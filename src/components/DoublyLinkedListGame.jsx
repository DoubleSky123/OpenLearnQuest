import React, { useState, useEffect, useCallback, useRef } from 'react';
import { generateDLLQuestion, DLL_LEVEL_TEMPLATES } from '../services/doublyQuestionGenerator';
import { shuffleArray, getCurrentPattern } from '../utils/helpers';
import { executeDLLOperation } from '../services/doublyLinkedListOperations';
import { validateAssembly } from '../services/validationLogic';
import PetCanvas, { getStage } from './PetCanvas';
import CodePool from './CodePool';
import AssemblyArea from './AssemblyArea';
import GameTimer from './GameTimer';
import LevelCompleteModal from './LevelCompleteModal';
import SuggestSinglyModal from './SuggestSinglyModal';
import HelpModal from './HelpModal';

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_LIVES    = 5;
const XP_PER_LEVEL = 500;
const LEVEL_NAMES  = ['Novice','Explorer','Learner','Practitioner','Skilled','Advanced','Expert','Master'];
const LEVEL_DIFFICULTY = ['Beginner', 'Intermediate', 'Advanced'];

const TYPE_A_ERRORS = new Set(['lost_reference','off_by_one','null_pointer','memory_leak']);
const SUGGEST_SINGLY_THRESHOLD = 3;

// Quest labels per DLL level
const QUEST_LABELS = {
  1: ['Insert at Head','Insert at Tail','Remove at Head','Remove at Tail'],
  2: ['Insert at Position','Remove at Position'],
  3: ['Combined Op A','Combined Op B','Combined Op C'],
};

const OP_TO_QUEST = {
  insertAtHead:     0, insertAtTail:     1,
  removeAtHead:     2, removeAtTail:     3,
  insertAtPosition: 0, removeAtPosition: 1,
};

// ─── DLL Visualiser ───────────────────────────────────────────────────────────
function DLLVisualiser({ nodes, emptyLabel = 'Empty list', highlight = false }) {
  if (!nodes || nodes.length === 0) {
    return <span className="text-gray-400 text-lg italic">{emptyLabel}</span>;
  }
  // order nodes
  const allIds     = new Set(nodes.map(n => n.id));
  const pointedIds = new Set(nodes.map(n => n.next).filter(Boolean));
  let headId = [...allIds].find(id => !pointedIds.has(id)) ?? nodes[0].id;
  const ordered = [];
  let cur = nodes.find(n => n.id === headId);
  const visited = new Set();
  while (cur && !visited.has(cur.id)) {
    ordered.push(cur);
    visited.add(cur.id);
    cur = cur.next !== null ? nodes.find(n => n.id === cur.next) : null;
  }

  return (
    <div className="flex items-center gap-1 flex-wrap overflow-x-auto">
      <span className="text-gray-400 text-base font-mono shrink-0">NULL</span>
      {ordered.map((node, idx) => (
        <React.Fragment key={node.id}>
          <span className="text-pink-400 text-base font-bold shrink-0">⇄</span>
          <div className={`shrink-0 rounded-lg border-2 px-3 py-2 text-center transition-all ${
            highlight
              ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
              : 'bg-pink-50 border-pink-300 text-pink-800'
          }`}>
            <div className="font-bold text-lg leading-none">{node.value}</div>
            <div className="text-xs text-gray-400 mt-0.5 font-mono">
              {node.prev !== null ? '←' : '∅'} {node.next !== null ? '→' : '∅'}
            </div>
          </div>
          {idx === ordered.length - 1 && (
            <span className="text-pink-400 text-base font-bold shrink-0">⇄</span>
          )}
        </React.Fragment>
      ))}
      <span className="text-gray-400 text-base font-mono shrink-0">NULL</span>
    </div>
  );
}

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
          <span className="text-pink-600 text-2xl font-bold">Challenge · Solo</span>
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
              <div className="h-full bg-pink-500 rounded-full transition-all duration-500" style={{ width: `${xpPct}%` }} />
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

// ─── Nav Card ─────────────────────────────────────────────────────────────────
function NavCard({ currentLevelId, completedLevels, onLevelChange, completedQuests }) {
  const labels = QUEST_LABELS[currentLevelId] ?? [];
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Level tabs */}
      <div className="grid grid-cols-3 border-b border-gray-200">
        {[1,2,3].map(lvl => {
          const isActive   = currentLevelId === lvl;
          const isComplete = completedLevels.includes(lvl);
          return (
            <button
              key={lvl}
              onClick={() => onLevelChange(lvl)}
              className={`py-2.5 text-lg font-semibold border-r border-gray-200 last:border-r-0 transition-colors ${
                isActive   ? 'bg-pink-600 text-white' :
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
          const isDone = (completedQuests[currentLevelId] ?? new Set()).has(idx);
          return (
            <div key={idx} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
              isDone ? 'bg-emerald-50 border-emerald-100' : 'bg-transparent border-transparent'
            }`}>
              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                isDone ? 'bg-emerald-100 border border-emerald-300' : 'bg-gray-100 border border-gray-200'
              }`}>
                <div className={`w-2 h-2 rounded-sm ${isDone ? 'bg-emerald-500' : 'bg-gray-300'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-lg font-medium truncate ${isDone ? 'text-emerald-800' : 'text-gray-500'}`}>
                  {label}
                </p>
                <p className="text-lg text-gray-400 mt-0.5">{isDone ? 'Completed' : 'Not started'}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Pet Card ─────────────────────────────────────────────────────────────────
function PetCard({ xp, petMood = 'idle' }) {
  const xpInLevel = xp % XP_PER_LEVEL;
  const xpPct     = Math.round((xpInLevel / XP_PER_LEVEL) * 100);
  const petLevel  = Math.floor(xp / XP_PER_LEVEL) + 1;
  const stage     = getStage(xp);
  return (
    <div className="bg-white rounded-xl border-2 border-dashed border-pink-200 overflow-hidden">
      <div className="bg-[#c8dfa8] mx-3 mt-3 rounded-lg flex items-center justify-center py-16">
        <PetCanvas stage={stage} mood={petMood} />
      </div>
      <div className="px-4 py-4 flex flex-col items-center gap-2">
        <p className="text-sm font-semibold text-gray-700">Algo</p>
        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div className="h-full bg-pink-400 rounded-full transition-all duration-500" style={{ width: `${xpPct}%` }} />
        </div>
        <p className="text-xs text-gray-500">Level {petLevel} · {xpInLevel} / {XP_PER_LEVEL} XP</p>
      </div>
    </div>
  );
}

// ─── Main Game ────────────────────────────────────────────────────────────────
export default function DoublyLinkedListGame({ onBack, initialXp = 0, onXpChange }) {
  const [currentLevelId, setCurrentLevelId]   = useState(1);
  const [currentQuestion, setCurrentQuestion] = useState(() => generateDLLQuestion(1));
  const [completedLevels, setCompletedLevels] = useState([]);
  // completedQuests: { 1: Set, 2: Set, 3: Set }
  const [completedQuests, setCompletedQuests] = useState({ 1: new Set(), 2: new Set(), 3: new Set() });

  const [nodes, setNodes]                         = useState([]);
  const [assemblyArea, setAssemblyArea]           = useState([]);
  const [codePool, setCodePool]                   = useState([]);
  const [isCorrectOrder, setIsCorrectOrder]       = useState(false);
  const [operationExecuted, setOperationExecuted] = useState(false);
  const [feedback, setFeedback]                   = useState(null);
  const [errorDetails, setErrorDetails]           = useState(null);

  const [lives, setLives]         = useState(MAX_LIVES);
  const [xp, setXp]               = useState(initialXp);
  const [errorCount, setErrorCount] = useState(0);
  const [xpGained, setXpGained]   = useState(0);

  const timerRef    = useRef(null);
  const [showModal, setShowModal] = useState(false);
  const [finalTime, setFinalTime] = useState(0);

  // Type-A error tracking
  const [typeAErrorCount, setTypeAErrorCount]   = useState(0);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const suggestShownRef     = useRef(false);
  const typeAErrorCountRef  = useRef(0);

  // Stale-closure guards
  const lastErrorCountedRef          = useRef(false);
  const completedLevelsRef           = useRef([]);
  const nodesRef                     = useRef([]);
  const currentQuestionRef           = useRef(null);
  const currentLevelIdRef            = useRef(1);
  const modalShownForThisRef         = useRef(false);
  const errorCountRef                = useRef(0);

  // ── Board init ─────────────────────────────────────────────────────────────
  const initBoard = useCallback((question, resetMistakes = true) => {
    const codeItems       = question.pseudocode.map((_, i) => ({ index: i, isDistractor: false }));
    const distractorItems = (question.distractors ?? []).map((_, i) => ({ index: i, isDistractor: true }));
    const freshNodes      = JSON.parse(JSON.stringify(question.initialNodes));
    setCodePool(shuffleArray([...codeItems, ...distractorItems]));
    setAssemblyArea([]);
    setNodes(freshNodes);
    nodesRef.current           = freshNodes;
    currentQuestionRef.current = question;
    setIsCorrectOrder(false);
    setOperationExecuted(false);
    setFeedback(null);
    setErrorDetails(null);
    if (resetMistakes) {
      setErrorCount(0);
      errorCountRef.current = 0;
      timerRef.current?.reset();
    }
    setShowModal(false);
    lastErrorCountedRef.current  = false;
    modalShownForThisRef.current = false;
  }, []);

  useEffect(() => { completedLevelsRef.current = completedLevels; }, [completedLevels]);
  useEffect(() => { currentLevelIdRef.current  = currentLevelId; },  [currentLevelId]);

  useEffect(() => {
    const q = generateDLLQuestion(currentLevelId);
    setCurrentQuestion(q);
    currentQuestionRef.current = q;
    setLives(MAX_LIVES);
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
        let resultNodes, msg;
        if (currentQuestion.isCombined) {
          const r1 = executeDLLOperation(currentQuestion.operation,  nodes, currentQuestion.operationValue,  currentQuestion.operationPosition);
          const r2 = executeDLLOperation(currentQuestion.operation2, r1.nodes, currentQuestion.operationValue2, currentQuestion.operationPosition2);
          resultNodes = r2.nodes;
          msg         = `${r1.message} → ${r2.message}`;
        } else {
          const r = executeDLLOperation(currentQuestion.operation, nodes, currentQuestion.operationValue, currentQuestion.operationPosition);
          resultNodes = r.nodes;
          msg         = r.message;
        }
        setNodes(resultNodes);
        setFeedback({ type: 'success', message: msg });
      }, 500);
    } else if (operationExecuted && assemblyArea.length !== required) {
      setErrorDetails({ type: 'already_executed', message: 'Code already executed! Reset to try again.' });
      setIsCorrectOrder(false);
    } else if (!operationExecuted && validation.errors) {
      setErrorDetails(validation.errors);
      setIsCorrectOrder(false);
      if (isFull && !lastErrorCountedRef.current) {
        setErrorCount(prev => { const n = prev + 1; errorCountRef.current = n; return n; });
        setLives(prev => Math.max(0, prev - 1));
        lastErrorCountedRef.current = true;

        const errType = validation.errors?.type;
        if (errType && TYPE_A_ERRORS.has(errType) && !suggestShownRef.current) {
          const nc = typeAErrorCountRef.current + 1;
          typeAErrorCountRef.current = nc;
          setTypeAErrorCount(nc);
          if (nc >= SUGGEST_SINGLY_THRESHOLD) {
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

  useEffect(() => {
    if (!operationExecuted) return;
    nodesRef.current = nodes;
  }, [nodes, operationExecuted]);

  // ── Goal check → XP → modal ────────────────────────────────────────────────
  useEffect(() => {
    if (!operationExecuted) return;
    const timer = setTimeout(() => {
      const q    = currentQuestionRef.current;
      if (!q) return;
      const cur  = getCurrentPattern(nodesRef.current);
      const goal = q.goalPattern;
      const goalMet = cur.length === goal.length && cur.every((v, i) => v === goal[i]);
      setIsCorrectOrder(goalMet);

      if (goalMet && !modalShownForThisRef.current) {
        modalShownForThisRef.current = true;
        const lvl   = currentLevelIdRef.current;
        const baseXP = lvl === 1 ? 80 : lvl === 2 ? 120 : 160;
        const gained = Math.max(Math.round(baseXP * 0.3), baseXP - errorCountRef.current * 20);
        setXpGained(gained);
        setXp(prev => { const next = prev + gained; onXpChange?.(next); return next; });

        // mark quest done
        const questIdx = OP_TO_QUEST[q.operation] ?? 0;
        setCompletedQuests(prev => ({
          ...prev,
          [lvl]: new Set([...(prev[lvl] ?? []), questIdx]),
        }));
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

  // ── Click handlers ─────────────────────────────────────────────────────────
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

  // ── Navigation ─────────────────────────────────────────────────────────────
  const resetQuestion = () => initBoard(currentQuestion, false);

  const newQuestion = () => {
    const q = generateDLLQuestion(currentLevelId);
    setCurrentQuestion(q);
    currentQuestionRef.current = q;
    initBoard(q, true);
  };

  const handleNextLevel = () => {
    setShowModal(false);
    setCurrentLevelId(prev => prev < 3 ? prev + 1 : 1);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
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

        {/* 3-column layout */}
        <div className="grid grid-cols-[1fr_1fr_240px] gap-4 items-start">

          {/* Col 1 — Nav + Quest info */}
          <div className="flex flex-col gap-4">
            <NavCard
              currentLevelId={currentLevelId}
              completedLevels={completedLevels}
              onLevelChange={setCurrentLevelId}
              completedQuests={completedQuests}
            />

            {/* Quest info card */}
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
                <DLLVisualiser
                  nodes={nodes}
                  emptyLabel="Empty list"
                  highlight={isCorrectOrder}
                />
              </div>

              {/* Goal state */}
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-2.5 mb-2">
                <p className="text-gray-400 text-lg font-medium mb-1.5">Goal state</p>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-gray-400 text-base font-mono shrink-0">NULL</span>
                  {q.goalPattern.map((v, i) => (
                    <React.Fragment key={i}>
                      <span className="text-pink-300 text-base font-bold shrink-0">⇄</span>
                      <div className="shrink-0 rounded-lg border-2 px-3 py-2 text-center bg-amber-50 border-amber-300 text-amber-800">
                        <div className="font-bold text-lg leading-none">{v}</div>
                      </div>
                      {i === q.goalPattern.length - 1 && (
                        <span className="text-pink-300 text-base font-bold shrink-0">⇄</span>
                      )}
                    </React.Fragment>
                  ))}
                  <span className="text-gray-400 text-base font-mono shrink-0">NULL</span>
                </div>
              </div>

              {/* Hint */}
              <div className="mt-2 bg-pink-50 border border-pink-200 rounded-lg p-2.5">
                <p className="text-lg font-semibold text-pink-700 mb-1">Hint</p>
                <p className="text-pink-600 text-lg leading-relaxed">{q.hint}</p>
              </div>

              {/* New question button */}
              <button
                onClick={newQuestion}
                className="mt-3 w-full py-2 rounded-lg border border-gray-200 text-gray-500 text-lg font-medium hover:bg-gray-50 transition-colors"
              >
                ↺ New Question
              </button>
            </div>
          </div>

          {/* Col 2 — Code area */}
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

          {/* Col 3 — Pet */}
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

      <SuggestSinglyModal
        isOpen={showSuggestModal}
        errorCount={typeAErrorCount}
        onGoSingly={() => { setShowSuggestModal(false); onBack(); }}
        onStay={() => setShowSuggestModal(false)}
      />
    </div>
  );
}
