import type { IDataInstance } from '../data-instance/interfaces';
import { generateAlloySchema } from '../data-instance/schema-descriptor';

export type LlmProvider = 'openai' | 'openai-compatible';

export interface LlmSelectorSynthesisOptions {
  provider?: LlmProvider;
  apiKey: string;
  model: string;
  prompt: string;
  dataInstance: IDataInstance;
  baseUrl?: string;
  maxCandidates?: number;
  temperature?: number;
  topP?: number;
  timeoutMs?: number;
}

export interface LlmSelectorSynthesisResult {
  candidates: string[];
  rawResponse: unknown;
}

const DEFAULT_MAX_CANDIDATES = 3;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_TOP_P = 1;
const DEFAULT_TIMEOUT_MS = 30_000;

function resolveBaseUrl(provider: LlmProvider, baseUrl?: string): string {
  if (baseUrl) return baseUrl.replace(/\/$/, '');
  if (provider === 'openai-compatible') return 'https://api.openai.com';
  return 'https://api.openai.com';
}

function buildMessages(prompt: string, schema: string, maxCandidates: number) {
  return [
    {
      role: 'system',
      content: [
        'You translate user requests into Alloy selector expressions.',
        'Return ONLY valid JSON with a single field: candidates (string array).',
        `Provide ${maxCandidates} candidate expressions unless the request only supports fewer.`,
        'Do not include explanations or extra fields.',
        'Use only relation/type names that appear in the schema.',
        'Expression syntax: Alloy relational operators (., ^, +, &, -) and relation names.'
      ].join(' ')
    },
    {
      role: 'user',
      content: [
        'Schema:',
        schema,
        '',
        'Request:',
        prompt
      ].join('\n')
    }
  ];
}

function stripCodeFences(content: string): string {
  return content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function extractCandidates(content: string, maxCandidates: number): string[] {
  const cleaned = stripCodeFences(content);

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.filter(item => typeof item === 'string').slice(0, maxCandidates);
    }
    if (parsed && Array.isArray((parsed as { candidates?: unknown }).candidates)) {
      return (parsed as { candidates: unknown[] }).candidates
        .filter(item => typeof item === 'string')
        .slice(0, maxCandidates);
    }
  } catch {
    // Fall through to heuristic parsing.
  }

  const lines = cleaned
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:[-*]|\d+\.)\s*/, '').trim())
    .filter(line => line.length > 0);

  return lines.slice(0, maxCandidates);
}

export async function synthesizeAlloySelectorsWithLlm(
  options: LlmSelectorSynthesisOptions
): Promise<LlmSelectorSynthesisResult> {
  const {
    provider = 'openai',
    apiKey,
    model,
    prompt,
    dataInstance,
    baseUrl,
    maxCandidates = DEFAULT_MAX_CANDIDATES,
    temperature = DEFAULT_TEMPERATURE,
    topP = DEFAULT_TOP_P,
    timeoutMs = DEFAULT_TIMEOUT_MS
  } = options;

  const schema = generateAlloySchema(dataInstance, {
    includeBuiltInTypes: false,
    includeTypeHierarchy: true,
    includeArityHints: false
  });

  const messages = buildMessages(prompt, schema, maxCandidates);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const base = resolveBaseUrl(provider, baseUrl);

  try {
    const response = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        top_p: topP
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM request failed (${response.status}): ${errorText}`);
    }

    const rawResponse = await response.json();
    const content = rawResponse?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('LLM response missing content.');
    }

    const candidates = extractCandidates(content, maxCandidates);
    return { candidates, rawResponse };
  } finally {
    clearTimeout(timeout);
  }
}
