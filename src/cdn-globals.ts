export type SpytialGlobalNamespace = Record<string, unknown> & {
  spytialcore?: Record<string, unknown>;
  CnDCore?: Record<string, unknown>;
  CndCore?: Record<string, unknown>;
  spytialComponents?: Record<string, unknown>;
  CnDComponents?: Record<string, unknown>;
  CndComponents?: Record<string, unknown>;
};

export function getRegisteredCoreGlobal(
  globalWindow: SpytialGlobalNamespace,
): Record<string, unknown> | undefined {
  const candidates = [
    globalWindow.spytialcore,
    globalWindow.CnDCore,
    globalWindow.CndCore,
  ];

  return candidates.find(
    (candidate): candidate is Record<string, unknown> =>
      Boolean(candidate) && typeof candidate === 'object',
  );
}

export function exposeComponentBundleGlobals(
  globalWindow: SpytialGlobalNamespace,
  componentApi: Record<string, unknown>,
): Record<string, unknown> | undefined {
  globalWindow.spytialComponents = componentApi;
  globalWindow.CnDComponents = componentApi;
  globalWindow.CndComponents = componentApi;

  const coreGlobal = getRegisteredCoreGlobal(globalWindow);
  if (!coreGlobal) {
    return undefined;
  }

  Object.assign(coreGlobal, componentApi);
  globalWindow.spytialcore = coreGlobal;
  globalWindow.CnDCore = coreGlobal;
  globalWindow.CndCore = coreGlobal;

  return coreGlobal;
}
