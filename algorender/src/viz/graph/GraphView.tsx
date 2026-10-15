'use client';

// Placeholder until the graph view is built. Replace with the real renderer;
// its props must stay { state: <this view's state type> }.
export function GraphView({ state }: { state: unknown }) {
  return <pre className="overflow-auto text-xs text-gray-500">{JSON.stringify(state, null, 2)}</pre>;
}
