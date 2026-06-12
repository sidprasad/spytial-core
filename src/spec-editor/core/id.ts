/**
 * Stable id generation for SpecItems.
 *
 * `uuid` is not a runtime dependency in this repo, so we use the platform Web
 * Crypto API when available (browsers + modern Node) and fall back to a
 * timestamp+random scheme otherwise. This module is framework-agnostic.
 */

interface CryptoLike {
  randomUUID?: () => string;
}

/** Generate a reasonably-unique id for a SpecItem. */
export function newId(): string {
  const cryptoObj: CryptoLike | undefined = (
    globalThis as { crypto?: CryptoLike }
  ).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  const timestamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 12);
  const rand2 = Math.random().toString(36).slice(2, 12);
  return `${timestamp}-${rand}-${rand2}`;
}
