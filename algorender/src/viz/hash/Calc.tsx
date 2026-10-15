'use client';

/**
 * The hash computation for the key in hand, one line per step; the newest line
 * is emphasised. With nothing in hand it shows the rule instead, so the box
 * keeps its place and the table below doesn't jump.
 */
export function Calc({ lines, rule }: { lines: readonly string[]; rule: string }) {
  return (
    <div className="min-h-[4.25rem] rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-[13px] leading-5">
      <div className="mb-0.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-gray-500">Hash</div>
      {lines.length === 0 ? (
        <div className="text-gray-400">{rule}</div>
      ) : (
        lines.map((line, i) => (
          <div key={i} className={`break-words ${i === lines.length - 1 ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
            {line}
          </div>
        ))
      )}
    </div>
  );
}
