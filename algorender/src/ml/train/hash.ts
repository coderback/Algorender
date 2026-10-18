/** FNV-1a over the config's JSON: a pretrained file whose hash differs from its trainer's config is stale. */
export function configHash(config: unknown): string {
  let h = 0x811c9dc5;
  for (const ch of JSON.stringify(config)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** A weight kept to `digits` significant digits, so the JSON stays small. */
export const compact = (v: number, digits = 5) => Number(v.toPrecision(digits)) + 0;
