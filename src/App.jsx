import React, { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { LEVELS } from './config/levels';
import { shuffleArray, getCurrentPattern, formatPatternValue } from './utils/helpers';
import { executeLinkedListOperation } from './services/linkedListOperations';
import { validateAssembly } from './services/validationLogic';
import LevelSelector from './components/LevelSelector';
import FeedbackMessage from './components/FeedbackMessage';
import GoalPattern from './components/GoalPattern';
import HintBox from './components/HintBox';
import CodePool from './components/CodePool';
import AssemblyArea from './components/AssemblyArea';

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
  const [errorDetails, setErrorDetails] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const currentLevel = LEVELS.find(l => l.id === currentLevelId);

  useEffect(() => {
    const allCodeIndices = currentLevel.pseudocode.map((_, i) => ({ index: i, isDistractor: false }));
    const distractorIndices = (currentLevel.distractors || []).map((_, i) => ({ index: i, isDistractor: true }));
    const combinedPool = [...allCodeIndices, ...distractorIndices];
    
    setCodePool(shuffleArray(combinedPool));
    setAssemblyArea([]);
    setComplexityArea([]);
    setIsCorrectOrder(false);
    setOperationExecuted(false);
    setNodes(JSON.parse(JSON.stringify(currentLevel.initialNodes)));
    setFeedback(null);
    setErrorDetails(null);
    
    if (currentLevel.hasComplexity) {
      setComplexityPool(['O(1)', 'O(n)', 'O(log n)', 'O(n²)']);
    } else {
      setComplexityPool([]);
    }
  }, [currentLevelId]);

  useEffect(() => {
    const validation = validateAssembly(assemblyArea, complexityArea, currentLevel);
    
    if (validation.isValid && !operationExecuted) {
      setOperationExecuted(true);
      setErrorDetails(null);
      
      setTimeout(() => {
        const result = executeLinkedListOperation(
          currentLevel.operation,
          nodes,
          currentLevel.operationValue,
          currentLevel.operationPosition
        );
        setNodes(result.nodes);
        setFeedback({ type: 'success', message: result.message });
      }, 500);
    } else if (operationExecuted && (assemblyArea.length !== currentLevel.correctOrder.length || 
               (currentLevel.hasComplexity && complexityArea.length !== currentLevel.complexity.length))) {
      setErrorDetails({
        type: 'already_executed',
        message: 'Code already executed! Reset the level to try a different solution.'
      });
      setIsCorrectOrder(false);
    } else if (!operationExecuted && validation.errors) {
      setErrorDetails(validation.errors);
      setIsCorrectOrder(false);
    } else if (!operationExecuted && !validation.errors) {
      setErrorDetails(null);
      setIsCorrectOrder(false);
    }
  }, [assemblyArea, complexityArea, operationExecuted]);

  useEffect(() => {
    if (operationExecuted) {
      setTimeout(() => {
        const current = getCurrentPattern(nodes);
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
  }, [nodes, operationExecuted]);

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

  const handleDropInPool = (e, poolType) => {
    e.preventDefault();
    if (!draggedIndex) return;
    
    if (poolType === 'code' && draggedIndex.source === 'assembly') {
      const item = assemblyArea[draggedIndex.index];
      setAssemblyArea(assemblyArea.filter((_, i) => i !== draggedIndex.index));
      setCodePool([...codePool, item]);
      setErrorDetails(null);
    } else if (poolType === 'complexity' && draggedIndex.source === 'complexity-assembly') {
      setComplexityArea(complexityArea.filter((_, i) => i !== draggedIndex.index));
      setErrorDetails(null);
    }
    setDraggedIndex(null);
  };

  const handleDropInAssembly = (e, areaType, dropIndex = null, position = 'before') => {
    e.preventDefault();
    setDragOverIndex(null);
    if (!draggedIndex) return;
    
    if (areaType === 'code') {
      if (draggedIndex.source === 'pool') {
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
        const item = complexityPool[draggedIndex.index];
        
        if (dropIndex !== null) {
          const newComplexity = [...complexityArea];
          const insertIdx = position === 'after' ? dropIndex + 1 : dropIndex;
          newComplexity.splice(insertIdx, 0, item);
          setComplexityArea(newComplexity);
        } else {
          setComplexityArea([...complexityArea, item]);
        }
      } else if (draggedIndex.source === 'complexity-assembly') {
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
    const allCodeIndices = currentLevel.pseudocode.map((_, i) => ({ index: i, isDistractor: false }));
    const distractorIndices = (currentLevel.distractors || []).map((_, i) => ({ index: i, isDistractor: true }));
    const combinedPool = [...allCodeIndices, ...distractorIndices];
    
    setCodePool(shuffleArray(combinedPool));
    setAssemblyArea([]);
    setComplexityArea([]);
    setIsCorrectOrder(false);
    setOperationExecuted(false);
    setNodes(JSON.parse(JSON.stringify(currentLevel.initialNodes)));
    setFeedback(null);
    setErrorDetails(null);
    
    if (currentLevel.hasComplexity) {
      setComplexityPool(['O(1)', 'O(n)', 'O(log n)', 'O(n²)']);
    }
  };

  const handleNextLevel = () => {
    const nextLevelId = currentLevelId + 1;
    if (nextLevelId <= LEVELS.length) {
      setCurrentLevelId(nextLevelId);
    } else {
      setCurrentLevelId(1);
    }
  };

  const isLevelComplete = completedLevels.includes(currentLevelId);
  const currentPattern = getCurrentPattern(nodes);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-2">Linked List Code Assembly</h1>
        <p className="text-slate-300 mb-6">Drag pseudocode blocks in the correct order to execute operations!</p>

        <LevelSelector 
          levels={LEVELS}
          currentLevelId={currentLevelId}
          completedLevels={completedLevels}
          onLevelChange={setCurrentLevelId}
        />

        <FeedbackMessage feedback={feedback} />

        <div className="grid grid-cols-2 gap-8">
          {/* Top Left: Goal & Hint */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-2xl font-bold text-white mb-2">{currentLevel.title}</h2>
            <p className="text-slate-300 text-sm mb-4">{currentLevel.description}</p>
            <GoalPattern goalPattern={currentLevel.goalPattern} useNumbers={currentLevel.useNumbers} />
            <HintBox hint={currentLevel.hint} />
          </div>

          {/* Top Right: Linked List State */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">🔗 Current Linked List State</h2>
            
            <div className="bg-slate-700 rounded p-4 mb-4">
              <p className="text-slate-300 text-sm mb-3">Current Pattern:</p>
              <div className="flex gap-3 flex-wrap min-h-24">
                {currentPattern.length === 0 ? (
                  <p className="text-slate-400 text-sm my-auto">Empty</p>
                ) : (
                  currentPattern.map((value, idx) => {
                    const isCorrect = value === currentLevel.goalPattern[idx];
                    return (
                      <div 
                        key={idx} 
                        className={`${currentLevel.useNumbers ? 'w-14 h-14 text-2xl' : 'w-16 h-16 text-4xl'} rounded-lg flex items-center justify-center border-3 font-bold transition-all transform ${
                          isCorrect ? 'bg-green-600 border-green-400 scale-110 shadow-lg shadow-green-500' : 'bg-slate-600 border-slate-500'
                        }`}
                      >
                        {formatPatternValue(value)}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="bg-slate-700 rounded p-4">
              <p className="text-slate-300 text-sm mb-3">Memory Structure:</p>
              <div className="flex items-center gap-2 flex-wrap font-mono text-sm min-h-20">
                {nodes.length === 0 ? (
                  <span className="text-slate-400">NULL</span>
                ) : (
                  <>
                    {nodes.map((node) => (
                      <React.Fragment key={node.id}>
                        <div className="bg-slate-600 border-2 border-slate-500 rounded px-3 py-2 text-white">
                          <div className="font-bold text-lg">{formatPatternValue(node.value)}</div>
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

            {isLevelComplete && (
              <div className="bg-slate-700 rounded p-4 mt-4">
                <div className="space-y-3">
                  <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded p-3 text-white text-center font-bold">
                    ✓ Level Complete!
                  </div>
                  <button onClick={handleNextLevel} className="w-full bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-700 hover:to-yellow-600 text-white py-3 rounded font-bold flex items-center justify-center gap-2">
                    {currentLevel.id < LEVELS.length ? 'Next Level' : 'Play Again'} <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Left: Code Pool */}
          <CodePool
            codePool={codePool}
            complexityPool={complexityPool}
            currentLevel={currentLevel}
            onDragStart={handleDragStart}
            onDrop={handleDropInPool}
          />

          {/* Bottom Right: Assembly Area */}
          <AssemblyArea
            assemblyArea={assemblyArea}
            complexityArea={complexityArea}
            currentLevel={currentLevel}
            isCorrectOrder={isCorrectOrder}
            errorDetails={errorDetails}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDrop={handleDropInAssembly}
            onReset={resetLevel}
            dragOverIndex={dragOverIndex}
          />
        </div>
      </div>
    </div>
  );
}