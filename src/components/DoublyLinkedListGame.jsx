import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, ArrowLeft } from 'lucide-react';
import { DLL_LEVEL_TEMPLATES, generateDLLQuestion } from '../services/doublyQuestionGenerator';
import { shuffleArray, getCurrentPattern, formatPatternValue } from '../utils/helpers';
import { executeDLLOperation } from '../services/doublyLinkedListOperations';
import { validateAssembly } from '../services/validationLogic';
import LevelSelector from './LevelSelector';
import FeedbackMessage from './FeedbackMessage';
import GoalPattern from './GoalPattern';
import HintBox from './HintBox';
import CodePool from './CodePool';
import AssemblyArea from './AssemblyArea';
import GameTimer from './GameTimer';
import ErrorCounter from './ErrorCounter';
import LevelCompleteModal from './LevelCompleteModal';
import SuggestSinglyModal from './SuggestSinglyModal';

// A-class errors: basic pointer errors that also exist in singly linked lists
const TYPE_A_ERRORS = new Set(['lost_reference', 'off_by_one', 'null_pointer', 'memory_leak']);
const SUGGEST_SINGLY_THRESHOLD = 3;

export default function DoublyLinkedListGame({ onBack }) {
  const [currentLevelId, setCurrentLevelId]   = useState(1);
  const [currentQuestion, setCurrentQuestion] = useState(() => generateDLLQuestion(1));
  const [completedLevels, setCompletedLevels] = useState([]);

  const [draggedIndex, setDraggedIndex]   = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const [nodes, setNodes]                     = useState([]);
  const [assemblyArea, setAssemblyArea]       = useState([]);
  const [codePool, setCodePool]               = useState([]);
  const [isCorrectOrder, setIsCorrectOrder]   = useState(false);
  const [operationExecuted, setOperationExecuted] = useState(false);
  const [feedback, setFeedback]               = useState(null);
  const [errorDetails, setErrorDetails]       = useState(null);

  // ── Timer / error / modal ──────────────────────────────────────────────────
  const timerRef             = useRef(null);
  const [errorCount, setErrorCount] = useState(0);
  const [showModal, setShowModal]   = useState(false);
  const [finalTime, setFinalTime]   = useState(0);
  const lastErrorCountedRef  = useRef(false);
  // ref mirrors — prevent stale closures in async effects
  const completedLevelsRef   = useRef([]);
  const nodesRef             = useRef([]);
  const currentQuestionRef   = useRef(null);
  const currentLevelIdRef    = useRef(1);
  const modalShownForThisQuestionRef = useRef(false);

  // Cross-question Type-A error tracking for adaptive suggestion
  const [typeAErrorCount, setTypeAErrorCount]     = useState(0);
  const [showSuggestModal, setShowSuggestModal]   = useState(false);
  const suggestShownRef                           = useRef(false); // only show once per session
  const typeAErrorCountRef                        = useRef(0);    // ref mirror for use in effects

  // ── Board init ─────────────────────────────────────────────────────────────
  // resetMistakes=true → new question; false → plain reset (keep mistake count)
  const initBoard = useCallback((question, resetMistakes = true) => {
    const codeItems       = question.pseudocode.map((_, i) => ({ index: i, isDistractor: false }));
    const distractorItems = (question.distractors ?? []).map((_, i) => ({ index: i, isDistractor: true }));
    const freshNodes = JSON.parse(JSON.stringify(question.initialNodes));
    setCodePool(shuffleArray([...codeItems, ...distractorItems]));
    setAssemblyArea([]);
    setNodes(freshNodes);
    nodesRef.current = freshNodes;
    currentQuestionRef.current = question;
    setIsCorrectOrder(false);
    setOperationExecuted(false);
    setFeedback(null);
    setErrorDetails(null);
    if (resetMistakes) setErrorCount(0);
    if (resetMistakes) timerRef.current?.reset();
    setShowModal(false);
    lastErrorCountedRef.current = false;
    modalShownForThisQuestionRef.current = false;
  }, []);

  useEffect(() => { completedLevelsRef.current = completedLevels; }, [completedLevels]);
  useEffect(() => { currentLevelIdRef.current = currentLevelId; }, [currentLevelId]);

  useEffect(() => {
    const q = generateDLLQuestion(currentLevelId);
    setCurrentQuestion(q);
    currentQuestionRef.current = q;
    initBoard(q, true);
  }, [currentLevelId]); // eslint-disable-line

  // ── Validation ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentQuestion) return;
    const required   = currentQuestion.correctOrder.length;
    const isFull     = assemblyArea.length === required;
    const validation = validateAssembly(assemblyArea, [], currentQuestion);

    if (!isFull) lastErrorCountedRef.current = false;

    if (validation.isValid && !operationExecuted) {
      setOperationExecuted(true);
      setErrorDetails(null);
      setFeedback(null);
      setTimeout(() => {
        if (currentQuestion.isCombined) {
          const r1 = executeDLLOperation(currentQuestion.operation,  nodes, currentQuestion.operationValue,  currentQuestion.operationPosition);
          const r2 = executeDLLOperation(currentQuestion.operation2, r1.nodes, currentQuestion.operationValue2, currentQuestion.operationPosition2);
          setNodes(r2.nodes);
          setFeedback({ type: 'success', message: `✔ ${r1.message} → ${r2.message}` });
        } else {
          const r = executeDLLOperation(currentQuestion.operation, nodes, currentQuestion.operationValue, currentQuestion.operationPosition);
          setNodes(r.nodes);
          setFeedback({ type: 'success', message: r.message });
        }
      }, 500);
    } else if (operationExecuted && assemblyArea.length !== required) {
      setErrorDetails({ type: 'already_executed', message: 'Code already executed! Reset to try again.' });
      setIsCorrectOrder(false);
    } else if (!operationExecuted && validation.errors) {
      setErrorDetails(validation.errors);
      setIsCorrectOrder(false);
      if (isFull && !lastErrorCountedRef.current) {
        setErrorCount(prev => prev + 1);
        lastErrorCountedRef.current = true;

        // Type-A error detection for adaptive suggestion
        const errType = validation.errors?.type;
        if (errType && TYPE_A_ERRORS.has(errType) && !suggestShownRef.current) {
          const newCount = typeAErrorCountRef.current + 1;
          typeAErrorCountRef.current = newCount;
          setTypeAErrorCount(newCount);
          if (newCount >= SUGGEST_SINGLY_THRESHOLD) {
            suggestShownRef.current = true;
            setTimeout(() => setShowSuggestModal(true), 800);
          }
        }
      }
    } else if (!operationExecuted && !validation.errors) {
      setErrorDetails(null);
      setIsCorrectOrder(false);
    }
  }, [assemblyArea, operationExecuted]); // eslint-disable-line

  // ── Keep nodesRef current ──────────────────────────────────────────────────
  useEffect(() => {
    if (!operationExecuted) return;
    nodesRef.current = nodes;
  }, [nodes, operationExecuted]);

  // ── Goal check → stop timer → show modal ──────────────────────────────────
  useEffect(() => {
    if (!operationExecuted) return;
    const timer = setTimeout(() => {
      const q    = currentQuestionRef.current;
      if (!q) return;
      const cur  = getCurrentPattern(nodesRef.current);
      const goal = q.goalPattern;
      const goalMet = cur.length === goal.length && cur.every((v, i) => v === goal[i]);
      setIsCorrectOrder(goalMet);
      if (goalMet && !modalShownForThisQuestionRef.current) {
        modalShownForThisQuestionRef.current = true;
        if (!completedLevelsRef.current.includes(currentLevelIdRef.current)) {
          setCompletedLevels(prev => {
            const next = [...prev, currentLevelIdRef.current];
            completedLevelsRef.current = next;
            return next;
          });
        }
        timerRef.current?.stop();
        setTimeout(() => {
          const t = timerRef.current?.getElapsed() ?? 0;
          setFinalTime(t);
          setShowModal(true);
        }, 300);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [nodes, operationExecuted]); // eslint-disable-line

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const handleDragStart = (e, index, source) => { setDraggedIndex({ index, source }); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver  = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDragEnter = (e, index, areaType, position = 'before') => { e.preventDefault(); setDragOverIndex({ index, areaType, position }); };

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
    if (!draggedIndex || areaType !== 'code') { setDragOverIndex(null); return; }
    const captured = draggedIndex;
    setDraggedIndex(null);
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

  // ── Reset / Next ───────────────────────────────────────────────────────────
  // reset: keep mistake count; new question: reset mistakes
  const resetQuestion   = () => initBoard(currentQuestion, false);
  const newQuestion     = () => { const q = generateDLLQuestion(currentLevelId); setCurrentQuestion(q); currentQuestionRef.current = q; initBoard(q, true); };
  const handleNextLevel = () => {
    setShowModal(false);
    const next = currentLevelId < 3 ? currentLevelId + 1 : 1;
    setCurrentLevelId(next);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const currentPattern  = getCurrentPattern(nodes);
  const q               = currentQuestion;
  if (!q) return null;

  const levelsForSelector = DLL_LEVEL_TEMPLATES.map(lt => ({ id: lt.id, title: lt.label }));

  const renderDLLMemory = () => {
    if (nodes.length === 0) return <span className="text-slate-400">NULL</span>;
    const allIds     = new Set(nodes.map(n => n.id));
    const pointedIds = new Set(nodes.map(n => n.next).filter(n => n !== null));
    let headId = null;
    for (let id of allIds) { if (!pointedIds.has(id)) { headId = id; break; } }
    if (headId === null) headId = nodes[0].id;
    const ordered = [];
    let cur = nodes.find(n => n.id === headId);
    const visited = new Set();
    while (cur && !visited.has(cur.id)) {
      ordered.push(cur);
      visited.add(cur.id);
      cur = cur.next !== null ? nodes.find(n => n.id === cur.next) : null;
    }
    return (
      <div className="flex items-center gap-1 flex-wrap font-mono text-sm min-h-16 overflow-x-auto">
        <span className="text-slate-400 text-xs">NULL</span>
        {ordered.map((node, idx) => (
          <React.Fragment key={node.id}>
            <span className="text-purple-400 text-xs">⇄</span>
            <div className="bg-slate-600 border-2 border-purple-500 rounded px-3 py-2 text-white shrink-0 text-center">
              <div className="font-bold text-base">{formatPatternValue(node.value)}</div>
              <div className="text-purple-300 text-xs mt-0.5">
                {node.prev !== null ? '←' : '∅'} {node.next !== null ? '→' : '∅'}
              </div>
            </div>
            {idx === ordered.length - 1 && <span className="text-purple-400 text-xs">⇄</span>}
          </React.Fragment>
        ))}
        <span className="text-slate-400 text-xs">NULL</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-7xl mx-auto">

        <div className="flex items-center gap-4 mb-1">
          <button onClick={onBack} className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-sm">
            <ArrowLeft size={16} /> Back
          </button>
          <h1 className="text-4xl font-bold text-white">Doubly Linked List Code Assembly</h1>
        </div>
        <p className="text-slate-300 mb-6 ml-14">
          Each node has both <span className="text-purple-400 font-semibold">next</span> and <span className="text-purple-400 font-semibold">prev</span> pointers — drag pseudocode blocks in the correct order!
        </p>

        <div className="flex items-center gap-3 mb-8 flex-wrap">
          <LevelSelector levels={levelsForSelector} currentLevelId={currentLevelId} completedLevels={completedLevels} onLevelChange={setCurrentLevelId} />
          <button onClick={newQuestion} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-semibold text-sm">
            <RefreshCw size={16} /> New Question
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <GameTimer ref={timerRef} isRunning={!showModal} />
            <ErrorCounter count={errorCount} />
          </div>
        </div>

        <FeedbackMessage feedback={feedback} />

        <div className="grid grid-cols-2 gap-8">
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold text-white">{q.title}</h2>
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                currentLevelId === 1 ? 'bg-green-700 text-green-100' :
                currentLevelId === 2 ? 'bg-yellow-700 text-yellow-100' :
                                       'bg-red-800 text-red-100'
              }`}>
                {DLL_LEVEL_TEMPLATES[currentLevelId - 1].difficulty}
              </span>
            </div>
            <p className="text-slate-300 text-sm mb-4">{q.description}</p>
            <GoalPattern goalPattern={q.goalPattern} useNumbers={q.useNumbers} />
            <HintBox hint={q.hint} />
          </div>

          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">🔗 Current Doubly Linked List State</h2>
            <div className="bg-slate-700 rounded p-4 mb-4">
              <p className="text-slate-300 text-sm mb-3">Current Pattern:</p>
              <div className="flex gap-3 flex-wrap min-h-16">
                {currentPattern.length === 0 ? (
                  <p className="text-slate-400 text-sm my-auto">Empty</p>
                ) : currentPattern.map((value, idx) => {
                  const ok = value === q.goalPattern[idx];
                  return (
                    <div key={idx} className={`w-12 h-12 text-lg rounded-lg flex items-center justify-center border-2 font-bold transition-all ${
                      ok ? 'bg-purple-600 border-purple-400 scale-110 shadow-lg shadow-purple-500' : 'bg-slate-600 border-slate-500 text-white'
                    }`}>
                      {formatPatternValue(value)}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-slate-700 rounded p-4">
              <p className="text-slate-300 text-sm mb-3">Memory Structure (bidirectional):</p>
              {renderDLLMemory()}
            </div>
          </div>

          <CodePool codePool={codePool} complexityPool={[]} currentLevel={q} onDragStart={handleDragStart} onDrop={handleDropInPool} />
          <AssemblyArea assemblyArea={assemblyArea} complexityArea={[]} currentLevel={q} isCorrectOrder={isCorrectOrder} errorDetails={errorDetails} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnter={handleDragEnter} onDrop={handleDropInAssembly} onReset={resetQuestion} dragOverIndex={dragOverIndex} />
        </div>
      </div>

      <LevelCompleteModal
        isOpen={showModal}
        levelId={currentLevelId}
        totalLevels={3}
        timeSeconds={finalTime}
        errorCount={errorCount}
        onNext={handleNextLevel}
        onNewQuestion={() => { setShowModal(false); newQuestion(); }}
        accentColor="from-purple-500 to-pink-500"
      />

      <SuggestSinglyModal
        isOpen={showSuggestModal}
        errorCount={typeAErrorCount}
        onGoSingly={() => {
          setShowSuggestModal(false);
          onBack(); // returns to ModuleSelector, player can pick Singly
        }}
        onStay={() => setShowSuggestModal(false)}
      />
    </div>
  );
}
