import React from 'react';
import CodeBlock from './CodeBlock';

/**
 * Code pool — click a block to move it to the assembly area.
 */
export default function CodePool({ codePool, currentLevel, onBlockClick }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-xl font-semibold text-gray-700 mb-3">Available blocks</h3>
      <div className="min-h-20 space-y-2">
        {codePool.length === 0 ? (
          <p className="text-gray-400 text-xl text-center py-6 border-2 border-dashed border-gray-200 rounded-lg">
            All blocks placed
          </p>
        ) : (
          codePool.map((item, idx) => (
            <CodeBlock
              key={`pool-${idx}`}
              item={item}
              index={idx}
              source="pool"
              onClick={onBlockClick}
              currentLevel={currentLevel}
            />
          ))
        )}
      </div>
    </div>
  );
}
