'use client';

// Placeholder until the text view is built. Replace with the real renderer;
// its props must stay { state: <this view's state type> }.
export function TextView({ state }: { state: unknown }) {
  return <pre className="overflow-auto text-xs text-gray-500">{JSON.stringify(state, null, 2)}</pre>;
}
