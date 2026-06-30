import { useState, useCallback, useRef, useEffect } from 'react';
import { generateLevel1Question, generateLevel2Question, generateLevel3Question } from '../services/questionGenerator';
import { generateDLLLevel1Question, generateDLLLevel2Question, generateDLLLevel3Question } from '../services/doublyQuestionGenerator';
import { shuffleArray, getCurrentPattern, XP_PER_LEVEL } from '../utils/helpers';
import { executeLinkedListOperation } from '../services/linkedListOperations';
import { executeDLLOperation } from '../services/doublyLinkedListOperations';
import { validateAssembly } from '../services/validationLogic';
import { progressApi, emotionApi } from '../services/api';
import { useEmotion } from '../contexts/EmotionContext';
import { useAdaptivePet } from '../hooks/useAdaptivePet';
import CodePool from './CodePool';
import AssemblyArea from './AssemblyArea';
import GameTopBar from './shared/GameTopBar';
import GamePetCard from './shared/GamePetCard';
import LevelCompleteModal from './LevelCompleteModal';
import TutorialQuickLinks from './TutorialQuickLinks';
import TutorChat from './TutorChat';
import { LinkedListVisualiser } from './GoalPattern';

const SUB_COUNTS = { 1: 4, 2: 4, 3: 4 };
const SUB_LABELS = {
  1: ['Insert at Head', 'Insert at End', 'Remove at Head', 'Remove Last Node'],
  2: ['Insert into Empty List', 'Delete Entire List', 'Insert at Position', 'Remove at Position'],
  3: ['Reverse Linked List', 'Merge Two Sorted Lists', 'Linked List Cycle', 'Sort Linked List'],
};
const XP_BY_LEVEL = { 1: 80, 2: 120, 3: 160 };

function genQ(moduleId, levelId, subIdx) {
  if (moduleId === 'doubly') {
    if (levelId === 1) return generateDLLLevel1Question();
    if (levelId === 2) return generateDLLLevel2Question();
    return generateDLLLevel3Question();
  }
  if (levelId === 1) return generateLevel1Question(subIdx);
  if (levelId === 2) return generateLevel2Question(subIdx);
  return generateLevel3Question(subIdx);
}

function executeOp(moduleId, operation, nodes, value, position, question) {
  if (moduleId === 'doubly') return executeDLLOperation(operation, nodes, value, position);
  return executeLinkedListOperation(operation, nodes, value, position);
}

export default function RegularGame({ moduleId, xp: initialXp, onBack, onXpGained, onComplete, levels = [1, 2, 3], startSubIdx = 0, singleSub = false, title = 'Practice · Stress-Free' }) {
  const [sessionId, setSessionId] = useState(null);
  const [levelId, setLevelId] = useState(levels[0]);
  const [subIdx, setSubIdx] = useState(startSubIdx);
  const [completedSubs, setCompletedSubs] = useState(() =>
    Object.fromEntries(levels.map(lv => [lv, new Set()]))
  );
  const [question, setQuestion] = useState(() => genQ(moduleId, levels[0], startSubIdx));
  const [nodes, setNodes] = useState([]);
  const [codePool, setCodePool] = useState([]);
  const [assemblyArea, setAssemblyArea] = useState([]);
  const [isCorrect, setIsCorrect] = useState(false);
  const [opExecuted, setOpExecuted] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);
  const [errorCount, setErrorCount] = useState(0);
  const [xpGained, setXpGained] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [showTutor, setShowTutor] = useState(false);
  const attemptStartRef = useRef(Date.now());
  const nodesRef = useRef([]);
  const qRef = useRef(question);
  const errorCountRef = useRef(0);
  const lastErrorRef = useRef(false);
  const modalShownRef = useRef(false);

  const { adaptiveConfig, emotion, setEmotion, initSession, recordQuestion, recordReset, markUsedTutor, getSignalsSnapshot } = useEmotion();
  const { message: petMessage, showWrong, showSuccess } = useAdaptivePet();

  useEffect(() => {
    progressApi.createSession(moduleId, 'regular')
      .then(s => { setSessionId(s.id); initSession(s.id, emotion); })
      .catch(() => {});
  }, [moduleId]); // eslint-disable-line

  const initBoard = useCallback((q) => {
    const items = q.pseudocode.map((_, i) => ({ index: i, isDistractor: false }));
    const dist = (q.distractors ?? []).map((_, i) => ({ index: i, isDistractor: true }));
    setCodePool(shuffleArray([...items, ...dist]));
    setAssemblyArea([]);
    const fresh = JSON.parse(JSON.stringify(q.initialNodes));
    setNodes(fresh);
    nodesRef.current = fresh;
    qRef.current = q;
    setIsCorrect(false);
    setOpExecuted(false);
    setFeedback(null);
    setErrorDetails(null);
    setErrorCount(0);
    errorCountRef.current = 0;
    lastErrorRef.current = false;
    modalShownRef.current = false;
    attemptStartRef.current = Date.now();
  }, []);

  useEffect(() => { initBoard(question); }, [question, initBoard]);

  // Validation
  useEffect(() => {
    const q = qRef.current;
    if (!q) return;
    const required = q.correctOrder.length;
    const full = assemblyArea.length === required;
    const validation = validateAssembly(assemblyArea, [], q);

    if (!full) lastErrorRef.current = false;

    if (validation.isValid && !opExecuted) {
      setOpExecuted(true);
      setErrorDetails(null);
      setFeedback(null);
      setTimeout(() => {
        const opVal = q.isMerge
          ? { l1Values: q.l1Values, l2Values: q.l2Values }
          : q.operationValue;
        const r = executeOp(moduleId, q.operation, nodes, opVal, q.operationPosition, q);
        setNodes(r.nodes);
        nodesRef.current = r.nodes;
        setFeedback({ type: 'success', message: r.message });
      }, 400);
    } else if (!opExecuted && validation.errors) {
      setErrorDetails(validation.errors);
      if (full && !lastErrorRef.current) {
        const next = errorCountRef.current + 1;
        setErrorCount(next);
        errorCountRef.current = next;
        lastErrorRef.current = true;
        showWrong();
        progressApi.addMistake({
          question_id: q.id ?? q.title,
          source: 'regular',
          title: q.title,
          your_answer: assemblyArea.map(it => it.isDistractor ? (q.distractors?.[it.index] ?? '?') : (q.pseudocode[it.index] ?? '?')),
          correct_answer: q.correctOrder.map(i => q.pseudocode[i]),
          explanation: q.hint,
        }).catch(() => {});
      }
    } else {
      setErrorDetails(null);
    }
  }, [assemblyArea, opExecuted]); // eslint-disable-line

  // Goal check → XP
  useEffect(() => {
    if (!opExecuted) return;
    const q = qRef.current;
    if (!q) return;
    const cur = getCurrentPattern(nodesRef.current);
    const goal = q.goalPattern;
    const met = q.isCycle ? true : cur.length === goal.length && cur.every((v, i) => v === goal[i]);
    setIsCorrect(met);

    if (met && !modalShownRef.current) {
      modalShownRef.current = true;
      showSuccess();
      const base = XP_BY_LEVEL[levelId] ?? 80;
      const gained = Math.max(Math.round(base * 0.4), base - errorCountRef.current * 15);
      setXpGained(gained);
      onXpGained(gained);
      setCompletedSubs(prev => ({
        ...prev,
        [levelId]: new Set([...prev[levelId], subIdx]),
      }));
      const timeMs = Date.now() - attemptStartRef.current;
      recordQuestion(timeMs, errorCountRef.current, levelId);
      if (sessionId) {
        progressApi.recordAttempt(sessionId, {
          question_id: q.id ?? q.title,
          difficulty: levelId,
          time_spent_ms: timeMs,
          error_count: errorCountRef.current,
          xp_gained: gained,
          passed: true,
        }).catch(() => {});

        // Every 5 questions, run behavioral emotion inference
        const snap = getSignalsSnapshot();
        if (snap.questions_done > 0 && snap.questions_done % 5 === 0) {
          emotionApi.inferBehavior(snap)
            .then(res => setEmotion(res.emotion, 'llm'))
            .catch(() => {});
        }
      }
      setTimeout(() => setShowModal(true), 600);
    }
  }, [nodes, opExecuted]); // eslint-disable-line

  const loadSub = (lv, si) => {
    setLevelId(lv);
    setSubIdx(si);
    setQuestion(genQ(moduleId, lv, si));
    setShowModal(false);
  };

  const handleNext = () => {
    if (singleSub) { onComplete?.(); return; }
    const total = SUB_COUNTS[levelId] ?? 4;
    const nextSub = (subIdx + 1) % total;
    const nextLevel = levels[levels.indexOf(levelId) + 1];
    if (nextSub === 0 && nextLevel) loadSub(nextLevel, 0);
    else if (nextSub === 0) onComplete?.();
    else loadSub(levelId, nextSub);
  };

  const q = question;
  const currentPattern = getCurrentPattern(nodes);

  return (
    <div className="min-h-screen bg-gray-50">
      <GameTopBar
        onBack={onBack} xp={initialXp} title={title} titleColor="text-indigo-600" barColor="bg-indigo-500"
        showTimer={false}
      />

      <div className="max-w-7xl mx-auto p-5">
        {feedback && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <p className="text-emerald-700 font-semibold">{feedback.message}</p>
          </div>
        )}

        {/* Level tabs */}
        <div className="flex gap-2 mb-4">
          {levels.map(lv => (
            <button
              key={lv}
              onClick={() => loadSub(lv, 0)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                levelId === lv
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : completedSubs[lv]?.size === 4
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'
              }`}
            >
              {completedSubs[lv]?.size === 4 ? '✓ ' : ''}Level {lv}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_1fr_240px] gap-4 items-start">
          {/* Col 1: Quest list + question info */}
          <div className="flex flex-col gap-4">
            {/* Sub-question list */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-col gap-1">
              {(SUB_LABELS[levelId] ?? []).map((label, idx) => {
                const done = completedSubs[levelId]?.has(idx);
                const active = idx === subIdx;
                return (
                  <button
                    key={idx}
                    onClick={() => loadSub(levelId, idx)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all border ${
                      active ? 'bg-indigo-50 border-indigo-200' :
                      done   ? 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100' :
                               'border-transparent hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 text-xs ${
                      done ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-500 text-white' : 'bg-gray-200'
                    }`}>
                      {done ? '✓' : active ? '▶' : ''}
                    </div>
                    <span className={`text-sm font-medium ${active ? 'text-indigo-800' : done ? 'text-emerald-800' : 'text-gray-500'}`}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Question info */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-base font-semibold text-gray-900 mb-1">{q.title}</h2>
              <p className="text-gray-500 text-sm mb-3">{q.description}</p>

              <div className="bg-gray-50 rounded-lg p-2.5 mb-2">
                <p className="text-gray-400 text-xs font-medium mb-1">Current state</p>
                <LinkedListVisualiser values={currentPattern} emptyLabel="Empty list" highlight={isCorrect} />
              </div>
              <div className="bg-gray-50 rounded-lg p-2.5 mb-2">
                <p className="text-gray-400 text-xs font-medium mb-1">Goal state</p>
                <LinkedListVisualiser values={q.goalPattern} emptyLabel="Empty list" nodeColor="bg-amber-50 border-amber-300 text-amber-800" />
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-indigo-700">Hint</p>
                  <button
                    onClick={() => { markUsedTutor(); setShowTutor(true); }}
                    className="text-xs bg-violet-500 text-white px-2 py-0.5 rounded-full hover:bg-violet-600"
                  >
                    🧑‍🏫 Ask Tutor
                  </button>
                </div>
                <p className="text-indigo-600 text-sm leading-relaxed">{q.hint}</p>
              </div>
            </div>
          </div>

          {/* Col 2: Code area */}
          <div className="flex flex-col gap-4">
            <CodePool codePool={codePool} currentLevel={q} onBlockClick={(i) => {
              const item = codePool[i];
              setCodePool(prev => prev.filter((_, j) => j !== i));
              setAssemblyArea(prev => [...prev, item]);
              setErrorDetails(null);
              lastErrorRef.current = false;
            }} />
            <AssemblyArea
              assemblyArea={assemblyArea}
              currentLevel={q}
              isCorrectOrder={isCorrect}
              errorDetails={errorDetails}
              onBlockClick={(i) => {
                const item = assemblyArea[i];
                setAssemblyArea(prev => prev.filter((_, j) => j !== i));
                setCodePool(prev => [...prev, item]);
                setErrorDetails(null);
                lastErrorRef.current = false;
              }}
              onReset={() => { recordReset(); initBoard(q); }}
            />
          </div>

          {/* Col 3: Pet */}
          <GamePetCard xp={initialXp} mood={isCorrect ? 'happy' : errorDetails ? 'sad' : 'idle'} theme="indigo" hideable message={petMessage} />
        </div>
      </div>

      {adaptiveConfig.showTutorialLinks && <TutorialQuickLinks operationTitle={q?.title} />}
      {showTutor && (
        <TutorChat
          sessionId={sessionId}
          questionTitle={q?.title ?? ''}
          operation={q?.operation ?? ''}
          yourAnswer={assemblyArea.map(it => it.isDistractor ? (q?.distractors?.[it.index] ?? '?') : (q?.pseudocode[it.index] ?? '?'))}
          correctAnswer={(q?.correctOrder ?? []).map(i => q?.pseudocode[i])}
          errorCount={errorCount}
          onClose={() => setShowTutor(false)}
        />
      )}

      <LevelCompleteModal
        isOpen={showModal}
        levelId={levelId}
        totalLevels={3}
        timeSeconds={0}
        errorCount={errorCount}
        xpGained={xpGained}
        onNext={handleNext}
        onNewQuestion={() => { setShowModal(false); initBoard(q); }}
      />
    </div>
  );
}
