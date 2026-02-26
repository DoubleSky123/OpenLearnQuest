import React from 'react';
import { CheckCircle } from 'lucide-react';

/**
 * Assembly area component - No error highlighting, clean display
 */
export default function AssemblyArea({ 
  assemblyArea, 
  complexityArea, 
  currentLevel, 
  isCorrectOrder, 
  errorDetails,
  onDragStart, 
  onDragOver, 
  onDragEnter,
  onDrop,
  onReset,
  dragOverIndex
}) {
  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-white">🔧 Assembly Area</h3>
        {isCorrectOrder && (
          <CheckCircle className="text-green-500" size={24} />
        )}
      </div>
      
      <div className={`bg-slate-700 rounded p-4 ${currentLevel.hasComplexity ? 'grid grid-cols-2 gap-3' : ''}`}>
        {/* Code column */}
        <div 
          className={`${currentLevel.hasComplexity ? '' : 'min-h-96'} space-y-2`}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(e, 'code'); }}
        >
          {currentLevel.hasComplexity && (
            <p className="text-slate-300 text-xs font-bold mb-2">Code Sequence:</p>
          )}
          {assemblyArea.length === 0 ? (
            <div 
              className="text-slate-400 text-sm text-center py-32 border-2 border-dashed border-slate-600 rounded"
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, 'code')}
            >
              Drop code blocks here
            </div>
          ) : (
            <>
              {assemblyArea.map((item, asmIdx) => {
                return (
                  <div
                    key={`asm-${asmIdx}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, asmIdx, 'assembly')}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const mouseY = e.clientY;
                      const middle = rect.top + rect.height / 2;
                      const position = mouseY < middle ? 'before' : 'after';
                      onDragEnter(e, asmIdx, 'code', position);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const position = dragOverIndex?.position || 'before';
                      onDrop(e, 'code', asmIdx, position);
                    }}
                    className={`p-3 rounded cursor-move border-2 transition-all font-mono text-sm relative ${
                      isCorrectOrder 
                        ? 'bg-green-700 border-green-500 text-white'
                        : 'bg-slate-600 border-slate-500 text-white hover:bg-slate-500 hover:border-blue-400'
                    } ${
                      dragOverIndex?.areaType === 'code' && dragOverIndex?.index === asmIdx 
                        ? dragOverIndex.position === 'before' 
                          ? 'border-t-4 border-t-yellow-400' 
                          : 'border-b-4 border-b-yellow-400'
                        : ''
                    }`}
                  >
                    <span className="text-slate-300 mr-2">{asmIdx + 1}.</span>
                    {item.isDistractor 
                      ? currentLevel.distractors[item.index]
                      : currentLevel.pseudocode[item.index]
                    }
                  </div>
                );
              })}
              <div 
                className="min-h-16 border-2 border-dashed border-slate-600 rounded text-slate-500 text-xs text-center flex items-center justify-center hover:border-blue-400 hover:text-blue-400 transition-all"
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, 'code')}
              >
                Drop here to append
              </div>
            </>
          )}
        </div>

        {/* Complexity column */}
        {currentLevel.hasComplexity && (
          <div 
            className="space-y-2"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDrop(e, 'complexity');
            }}
          >
            <p className="text-slate-300 text-xs font-bold mb-2">Time Complexity:</p>
            
            {!complexityArea || complexityArea.length === 0 ? (
              <div 
                className="text-slate-400 text-sm text-center py-32 border-2 border-dashed border-slate-600 rounded"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDrop(e, 'complexity');
                }}
              >
                Drop complexity here
              </div>
            ) : (
              <>
                {complexityArea.map((complexity, idx) => {
                  return (
                    <div
                      key={`comp-${idx}`}
                      draggable
                      onDragStart={(e) => onDragStart(e, idx, 'complexity-assembly')}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDrop(e, 'complexity', idx);
                      }}
                      className={`px-4 py-3 rounded cursor-move border-2 transition-all font-mono text-base text-center font-bold ${
                        isCorrectOrder 
                          ? 'bg-green-700 border-green-500 text-white'
                          : 'bg-purple-700 border-purple-600 text-white hover:bg-purple-600 hover:border-purple-400'
                      }`}
                    >
                      {complexity}
                    </div>
                  );
                })}
                <div 
                  className="min-h-16 border-2 border-dashed border-slate-600 rounded text-slate-500 text-xs text-center flex items-center justify-center hover:border-purple-400 hover:text-purple-400 transition-all"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDrop(e, 'complexity');
                  }}
                >
                  Drop here to append
                </div>
              </>
            )}
          </div>
        )}
      </div>
      
      {/* Error display */}
      {errorDetails && (
        <div className="mt-4 bg-red-900 border border-red-600 rounded-lg p-4">
          <p className="text-red-100 font-semibold text-sm mb-1">{errorDetails.message}</p>
          {errorDetails.explanation && (
            <p className="text-red-200 text-sm mb-2">{errorDetails.explanation}</p>
          )}
          {errorDetails.reasoning && (
            <p className="text-red-300 text-xs mb-1"><span className="font-semibold">Why: </span>{errorDetails.reasoning}</p>
          )}
          {errorDetails.keyPoint && (
            <p className="text-yellow-300 text-xs mt-2"><span className="font-semibold">Key point: </span>{errorDetails.keyPoint}</p>
          )}
          {errorDetails.hint && (
            <p className="text-blue-300 text-xs mt-1"><span className="font-semibold">Hint: </span>{errorDetails.hint}</p>
          )}
        </div>
      )}

      <button
        onClick={onReset}
        className="w-full mt-4 bg-slate-600 hover:bg-slate-700 text-white py-2 rounded font-semibold"
      >
        Reset Level
      </button>
    </div>
  );
}
