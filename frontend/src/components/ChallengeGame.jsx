import { useState, useCallback, useRef, useEffect } from 'react';
import { generateLevel1Question, generateLevel2Question, generateLevel3Question } from '../services/questionGenerator';
import { generateDLLLevel1Question, generateDLLLevel2Question, generateDLLLevel3Question } from '../services/doublyQuestionGenerator';
import { shuffleArray, getCurrentPattern } from '../utils/helpers';
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
import JeopardyChallenge from './JeopardyChallenge';
import TutorialQuickLinks from './TutorialQuickLinks';
import TutorChat from './TutorChat';
import GameTimer from './GameTimer';
import { LinkedListVisualiser } from './GoalPattern';

const MAX_LIVES = 5;
const SUB_COUNTS = { 1: 4, 2: 4, 3: 4 };
const SUB_LABELS = {
  1: ['Insert at Head', 'Insert at End', 'Remove at Head', 'Remove Last Node'],
  2: ['Insert into Empty List', 'Delete Entire List', 'Insert at Position', 'Remove at Position'],
  3: ['Reverse Linked List', 'Merge Two Sorted Lists', 'Linked List Cycle', 'Sort Linked List'],
};
const XP_BY_LEVEL = { 1: 100, 2: 150, 3: 200 };

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

export default function ChallengeGame({ moduleId, xp: initialXp, onBack, onXpGained, onComplete, levels = [1, 2, 3], startSubIdx = 0, singleSub = false, title = 'Challenge Mode', gameMode = 'challenge-comp' }) {
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
  const [lives, setLives] = useState(MAX_LIVES);
  const [xpGained, setXpGained] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [showJeopardy, setShowJeopardy] = useState(false);
  const [showTutor, setShowTutor] = useState(false);
  const [finalTime, setFinalTime] = useState(0);
  const timerRef = useRef(null);
  const pendingTimeRef = useRef(0);
  const attemptStartRef = useRef(Date.now());
  const nodesRef = useRef([]);
  const qRef = useRef(question);
  const errorCountRef = useRef(0);
  const lastErrorRef = useRef(false);
  const modalShownRef = useRef(false);

  const { adaptiveConfig, emotion, setEmotion, initSession, recordQuestion, recordReset, markUsedTutor, getSignalsSnapshot } = useEmotion();
  const { message: petMessage, showWrong, showSuccess } = useAdaptivePet();

  useEffect(() => {
    progressApi.createSession(moduleId, 'challenge')
      .then(s => { setSessionId(s.id); initSession(s.id, emotion); })
      .catch(() => {});
  }, [moduleId]);

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
    timerRef.current?.reset?.();
    setShowModal(false);
  }, []);

  useEffect(() => { initBoard(question); }, [question, initBoard]);

  useEffect(() => {
    if (!opExecuted) return;
    nodesRef.current = nodes;
  }, [nodes, opExecuted]);

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
        const opVal = q.isMerge ? { l1Values: q.l1Values, l2Values: q.l2Values } : q.operationValue;
        const r = moduleId === 'doubly'
          ? executeDLLOperation(q.operation, nodes, opVal, q.operationPosition)
          : executeLinkedListOperation(q.operation, nodes, opVal, q.operationPosition);
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
        setLives(prev => Math.max(0, prev - 1));
        showWrong();
        progressApi.addMistake({
          question_id: q.id ?? q.title,
          source: 'challenge',
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
      const base = XP_BY_LEVEL[levelId] ?? 100;
      const gained = Math.max(Math.round(base * 0.3), base - errorCountRef.current * 20);
      setXpGained(gained);
      onXpGained(gained);
      setCompletedSubs(prev => ({ ...prev, [levelId]: new Set([...prev[levelId], subIdx]) }));

      const timeMs = Date.now() - attemptStartRef.current;
      timerRef.current?.stop?.();
      recordQuestion(timeMs, errorCountRef.current, levelId);
      if (sessionId) {
        progressApi.recordAttempt(sessionId, {
          question_id: q.id ?? q.title,
          difficulty: levelId,
          time_spent_ms: timeMs,
          error_count: errorCountRef.current,
          xp_gained: gained,
          passed: true,
          lives_after: lives,
        }).catch(() => {});

        const snap = getSignalsSnapshot();
        if (snap.questions_done > 0 && snap.questions_done % 5 === 0) {
          emotionApi.inferBehavior(snap)
            .then(res => setEmotion(res.emotion, 'llm'))
            .catch(() => {});
        }
      }

      setTimeout(() => {
        const elapsed = timerRef.current?.getElapsed?.() ?? 0;
        if (adaptiveConfig.showJeopardyBonus) {
          pendingTimeRef.current = elapsed;
          setShowJeopardy(true);
        } else {
          setFinalTime(elapsed);
          setShowModal(true);
        }
      }, 300);
    }
  }, [nodes, opExecuted]); // eslint-disable-line

  const loadSub = (lv, si) => {
    setLevelId(lv);
    setSubIdx(si);
    setQuestion(genQ(moduleId, lv, si));
    setShowModal(false);
  };

  const saveAndComplete = () => {
    if (sessionId) {
      progressApi.completeSession(sessionId, {
        lives_remaining: lives,
        game_mode_detail: gameMode,
      }).catch(() => {});
    }
    onComplete?.();
  };

  const handleNext = () => {
    if (singleSub) { saveAndComplete(); return; }
    const total = SUB_COUNTS[levelId] ?? 4;
    const nextSub = (subIdx + 1) % total;
    const nextLevel = levels[levels.indexOf(levelId) + 1];
    if (nextSub === 0 && nextLevel) loadSub(nextLevel, 0);
    else if (nextSub === 0) saveAndComplete();
    else loadSub(levelId, nextSub);
  };

  const handleJeopardyComplete = (bonusXp) => {
    setShowJeopardy(false);
    if (bonusXp > 0) onXpGained(bonusXp);
    setFinalTime(pendingTimeRef.current);
    setShowModal(true);
  };

  const q = question;
  const currentPattern = getCurrentPattern(nodes);
  const livesArr = Array.from({ length: MAX_LIVES }, (_, i) => i < lives);

  return (
    <div className="min-h-screen bg-gray-50">
      <GameTopBar
        onBack={onBack} xp={initialXp} showTimer={false}
        title={title} titleColor="text-violet-600" barColor="bg-violet-500"
      />

      <div className="max-w-7xl mx-auto p-5">
        {/* Lives + Timer row */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-gray-500">Lives:</span>
          {livesArr.map((alive, i) => (
            <span key={i} className={`text-xl transition-all ${alive ? '' : 'opacity-20'}`}>❤️</span>
          ))}
          {lives === 0 && (
            <span className="text-red-600 text-sm font-semibold">No lives left — keep going!</span>
          )}
          <div className="ml-4">
            <GameTimer ref={timerRef} isRunning={!showModal} />
          </div>
        </div>

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
                  ? 'bg-violet-600 text-white border-violet-600'
                  : completedSubs[lv]?.size === 4
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300'
              }`}
            >
              {completedSubs[lv]?.size === 4 ? '✓ ' : ''}Level {lv}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_1fr_240px] gap-4 items-start">
          {/* Col 1: Quest list + info */}
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-col gap-1">
              {(SUB_LABELS[levelId] ?? []).map((label, idx) => {
                const done = completedSubs[levelId]?.has(idx);
                const active = idx === subIdx;
                return (
                  <button
                    key={idx}
                    onClick={() => loadSub(levelId, idx)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all border ${
                      active ? 'bg-violet-50 border-violet-200' :
                      done   ? 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100' :
                               'border-transparent hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 text-xs ${
                      done ? 'bg-emerald-500 text-white' : active ? 'bg-violet-500 text-white' : 'bg-gray-200'
                    }`}>
                      {done ? '✓' : active ? '▶' : ''}
                    </div>
                    <span className={`text-sm font-medium ${active ? 'text-violet-800' : done ? 'text-emerald-800' : 'text-gray-500'}`}>
                      {label}
                    </span>
                    {done && <span className="ml-auto text-xs text-violet-500">+{XP_BY_LEVEL[levelId]}</span>}
                  </button>
                );
              })}
            </div>

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
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-violet-700">Hint</p>
                  <button
                    onClick={() => { markUsedTutor(); setShowTutor(true); }}
                    className="text-xs bg-violet-500 text-white px-2 py-0.5 rounded-full hover:bg-violet-600"
                  >
                    🧑‍🏫 Ask Tutor
                  </button>
                </div>
                <p className="text-violet-600 text-sm leading-relaxed">{q.hint}</p>
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
          <GamePetCard xp={initialXp} mood={isCorrect ? 'happy' : errorDetails ? 'sad' : 'idle'} theme="violet" hideable message={petMessage} />
        </div>
      </div>

      {showJeopardy && <JeopardyChallenge onComplete={handleJeopardyComplete} />}
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
        timeSeconds={finalTime}
        errorCount={errorCount}
        xpGained={xpGained}
        onNext={handleNext}
        onNewQuestion={() => { setShowModal(false); initBoard(q); }}
      />
    </div>
  );
}
