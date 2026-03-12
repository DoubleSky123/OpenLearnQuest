import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * ErrorCounter — displays the number of mistakes made on the current question.
 * @param {number} count  — error count to display
 */
export default function ErrorCounter({ count }) {
  const colour =
    count === 0 ? 'text-green-400 border-green-700 bg-slate-700' :
    count <= 2  ? 'text-yellow-400 border-yellow-700 bg-slate-700' :
                  'text-red-400   border-red-700   bg-slate-700';

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm font-mono ${colour}`}>
      <AlertTriangle size={14} className="shrink-0" />
      <span className="font-bold">{count}</span>
      <span className="text-slate-400 font-sans text-xs">{count === 1 ? 'mistake' : 'mistakes'}</span>
    </div>
  );
}
