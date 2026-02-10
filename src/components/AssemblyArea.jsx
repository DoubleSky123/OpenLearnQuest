import React from 'react';
import { CheckCircle, AlertTriangle } from 'lucide-react';

/**
 * Assembly area component - FIXED VERSION with complexity display
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
  console.log('🔧 AssemblyArea FIXED - complexityArea:', complexityArea);
  
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
          onDragOver={onDragOver}
          onDrop={(e) => onDrop(e, 'code')}
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
                const hasError = errorDetails?.wrongLines?.includes(asmIdx + 1) || 
                                (errorDetails?.type === 'distractor' && item.isDistractor);
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
                      e.stopPropagation();
                      const position = dragOverIndex?.position || 'before';
                      onDrop(e, 'code', asmIdx, position);
                    }}
                    className={`p-3 rounded cursor-move border-2 transition-all font-mono text-sm relative ${
                      isCorrectOrder 
                        ? 'bg-green-700 border-green-500 text-white'
                        : hasError
                        ? 'bg-red-800 border-red-500 text-white'
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

        {/* Complexity column - FIXED */}
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
                  console.log(`✅ Rendering complexity ${idx}:`, complexity);
                  const hasError = errorDetails?.errors?.some(e => e.line === idx + 1);
                  const errorInfo = errorDetails?.errors?.find(e => e.line === idx + 1);
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
                          : hasError
                          ? 'bg-red-800 border-red-500 text-white'
                          : 'bg-purple-700 border-purple-600 text-white hover:bg-purple-600 hover:border-purple-400'
                      }`}
                    >
                      {complexity}
                      {errorInfo && (
                        <div className="text-xs mt-1 text-red-200">
                          Expected: {errorInfo.expected}
                        </div>
                      )}
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
        <div className="mt-4 bg-red-900 border border-red-500 rounded p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <p className="text-red-100 text-sm font-semibold mb-1">
                ❌ {errorDetails.message}
              </p>
              {errorDetails.type === 'complexity' && errorDetails.errors && (
                <ul className="text-red-200 text-xs mt-2 space-y-1">
                  {errorDetails.errors.map((err, idx) => (
                    <li key={idx}>
                      Line {err.line}: Got {err.actual}, expected {err.expected}
                    </li>
                  ))}
                </ul>
              )}
              {errorDetails.type === 'distractor' && (
                <p className="text-red-200 text-xs mt-1">
                  Incorrect code blocks should be removed from the assembly area.
                </p>
              )}
              {errorDetails.type === 'code_order' && (
                <p className="text-red-200 text-xs mt-1">
                  Try rearranging the code blocks in the correct sequence.
                </p>
              )}
              {errorDetails.type === 'too_many_blocks' && (
                <p className="text-red-200 text-xs mt-1">
                  Remove the extra code blocks from the assembly area.
                </p>
              )}
              {errorDetails.type === 'too_many_complexity' && (
                <p className="text-red-200 text-xs mt-1">
                  Remove the extra complexity blocks from the assembly area.
                </p>
              )}
              {errorDetails.type === 'already_executed' && (
                <p className="text-red-200 text-xs mt-1">
                  Click "Reset Level" below to start over with a new solution.
                </p>
              )}
            </div>
          </div>
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