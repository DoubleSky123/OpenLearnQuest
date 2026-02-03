import React, { useState, useEffect } from 'react';
import { Lock, Unlock, Star, ChevronRight, CheckCircle, AlertTriangle } from 'lucide-react';

const COLORS = {
  red: '🔴',
  blue: '🔵',
  green: '🟢',
};

// Level definitions with pseudocode and complexity
const LEVELS = [
  {
    id: 1,
    title: 'Insert at Head - O(1)',
    description: 'Add 🟢 to the beginning - O(1) Fast operation! Only one pointer change needed.',
    goalPattern: ['🟢', '🔴', '🔵'],
    initialNodes: [
      { id: 1, value: '🔴', next: 2 },
      { id: 2, value: '🔵', next: null }
    ],
    operation: 'insertAtHead',
    operationValue: 'green',
    pseudocode: [
      'create newNode with 🟢',
      'newNode.next = head',
      'head = newNode'
    ],
    correctOrder: [0, 1, 2],
    hasComplexity: false,
    hint: 'Think about the order: First create the node, then link it, then update head pointer'
  },
  {
    id: 2,
    title: 'Insert at Tail - O(n)',
    description: 'Add 🟢 to the end - O(n) Requires traversing the entire list to find the tail.',
    goalPattern: ['🔴', '🔵', '🟢'],
    initialNodes: [
      { id: 1, value: '🔴', next: 2 },
      { id: 2, value: '🔵', next: null }
    ],
    operation: 'insertAtTail',
    operationValue: 'green',
    pseudocode: [
      'traverse to last node',
      'create newNode with 🟢',
      'lastNode.next = newNode',
      'newNode.next = NULL'
    ],
    correctOrder: [0, 1, 2, 3],
    hasComplexity: false,
    hint: 'You need to find the tail first, then create and attach the new node'
  },
  {
    id: 3,
    title: 'Remove at Head - O(1)',
    description: 'Remove first element - O(1) Fast operation! Direct access to head pointer.',
    goalPattern: ['🔵', '🟢'],
    initialNodes: [
      { id: 1, value: '🔴', next: 2 },
      { id: 2, value: '🔵', next: 3 },
      { id: 3, value: '🟢', next: null }
    ],
    operation: 'removeAtHead',
    pseudocode: [
      'temp = head',
      'head = head.next',
      'free temp'
    ],
    correctOrder: [0, 1, 2],
    hasComplexity: false,
    hint: 'Save the old head, move head pointer, then free memory'
  },
  {
    id: 4,
    title: 'Remove at Tail',
    description: 'Remove the last element - analyze the time complexity of each step!',
    goalPattern: ['🔴', '🔵'],
    initialNodes: [
      { id: 1, value: '🔴', next: 2 },
      { id: 2, value: '🔵', next: 3 },
      { id: 3, value: '🟢', next: null }
    ],
    operation: 'removeAtTail',
    pseudocode: [
      'traverse to second-last node',
      'temp = node.next',
      'node.next = NULL',
      'free temp'
    ],
    complexity: ['O(n)', 'O(1)', 'O(1)', 'O(1)'],
    correctOrder: [0, 1, 2, 3],
    hasComplexity: true,
    hint: 'Which step requires traversing the list? That\'s your O(n) operation!'
  },
  {
    id: 5,
    title: 'Insert at Position',
    description: 'Insert 🟢 at position 1 - match each operation with its time complexity!',
    goalPattern: ['🔴', '🟢', '🔵'],
    initialNodes: [
      { id: 1, value: '🔴', next: 2 },
      { id: 2, value: '🔵', next: null }
    ],
    operation: 'insertAtPosition',
    operationValue: 'green',
    operationPosition: 1,
    pseudocode: [
      'traverse to position 0',
      'create newNode with 🟢',
      'newNode.next = node.next',
      'node.next = newNode'
    ],
    complexity: ['O(n)', 'O(1)', 'O(1)', 'O(1)'],
    correctOrder: [0, 1, 2, 3],
    hasComplexity: true,
    hint: 'Traversal is O(n), pointer operations are O(1)'
  },
  {
    id: 6,
    title: 'Remove at Position',
    description: 'Remove node at position 1 - identify which operations take linear time!',
    goalPattern: ['🔴', '🟢'],
    initialNodes: [
      { id: 1, value: '🔴', next: 2 },
      { id: 2, value: '🔵', next: 3 },
      { id: 3, value: '🟢', next: null }
    ],
    operation: 'removeAtPosition',
    operationPosition: 1,
    pseudocode: [
      'traverse to position 0',
      'temp = node.next',
      'node.next = temp.next',
      'free temp'
    ],
    complexity: ['O(n)', 'O(1)', 'O(1)', 'O(1)'],
    correctOrder: [0, 1, 2, 3],
    hasComplexity: true,
    hint: 'Only traversal requires visiting multiple nodes - everything else is constant time'
  }
];

// Shuffle array helper
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export default function LinkedListCodeAssemblyGame() {
  const [currentLevelId, setCurrentLevelId] = useState(1);
  const [nodes, setNodes] = useState(LEVELS[0].initialNodes);
  const [completedLevels, setCompletedLevels] = useState([]);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [assemblyArea, setAssemblyArea] = useState([]);
  const [complexityArea, setComplexityArea] = useState([]);
  const [codePool, setCodePool] = useState([]);
  const [complexityPool, setComplexityPool] = useState([]);
  const [isCorrectOrder, setIsCorrectOrder] = useState(false);
  const [operationExecuted, setOperationExecuted] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [showError, setShowError] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const currentLevel = LEVELS.find(l => l.id === currentLevelId);

  // Initialize code pool when level changes
  useEffect(() => {
    const indices = currentLevel.pseudocode.map((_, i) => i);
    setCodePool(shuffleArray(indices));
    setAssemblyArea([]);
    setComplexityArea([]);
    setIsCorrectOrder(false);
    setOperationExecuted(false);
    setNodes(JSON.parse(JSON.stringify(currentLevel.initialNodes)));
    setFeedback(null);
    setShowError(false);
    
    if (currentLevel.hasComplexity) {
      const complexityIndices = currentLevel.complexity.map((_, i) => i);
      setComplexityPool(shuffleArray(complexityIndices));
    } else {
      setComplexityPool([]);
    }
  }, [currentLevelId]);

  // Check if assembly is correct
  useEffect(() => {
    const codeComplete = assemblyArea.length === currentLevel.correctOrder.length;
    const complexityComplete = !currentLevel.hasComplexity || 
                               complexityArea.length === currentLevel.complexity.length;
    
    if (codeComplete && complexityComplete) {
      const codeCorrect = assemblyArea.every((idx, pos) => idx === currentLevel.correctOrder[pos]);
      const complexityCorrect = !currentLevel.hasComplexity || 
                                complexityArea.every((idx, pos) => 
                                  currentLevel.complexity[idx] === currentLevel.complexity[pos]
                                );
      
      const allCorrect = codeCorrect && complexityCorrect;
      
      // Only execute if correct and not yet executed
      if (allCorrect && !operationExecuted) {
        setOperationExecuted(true);
        setShowError(false);
        executeOperation();
      } else if (!allCorrect && codeComplete && complexityComplete) {
        setShowError(true);
        setIsCorrectOrder(false);
      } else {
        setShowError(false);
      }
    } else {
      setIsCorrectOrder(false);
      setShowError(false);
    }
  }, [assemblyArea, complexityArea, currentLevel, operationExecuted]);

  const getCurrentPattern = () => {
    const pattern = [];
    const allIds = new Set(nodes.map(n => n.id));
    const pointedIds = new Set(nodes.map(n => n.next).filter(n => n !== null));
    
    let head = null;
    for (let id of allIds) {
      if (!pointedIds.has(id)) {
        head = id;
        break;
      }
    }
    
    if (head === null && nodes.length > 0) {
      head = nodes[0].id;
    }
    
    let current = head;
    while (current !== null) {
      const node = nodes.find(n => n.id === current);
      if (!node) break;
      pattern.push(node.value);
      current = node.next;
    }
    return pattern;
  };

  const executeOperation = () => {
    const { operation, operationValue, operationPosition } = currentLevel;
    
    setTimeout(() => {
      if (operation === 'insertAtHead') {
        const newId = Math.max(...nodes.map(n => n.id), 0) + 1;
        const newNode = { id: newId, value: COLORS[operationValue], next: 1 };
        setNodes(prev => [newNode, ...prev]);
        setFeedback({ type: 'success', message: '✓ Code executed! Node inserted at head' });
      } else if (operation === 'insertAtTail') {
        const newId = Math.max(...nodes.map(n => n.id), 0) + 1;
        setNodes(prev => {
          const newNodes = [...prev];
          const lastNode = newNodes.find(n => n.next === null);
          if (lastNode) lastNode.next = newId;
          newNodes.push({ id: newId, value: COLORS[operationValue], next: null });
          return newNodes;
        });
        setFeedback({ type: 'success', message: '✓ Code executed! Node inserted at tail' });
      } else if (operation === 'removeAtHead') {
        setNodes(prev => prev.filter(n => n.id !== 1));
        setFeedback({ type: 'success', message: '✓ Code executed! Head node removed' });
      } else if (operation === 'removeAtTail') {
        setNodes(prev => {
          const lastNode = prev.find(n => n.next === null);
          if (!lastNode) return prev;
          const secondLast = prev.find(n => n.next === lastNode.id);
          if (secondLast) {
            return prev.map(n => n.id === secondLast.id ? { ...n, next: null } : n)
                      .filter(n => n.id !== lastNode.id);
          }
          return prev.filter(n => n.id !== lastNode.id);
        });
        setFeedback({ type: 'success', message: '✓ Code executed! One node removed from tail' });
      } else if (operation === 'insertAtPosition') {
        const newId = Math.max(...nodes.map(n => n.id), 0) + 1;
        setNodes(prev => {
          const newNodes = [...prev];
          let current = newNodes.find(n => n.id === 1);
          for (let i = 0; i < operationPosition - 1 && current; i++) {
            current = newNodes.find(n => n.id === current.next);
          }
          if (current) {
            newNodes.push({ id: newId, value: COLORS[operationValue], next: current.next });
            const nodeToUpdate = newNodes.find(n => n.id === current.id);
            if (nodeToUpdate) nodeToUpdate.next = newId;
          }
          return newNodes;
        });
        setFeedback({ type: 'success', message: `✓ Code executed! Node inserted at position ${operationPosition}` });
      } else if (operation === 'removeAtPosition') {
        setNodes(prev => {
          let current = prev.find(n => n.id === 1);
          for (let i = 0; i < operationPosition - 1 && current; i++) {
            current = prev.find(n => n.id === current.next);
          }
          if (current && current.next) {
            const toRemove = prev.find(n => n.id === current.next);
            return prev.map(n => n.id === current.id ? { ...n, next: toRemove?.next || null } : n)
                      .filter(n => n.id !== toRemove?.id);
          }
          return prev;
        });
        setFeedback({ type: 'success', message: `✓ Code executed! Node removed at position ${operationPosition}` });
      }
    }, 500);
  };

  // Check level completion - only set isCorrectOrder to true when goal is met
  useEffect(() => {
    if (operationExecuted) {
      setTimeout(() => {
        const current = getCurrentPattern();
        const goalMet = current.length === currentLevel.goalPattern.length && 
                        current.every((v, i) => v === currentLevel.goalPattern[i]);
        
        setIsCorrectOrder(goalMet);
        
        if (goalMet && !completedLevels.includes(currentLevelId)) {
          setCompletedLevels([...completedLevels, currentLevelId]);
          setTimeout(() => {
            setFeedback({ type: 'complete', message: '🎉 Level Complete!' });
          }, 800);
        }
      }, 1000);
    }
  }, [nodes, operationExecuted, currentLevel.goalPattern, currentLevelId, completedLevels]);

  const handleDragStart = (e, index, source) => {
    setDraggedIndex({ index, source });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e, index, areaType, position = 'before') => {
    e.preventDefault();
    setDragOverIndex({ index, areaType, position });
  };

  const handleDragLeave = (e) => {
    setDragOverIndex(null);
  };

  const handleDropInPool = (e, poolType) => {
    e.preventDefault();
    if (!draggedIndex) return;
    
    if (poolType === 'code' && draggedIndex.source === 'assembly') {
      const item = assemblyArea[draggedIndex.index];
      setAssemblyArea(assemblyArea.filter((_, i) => i !== draggedIndex.index));
      setCodePool([...codePool, item]);
    } else if (poolType === 'complexity' && draggedIndex.source === 'complexity-assembly') {
      const item = complexityArea[draggedIndex.index];
      setComplexityArea(complexityArea.filter((_, i) => i !== draggedIndex.index));
      setComplexityPool([...complexityPool, item]);
    }
    setDraggedIndex(null);
  };

  const handleDropInAssembly = (e, areaType, dropIndex = null, position = 'before') => {
    e.preventDefault();
    setDragOverIndex(null);
    if (!draggedIndex) return;
    
    if (areaType === 'code') {
      if (draggedIndex.source === 'pool') {
        // From pool to assembly at specific position
        const item = codePool[draggedIndex.index];
        setCodePool(codePool.filter((_, i) => i !== draggedIndex.index));
        
        if (dropIndex !== null) {
          const newAssembly = [...assemblyArea];
          const insertIdx = position === 'after' ? dropIndex + 1 : dropIndex;
          newAssembly.splice(insertIdx, 0, item);
          setAssemblyArea(newAssembly);
        } else {
          setAssemblyArea([...assemblyArea, item]);
        }
      } else if (draggedIndex.source === 'assembly') {
        // Reorder within assembly area
        if (dropIndex !== null && dropIndex !== draggedIndex.index) {
          const newAssembly = [...assemblyArea];
          const [movedItem] = newAssembly.splice(draggedIndex.index, 1);
          let insertIndex = position === 'after' ? dropIndex + 1 : dropIndex;
          if (dropIndex > draggedIndex.index) {
            insertIndex = position === 'after' ? dropIndex : dropIndex - 1;
          }
          newAssembly.splice(insertIndex, 0, movedItem);
          setAssemblyArea(newAssembly);
        }
      }
    } else if (areaType === 'complexity') {
      if (draggedIndex.source === 'complexity-pool') {
        // From pool to complexity area at specific position
        const item = complexityPool[draggedIndex.index];
        setComplexityPool(complexityPool.filter((_, i) => i !== draggedIndex.index));
        
        if (dropIndex !== null) {
          const newComplexity = [...complexityArea];
          const insertIdx = position === 'after' ? dropIndex + 1 : dropIndex;
          newComplexity.splice(insertIdx, 0, item);
          setComplexityArea(newComplexity);
        } else {
          setComplexityArea([...complexityArea, item]);
        }
      } else if (draggedIndex.source === 'complexity-assembly') {
        // Reorder within complexity area
        if (dropIndex !== null && dropIndex !== draggedIndex.index) {
          const newComplexity = [...complexityArea];
          const [movedItem] = newComplexity.splice(draggedIndex.index, 1);
          let insertIndex = position === 'after' ? dropIndex + 1 : dropIndex;
          if (dropIndex > draggedIndex.index) {
            insertIndex = position === 'after' ? dropIndex : dropIndex - 1;
          }
          newComplexity.splice(insertIndex, 0, movedItem);
          setComplexityArea(newComplexity);
        }
      }
    }
    setDraggedIndex(null);
  };

  const resetLevel = () => {
    const indices = currentLevel.pseudocode.map((_, i) => i);
    setCodePool(shuffleArray(indices));
    setAssemblyArea([]);
    setComplexityArea([]);
    setIsCorrectOrder(false);
    setOperationExecuted(false);
    setNodes(JSON.parse(JSON.stringify(currentLevel.initialNodes)));
    setFeedback(null);
    setShowError(false);
    
    if (currentLevel.hasComplexity) {
      const complexityIndices = currentLevel.complexity.map((_, i) => i);
      setComplexityPool(shuffleArray(complexityIndices));
    }
  };

  const currentPattern = getCurrentPattern();
  const isLevelComplete = completedLevels.includes(currentLevelId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-2">Linked List Code Assembly</h1>
        <p className="text-slate-300 mb-6">Drag pseudocode blocks in the correct order to execute operations!</p>

        {/* Level selection */}
        <div className="mb-8 p-4 bg-slate-800 rounded-lg border border-slate-700">
          <p className="text-slate-300 text-sm mb-3">Levels:</p>
          <div className="flex gap-2 flex-wrap">
            {LEVELS.map((level, idx) => {
              // UNLOCKING DISABLED FOR TESTING - Remove comments to enable
              // const isLocked = idx > 0 && !completedLevels.includes(LEVELS[idx - 1].id);
              const isLocked = false; // Temporarily allow all levels
              return (
                <button
                  key={level.id}
                  onClick={() => {
                    if (!isLocked) {
                      setCurrentLevelId(level.id);
                    }
                  }}
                  disabled={isLocked}
                  className={`px-4 py-2 rounded font-bold text-sm transition-all ${
                    currentLevelId === level.id
                      ? 'bg-blue-600 text-white border-2 border-blue-400'
                      : isLocked
                      ? 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                      : completedLevels.includes(level.id)
                      ? 'bg-green-700 text-white hover:bg-green-600'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {isLocked ? <Lock size={14} className="inline mr-1" /> : 
                   completedLevels.includes(level.id) ? <Star size={14} className="inline mr-1" /> : 
                   <Unlock size={14} className="inline mr-1" />}
                  L{level.id}
                </button>
              );
            })}
          </div>
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`mb-6 rounded-lg p-4 border-l-4 ${
            feedback.type === 'complete'
              ? 'bg-green-900 border-green-500 text-green-100'
              : 'bg-blue-900 border-blue-500 text-blue-100'
          }`}>
            <p className="font-bold">{feedback.message}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-8">
          {/* Left: Goal and Instructions */}
          <div className="space-y-6">
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 className="text-2xl font-bold text-white mb-2">{currentLevel.title}</h2>
              <p className="text-slate-300 text-sm mb-4">{currentLevel.description}</p>

              {/* Goal pattern */}
              <div className="bg-slate-700 rounded p-4 mb-4">
                <p className="text-slate-300 text-sm mb-3">🎯 Goal Pattern:</p>
                <div className="flex gap-3 flex-wrap">
                  {currentLevel.goalPattern.map((shape, idx) => (
                    <div key={idx} className="w-16 h-16 bg-yellow-600 rounded-lg flex items-center justify-center text-4xl border-3 border-yellow-400 font-bold shadow-lg">
                      {shape}
                    </div>
                  ))}
                </div>
              </div>

              {/* Hint */}
              <div className="bg-blue-900 border border-blue-500 rounded p-3 text-blue-100 text-sm">
                <p className="font-bold mb-1">💡 Hint:</p>
                <p>{currentLevel.hint}</p>
              </div>
            </div>

            {/* Unified Code & Complexity Pool - only for advanced levels */}
            {currentLevel.hasComplexity ? (
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-3">📦 Code & Complexity Blocks</h3>
                <div className="bg-slate-700 rounded p-4 space-y-2">
                  {/* Code blocks */}
                  {codePool.map((codeIdx, poolIdx) => (
                    <div
                      key={`pool-${poolIdx}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, poolIdx, 'pool')}
                      className="bg-slate-600 hover:bg-slate-500 text-white p-3 rounded cursor-move border-2 border-slate-500 hover:border-blue-400 transition-all font-mono text-sm"
                    >
                      {currentLevel.pseudocode[codeIdx]}
                    </div>
                  ))}
                  
                  {/* Complexity blocks in a flex row */}
                  {complexityPool.length > 0 && (
                    <div className="flex gap-2 flex-wrap pt-2">
                      {complexityPool.map((complexityIdx, poolIdx) => (
                        <div
                          key={`complexity-pool-${poolIdx}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, poolIdx, 'complexity-pool')}
                          className="bg-purple-700 hover:bg-purple-600 text-white px-4 py-2 rounded cursor-move border-2 border-purple-600 hover:border-purple-400 transition-all font-mono text-xs font-bold"
                        >
                          {currentLevel.complexity[complexityIdx]}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {codePool.length === 0 && complexityPool.length === 0 && (
                    <p className="text-slate-400 text-sm text-center py-8">All blocks used</p>
                  )}
                </div>
              </div>
            ) : (
              /* Simple code pool for basic levels */
              <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-3">📦 Code Blocks</h3>
                <div 
                  className="min-h-32 bg-slate-700 rounded p-4 space-y-2"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropInPool(e, 'code')}
                >
                  {codePool.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-8">All blocks used</p>
                  ) : (
                    codePool.map((codeIdx, poolIdx) => (
                      <div
                        key={`pool-${poolIdx}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, poolIdx, 'pool')}
                        className="bg-slate-600 hover:bg-slate-500 text-white p-3 rounded cursor-move border-2 border-slate-500 hover:border-blue-400 transition-all font-mono text-sm"
                      >
                        {currentLevel.pseudocode[codeIdx]}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Assembly Area */}
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
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropInAssembly(e, 'code')}
                >
                  {currentLevel.hasComplexity && (
                    <p className="text-slate-300 text-xs font-bold mb-2">Code Sequence:</p>
                  )}
                  {assemblyArea.length === 0 ? (
                    <div 
                      className="text-slate-400 text-sm text-center py-32 border-2 border-dashed border-slate-600 rounded"
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDropInAssembly(e, 'code')}
                    >
                      Drop code blocks here
                    </div>
                  ) : (
                    <>
                      {assemblyArea.map((codeIdx, asmIdx) => (
                        <div
                          key={`asm-${asmIdx}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, asmIdx, 'assembly')}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Detect if dragging over top or bottom half
                            const rect = e.currentTarget.getBoundingClientRect();
                            const mouseY = e.clientY;
                            const middle = rect.top + rect.height / 2;
                            const position = mouseY < middle ? 'before' : 'after';
                            handleDragEnter(e, asmIdx, 'code', position);
                          }}
                          onDrop={(e) => {
                            e.stopPropagation();
                            const position = dragOverIndex?.position || 'before';
                            handleDropInAssembly(e, 'code', asmIdx, position);
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
                          {currentLevel.pseudocode[codeIdx]}
                        </div>
                      ))}
                      {/* Drop zone at the bottom */}
                      <div 
                        className="min-h-16 border-2 border-dashed border-slate-600 rounded text-slate-500 text-xs text-center flex items-center justify-center hover:border-blue-400 hover:text-blue-400 transition-all"
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDropInAssembly(e, 'code')}
                      >
                        Drop here to append
                      </div>
                    </>
                  )}
                </div>

                {/* Complexity column - only for advanced levels */}
                {currentLevel.hasComplexity && (
                  <div 
                    className="space-y-2"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropInAssembly(e, 'complexity')}
                  >
                    <p className="text-slate-300 text-xs font-bold mb-2">Time Complexity:</p>
                    {complexityArea.length === 0 ? (
                      <div 
                        className="text-slate-400 text-sm text-center py-32 border-2 border-dashed border-slate-600 rounded"
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDropInAssembly(e, 'complexity')}
                      >
                        Drop complexity here
                      </div>
                    ) : (
                      <>
                        {complexityArea.map((complexityIdx, asmIdx) => (
                          <div
                            key={`complexity-asm-${asmIdx}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, asmIdx, 'complexity-assembly')}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              // Detect if dragging over top or bottom half
                              const rect = e.currentTarget.getBoundingClientRect();
                              const mouseY = e.clientY;
                              const middle = rect.top + rect.height / 2;
                              const position = mouseY < middle ? 'before' : 'after';
                              handleDragEnter(e, asmIdx, 'complexity', position);
                            }}
                            onDrop={(e) => {
                              e.stopPropagation();
                              const position = dragOverIndex?.position || 'before';
                              handleDropInAssembly(e, 'complexity', asmIdx, position);
                            }}
                            className={`px-4 py-3 rounded cursor-move border-2 transition-all font-mono text-xs text-center font-bold ${
                              isCorrectOrder 
                                ? 'bg-green-700 border-green-500 text-white'
                                : 'bg-purple-700 border-purple-600 text-white hover:bg-purple-600 hover:border-purple-400'
                            } ${
                              dragOverIndex?.areaType === 'complexity' && dragOverIndex?.index === asmIdx 
                                ? dragOverIndex.position === 'before'
                                  ? 'border-t-4 border-t-yellow-400' 
                                  : 'border-b-4 border-b-yellow-400'
                                : ''
                            }`}
                          >
                            {currentLevel.complexity[complexityIdx]}
                          </div>
                        ))}
                        {/* Drop zone at the bottom */}
                        <div 
                          className="min-h-16 border-2 border-dashed border-slate-600 rounded text-slate-500 text-xs text-center flex items-center justify-center hover:border-purple-400 hover:text-purple-400 transition-all"
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDropInAssembly(e, 'complexity')}
                        >
                          Drop here to append
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              
              {showError && (
                <div className="mt-4 bg-red-900 border border-red-500 rounded p-3 flex items-center gap-2">
                  <AlertTriangle className="text-red-400" size={20} />
                  <p className="text-red-100 text-sm font-semibold">
                    ❌ {currentLevel.hasComplexity ? 'Code sequence or time complexity is incorrect. Please rearrange!' : 'Code sequence is incorrect. Please rearrange!'}
                  </p>
                </div>
              )}
              
              <button
                onClick={resetLevel}
                className="w-full mt-4 bg-slate-600 hover:bg-slate-700 text-white py-2 rounded font-semibold"
              >
                Reset Level
              </button>
            </div>
          </div>

          {/* Right: Linked List Visualization */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">🔗 Current Linked List State</h2>

            {/* Current pattern */}
            <div className="bg-slate-700 rounded p-4 mb-6">
              <p className="text-slate-300 text-sm mb-3">Current Pattern:</p>
              <div className="flex gap-3 flex-wrap min-h-24">
                {currentPattern.length === 0 ? (
                  <p className="text-slate-400 text-sm my-auto">Empty</p>
                ) : (
                  currentPattern.map((shape, idx) => {
                    const isCorrect = shape === currentLevel.goalPattern[idx];
                    return (
                      <div 
                        key={idx} 
                        className={`w-16 h-16 rounded-lg flex items-center justify-center text-4xl border-3 font-bold transition-all transform ${
                          isCorrect
                            ? 'bg-green-600 border-green-400 scale-110 shadow-lg shadow-green-500'
                            : 'bg-slate-600 border-slate-500'
                        }`}
                      >
                        {shape}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Memory structure */}
            <div className="bg-slate-700 rounded p-4 mb-6">
              <p className="text-slate-300 text-sm mb-3">Memory Structure:</p>
              <div className="flex items-center gap-2 flex-wrap font-mono text-sm min-h-20">
                {nodes.length === 0 ? (
                  <span className="text-slate-400">NULL</span>
                ) : (
                  <>
                    {nodes.map((node) => (
                      <React.Fragment key={node.id}>
                        <div className="bg-slate-600 border-2 border-slate-500 rounded px-3 py-2 text-white">
                          <div className="font-bold text-lg">{node.value}</div>
                          <div className="text-xs text-slate-200">id:{node.id}</div>
                          <div className="text-xs text-slate-300">→{node.next || 'NULL'}</div>
                        </div>
                        {node.next !== null && <span className="text-slate-400">→</span>}
                      </React.Fragment>
                    ))}
                    <span className="text-slate-400">NULL</span>
                  </>
                )}
              </div>
            </div>

            {/* Status */}
            <div className="bg-slate-700 rounded p-4">
              {isLevelComplete ? (
                <div className="space-y-3">
                  <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded p-3 text-white text-center font-bold">
                    ✓ Level Complete!
                  </div>
                  {currentLevelId < LEVELS.length && (
                    <button
                      onClick={() => {
                        const nextLevel = LEVELS[currentLevelId];
                        setCurrentLevelId(nextLevel.id);
                      }}
                      className="w-full bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-700 hover:to-yellow-600 text-white py-3 rounded font-bold flex items-center justify-center gap-2"
                    >
                      Next Level <ChevronRight size={20} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-slate-300 text-sm">
                  <p className="mb-2">📋 Steps to complete:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Drag code blocks to Assembly Area</li>
                    {currentLevel.hasComplexity && (
                      <li>Drag time complexity blocks to match each code line</li>
                    )}
                    <li>Arrange them in correct order</li>
                    <li>Code will auto-execute when correct</li>
                    <li>Match the goal pattern to complete</li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}