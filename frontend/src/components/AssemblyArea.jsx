import React from 'react';
import { CheckCircle } from 'lucide-react';

/**
 * Assembly area — click a placed block to return it to the pool.
 */
export default function AssemblyArea({
  assemblyArea,
  currentLevel,
  isCorrectOrder,
  errorDetails,
  onBlockClick,
  onReset,
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xl font-semibold text-gray-700">Assembly area</h3>
        {isCorrectOrder && (
          <div className="flex items-center gap-1.5 text-emerald-600 text-lg font-medium">
            <CheckCircle size={15} /> Correct!
          </div>
        )}
      </div>

      <div className="min-h-48 bg-gray-50 rounded-lg border border-gray-100 p-3 space-y-2 mb-3">
        {assemblyArea.length === 0 ? (
          <p className="text-gray-400 text-xl text-center py-10">
            Click a block above to place it here
          </p>
        ) : (
          assemblyArea.map((item, idx) => (
            <div key={`asm-${idx}`} className="flex items-center gap-2">
              <span className="text-gray-400 text-lg w-7 shrink-0">{idx + 1}.</span>
              <div className="flex-1">
                <button
                  onClick={() => onBlockClick(idx)}
                  className={`w-full text-left p-3 rounded-lg border font-mono text-xl transition-all cursor-pointer ${
                    isCorrectOrder
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-white border-gray-200 text-gray-800 hover:border-red-300 hover:bg-red-50'
                  }`}
                >
                  {item.isDistractor
                    ? currentLevel.distractors[item.index]
                    : currentLevel.pseudocode[item.index]}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {errorDetails && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-700 font-semibold text-xl mb-1">{errorDetails.message}</p>
          {errorDetails.explanation && (
            <p className="text-red-600 text-xl">{errorDetails.explanation}</p>
          )}
          {errorDetails.hint && (
            <p className="text-violet-600 text-lg mt-2">
              <span className="font-semibold">Hint: </span>{errorDetails.hint}
            </p>
          )}
        </div>
      )}

      <button
        onClick={onReset}
        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 py-2 rounded-lg text-xl font-medium transition-colors"
      >
        Reset
      </button>
    </div>
  );
}
