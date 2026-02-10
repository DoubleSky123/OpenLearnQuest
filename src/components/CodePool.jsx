import React from 'react';
import CodeBlock from './CodeBlock';
import ComplexityBlock from './ComplexityBlock';

/**
 * Code pool component - container for draggable code and complexity blocks
 * @param {Array} codePool - Array of code block items
 * @param {Array} complexityPool - Array of complexity indices
 * @param {Object} currentLevel - Current level configuration
 * @param {Function} onDragStart - Drag start handler
 * @param {Function} onDrop - Drop handler
 */
export default function CodePool({ codePool, complexityPool, currentLevel, onDragStart, onDrop }) {
  // Advanced levels show code and complexity blocks together
  if (currentLevel.hasComplexity) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h3 className="text-lg font-bold text-white mb-3">📦 Code & Complexity Blocks</h3>
        <div className="bg-slate-700 rounded p-4 space-y-2">
          {/* Code blocks */}
          {codePool.map((item, poolIdx) => (
            <CodeBlock
              key={`pool-${poolIdx}`}
              item={item}
              index={poolIdx}
              source="pool"
              onDragStart={onDragStart}
              currentLevel={currentLevel}
            />
          ))}
          
          {/* Complexity blocks in a row */}
          {complexityPool.length > 0 && (
            <div className="flex gap-2 flex-wrap pt-2">
              {complexityPool.map((complexity, poolIdx) => (
                <div
                  key={`complexity-pool-${poolIdx}`}
                  draggable
                  onDragStart={(e) => {
                    console.log('Drag start complexity:', complexity, 'index:', poolIdx);
                    onDragStart(e, poolIdx, 'complexity-pool');
                  }}
                  className="bg-purple-700 hover:bg-purple-600 text-white px-4 py-2 rounded cursor-move border-2 border-purple-600 hover:border-purple-400 transition-all font-mono text-xs font-bold"
                >
                  {complexity}
                </div>
              ))}
            </div>
          )}
          
          {codePool.length === 0 && (
            <p className="text-slate-400 text-sm text-center py-8">All code blocks used</p>
          )}
        </div>
      </div>
    );
  }
  
  // Basic levels only show code blocks
  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
      <h3 className="text-lg font-bold text-white mb-3">📦 Code Blocks</h3>
      <div 
        className="min-h-32 bg-slate-700 rounded p-4 space-y-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => onDrop(e, 'code')}
      >
        {codePool.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">All blocks used</p>
        ) : (
          codePool.map((item, poolIdx) => (
            <CodeBlock
              key={`pool-${poolIdx}`}
              item={item}
              index={poolIdx}
              source="pool"
              onDragStart={onDragStart}
              currentLevel={currentLevel}
            />
          ))
        )}
      </div>
    </div>
  );
}