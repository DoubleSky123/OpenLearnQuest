import React from 'react';

export default function HintBox({ hint }) {
  return (
    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm">
      <p className="font-semibold text-violet-700 mb-1">Hint</p>
      <p className="text-violet-600">{hint}</p>
    </div>
  );
}
