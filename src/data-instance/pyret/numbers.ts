/** Lossless, JSON-safe numeric payloads. Labels are display text, never the decoder. */
export type PyretNumberPayload = { version: 1 } & (
  | { kind: 'integer'; value: string }
  | { kind: 'rational'; numerator: string; denominator: string }
  | { kind: 'roughnum'; value: string }
);

/** Structural reification uses this carrier without requiring a live runtime. */
export interface ReifiedNumber { $pyretNumber: PyretNumberPayload }

const integerText = (v: unknown): v is string =>
  typeof v === 'string' && /^-?(0|[1-9][0-9]*)$/.test(v);

function exact(n: bigint, d = 1n): PyretNumberPayload {
  if (d === 0n) throw new Error('Invalid Pyret rational denominator');
  if (d < 0n) { n = -n; d = -d; }
  let a = n < 0n ? -n : n, b = d;
  while (b !== 0n) { const r = a % b; a = b; b = r; }
  n /= a; d /= a;
  return d === 1n
    ? { version: 1, kind: 'integer', value: n.toString() }
    : { version: 1, kind: 'rational', numerator: n.toString(), denominator: d.toString() };
}

function validate(value: unknown): PyretNumberPayload {
  const p = value as Partial<PyretNumberPayload> | null;
  if (p?.version === 1) {
    if (p.kind === 'integer' && integerText(p.value)) return exact(BigInt(p.value));
    if (p.kind === 'rational' && integerText(p.numerator) && integerText(p.denominator)) {
      return exact(BigInt(p.numerator), BigInt(p.denominator));
    }
    if (p.kind === 'roughnum' && typeof p.value === 'string'
        && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?$/i.test(p.value)
        && Number.isFinite(Number(p.value))) {
      return { version: 1, kind: 'roughnum', value: p.value };
    }
  }
  throw new Error('Malformed Pyret number metadata');
}

export function readNumberMetadata(metadata?: Record<string, unknown>): PyretNumberPayload | undefined {
  return metadata && Object.prototype.hasOwnProperty.call(metadata, 'pyretNumber')
    ? validate(metadata.pyretNumber) : undefined;
}

// Pyret's js-numbers BigInteger supplies these methods on its prototype.
// Use its exact decimal conversion, never toFixnum/valueOf/Number.
function runtimeInteger(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value).toString();
  if (typeof value === 'bigint') return value.toString();
  if (!value || typeof value !== 'object') return undefined;
  const v = value as { isInteger?: () => boolean; isExact?: () => boolean; toString(): string };
  if (typeof v.isInteger === 'function' && v.isInteger()
      && typeof v.isExact === 'function' && v.isExact()) {
    const text = v.toString();
    if (integerText(text)) return text;
  }
  return undefined;
}

/** Recognize real js-numbers values and our own structural carriers at any depth. */
export function numberPayload(value: unknown): PyretNumberPayload | undefined {
  if (value && typeof value === 'object') {
    if ('$pyretNumber' in value) return validate(value.$pyretNumber);
    // Keep compatibility with synthetic { n, d } rational inputs as well.
    if ('n' in value && 'd' in value) {
      const n = runtimeInteger(value.n), d = runtimeInteger(value.d);
      if (n !== undefined && d !== undefined) return exact(BigInt(n), BigInt(d));
    }
    const rough = value as { isRoughnum?: () => boolean; n?: unknown };
    if (typeof rough.isRoughnum === 'function' && rough.isRoughnum()) {
      if (typeof rough.n !== 'number' || !Number.isFinite(rough.n)) {
        throw new Error('Invalid Pyret roughnum');
      }
      return { version: 1, kind: 'roughnum', value: Object.is(rough.n, -0) ? '-0' : String(rough.n) };
    }
  }
  const integer = runtimeInteger(value);
  if (integer !== undefined) return exact(BigInt(integer));
  // Synthetic JS decimal inputs historically represented exact Pyret decimals.
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid Pyret number');
    const [mantissa, exponent = '0'] = String(value).split('e');
    const fractionDigits = mantissa.split('.')[1]?.length ?? 0;
    const power = Number(exponent) - fractionDigits;
    const n = BigInt(mantissa.replace('.', ''));
    return power >= 0 ? exact(n * 10n ** BigInt(power)) : exact(n, 10n ** BigInt(-power));
  }
  return undefined;
}

export function numberSource(p: PyretNumberPayload): string {
  switch (p.kind) {
    case 'integer': return p.value;
    case 'rational': return `${p.numerator}/${p.denominator}`;
    case 'roughnum': return `~${p.value}`;
  }
}

export function reifyNumber(p: PyretNumberPayload): number | ReifiedNumber {
  if (p.kind === 'integer') {
    const n = BigInt(p.value);
    // Preserve the existing JS primitive API for safe integers only.
    if (n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(n);
  }
  return { $pyretNumber: p };
}
