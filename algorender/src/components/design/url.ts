import type { Component, ComponentKind, Design } from '@/systems/design/types';

// A design in a URL (`?d=…`, the sandbox's share link) or in localStorage
// (one per case study): compact JSON, base64url-encoded so it survives a URL
// unescaped. Decoding checks only the shape; validateDesign() judges the rest.

const KINDS: readonly ComponentKind[] = ['clients', 'rate-limiter', 'load-balancer', 'app', 'cache', 'database', 'queue'];

export const STORAGE_PREFIX = 'algorender:design:';
export const storageKey = (study: string) => `${STORAGE_PREFIX}${study}`;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
}

export const encodeDesign = (design: Design): string => toBase64Url(JSON.stringify(design.components));

/** The design in `text`, or null when it isn't one (truncated, edited by hand, from another version). */
export function decodeDesign(text: string | null | undefined): Design | null {
  if (!text || text.length > 8000) return null;
  try {
    return parseDesign(JSON.parse(fromBase64Url(text)));
  } catch {
    return null;
  }
}

/** Checks that `value` is a list of components with ids, kinds and labels, each id unique, and exactly one clients. */
export function parseDesign(value: unknown): Design | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 24) return null;
  const ids = new Set<string>();
  for (const c of value) {
    if (!c || typeof c !== 'object') return null;
    const { id, kind, label } = c as Record<string, unknown>;
    if (typeof id !== 'string' || typeof label !== 'string' || !KINDS.includes(kind as ComponentKind) || ids.has(id)) return null;
    ids.add(id);
  }
  if (value.filter((c) => (c as Component).kind === 'clients').length !== 1) return null;
  return { components: value as Component[] };
}

export function loadSaved(study: string): Design | null {
  try {
    return decodeDesign(localStorage.getItem(storageKey(study)));
  } catch {
    return null;
  }
}

export function save(study: string, design: Design | null) {
  try {
    if (design) localStorage.setItem(storageKey(study), encodeDesign(design));
    else localStorage.removeItem(storageKey(study));
  } catch {
    // Storage can be full or blocked; the design simply isn't remembered.
  }
}
