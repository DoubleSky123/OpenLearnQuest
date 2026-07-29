import React, { useLayoutEffect, useRef, useState } from 'react';
import { formatPatternValue } from '../utils/helpers';

function LinkedListVisualiser({ values = [], emptyLabel = 'Empty', nodeColor = 'bg-gray-200 border-gray-300', highlight = false, goalValues = [], cycleTo = null }) {
  // cycleTo: index the LAST node's next loops back to (LeetCode pos style).
  // Purely visual — callers keep the underlying node chain linear.
  const hasCycle = cycleTo != null && Number.isInteger(cycleTo)
    && cycleTo >= 0 && cycleTo < values.length && values.length > 1;
  const containerRef = useRef(null);
  const nodeRefs = useRef([]);
  const [edge, setEdge] = useState(null);

  useLayoutEffect(() => {
    if (!hasCycle) { setEdge(null); return; }
    const c = containerRef.current;
    const from = nodeRefs.current[values.length - 1];
    const to = nodeRefs.current[cycleTo];
    if (!c || !from || !to) return;
    const cb = c.getBoundingClientRect();
    const fb = from.getBoundingClientRect();
    const tb = to.getBoundingClientRect();
    const x1 = fb.left - cb.left + fb.width / 2;
    const y1 = fb.bottom - cb.top + 2;
    const x2 = tb.left - cb.left + tb.width / 2;
    const y2 = tb.bottom - cb.top + 6;
    const dip = Math.max(y1, y2) + 22;
    setEdge({
      d: `M ${x1} ${y1} C ${x1} ${dip}, ${x2} ${dip}, ${x2} ${y2}`,
      w: cb.width, h: dip + 4,
    });
  }, [hasCycle, cycleTo, values.join(',')]); // eslint-disable-line

  if (values.length === 0) {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-sm italic min-h-12">
        <span className="w-10 h-10 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-xs">∅</span>
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative flex items-center gap-1 flex-wrap ${hasCycle ? 'pb-7' : ''}`}>
      {values.map((val, idx) => {
        const isMatch = highlight && goalValues.length > 0 && val === goalValues[idx];
        const circleClass = highlight
          ? isMatch
            ? 'bg-emerald-100 border-emerald-400 text-emerald-800 scale-110 shadow-sm'
            : 'bg-gray-100 border-gray-300 text-gray-700'
          : nodeColor;
        return (
          <React.Fragment key={idx}>
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              {idx === 0 ? (
                <div className="flex flex-col items-center leading-tight">
                  <span className="text-[11px] font-mono font-semibold text-indigo-500">head</span>
                  <span className="text-indigo-400 text-xs">↓</span>
                </div>
              ) : (
                <div className="h-7" />
              )}
              <div
                ref={el => { nodeRefs.current[idx] = el; }}
                className={`w-11 h-11 rounded-full border-2 flex items-center justify-center font-semibold text-sm transition-all ${circleClass}`}
              >
                {formatPatternValue(val)}
              </div>
              <span className="text-gray-400 text-xs">{idx}</span>
            </div>
            {idx < values.length - 1 && (
              <span className="text-gray-400 text-base select-none mb-4">→</span>
            )}
          </React.Fragment>
        );
      })}
      {!hasCycle && <span className="text-gray-400 text-sm ml-1 select-none mb-4">→ NULL</span>}
      {hasCycle && edge && (
        <svg
          className="absolute left-0 top-0 pointer-events-none"
          width={edge.w}
          height={edge.h}
          style={{ overflow: 'visible' }}
        >
          <defs>
            <marker id="cycle-arrow" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 8 4 L 0 8 z" fill="#f59e0b" />
            </marker>
          </defs>
          <path d={edge.d} fill="none" stroke="#f59e0b" strokeWidth="2" markerEnd="url(#cycle-arrow)" />
        </svg>
      )}
    </div>
  );
}

export default function GoalPattern({ goalPattern }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-gray-900 mb-3">Goal state</h2>
      <div className="bg-gray-50 rounded-lg border border-gray-100 p-4">
        <LinkedListVisualiser
          values={goalPattern}
          emptyLabel="Empty list (no nodes)"
          nodeColor="bg-amber-50 border-amber-300 text-amber-800"
        />
      </div>
    </div>
  );
}

export { LinkedListVisualiser };
