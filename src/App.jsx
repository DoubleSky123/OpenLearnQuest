import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { LEVEL_TEMPLATES } from './config/levels';
import { generateQuestion } from './services/questionGenerator';
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
  // ── Difficulty level (1 / 2 / 3) ──────────────────────────────────────
  const [currentLevelId, setCurrentLevelId]   = useState(1);

  // ── Generated question for this round ────────────────────────────────
  const [currentQuestion, setCurrentQuestion] = useState(() => generateQuestion(1));

  // ── Completed difficulties ─────────────────────────────────────────────
  const [completedLevels, setCompletedLevels] = useState([]);

  // ── Drag state ────────────────────────────────────────────────────────
  const [draggedIndex, setDraggedIndex]   = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  // ── Board state ───────────────────────────────────────────────────────
  const [nodes, setNodes]               = useState([]);
  const [assemblyArea, setAssemblyArea] = useState([]);
  const [codePool, setCodePool]         = useState([]);
  const [isCorrectOrder, setIsCorrectOrder]     = useState(false);
  const [operationExecuted, setOperationExecuted] = useState(false);
  const [feedback, setFeedback]         = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);

  // ─────────────────────────────────────────────────────────────────────
  // Initialise board whenever the question changes
  // ─────────────────────────────────────────────────────────────────────
  const initBoard = useCallback((question) => {
    const codeItems      = question.pseudocode.map((_, i) => ({ index: i, isDistractor: false }));
    const distractorItems = (question.distractors ?? []).map((_, i) => ({ index: i, isDistractor: true }));
    setCodePool(shuffleArray([...codeItems, ...distractorItems]));
    setAssemblyArea([]);
    setNodes(JSON.parse(JSON.stringify(question.initialNodes)));
    setIsCorrectOrder(false);
    setOperationExecuted(false);
    setFeedback(null);
    setErrorDetails(null);
  }, []);

  // When level changes → generate a new question
  useEffect(() => {
    const q = generateQuestion(currentLevelId);
    setCurrentQuestion(q);
    initBoard(q);
  }, [currentLevelId]);          // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────
  // Validation effect
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentQuestion) return;
    const validation = validateAssembly(assemblyArea, [], currentQuestion);

    if (validation.isValid && !operationExecuted) {
      setOperationExecuted(true);
      setErrorDetails(null);
      setFeedback(null);

      setTimeout(() => {
        // For combined questions execute both operations in sequence
        if (currentQuestion.isCombined) {
          const res1 = executeLinkedListOperation(
            currentQuestion.operation,
            nodes,
            currentQuestion.operationValue,
            currentQuestion.operationPosition,
          );
          const res2 = executeLinkedListOperation(
            currentQuestion.operation2,
            res1.nodes,
            currentQuestion.operationValue2,
            currentQuestion.operationPosition2,
          );
          setNodes(res2.nodes);
          setFeedback({ type: 'success', message: `✔ ${res1.message} → ${res2.message}` });
        } else {
          const res = executeLinkedListOperation(
            currentQuestion.operation,
            nodes,
            currentQuestion.operationValue,
            currentQuestion.operationPosition,
          );
          setNodes(res.nodes);
          setFeedback({ type: 'success', message: res.message });
        }
      }, 500);

    } else if (operationExecuted && assemblyArea.length !== currentQuestion.correctOrder.length) {
      setErrorDetails({ type: 'already_executed', message: 'Code already executed! Reset to try again.' });
      setIsCorrectOrder(false);
    } else if (!operationExecuted && validation.errors) {
      setErrorDetails(validation.errors);
      setIsCorrectOrder(false);
    } else if (!operationExecuted && !validation.errors) {
      setErrorDetails(null);
      setIsCorrectOrder(false);
    }
  }, [assemblyArea, operationExecuted]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────
  // Goal-check effect
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!operationExecuted || !currentQuestion) return;

    setTimeout(() => {
      const current  = getCurrentPattern(nodes);
      const goal     = currentQuestion.goalPattern;
      const goalMet  = current.length === goal.length && current.every((v, i) => v === goal[i]);

      setIsCorrectOrder(goalMet);

      if (goalMet && !completedLevels.includes(currentLevelId)) {
        setCompletedLevels(prev => [...prev, currentLevelId]);
        setTimeout(() => setFeedback({ type: 'complete', message: '🎉 Level Complete!' }), 800);
      }
    }, 1000);
  }, [nodes, operationExecuted]);    // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────
  // Drag handlers
  // ─────────────────────────────────────────────────────────────────────
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

  const handleDropInPool = (e) => {
    e.preventDefault();
    if (!draggedIndex) return;
    if (draggedIndex.source === 'assembly') {
      const item = assemblyArea[draggedIndex.index];
      setAssemblyArea(prev => prev.filter((_, i) => i !== draggedIndex.index));
      setCodePool(prev => [...prev, item]);
      setErrorDetails(null);
    }
    setDraggedIndex(null);
  };

  const handleDropInAssembly = (e, areaType, dropIndex = null, position = 'before') => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedIndex || areaType !== 'code') {
      setDragOverIndex(null);
      return;
    }

    const captured = draggedIndex;
    setDraggedIndex(null);  // clear immediately to prevent double-fire
    setDragOverIndex(null);

    if (captured.source === 'pool') {
      const item = codePool[captured.index];
      setCodePool(prev => prev.filter((_, i) => i !== captured.index));
      setAssemblyArea(prev => {
        const next = [...prev];
        const idx  = dropIndex !== null ? (position === 'after' ? dropIndex + 1 : dropIndex) : next.length;
        next.splice(idx, 0, item);
        return next;
      });
    } else if (captured.source === 'assembly') {
      if (dropIndex !== null && dropIndex !== captured.index) {
        setAssemblyArea(prev => {
          const next = [...prev];
          const [moved] = next.splice(captured.index, 1);
          let ins = position === 'after' ? dropIndex + 1 : dropIndex;
          if (dropIndex > captured.index) ins = position === 'after' ? dropIndex : dropIndex - 1;
          next.splice(ins, 0, moved);
          return next;
        });
      }
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // Reset / next
  // ─────────────────────────────────────────────────────────────────────
  const resetQuestion = () => initBoard(currentQuestion);

  const newQuestion = () => {
    const q = generateQuestion(currentLevelId);
    setCurrentQuestion(q);
    initBoard(q);
  };

  const handleNextLevel = () => {
    const next = currentLevelId < 3 ? currentLevelId + 1 : 1;
    setCurrentLevelId(next);
  };

  // ─────────────────────────────────────────────────────────────────────
  // Derived
  // ─────────────────────────────────────────────────────────────────────
  const isLevelComplete  = completedLevels.includes(currentLevelId);
  const currentPattern   = getCurrentPattern(nodes);
  const q                = currentQuestion;

  if (!q) return null;

  // LevelSelector expects objects with { id, label } shape
  const levelsForSelector = LEVEL_TEMPLATES.map(lt => ({
    id:    lt.id,
    title: lt.label,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <h1 className="text-4xl font-bold text-white mb-1">Linked List Code Assembly</h1>
        <p className="text-slate-300 mb-6">Drag pseudocode blocks in the correct order to execute the operation!</p>

        {/* Level selector + new-question button */}
        <div className="flex items-center gap-4 mb-8">
          <LevelSelector
            levels={levelsForSelector}
            currentLevelId={currentLevelId}
            completedLevels={completedLevels}
            onLevelChange={setCurrentLevelId}
          />
          <button
            onClick={newQuestion}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold text-sm"
            title="Generate a new random question at this difficulty"
          >
            <RefreshCw size={16} /> New Question
          </button>
        </div>

        <FeedbackMessage feedback={feedback} />

        <div className="grid grid-cols-2 gap-8">

          {/* ── Top Left: Goal & Hint ─────────────────────────────── */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold text-white">{q.title}</h2>
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                currentLevelId === 1 ? 'bg-green-700 text-green-100' :
                currentLevelId === 2 ? 'bg-yellow-700 text-yellow-100' :
                                       'bg-red-800 text-red-100'
              }`}>
                {LEVEL_TEMPLATES[currentLevelId - 1].difficulty}
              </span>
            </div>
            <p className="text-slate-300 text-sm mb-4">{q.description}</p>
            <GoalPattern goalPattern={q.goalPattern} useNumbers={q.useNumbers} />
            <HintBox hint={q.hint} />
          </div>

          {/* ── Top Right: Linked List State ─────────────────────── */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">🔗 Current Linked List State</h2>

            <div className="bg-slate-700 rounded p-4 mb-4">
              <p className="text-slate-300 text-sm mb-3">Current Pattern:</p>
              <div className="flex gap-3 flex-wrap min-h-16">
                {currentPattern.length === 0 ? (
                  <p className="text-slate-400 text-sm my-auto">Empty</p>
                ) : (
                  currentPattern.map((value, idx) => {
                    const isCorrect = value === q.goalPattern[idx];
                    return (
                      <div
                        key={idx}
                        className={`w-12 h-12 text-lg rounded-lg flex items-center justify-center border-2 font-bold transition-all ${
                          isCorrect
                            ? 'bg-green-600 border-green-400 scale-110 shadow-lg shadow-green-500'
                            : 'bg-slate-600 border-slate-500 text-white'
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
              <div className="flex items-center gap-2 flex-wrap font-mono text-sm min-h-16 overflow-x-auto">
                {nodes.length === 0 ? (
                  <span className="text-slate-400">NULL</span>
                ) : (
                  <>
                    {nodes.map((node) => (
                      <React.Fragment key={node.id}>
                        <div className="bg-slate-600 border-2 border-slate-500 rounded px-3 py-2 text-white shrink-0">
                          <div className="font-bold text-base">{formatPatternValue(node.value)}</div>
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
              <div className="bg-slate-700 rounded p-4 mt-4 space-y-3">
                <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded p-3 text-white text-center font-bold">
                  ✓ Level Complete!
                </div>
                <button
                  onClick={handleNextLevel}
                  className="w-full bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-700 hover:to-yellow-600 text-white py-3 rounded font-bold flex items-center justify-center gap-2"
                >
                  {currentLevelId < 3 ? 'Next Level' : 'Play Again'} <ChevronRight size={20} />
                </button>
              </div>
            )}
          </div>

          {/* ── Bottom Left: Code Pool ────────────────────────────── */}
          <CodePool
            codePool={codePool}
            complexityPool={[]}
            currentLevel={q}
            onDragStart={handleDragStart}
            onDrop={handleDropInPool}
          />

          {/* ── Bottom Right: Assembly Area ───────────────────────── */}
          <AssemblyArea
            assemblyArea={assemblyArea}
            complexityArea={[]}
            currentLevel={q}
            isCorrectOrder={isCorrectOrder}
            errorDetails={errorDetails}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDrop={handleDropInAssembly}
            onReset={resetQuestion}
            dragOverIndex={dragOverIndex}
          />
        </div>
      </div>
    </div>
  );
}
