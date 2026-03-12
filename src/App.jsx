import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LEVEL_TEMPLATES } from './config/levels';
import { generateQuestion, generateLevel1Question, generateLevel2Question, generateLevel3Question } from './services/questionGenerator';
import { shuffleArray, getCurrentPattern } from './utils/helpers';
import { executeLinkedListOperation } from './services/linkedListOperations';
import { validateAssembly } from './services/validationLogic';
import LevelSelector from './components/LevelSelector';
import FeedbackMessage from './components/FeedbackMessage';
import GoalPattern, { LinkedListVisualiser } from './components/GoalPattern';
import HintBox from './components/HintBox';
import CodePool from './components/CodePool';
import AssemblyArea from './components/AssemblyArea';
import ModuleSelector from './components/ModuleSelector';
import ModeSelector from './components/ModeSelector';
import TutorialGame from './components/TutorialGame';
import TrainingGame from './components/TrainingGame';
import SubQuestionSelector from './components/SubQuestionSelector';
import DoublyLinkedListGame from './components/DoublyLinkedListGame';
import SortLinkedListGame from './components/SortLinkedListGame';
import GameTimer from './components/GameTimer';
import ErrorCounter from './components/ErrorCounter';
import LevelCompleteModal from './components/LevelCompleteModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const genQuestion = (levelId, subIdx) => {
  if (levelId === 1) return generateLevel1Question(subIdx);
  if (levelId === 2) return generateLevel2Question(subIdx);
  if (levelId === 3) return generateLevel3Question(subIdx);
  return generateLevel1Question(subIdx);
};

const SUB_COUNTS = { 1: 4, 2: 4, 3: 4 };

// ─── Singly Linked List Game ──────────────────────────────────────────────────
function SinglyLinkedListGame({ onBack }) {
  const [currentLevelId, setCurrentLevelId] = useState(1);
  const [currentQuestion, setCurrentQuestion] = useState(() => generateLevel1Question(0));
  const [completedLevels, setCompletedLevels] = useState([]);

  // Sub-question indices per level
  const [subIdx1, setSubIdx1] = useState(0);
  const [subIdx2, setSubIdx2] = useState(0);
  const [subIdx3, setSubIdx3] = useState(0);

  // Completed sub-question sets per level (independent)
  const [completedSubs1, setCompletedSubs1] = useState(new Set());
  const [completedSubs2, setCompletedSubs2] = useState(new Set());
  const [completedSubs3, setCompletedSubs3] = useState(new Set());

  // Derived helpers (render-time only — do NOT use inside useEffect/setTimeout)
  const currentSubIdx = currentLevelId === 1 ? subIdx1 : currentLevelId === 2 ? subIdx2 : subIdx3;
  const currentCompletedSubs = currentLevelId === 1 ? completedSubs1 : currentLevelId === 2 ? completedSubs2 : completedSubs3;

  // Drag state
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  // Board state
  const [nodes, setNodes] = useState([]);
  const [assemblyArea, setAssemblyArea] = useState([]);
  const [codePool, setCodePool] = useState([]);
  const [isCorrectOrder, setIsCorrectOrder] = useState(false);
  const [operationExecuted, setOperationExecuted] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);

  // Timer / error / modal
  const timerRef = useRef(null);
  const [errorCount, setErrorCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [finalTime, setFinalTime] = useState(0);
  const lastErrorCountedRef = useRef(false);

  // Refs to avoid stale closures inside async effects
  const completedLevelsRef = useRef([]);
  const nodesRef = useRef([]);
  const currentQuestionRef = useRef(null);
  const currentLevelIdRef = useRef(1);
  const modalShownForThisQuestionRef = useRef(false);

  // Setters map for completedSubs — stable refs, safe to use inside effects
  const setCompletedSubsRef = useRef({
    1: setCompletedSubs1,
    2: setCompletedSubs2,
    3: setCompletedSubs3,
  });

  // ── Board init ──────────────────────────────────────────────────────────────
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
    if (resetMistakes) { setErrorCount(0); timerRef.current?.reset(); }
    setShowModal(false);
    lastErrorCountedRef.current = false;
    modalShownForThisQuestionRef.current = false;
  }, []);

  // ── Sync refs ───────────────────────────────────────────────────────────────
  useEffect(() => { completedLevelsRef.current = completedLevels; }, [completedLevels]);
  useEffect(() => { currentLevelIdRef.current = currentLevelId; }, [currentLevelId]);

  // ── Level change ────────────────────────────────────────────────────────────
  useEffect(() => {
    // Reset sub-index and completedSubs for the new level
    if (currentLevelId === 1) { setSubIdx1(0); setCompletedSubs1(new Set()); }
    if (currentLevelId === 2) { setSubIdx2(0); setCompletedSubs2(new Set()); }
    if (currentLevelId === 3) { setSubIdx3(0); setCompletedSubs3(new Set()); }
    const q = genQuestion(currentLevelId, 0);
    setCurrentQuestion(q);
    currentQuestionRef.current = q;
    initBoard(q, true);
  }, [currentLevelId]); // eslint-disable-line

  // ── Validation ──────────────────────────────────────────────────────────────
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
        const opVal = currentQuestion.isMerge
          ? { l1Values: currentQuestion.l1Values, l2Values: currentQuestion.l2Values }
          : currentQuestion.operationValue;
        const r = executeLinkedListOperation(
          currentQuestion.operation, nodes, opVal, currentQuestion.operationPosition
        );
        setNodes(r.nodes);
        setFeedback({ type: 'success', message: r.message });
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
      }
    } else if (!operationExecuted && !validation.errors) {
      setErrorDetails(null);
      setIsCorrectOrder(false);
    }
  }, [assemblyArea, operationExecuted]); // eslint-disable-line

  // ── Keep nodesRef current ───────────────────────────────────────────────────
  useEffect(() => {
    if (!operationExecuted) return;
    nodesRef.current = nodes;
  }, [nodes, operationExecuted]);

  // ── Goal check → stop timer → show modal ───────────────────────────────────
  useEffect(() => {
    if (!operationExecuted) return;
    const timer = setTimeout(() => {
      const q    = currentQuestionRef.current;
      if (!q) return;
      const cur  = getCurrentPattern(nodesRef.current);
      const goal = q.goalPattern;
      const goalMet = q.isCycle
        ? true
        : cur.length === goal.length && cur.every((v, i) => v === goal[i]);
      setIsCorrectOrder(goalMet);
      if (goalMet && !modalShownForThisQuestionRef.current) {
        modalShownForThisQuestionRef.current = true;
        // Mark sub-question complete — use stable ref to avoid stale closure
        const lvl = currentLevelIdRef.current;
        const subI = q.subQuestionIndex ?? 0;
        setCompletedSubsRef.current[lvl]?.(prev => new Set([...prev, subI]));
        // Mark level complete
        if (!completedLevelsRef.current.includes(lvl)) {
          setCompletedLevels(prev => {
            const next = [...prev, lvl];
            completedLevelsRef.current = next;
            return next;
          });
        }
        timerRef.current?.stop();
        setTimeout(() => {
          setFinalTime(timerRef.current?.getElapsed() ?? 0);
          setShowModal(true);
        }, 300);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [nodes, operationExecuted]); // eslint-disable-line

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const handleDragStart = (e, index, source) => {
    setDraggedIndex({ index, source });
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver  = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
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

  // ── Navigation ──────────────────────────────────────────────────────────────
  const loadSub = (levelId, idx) => {
    if (levelId === 1) setSubIdx1(idx);
    if (levelId === 2) setSubIdx2(idx);
    if (levelId === 3) setSubIdx3(idx);
    const q = genQuestion(levelId, idx);
    setCurrentQuestion(q);
    currentQuestionRef.current = q;
    initBoard(q, true);
  };

  const resetQuestion = () => initBoard(currentQuestion, false);

  const newQuestion = () => {
    const total  = SUB_COUNTS[currentLevelId] ?? 3;
    const nextIdx = (currentSubIdx + 1) % total;
    loadSub(currentLevelId, nextIdx);
  };

  const jumpToSub = (idx) => loadSub(currentLevelId, idx);

  const handleNextLevel = () => {
    setShowModal(false);
    setCurrentLevelId(prev => prev < 3 ? prev + 1 : 1);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const currentPattern = getCurrentPattern(nodes);
  const q = currentQuestion;
  if (!q) return null;

  const levelsForSelector = LEVEL_TEMPLATES.map(lt => ({ id: lt.id, title: lt.label }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-1">
          <button onClick={onBack} className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-sm">
            ← Back
          </button>
          <h1 className="text-4xl font-bold text-white">Linked List Code Assembly</h1>
        </div>
        <p className="text-slate-300 mb-6 ml-14">Drag pseudocode blocks in the correct order to the Assembly Area to execute the operation!</p>

        {/* Controls */}
        <div className="flex items-center gap-3 mb-8 flex-wrap">
          <LevelSelector
            levels={levelsForSelector}
            currentLevelId={currentLevelId}
            completedLevels={completedLevels}
            onLevelChange={setCurrentLevelId}
          >
            <SubQuestionSelector
              levelId={currentLevelId}
              currentSubIdx={currentSubIdx}
              completedSubs={currentCompletedSubs}
              onSubChange={jumpToSub}
            />
          </LevelSelector>


          <div className="flex items-center gap-2 ml-auto">
            <GameTimer ref={timerRef} isRunning={!showModal} />
            <ErrorCounter count={errorCount} />
          </div>
        </div>

        <FeedbackMessage feedback={feedback} />

        <div className="grid grid-cols-2 gap-8">

          {/* Top Left: Title + Description + Current State */}
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
            {q.isMerge ? (
              <div className="bg-slate-700 rounded p-4">
                <p className="text-slate-300 text-sm mb-2">l1:</p>
                <LinkedListVisualiser values={q.l1Values} nodeColor="bg-indigo-600 border-indigo-400" />
                <p className="text-slate-300 text-sm mt-3 mb-2">l2:</p>
                <LinkedListVisualiser values={q.l2Values} nodeColor="bg-purple-600 border-purple-400" />
              </div>
            ) : (
              <div className="bg-slate-700 rounded p-4">
                <LinkedListVisualiser
                  values={currentPattern}
                  emptyLabel="Empty list"
                  highlight={isCorrectOrder}
                  goalValues={isCorrectOrder ? currentPattern : []}
                />
              </div>
            )}
          </div>

          {/* Top Right: Goal + Hint */}
          <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
            {q.isCycle ? (
              <div className="bg-slate-700 rounded p-4 mb-4">
                <p className="text-slate-300 text-sm mb-3">🎯 Goal:</p>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔄</span>
                  <span className="text-green-400 font-bold text-lg">CYCLE DETECTED → return True</span>
                </div>
                <p className="text-slate-400 text-xs mt-2">The last node points back to the node with value <span className="text-yellow-300 font-bold">{q.cycleNodeValue}</span></p>
              </div>
            ) : (
              <GoalPattern goalPattern={q.goalPattern} useNumbers={q.useNumbers} />
            )}
            <HintBox hint={q.hint} />
          </div>

          <CodePool
            codePool={codePool}
            complexityPool={[]}
            currentLevel={q}
            onDragStart={handleDragStart}
            onDrop={handleDropInPool}
          />
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

      <LevelCompleteModal
        isOpen={showModal}
        levelId={currentLevelId}
        totalLevels={3}
        timeSeconds={finalTime}
        errorCount={errorCount}
        onNext={handleNextLevel}
        onNewQuestion={() => { setShowModal(false); newQuestion(); }}
        accentColor="from-green-500 to-emerald-500"
      />
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]   = useState('menu');
  const [moduleId, setModuleId] = useState(null); // 'singly' | 'doubly'

  const goMenu       = () => setScreen('menu');
  const goModeSelect = (mod) => { setModuleId(mod); setScreen('mode-select'); };
  const goRegular    = () => setScreen(moduleId === 'doubly' ? 'doubly' : 'singly');

  if (screen === 'menu')        return <ModuleSelector onSelect={goModeSelect} />;
  if (screen === 'mode-select') return <ModeSelector moduleId={moduleId} onSelect={(mode) => {
    if (mode === 'tutorial') setScreen('tutorial');
    if (mode === 'training') setScreen('training');
    if (mode === 'regular')  goRegular();
    if (mode === 'sort')     setScreen('sort');
  }} onBack={goMenu} />;
  if (screen === 'tutorial')    return <TutorialGame onBack={() => setScreen('mode-select')} onGoRegular={() => { setScreen('mode-select'); }} />;
  if (screen === 'training')    return <TrainingGame onBack={() => setScreen('mode-select')} onGoRegular={() => { setScreen('mode-select'); }} />;
  if (screen === 'singly')      return <SinglyLinkedListGame onBack={() => setScreen('mode-select')} />;
  if (screen === 'doubly')      return <DoublyLinkedListGame onBack={() => setScreen('mode-select')} />;
  if (screen === 'sort')        return <SortLinkedListGame onBack={() => setScreen('mode-select')} />;
  return <ModuleSelector onSelect={goModeSelect} />;
}
