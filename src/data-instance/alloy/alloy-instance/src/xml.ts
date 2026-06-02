import { AlloyDatum } from './datum';
import { instanceFromElement } from './instance';

// For client-side use, we expect DOMParser to be available
export function parseAlloyXML(xml: string): AlloyDatum {
  // Use DOMParser to parse the XML string
  const parser = new globalThis.DOMParser();
  const document = parser.parseFromString(xml, 'application/xml');
  const instances = Array.from(document.querySelectorAll('instance'));
  if (!instances.length) throw new Error(`No Alloy instance in XML: ${xml}`);
  
  // A provider may attach visualizer configuration (script / theme / cnd) to the instance XML as
  // <visualizer ...> elements. This is not part of the Alloy instance XML spec, but Sterling/Forge
  // use it — e.g. Forge embeds the Cope and Drag spec as a `cnd` attribute.
  const visualizerElements = document.querySelectorAll('visualizer');
  let maybeScriptText: string | undefined;
  let maybeThemeText: string | undefined;
  let maybeCnDText: string | undefined;
  for (const vis of Array.from(visualizerElements)) {
    // The last visualizer element for a given attribute wins.
    maybeScriptText = parseStringAttribute(vis as globalThis.Element, 'script') ?? maybeScriptText;
    maybeThemeText = parseStringAttribute(vis as globalThis.Element, 'theme') ?? maybeThemeText;
    maybeCnDText = parseStringAttribute(vis as globalThis.Element, 'cnd') ?? maybeCnDText;
  }

  return {
    instances: instances.map((element) => instanceFromElement(element as globalThis.Element)),
    bitwidth: parseNumericAttribute(instances[0], 'bitwidth'),
    command: parseStringAttribute(instances[0], 'command'),
    loopBack: parseLoopBack(instances[0]),
    maxSeq: parseNumericAttribute(instances[0], 'maxseq'),
    maxTrace: parseNumericAttribute(instances[0], 'maxtrace'),
    minTrace: parseNumericAttribute(instances[0], 'mintrace'),
    traceLength: parseNumericAttribute(instances[0], 'tracelength'),
    visualizerConfig: {
      script: deEscape(maybeScriptText),
      theme: deEscape(maybeThemeText),
      cnd: deEscape(maybeCnDText)
    }
  };
}

/**
 * The loop-back state index of a temporal trace. Providers express the lasso differently:
 *  - `backloop` (Alloy/Sterling) or `loop` (Forge): the loop-back index directly;
 *  - `looplength` (Alloy's own instance XML): the *length* of the loop, so the index is
 *    `tracelength - looplength`.
 *
 * The `looplength` form is only honoured when `tracelength > 1`, so a static instance — which
 * Alloy writes as `tracelength="1" looplength="1"` — is not mistaken for a one-state trace.
 */
function parseLoopBack(element: globalThis.Element): number | undefined {
  const backloop = parseNumericAttribute(element, 'backloop');
  if (backloop !== undefined) return backloop;
  const loop = parseNumericAttribute(element, 'loop');
  if (loop !== undefined) return loop;
  const tracelength = parseNumericAttribute(element, 'tracelength');
  const looplength = parseNumericAttribute(element, 'looplength');
  if (tracelength !== undefined && looplength !== undefined && tracelength > 1) {
    return tracelength - looplength;
  }
  return undefined;
}

function parseNumericAttribute(
  element: globalThis.Element,
  attribute: string
): number | undefined {
  const value = element.getAttribute(attribute);
  return value ? +value : undefined;
}

function parseStringAttribute(
  element: globalThis.Element,
  attribute: string
): string | undefined {
  const value = element.getAttribute(attribute);
  return value ? `${value}` : undefined;
}

// Could use decodeURIComponent, but start small
function deEscape(s: string | undefined): string | undefined {
  return s?.replaceAll("&quot;", "\"")
           .replaceAll("\\\"", "\"")
           .replaceAll("&gt;", ">")
           .replaceAll("&lt;", "<")
}

export function sigElementIsSet(sigElement: globalThis.Element): boolean {
  return sigElement.querySelectorAll('type').length > 0;
}

/**
 * Get the type hierarcies from an <instance> element.
 *
 * @param typeNames Map of type id numbers to type names.
 * @param element An <instance> element.
 */
export function typeHierarchiesFromElement(
  typeNames: Record<string, string>,
  element: globalThis.Element
): Record<string, string[]> {
  const parents: Record<string, string> = {};

  const sigElements = element.querySelectorAll('sig');
  for (const sigElement of sigElements) {
    if (!sigElementIsSet(sigElement)) {
      const id = sigElement.getAttribute('ID');
      const parentId = sigElement.getAttribute('parentID');
      const label = sigElement.getAttribute('label');
      if (!id) throw new Error('No ID found for sig element');
      if (!label) throw new Error('No label found for sig element');
      if (parentId) parents[id] = parentId;
    }
  }

  const traverseHierarchy = (id: string, hierarchy: string[]): string[] => {
    if (!parents[id]) return hierarchy;
    return traverseHierarchy(parents[id], [...hierarchy, typeNames[id]]);
  };

  const hierarchies: Record<string, string[]> = {};

  for (const id in typeNames) {
    hierarchies[typeNames[id]] = traverseHierarchy(id, []);
  }

  return hierarchies;
}

export function typeNamesFromElement(element: globalThis.Element): Record<string, string> {
  const names: Record<string, string> = {};
  const sigElements = element.querySelectorAll('sig');
  for (const sigElement of sigElements) {
    const id = sigElement.getAttribute('ID');
    const label = sigElement.getAttribute('label');
    if (!id) throw new Error('No ID found for sig element');
    if (!label) throw new Error('No label found for sig element');
    names[id] = label;
  }
  return names;
}