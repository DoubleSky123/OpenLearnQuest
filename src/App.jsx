import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LEVEL_TEMPLATES } from './config/levels';
import { generateLevel1Question, generateLevel2Question, generateLevel3Question } from './services/questionGenerator';
import { shuffleArray, getCurrentPattern } from './utils/helpers';
import { executeLinkedListOperation } from './services/linkedListOperations';
import { validateAssembly } from './services/validationLogic';
import GoalPattern, { LinkedListVisualiser } from './components/GoalPattern';
import PetCanvas, { getStage } from './components/PetCanvas';
import CodePool from './components/CodePool';
import AssemblyArea from './components/AssemblyArea';
import ModuleSelector from './components/ModuleSelector';
import ModeSelector from './components/ModeSelector';
import TutorialGame from './components/TutorialGame';
import TrainingGame from './components/TrainingGame';
import DoublyLinkedListGame from './components/DoublyLinkedListGame';
import DLLIntroPage from './components/DLLIntroPage';
import DLLTutorialGame from './components/DLLTutorialGame';
import DLLTrainingGame from './components/DLLTrainingGame';
import SortLinkedListGame from './components/SortLinkedListGame';
import TutorialIntroPage from './components/TutorialIntroPage';
import GameTimer from './components/GameTimer';
import LevelCompleteModal from './components/LevelCompleteModal';
import HelpModal from './components/HelpModal';

// ─── Constants ────────────────────────────────────────────────────────────────

const genQuestion = (levelId, subIdx) => {
  if (levelId === 1) return generateLevel1Question(subIdx);
  if (levelId === 2) return generateLevel2Question(subIdx);
  if (levelId === 3) return generateLevel3Question(subIdx);
  return generateLevel1Question(subIdx);
};

const SUB_COUNTS   = { 1: 4, 2: 4, 3: 4 };
const MAX_LIVES    = 5;
const XP_PER_LEVEL = 500;

const LEVEL_NAMES = [
  'Novice', 'Explorer', 'Learner', 'Practitioner',
  'Skilled', 'Advanced', 'Expert', 'Master',
];

const SUB_LABELS = {
  1: ['Insert at Head', 'Insert at End', 'Remove at Head', 'Remove Last Node'],
  2: ['Insert into Empty List', 'Delete Entire List', 'Insert at Position', 'Remove at Position'],
  3: ['Reverse Linked List', 'Merge Two Sorted Lists', 'Linked List Cycle', 'Sort Linked List'],
};

const LEVEL_DIFFICULTY = ['Beginner', 'Intermediate', 'Advanced'];

// ─── Top Bar ──────────────────────────────────────────────────────────────────

function TopBar({ onBack, xp, lives, timerRef, showModal }) {
  const level     = Math.floor(xp / XP_PER_LEVEL) + 1;
  const levelName = LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)];
  const xpInLevel = xp % XP_PER_LEVEL;
  const xpPct     = Math.round((xpInLevel / XP_PER_LEVEL) * 100);
  const [showHelp, setShowHelp] = React.useState(false);

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto flex items-center">

        {/* Left */}
        <div className="flex-1 flex items-center gap-2">
          <button onClick={onBack} className="border border-gray-300 rounded-lg px-4 py-1.5 text-gray-600 font-semibold text-lg hover:bg-gray-50 transition-colors">
            ← Back
          </button>
          <button onClick={() => setShowHelp(true)} className="w-8 h-8 rounded-full border border-gray-300 text-gray-500 font-bold text-base hover:bg-gray-50 transition-colors flex items-center justify-center" title="Game Guide">
            ?
          </button>
        </div>

        {/* Center */}
        <div className="flex-1 flex justify-center">
          <span className="text-violet-600 text-2xl font-bold">
            Challenge · Solo
          </span>
        </div>

        {/* Right */}
        <div className="flex-1 flex justify-end items-center gap-4">
          <span className="text-gray-700 text-lg font-semibold whitespace-nowrap">
            Level {level} · {levelName}
          </span>
          <div className="w-36 shrink-0">
            <div className="flex justify-between text-sm text-gray-400 mb-1">
              <span>XP</span><span>{xpInLevel}/{XP_PER_LEVEL}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${xpPct}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-1">
            {Array.from({ length: MAX_LIVES }).map((_, i) => (
              <svg key={i} width="18" height="16" viewBox="0 0 18 16">
                <path d="M9 14S1 9 1 4.5A4 4 0 019 2a4 4 0 018 2.5C17 9 9 14 9 14z"
                  fill={i < lives ? '#E24B4A' : '#D1D5DB'} />
              </svg>
            ))}
          </div>
          <GameTimer ref={timerRef} isRunning={!showModal} />
        </div>

      </div>
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}

// ─── Nav Card (Col 1) ─────────────────────────────────────────────────────────

function NavCard({ currentLevelId, completedLevels, onLevelChange, currentSubIdx, completedSubs, onSubChange }) {
  const labels = SUB_LABELS[currentLevelId] ?? [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Level tabs */}
      <div className="grid grid-cols-3 border-b border-gray-200">
        {[1, 2, 3].map(lvl => {
          const isActive   = currentLevelId === lvl;
          const isComplete = completedLevels.includes(lvl);
          return (
            <button
              key={lvl}
              onClick={() => onLevelChange(lvl)}
              className={`py-2.5 text-lg font-semibold border-r border-gray-200 last:border-r-0 transition-colors ${
                isActive   ? 'bg-violet-600 text-white' :
                isComplete ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' :
                             'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {isComplete && !isActive ? '✓ ' : ''}Level {lvl}
            </button>
          );
        })}
      </div>

      {/* Quest list */}
      <div className="p-2 flex flex-col gap-1">
        {labels.map((label, idx) => {
          const isDone   = completedSubs.has(idx);
          const isActive = idx === currentSubIdx;
          return (
            <button
              key={idx}
              onClick={() => onSubChange(idx)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all border ${
                isActive ? 'bg-violet-50 border-violet-200' :
                isDone   ? 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100' :
                           'bg-transparent border-transparent hover:bg-gray-50'
              }`}
            >
              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                isDone   ? 'bg-emerald-100 border border-emerald-300' :
                isActive ? 'bg-violet-100 border border-violet-300' :
                           'bg-gray-100 border border-gray-200'
              }`}>
                <div className={`w-2 h-2 rounded-sm ${
                  isDone ? 'bg-emerald-500' : isActive ? 'bg-violet-500' : 'bg-gray-300'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-lg font-medium truncate ${
                  isActive ? 'text-violet-800' : isDone ? 'text-emerald-800' : 'text-gray-500'
                }`}>{label}</p>
                <p className="text-lg text-gray-400 mt-0.5">
                  {isDone ? 'Completed' : isActive ? 'In progress' : 'Not started'}
                </p>
              </div>
              {isDone && (
                <span className="text-lg bg-violet-50 border border-violet-200 text-violet-600 px-2 py-1 rounded-full shrink-0">
                  +100
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Pet Card ─────────────────────────────────────────────────────────────────

// (PetCanvas imported from ./components/PetCanvas)

function PetCard({ xp, petMood = 'idle' }) {
  const xpInLevel = xp % XP_PER_LEVEL;
  const xpPct     = Math.round((xpInLevel / XP_PER_LEVEL) * 100);
  const petLevel  = Math.floor(xp / XP_PER_LEVEL) + 1;
  const stage     = getStage(xp);

  return (
    <div className="bg-white rounded-xl border-2 border-dashed border-violet-200 overflow-hidden">
      <div className="bg-[#c8dfa8] mx-3 mt-3 rounded-lg flex items-center justify-center py-16">
        <PetCanvas stage={stage} mood={petMood} />
      </div>
      <div className="px-4 py-4 flex flex-col items-center gap-2">
        <p className="text-sm font-semibold text-gray-700">Algo</p>
        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div className="h-full bg-violet-400 rounded-full transition-all duration-500" style={{ width: `${xpPct}%` }} />
        </div>
        <p className="text-xs text-gray-500">Level {petLevel} · {xpInLevel} / {XP_PER_LEVEL} XP</p>
      </div>
    </div>
  );
}

// ─── Singly Linked List Game ──────────────────────────────────────────────────

function SinglyLinkedListGame({ onBack, initialXp = 0, onXpChange, initialLevel = 1 }) {
  const [currentLevelId, setCurrentLevelId] = useState(initialLevel);
  const [currentQuestion, setCurrentQuestion] = useState(() => generateLevel1Question(0));
  const [completedLevels, setCompletedLevels] = useState([]);

  const [subIdx1, setSubIdx1] = useState(0);
  const [subIdx2, setSubIdx2] = useState(0);
  const [subIdx3, setSubIdx3] = useState(0);

  const [completedSubs1, setCompletedSubs1] = useState(new Set());
  const [completedSubs2, setCompletedSubs2] = useState(new Set());
  const [completedSubs3, setCompletedSubs3] = useState(new Set());

  const currentSubIdx        = currentLevelId === 1 ? subIdx1 : currentLevelId === 2 ? subIdx2 : subIdx3;
  const currentCompletedSubs = currentLevelId === 1 ? completedSubs1 : currentLevelId === 2 ? completedSubs2 : completedSubs3;

  const [nodes, setNodes]                     = useState([]);
  const [assemblyArea, setAssemblyArea]       = useState([]);
  const [codePool, setCodePool]               = useState([]);
  const [isCorrectOrder, setIsCorrectOrder]   = useState(false);
  const [operationExecuted, setOperationExecuted] = useState(false);
  const [feedback, setFeedback]               = useState(null);
  const [errorDetails, setErrorDetails]       = useState(null);

  const [lives, setLives]         = useState(MAX_LIVES);
  const [xp, setXp]               = useState(initialXp);
  const [errorCount, setErrorCount] = useState(0);
  const [assists, setAssists]     = useState(0);
  const [xpGained, setXpGained]   = useState(0);

  const timerRef = useRef(null);
  const [showModal, setShowModal] = useState(false);
  const [finalTime, setFinalTime] = useState(0);

  const lastErrorCountedRef  = useRef(false);
  const completedLevelsRef   = useRef([]);
  const nodesRef             = useRef([]);
  const currentQuestionRef   = useRef(null);
  const currentLevelIdRef    = useRef(1);
  const modalShownForThisRef = useRef(false);
  const errorCountRef        = useRef(0);

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
    if (resetMistakes) {
      setErrorCount(0);
      errorCountRef.current = 0;
      setAssists(0);
      timerRef.current?.reset();
    }
    setShowModal(false);
    lastErrorCountedRef.current  = false;
    modalShownForThisRef.current = false;
  }, []);

  useEffect(() => { completedLevelsRef.current = completedLevels; }, [completedLevels]);
  useEffect(() => { currentLevelIdRef.current = currentLevelId; }, [currentLevelId]);

  useEffect(() => {
    if (currentLevelId === 1) { setSubIdx1(0); setCompletedSubs1(new Set()); }
    if (currentLevelId === 2) { setSubIdx2(0); setCompletedSubs2(new Set()); }
    if (currentLevelId === 3) { setSubIdx3(0); setCompletedSubs3(new Set()); }
    const q = genQuestion(currentLevelId, 0);
    setCurrentQuestion(q);
    currentQuestionRef.current = q;
    setLives(MAX_LIVES);
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
        setErrorCount(prev => { const next = prev + 1; errorCountRef.current = next; return next; });
        setLives(prev => Math.max(0, prev - 1));
        lastErrorCountedRef.current = true;
      }
    } else if (!operationExecuted && !validation.errors) {
      setErrorDetails(null);
      setIsCorrectOrder(false);
    }
  }, [assemblyArea, operationExecuted]); // eslint-disable-line

  useEffect(() => {
    if (!operationExecuted) return;
    nodesRef.current = nodes;
  }, [nodes, operationExecuted]);

  // ── Goal check → XP → modal ──────────────────────────────────────────────────
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

      if (goalMet && !modalShownForThisRef.current) {
        modalShownForThisRef.current = true;
        const lvl  = currentLevelIdRef.current;
        const subI = q.subQuestionIndex ?? 0;
        const baseXP = lvl === 1 ? 80 : lvl === 2 ? 120 : 160;
        const gained = Math.max(Math.round(baseXP * 0.3), baseXP - errorCountRef.current * 20);
        setXpGained(gained);
        setXp(prev => { const next = prev + gained; onXpChange?.(next); return next; });

        setCompletedSubsRef.current[lvl]?.(prev => new Set([...prev, subI]));
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

  // ── Click handlers ────────────────────────────────────────────────────────────
  const handlePoolBlockClick = (poolIdx) => {
    const item = codePool[poolIdx];
    setCodePool(prev => prev.filter((_, i) => i !== poolIdx));
    setAssemblyArea(prev => [...prev, item]);
    setErrorDetails(null);
    lastErrorCountedRef.current = false;
  };

  const handleAssemblyBlockClick = (asmIdx) => {
    const item = assemblyArea[asmIdx];
    setAssemblyArea(prev => prev.filter((_, i) => i !== asmIdx));
    setCodePool(prev => [...prev, item]);
    setErrorDetails(null);
    lastErrorCountedRef.current = false;
  };

  // ── Navigation ────────────────────────────────────────────────────────────────
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
  const newQuestion   = () => { const total = SUB_COUNTS[currentLevelId] ?? 3; loadSub(currentLevelId, (currentSubIdx + 1) % total); };
  const jumpToSub     = (idx) => loadSub(currentLevelId, idx);
  const handleNextLevel = () => { setShowModal(false); setCurrentLevelId(prev => prev < 3 ? prev + 1 : 1); };

  // ── Render ────────────────────────────────────────────────────────────────────
  const currentPattern = getCurrentPattern(nodes);
  const q = currentQuestion;
  if (!q) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar onBack={onBack} xp={xp} lives={lives} timerRef={timerRef} showModal={showModal} />

      <div className="max-w-7xl mx-auto p-5">

        {/* Feedback banner */}
        {feedback && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <p className="text-emerald-700 font-semibold text-xl">{feedback.message}</p>
          </div>
        )}

        {/* 3-column layout: nav+info | code area | pet */}
        <div className="grid grid-cols-[1fr_1fr_240px] gap-4 items-start">

          {/* Col 1 — Nav + Quest info */}
          <div className="flex flex-col gap-4">
            <NavCard
              currentLevelId={currentLevelId}
              completedLevels={completedLevels}
              onLevelChange={setCurrentLevelId}
              currentSubIdx={currentSubIdx}
              completedSubs={currentCompletedSubs}
              onSubChange={jumpToSub}
            />

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <h2 className="text-xl font-semibold text-gray-900">{q.title}</h2>
                <span className={`text-lg px-3 py-1 rounded-full font-medium border ${
                  currentLevelId === 1 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  currentLevelId === 2 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                         'bg-red-50 text-red-600 border-red-200'
                }`}>{LEVEL_DIFFICULTY[currentLevelId - 1]}</span>
              </div>
              <p className="text-gray-500 text-lg mb-3">{q.description}</p>

              {/* Current state */}
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-2.5 mb-2">
                <p className="text-gray-400 text-lg font-medium mb-1.5">Current state</p>
                {q.isMerge ? (
                  <>
                    <p className="text-gray-400 text-lg mb-1">l1</p>
                    <LinkedListVisualiser values={q.l1Values} nodeColor="bg-violet-100 border-violet-300 text-violet-800" />
                    <p className="text-gray-400 text-lg mt-1.5 mb-1">l2</p>
                    <LinkedListVisualiser values={q.l2Values} nodeColor="bg-pink-100 border-pink-300 text-pink-800" />
                  </>
                ) : (
                  <LinkedListVisualiser
                    values={currentPattern}
                    emptyLabel="Empty list"
                    highlight={isCorrectOrder}
                    goalValues={isCorrectOrder ? currentPattern : []}
                  />
                )}
              </div>

              {/* Goal state */}
              {q.isCycle ? (
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-2.5">
                  <p className="text-gray-400 text-lg font-medium mb-1">Goal</p>
                  <p className="text-emerald-600 font-semibold text-lg">CYCLE DETECTED → return True</p>
                  <p className="text-gray-400 text-lg mt-1">
                    Last node points back to value <span className="text-amber-600 font-semibold">{q.cycleNodeValue}</span>
                  </p>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-2.5">
                  <p className="text-gray-400 text-lg font-medium mb-1.5">Goal state</p>
                  <LinkedListVisualiser
                    values={q.goalPattern}
                    emptyLabel="Empty list (no nodes)"
                    nodeColor="bg-amber-50 border-amber-300 text-amber-800"
                  />
                </div>
              )}
              {/* Hint — inside panel */}
              <div className="mt-2 bg-violet-50 border border-violet-200 rounded-lg p-2.5">
                <p className="text-lg font-semibold text-violet-700 mb-1">Hint</p>
                <p className="text-violet-600 text-lg leading-relaxed">{q.hint}</p>
              </div>
            </div>
          </div>

          {/* Col 3 — Code area */}
          <div className="flex flex-col gap-4">
            <CodePool
              codePool={codePool}
              currentLevel={q}
              onBlockClick={handlePoolBlockClick}
            />
            <AssemblyArea
              assemblyArea={assemblyArea}
              currentLevel={q}
              isCorrectOrder={isCorrectOrder}
              errorDetails={errorDetails}
              onBlockClick={handleAssemblyBlockClick}
              onReset={resetQuestion}
            />
          </div>

          {/* Col 4 — Pet */}
          <PetCard xp={xp} petMood={isCorrectOrder ? 'happy' : errorDetails ? 'sad' : 'idle'} />

        </div>
      </div>

      <LevelCompleteModal
        isOpen={showModal}
        levelId={currentLevelId}
        totalLevels={3}
        timeSeconds={finalTime}
        errorCount={errorCount}
        xpGained={xpGained}
        onNext={handleNextLevel}
        onNewQuestion={() => { setShowModal(false); newQuestion(); }}
      />
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen]       = useState('menu');
  const [moduleId, setModuleId]   = useState(null);
  const [globalXp, setGlobalXp]   = useState(0);
  const [modeStartAt, setModeStartAt] = useState(0);

  const goMenu       = () => setScreen('menu');
  const goModeSelect = (mod) => { setModuleId(mod); setScreen('mode-select'); };
  const goRegular    = () => setScreen(moduleId === 'doubly' ? 'doubly' : 'singly');

  if (screen === 'menu')        return <ModuleSelector onSelect={goModeSelect} xp={globalXp} />;
  if (screen === 'mode-select') return <ModeSelector moduleId={moduleId} xp={globalXp} onSelect={(mode, qIdx) => {
    setModeStartAt(qIdx ?? 0);
    if (moduleId === 'doubly') {
      if (mode === 'intro')    setScreen('dll-intro');
      if (mode === 'tutorial') setScreen('dll-tutorial');
      if (mode === 'training') setScreen('dll-training');
      if (mode === 'regular')  goRegular();
    } else {
      if (mode === 'intro')    setScreen('tutorial-intro');
      if (mode === 'tutorial') setScreen('tutorial');
      if (mode === 'training') setScreen('training');
      if (mode === 'regular')  goRegular();
    }
  }} onBack={goMenu} />;
  if (screen === 'tutorial-intro') return <TutorialIntroPage xp={globalXp} onBack={() => setScreen('mode-select')} onComplete={() => setScreen('tutorial')} />;
  if (screen === 'dll-intro')      return <DLLIntroPage xp={globalXp} onBack={() => setScreen('mode-select')} onComplete={() => setScreen('dll-tutorial')} />;
  if (screen === 'dll-tutorial')   return <DLLTutorialGame xp={globalXp} onBack={() => setScreen('mode-select')} onGoTraining={() => setScreen('dll-training')} />;
  if (screen === 'dll-training')   return <DLLTrainingGame xp={globalXp} onBack={() => setScreen('mode-select')} onGoChallenge={() => setScreen('doubly')} />;
  if (screen === 'tutorial') return <TutorialGame startAt={modeStartAt} xp={globalXp} onBack={() => setScreen('mode-select')} onGoRegular={() => { setModeStartAt(0); setScreen('training'); }} />;
  if (screen === 'training') return <TrainingGame startAt={modeStartAt} xp={globalXp} onBack={() => setScreen('mode-select')} onGoRegular={() => { setModeStartAt(0); goRegular(); }} />;
  if (screen === 'singly')   return <SinglyLinkedListGame onBack={() => setScreen('mode-select')} initialXp={globalXp} onXpChange={setGlobalXp} initialLevel={modeStartAt || 1} />;
  if (screen === 'doubly')   return <DoublyLinkedListGame onBack={() => setScreen('mode-select')} initialXp={globalXp} onXpChange={setGlobalXp} />;
  if (screen === 'sort')     return <SortLinkedListGame onBack={() => setScreen('mode-select')} />;
  return <ModuleSelector onSelect={goModeSelect} />;
}
