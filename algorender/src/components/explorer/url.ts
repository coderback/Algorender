/** Replaces the query string's own keys with `params`, keeping `mode` and dropping `step`. */
export function writeUrl(params: URLSearchParams, mode: string) {
  if (mode !== 'watch') params.set('mode', mode);
  window.history.replaceState(null, '', `?${params}`);
}

export function modeFromParams(params: URLSearchParams): 'watch' | 'predict' {
  return params.get('mode') === 'predict' ? 'predict' : 'watch';
}

export function stepFromParams(params: URLSearchParams): number {
  return Math.max(0, Number(params.get('step')) || 0);
}
