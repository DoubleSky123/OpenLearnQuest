import React from 'react';
import CodeBlock from './CodeBlock';

/**
 * Code pool component - container for draggable code and complexity blocks
 * Now supports dragging blocks back from assembly area
 */
export default function CodePool({ codePool, complexityPool, currentLevel, onDragStart, onDrop }) {
  // Advanced levels show code and complexity blocks together
  if (currentLevel.hasComplexity) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
        <h3 className="text-lg font-bold text-white mb-3">📦 Code & Complexity Blocks</h3>
        <div className="bg-slate-700 rounded p-4 space-y-2">
          {/* Code blocks section with drop zone */}
          <div
            className="space-y-2 min-h-32"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, 'code')}
          >
            <p className="text-slate-300 text-xs font-bold mb-2">Code Blocks:</p>
            {codePool.length === 0 ? (
              <div className="text-slate-400 text-sm text-center py-8 border-2 border-dashed border-slate-600 rounded">
                Drag code blocks back here to remove from assembly
              </div>
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
          
          {/* Complexity blocks section with drop zone */}
          {complexityPool.length > 0 && (
            <div 
              className="pt-4 border-t border-slate-600"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, 'complexity')}
            >
              <p className="text-slate-300 text-xs font-bold mb-2">Complexity Blocks:</p>
              <div className="flex gap-2 flex-wrap">
                {complexityPool.map((complexity, poolIdx) => (
                  <div
                    key={`complexity-pool-${poolIdx}`}
                    draggable
                    onDragStart={(e) => {
                      onDragStart(e, poolIdx, 'complexity-pool');
                    }}
                    className="bg-purple-700 hover:bg-purple-600 text-white px-4 py-2 rounded cursor-move border-2 border-purple-600 hover:border-purple-400 transition-all font-mono text-xs font-bold"
                  >
                    {complexity}
                  </div>
                ))}
              </div>
            </div>
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
          <div className="text-slate-400 text-sm text-center py-8 border-2 border-dashed border-slate-600 rounded">
            Drag code blocks back here to remove from assembly
          </div>
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
