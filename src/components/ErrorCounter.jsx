import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ErrorCounter({ count }) {
  const style =
    count === 0 ? 'text-emerald-600 border-emerald-200 bg-emerald-50' :
    count <= 2  ? 'text-amber-600  border-amber-200  bg-amber-50'  :
                  'text-red-600    border-red-200     bg-red-50';

  return (
    <div className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-mono ${style}`}>
      <AlertTriangle size={14} className="shrink-0" />
      <span className="font-semibold">{count}</span>
      <span className="text-gray-400 font-sans text-xs">{count === 1 ? 'mistake' : 'mistakes'}</span>
    </div>
  );
}
