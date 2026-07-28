import { useState, useCallback, useRef, useEffect } from 'react';
import { shuffleArray, getCurrentPattern, assemblyToText, cloneNodes } from '../utils/helpers';
import { executeLinkedListOperation } from '../services/linkedListOperations';
import { executeDLLOperation } from '../services/doublyLinkedListOperations';
import { validateAssembly } from '../services/validationLogic';
import { selectOrderingHint } from '../services/stepHints';
import { progressApi, gameMasterApi, emotionApi, streamTutorChat } from '../services/api';
import { useEmotion } from '../contexts/EmotionContext';
import { useScaffold } from '../hooks/useScaffold';
import CodePool from './CodePool';
import AssemblyArea from './AssemblyArea';
import FillBlankBoard from './FillBlankBoard';
import FindBugBoard from './FindBugBoard';
import GameTopBar from './shared/GameTopBar';
import GameTimer from './GameTimer';
import TutorChat from './TutorChat';
import ConceptMasteryPanel from './ConceptMasteryPanel';
import SessionSummaryOverlay from './SessionSummaryOverlay';
import { LinkedListVisualiser } from './GoalPattern';
import LinkedListHintAnimation from './LinkedListHintAnimation';
import TutorToast from './TutorToast';
import UnlockPopup from './UnlockPopup';
import AnalysisCard from './AnalysisCard';

const MAX_LIVES = 5;

export default function AgenticSession({ moduleId, xp: initialXp, mode, operation: chosenOperation = null, onBack, onXpGained, onComplete }) {
  const isCompetitive = mode === 'competitive';

  // ── Session state ────────────────────────────────────────────────────────────
  const [sessionId,      setSessionId]      = useState(null);
  const [question,       setQuestion]       = useState(null);
  const [operation,      setOperation]      = useState(null);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [, setMasteryData] = useState(null);   // mastery_summary kept for API parity; not rendered
  const [conceptMastery, setConceptMastery] = useState({});
  // Post-question analysis card (LC-style verdict + concept/speed/consider)
  const [analysisData,  setAnalysisData]  = useState(null);  // recordResult response
  const [masteryDelta,  setMasteryDelta]  = useState(null);  // [{concept, before, after}]
  const [tutorSeed,     setTutorSeed]     = useState(null);  // "consider" question pre-typed into tutor
  const [showAnalysis,  setShowAnalysis]  = useState(false); // non-blocking analysis panel toggle
  // fill_blank / find_bug board state lifted for the tutor ({lines, note}) —
  // without it the tutor only saw the ordering board's assembly
  const [boardState,    setBoardState]    = useState(null);
  const [orderingHint,  setOrderingHint]  = useState(null);  // step-hint decision chain output (ordering)
  const [showOpHint,    setShowOpHint]    = useState(false); // LC-style collapsed hint (Advanced ops only)
  const boardStateRef   = useRef(null);      // ref mirrors for effects with stale closures
  const assemblyAreaRef = useRef([]);
  useEffect(() => { boardStateRef.current = boardState; }, [boardState]);
  const conceptMasteryRef = useRef({});
  const answerTimeMsRef   = useRef(0);
  useEffect(() => { conceptMasteryRef.current = conceptMastery; }, [conceptMastery]);
  const [loading,        setLoading]        = useState(true);
  const [loadError,      setLoadError]      = useState(null);

  // ── Session length (dynamic 3-5 questions) ───────────────────────────────────
  const [plannedQuestions,   setPlannedQuestions]   = useState(3);
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const plannedQuestionsRef    = useRef(3);
  const sessionPerfectCountRef = useRef(0);
  const totalXpRef             = useRef(0);
  const questionsCompletedRef  = useRef(0);

  // ── Game board state ─────────────────────────────────────────────────────────
  const [nodes,        setNodes]        = useState([]);
  const [codePool,     setCodePool]     = useState([]);
  const [assemblyArea, setAssemblyArea] = useState([]);
  // must live BELOW the declaration — deps arrays are evaluated at render time (TDZ)
  useEffect(() => { assemblyAreaRef.current = assemblyArea; }, [assemblyArea]);
  const [isCorrect,    setIsCorrect]    = useState(false);
  const [opExecuted,   setOpExecuted]   = useState(false);
  const [errorDetails, setErrorDetails] = useState(null);
  const [errorCount,   setErrorCount]   = useState(0);
  const [xpGained,     setXpGained]     = useState(0);
  const [showSuccess,  setShowSuccess]  = useState(false);

  // ── Competitive ──────────────────────────────────────────────────────────────
  const [lives,    setLives]    = useState(MAX_LIVES);
  const [gameOver, setGameOver] = useState(false);

  // ── Hint & Tutor ─────────────────────────────────────────────────────────────
  const [showHintAnim,     setShowHintAnim]     = useState(false);
  const [showTutor,        setShowTutor]        = useState(false);
  const [proactiveMessage, setProactiveMessage] = useState(null);
  const [proactiveHistory, setProactiveHistory] = useState(null);
  const [showToast,        setShowToast]        = useState(false);
  const [typeUnlocked,     setTypeUnlocked]     = useState(1);      // earned ceiling for current operation
  const [activeLevel,      setActiveLevel]      = useState(1);      // type the student is practicing (<= ceiling)
  const [showLevelUp,      setShowLevelUp]      = useState(false);  // level-up choice popup (non-dismissing)
  const levelUpPromptedRef = useRef(false);                        // popup shown once per gap
  const proactiveTriggeredRef = useRef(false);
  const animAutoOpenedRef     = useRef(false);   // animation auto-opened once this question
  const maxScaffoldRef        = useRef(0);       // highest scaffold level reached this question (telemetry)

  // ── Refs ──────────────────────────────────────────────────────────────────────
  const timerRef           = useRef(null);
  const nodesRef           = useRef([]);
  const qRef               = useRef(null);
  const errorCountRef      = useRef(0);
  const lastErrorRef       = useRef(false);
  const modalShownRef      = useRef(false);
  const attemptStartRef    = useRef(Date.now());
  const prefetchRef        = useRef(null);    // { question, operation }
  const prefetchAbortRef   = useRef(null);    // AbortController for in-flight prefetch
  const resultRecordedRef  = useRef(false);   // true once record_result succeeded for current question
  const sessionStartedRef  = useRef(false);   // guard: start the session exactly once (StrictMode-safe)

  const {
    emotion, setEmotion, initSession,
    recordQuestion, recordReset, markUsedTutor, getSignalsSnapshot,
  } = useEmotion();

  // ── Scaffold orchestrator (single source of truth for help intensity) ────────
  // emotion sets the baseline, each error climbs one level, mastery caps the ceiling.
  // TODO: pass per-operation mastery once backend returns it; null = full support (cap 4).
  const scaffold = useScaffold(emotion, errorCount, null);

  // ── Proactive tutor push — fires once when scaffold level reaches the Socratic band (≥2) ──
  // Trigger point is now emotion-aware: a confused/frustrated student gets the push sooner
  // (higher baseline), an engaged student only after more errors. See useScaffold.
  const PROACTIVE_INIT_BY_TYPE = {
    fill_blank: "[PROACTIVE_INIT] The student is stuck on this fill-in-the-blank step. Without asking what they need help with, consider the blank they are on and ask one targeted Socratic question about the value that belongs there.",
    find_bug:   "[PROACTIVE_INIT] The student is struggling to find the bug. Without asking what they need help with, consider the line they suspect and ask one targeted Socratic question about what that line does.",
    ordering:   "[PROACTIVE_INIT] The student is struggling on this step. Without asking what they need help with, observe their current step assembly and ask one targeted Socratic question.",
  };

  useEffect(() => {
    // Need scaffold ≥2 AND at least one error on THIS question (avoid pushing on an empty board).
    if (scaffold.level < 2 || errorCountRef.current < 1 || proactiveTriggeredRef.current || showTutor) return;
    const q = qRef.current;
    if (!q || !sessionId) return;
    proactiveTriggeredRef.current = true;

    const qType = q.question_type || 'ordering';
    const proactiveInit = PROACTIVE_INIT_BY_TYPE[qType] || PROACTIVE_INIT_BY_TYPE.ordering;
    const attemptNow = qType === 'ordering'
      ? assemblyToText(assemblyAreaRef.current ?? [], q.pseudocode, q.distractors)
      : (boardStateRef.current?.lines ?? []);
    const correctAnswer = qType === 'ordering'
      ? closestCorrectLines(q, attemptNow)
      : (q.correctOrder ?? []).map(i => q.pseudocode[i]);
    let accumulated = "";
    streamTutorChat(
      {
        session_id:      sessionId,   // persists the proactive exchange into memory
        question_title:  q.title,
        operation:       q.operation,
        question_type:   qType,
        your_answer:     qType === 'ordering'
          ? assemblyToText(assemblyAreaRef.current ?? [], q.pseudocode, q.distractors)
          : (boardStateRef.current?.lines ?? []),
        board_note:      boardStateRef.current?.note ?? null,
        correct_answer:  correctAnswer,
        error_count:     errorCountRef.current,
        messages:        [],
        user_message:    proactiveInit,
        error_diagnosis: null,
      },
      (token) => { accumulated += token; },
      () => {
        const history = [
          { role: "user",      content: proactiveInit },
          { role: "assistant", content: accumulated },
        ];
        setProactiveMessage(accumulated);
        setProactiveHistory(history);
        setShowToast(true);
      },
      (err) => console.warn("[proactive tutor failed]", err),
    );
  }, [scaffold.level]); // eslint-disable-line

  // ── Animation auto-opens once when scaffold level reaches 3 ──────────────────
  useEffect(() => {
    if (scaffold.level > maxScaffoldRef.current) maxScaffoldRef.current = scaffold.level;
    if (scaffold.level < 3 || animAutoOpenedRef.current || showHintAnim) return;
    animAutoOpenedRef.current = true;
    setShowHintAnim(true);
  }, [scaffold.level]); // eslint-disable-line

  // ── Pre-fetch next AI question in background ─────────────────────────────────
  const startPrefetch = useCallback((sid, lastOp, currentEmotion) => {
    // Cancel any in-flight prefetch before starting a new one
    prefetchAbortRef.current?.abort();
    const ctrl = new AbortController();
    prefetchAbortRef.current = ctrl;
    prefetchRef.current = null;

    gameMasterApi.prefetchNext(sid, lastOp, currentEmotion, chosenOperation)
      .then(data => {
        if (!ctrl.signal.aborted) prefetchRef.current = data;
      })
      .catch(e => {
        if (e?.name !== 'AbortError') console.warn('[prefetch failed]', e);
      });
  }, [chosenOperation]);

  // Cancel pending prefetch on unmount
  useEffect(() => () => prefetchAbortRef.current?.abort(), []);

  // ── Emotion refresh (every question) ─────────────────────────────────────────
  // Re-infer emotion from behaviour after each question and return the emotion to
  // use for prefetch, so the next question is generated with the *fresh* state.
  const inferEmotion = useCallback(() => {
    const snap = getSignalsSnapshot();
    if (snap.questions_done < 2) return Promise.resolve(emotion);   // backend reserves judgement < 2
    return emotionApi.inferBehavior(snap)
      .then(res => { setEmotion(res.emotion, 'llm'); return res.emotion; })
      .catch(() => emotion);
  }, [getSignalsSnapshot, setEmotion, emotion]);

  // ── Board init ────────────────────────────────────────────────────────────────
  const initBoard = useCallback((q, { resetErrors = true } = {}) => {
    if (!q.question_type || q.question_type === 'ordering') {
      const items = q.pseudocode.map((_, i) => ({ index: i, isDistractor: false }));
      const dist  = (q.distractors ?? []).map((_, i) => ({ index: i, isDistractor: true }));
      setCodePool(shuffleArray([...items, ...dist]));
    } else {
      setCodePool([]);
    }
    setAssemblyArea([]);
    const fresh = cloneNodes(q.initialNodes);
    setNodes(fresh);
    nodesRef.current  = fresh;
    qRef.current      = q;
    setIsCorrect(false);
    setOpExecuted(false);
    setErrorDetails(null);
    if (resetErrors) {
      setErrorCount(0);
      errorCountRef.current = 0;
    }
    setShowHintAnim(false);
    setShowSuccess(false);
    setProactiveMessage(null);
    setProactiveHistory(null);
    setShowToast(false);
    proactiveTriggeredRef.current = false;
    animAutoOpenedRef.current = false;
    maxScaffoldRef.current = 0;
    lastErrorRef.current    = false;
    modalShownRef.current   = false;
    resultRecordedRef.current = false;
    attemptStartRef.current = Date.now();
    timerRef.current?.reset?.();
    setBoardState(null);
    setOrderingHint(null);
    setShowOpHint(false);
    setQuestion(q);
  }, []);

  // ── Session start ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (sessionStartedRef.current) return;   // avoid double-create under StrictMode / remounts
    sessionStartedRef.current = true;
    gameMasterApi.startSession(moduleId, mode, emotion, chosenOperation)
      .then(data => {
        setSessionId(data.session_id);
        setOperation(data.operation);
        setMasteryData(data.mastery_summary);
        if (data.concept_mastery) setConceptMastery(data.concept_mastery);
        if (data.type_unlocked != null) { setTypeUnlocked(data.type_unlocked); setActiveLevel(data.active_type_level); }
        initSession(data.session_id, emotion);
        initBoard(data.question);
        startPrefetch(data.session_id, data.operation, emotion);
      })
      .catch(e => setLoadError(e.message ?? 'Failed to start session'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  // ── Level up: when a higher type is unlocked but not yet entered, prompt once ─
  useEffect(() => {
    if (activeLevel < typeUnlocked) {
      if (!levelUpPromptedRef.current) {
        levelUpPromptedRef.current = true;
        setShowLevelUp(true);
      }
    } else {
      levelUpPromptedRef.current = false;   // gap closed; allow a future unlock to re-prompt
    }
  }, [activeLevel, typeUnlocked]);

  // Student opts into the unlocked type → swap the board to a fresh question of it.
  const handleLevelUp = useCallback(() => {
    setShowLevelUp(false);
    gameMasterApi.levelUp(sessionId, operation, emotion)
      .then(data => {
        if (data.type_unlocked != null) { setTypeUnlocked(data.type_unlocked); setActiveLevel(data.active_type_level); }
        initBoard(data.question);
        startPrefetch(sessionId, operation, emotion);
      })
      .catch(e => console.warn('[levelUp failed]', e));
  }, [sessionId, operation, emotion, initBoard, startPrefetch]);

  // ── Non-ordering completion (fill_blank / find_bug) ─────────────────────────
  const handleBoardComplete = useCallback((boardErrors) => {
    if (modalShownRef.current) return;
    modalShownRef.current = true;
    setIsCorrect(true);
    timerRef.current?.stop?.();
    const q       = qRef.current;
    const timeMs  = Date.now() - attemptStartRef.current;
    answerTimeMsRef.current = timeMs;   // frozen snapshot for the analysis card
    const level   = _opLevel(q.operation);
    const gained  = Math.max(Math.round(80 * 0.3), 80 - boardErrors * 20);
    const isPerfect = boardErrors === 0;
    setXpGained(gained);
    recordQuestion(timeMs, boardErrors, level);
    if (!isPerfect) {
      const newPlan = Math.min(plannedQuestionsRef.current + 1, 5);
      plannedQuestionsRef.current = newPlan;
      setPlannedQuestions(newPlan);
    }
    sessionPerfectCountRef.current += isPerfect ? 1 : 0;
    totalXpRef.current   += gained;
    questionsCompletedRef.current += 1;
    gameMasterApi.recordResult(
      sessionId, q.operation, q.id, questionNumber,
      true, boardErrors, timeMs,
      { intraDifficulty: q.intra_difficulty ?? null, scaffoldLevel: maxScaffoldRef.current, emotion },
    ).then(data => {
      resultRecordedRef.current = true;
      // Mastery delta for the analysis card: before (ref) vs after (response)
      if (data.concept_mastery && data.concepts_exercised) {
        const before = conceptMasteryRef.current || {};
        setMasteryDelta(data.concepts_exercised.map(c => ({
          concept: c,
          before:  before[c] ?? 0,
          after:   data.concept_mastery[c] ?? 0,
        })));
      }
      setAnalysisData(data);
      if (data.concept_mastery) setConceptMastery(data.concept_mastery);
      if (data.mastery_summary) setMasteryData(data.mastery_summary);
      inferEmotion().then(em => startPrefetch(sessionId, q.operation, em));
      setTimeout(() => setShowSuccess(true), 300);
    }).catch(e => {
      console.warn('[recordResult failed]', e);
      setTimeout(() => setShowSuccess(true), 300);
    });
  }, [sessionId, questionNumber, onXpGained, recordQuestion, startPrefetch, inferEmotion, emotion]);

  const handleBoardError = useCallback(() => {
    const next = errorCountRef.current + 1;
    setErrorCount(next);
    errorCountRef.current = next;
    const q = qRef.current;
    if (q) {
      progressApi.addMistake({
        question_id: q.id ?? q.title,
        source: 'agentic',
        title: q.title,
        your_answer: [],
        correct_answer: [],
        explanation: q.hint,
      }).catch(() => {});
    }
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const q = qRef.current;
    if (!q) return;
    if (q.question_type && q.question_type !== 'ordering') return;
    const full       = assemblyArea.length === q.correctOrder.length;
    const validation = validateAssembly(assemblyArea, [], q);

    if (!full) { lastErrorRef.current = false; return; }

    if (validation.isValid && !opExecuted) {
      setOpExecuted(true);
      setErrorDetails(null);
      setOrderingHint(null);
      setTimeout(() => {
        const opVal = q.isMerge
          ? { l1Values: q.l1Values, l2Values: q.l2Values }
          : q.operationValue;
        const r = moduleId === 'doubly'
          ? executeDLLOperation(q.operation, nodes, opVal, q.operationPosition)
          : executeLinkedListOperation(q.operation, nodes, opVal, q.operationPosition);
        setNodes(r.nodes);
        nodesRef.current = r.nodes;
      }, 400);
    } else if (!opExecuted && validation.errors) {
      setErrorDetails(validation.errors);
      // step-hint decision chain: distractor -> altitude escalation -> first-wrong step
      setOrderingHint(selectOrderingHint(q, assemblyToText(assemblyArea, q.pseudocode, q.distractors)));
      if (full && !lastErrorRef.current) {
        const next = errorCountRef.current + 1;
        setErrorCount(next);
        errorCountRef.current = next;
        lastErrorRef.current  = true;
        if (isCompetitive) setLives(prev => {
          const n = Math.max(0, prev - 1);
          if (n === 0) setGameOver(true);
          return n;
        });
        progressApi.addMistake({
          question_id:   q.id ?? q.title,
          source:        'agentic',
          title:         q.title,
          your_answer:   assemblyToText(assemblyArea, q.pseudocode, q.distractors),
          correct_answer: q.correctOrder.map(i => q.pseudocode[i]),
          explanation:   q.hint,
        }).catch(e => console.warn('[addMistake failed]', e));
      }
    } else {
      setErrorDetails(null);
    }
  }, [assemblyArea, opExecuted]); // eslint-disable-line

  // ── Goal check ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!opExecuted) return;
    const q = qRef.current;
    if (!q) return;
    if (q.question_type && q.question_type !== 'ordering') return;
    const cur  = getCurrentPattern(nodesRef.current);
    const goal = q.goalPattern ?? [];
    const met  = q.operation === 'detectCycle'
      ? true
      : cur.length === goal.length && cur.every((v, i) => v === goal[i]);

    setIsCorrect(met);
    if (!met || modalShownRef.current) return;

    modalShownRef.current = true;
    timerRef.current?.stop?.();

    const timeMs   = Date.now() - attemptStartRef.current;
    answerTimeMsRef.current = timeMs;   // frozen snapshot for the analysis card
    const level    = _opLevel(q.operation);
    const gained   = Math.max(Math.round(80 * 0.3), 80 - errorCountRef.current * 20);
    const isPerfect = errorCountRef.current === 0;
    setXpGained(gained);
    recordQuestion(timeMs, errorCountRef.current, level);

    // Track session stats
    if (!isPerfect) {
      const newPlan = Math.min(plannedQuestionsRef.current + 1, 5);
      plannedQuestionsRef.current = newPlan;
      setPlannedQuestions(newPlan);
    }
    sessionPerfectCountRef.current += isPerfect ? 1 : 0;
    totalXpRef.current += gained;
    questionsCompletedRef.current += 1;

    // Save result immediately — don't wait for Next click
    gameMasterApi.recordResult(
      sessionId, q.operation, q.id, questionNumber,
      true, errorCountRef.current, timeMs,
      { intraDifficulty: q.intra_difficulty ?? null, scaffoldLevel: maxScaffoldRef.current, emotion },
    ).then(data => {
      resultRecordedRef.current = true;
      // Mastery delta for the analysis card: before (ref) vs after (response)
      if (data.concept_mastery && data.concepts_exercised) {
        const before = conceptMasteryRef.current || {};
        setMasteryDelta(data.concepts_exercised.map(c => ({
          concept: c,
          before:  before[c] ?? 0,
          after:   data.concept_mastery[c] ?? 0,
        })));
      }
      setAnalysisData(data);
      if (data.concept_mastery) setConceptMastery(data.concept_mastery);
      if (data.mastery_summary) setMasteryData(data.mastery_summary);
      inferEmotion().then(em => startPrefetch(sessionId, q.operation, em));
    }).catch(e => console.warn('[recordResult failed]', e));

    setTimeout(() => setShowSuccess(true), 300);
  }, [nodes, opExecuted]); // eslint-disable-line

  // ── Next question ─────────────────────────────────────────────────────────────
  const handleNext = useCallback(async () => {
    if (!sessionId || !qRef.current) return;
    setShowSuccess(false);
    setShowAnalysis(false);
    setAnalysisData(null);
    setMasteryDelta(null);
    setTutorSeed(null);

    const timeMs     = Date.now() - attemptStartRef.current;
    const nextNum    = questionNumber + 1;
    const skipRecord = resultRecordedRef.current;
    const planned    = plannedQuestionsRef.current;
    const isLast     = questionNumber >= planned;

    const onSessionComplete = () => setShowSessionSummary(true);

    // Use prefetch only when not on the last question (avoids showing Q+1 before summary)
    if (prefetchRef.current && !isLast) {
      const pre = prefetchRef.current;
      prefetchRef.current = null;
      // Capture the just-finished question's telemetry BEFORE initBoard swaps it out
      const recordedId        = qRef.current.id;
      const recordedTelemetry = { intraDifficulty: qRef.current.intra_difficulty ?? null, scaffoldLevel: maxScaffoldRef.current, questionType: qRef.current.question_type ?? 'ordering' };
      setQuestionNumber(nextNum);
      setOperation(pre.operation);
      initBoard(pre.question);
      gameMasterApi.nextQuestion(
        sessionId, operation, recordedId,
        questionNumber, true, errorCountRef.current, timeMs, emotion, skipRecord, planned, chosenOperation,
        recordedTelemetry,
      ).then(data => {
        if (data.mastery_summary) setMasteryData(data.mastery_summary);
        if (data.concept_mastery) setConceptMastery(data.concept_mastery);
        if (data.type_unlocked != null) { setTypeUnlocked(data.type_unlocked); setActiveLevel(data.active_type_level); }
        if (data.session_complete) { onSessionComplete(); return; }
        startPrefetch(sessionId, pre.operation, emotion);
      }).catch(e => console.warn('[nextQuestion (bg) failed]', e));
      return;
    }

    // Last question or prefetch not ready → await backend
    setLoading(true);
    try {
      const data = await gameMasterApi.nextQuestion(
        sessionId, operation, qRef.current.id,
        questionNumber, true, errorCountRef.current, timeMs, emotion, skipRecord, planned, chosenOperation,
        { intraDifficulty: qRef.current.intra_difficulty ?? null, scaffoldLevel: maxScaffoldRef.current, questionType: qRef.current.question_type ?? 'ordering' },
      );
      if (data.mastery_summary) setMasteryData(data.mastery_summary);
      if (data.concept_mastery) setConceptMastery(data.concept_mastery);
      if (data.type_unlocked != null) { setTypeUnlocked(data.type_unlocked); setActiveLevel(data.active_type_level); }
      if (data.session_complete) { onSessionComplete(); return; }
      setQuestionNumber(data.question_number ?? nextNum);
      setOperation(data.operation ?? operation);
      if (data.planned_questions) {
        plannedQuestionsRef.current = data.planned_questions;
        setPlannedQuestions(data.planned_questions);
      }
      initBoard(data.question);
      startPrefetch(sessionId, data.operation, emotion);
    } catch (e) {
      console.error('[nextQuestion failed]', e);
      setLoadError('Failed to load next question. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionId, operation, questionNumber, emotion, initBoard, startPrefetch]); // eslint-disable-line


  // ── Computed ──────────────────────────────────────────────────────────────────
  const q              = question;
  const currentPattern = getCurrentPattern(nodes);
  const livesArr       = Array.from({ length: MAX_LIVES }, (_, i) => i < lives);

  // ── Block click handlers ──────────────────────────────────────────────────────
  const onPoolBlockClick = (i) => {
    const item = codePool[i];
    setCodePool(prev => prev.filter((_, j) => j !== i));
    setAssemblyArea(prev => [...prev, item]);
    setErrorDetails(null);
    lastErrorRef.current = false;
  };

  const onAssemblyBlockClick = (i) => {
    const item = assemblyArea[i];
    setAssemblyArea(prev => prev.filter((_, j) => j !== i));
    setCodePool(prev => [...prev, item]);
    setErrorDetails(null);
    lastErrorRef.current = false;
  };

  const onReset = () => {
    recordReset();
    if (qRef.current) initBoard(qRef.current, { resetErrors: false });
  };

  // ── Error / loading screens ───────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8">
          <p className="text-red-600 font-semibold text-lg mb-4">{loadError}</p>
          <button onClick={onBack} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-semibold">← Back</button>
        </div>
      </div>
    );
  }

  if (loading && !question) {
    return (
      <div className="min-h-screen bg-gray-50">
        <GameTopBar onBack={onBack} xp={initialXp} title={isCompetitive ? 'Competitive Mode' : 'Stress-Free Mode'} showTimer={false} />
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-5xl mb-4 animate-pulse">🤖</div>
            <p className="text-gray-500 font-semibold">AI is preparing your question…</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <GameTopBar
        onBack={onBack} xp={initialXp} showTimer={false}
        title={isCompetitive ? 'Competitive Mode' : 'Stress-Free Mode'}
        titleColor={isCompetitive ? 'text-violet-600' : 'text-indigo-600'}
        barColor={isCompetitive ? 'bg-violet-500' : 'bg-indigo-500'}
      />

      <div className="max-w-7xl mx-auto p-5">

        {/* Status bar — competitive only */}
        {isCompetitive && (
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500 mr-1">Lives:</span>
              {livesArr.map((alive, i) => (
                <span key={i} className={`text-lg ${alive ? '' : 'opacity-20'}`}>❤️</span>
              ))}
            </div>
            <GameTimer ref={timerRef} isRunning={!showSuccess && !gameOver} />
          </div>
        )}

        {/* Game over */}
        {gameOver && isCompetitive && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
            <p className="text-red-700 font-semibold">No lives left — session ended.</p>
            <button onClick={onComplete} className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-semibold">See Results →</button>
          </div>
        )}

        {q && (
          <div className="grid grid-cols-[1fr_1fr_240px] gap-4 items-start">

            {/* Col 1: Info panel */}
            <div className="flex flex-col gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h2 className="text-base font-semibold text-gray-900 mb-1">{q.title}</h2>
                {questionInstruction(q) && (
                  <p className="text-sm text-indigo-600 font-medium mb-2">
                    🎯 {questionInstruction(q)}
                  </p>
                )}
                {/* LC-style collapsed hint — Advanced (algorithm) ops only; basics
                    are covered by the animation and would just repeat it */}
                {_opLevel(q.operation) === 3 && q.hint && (
                  <div className="mb-2">
                    <button
                      onClick={() => setShowOpHint(v => !v)}
                      className="text-xs font-semibold text-amber-600 hover:text-amber-700"
                    >
                      💡 Hint {showOpHint ? '▾' : '▸'}
                    </button>
                    {showOpHint && (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mt-1">
                        {q.hint}
                      </p>
                    )}
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg p-2.5 mb-2">
                  <p className="text-gray-400 text-xs font-medium mb-1">Current state</p>
                  <LinkedListVisualiser values={currentPattern} emptyLabel="Empty list" highlight={isCorrect} goalValues={q.goalPattern} />
                </div>

                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-gray-400 text-xs font-medium mb-1">Goal state</p>
                  <LinkedListVisualiser values={q.goalPattern} emptyLabel="Empty list" nodeColor="bg-amber-50 border-amber-300 text-amber-800" />
                </div>

                {/* Buttons */}
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => setShowHintAnim(true)}
                    className="text-xs bg-amber-400 text-white px-2 py-1 rounded-full hover:bg-amber-500"
                  >
                    🎬 Animation
                  </button>
                  <button
                    onClick={() => { setShowTutor(v => !v); markUsedTutor(); }}
                    className="text-xs bg-violet-500 text-white px-2 py-1 rounded-full hover:bg-violet-600"
                  >
                    🎓 Tutor
                  </button>
                  {activeLevel < typeUnlocked && (
                    <button
                      onClick={handleLevelUp}
                      className="text-xs bg-emerald-500 text-white px-2 py-1 rounded-full hover:bg-emerald-600"
                    >
                      🔓 New question type →
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Col 2: Game board (dispatched by question type) */}
            <div className="flex flex-col gap-4">
              {/* Pass strip — non-blocking: the student reviews the board or moves on */}
              {showSuccess && (
                <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                  <span className="text-emerald-700 font-bold text-sm">✓ Passed</span>
                  <div className="flex-1" />
                  <button
                    onClick={() => setShowAnalysis(v => !v)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                      showAnalysis ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-500 text-white hover:bg-indigo-600'
                    }`}
                  >
                    📊 Analysis
                  </button>
                  <button
                    onClick={handleNext}
                    className="text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-4 py-1.5 rounded-full hover:opacity-90 transition-opacity"
                  >
                    {questionNumber >= plannedQuestions ? 'Finish Session →' : 'Next Question →'}
                  </button>
                </div>
              )}
              {(!q.question_type || q.question_type === 'ordering') && (
                <>
                  <CodePool
                    codePool={codePool}
                    currentLevel={q}
                    onBlockClick={onPoolBlockClick}
                  />
                  <AssemblyArea
                    assemblyArea={assemblyArea}
                    currentLevel={q}
                    isCorrectOrder={isCorrect}
                    errorDetails={errorDetails}
                    onBlockClick={onAssemblyBlockClick}
                    onReset={onReset}
                  />
                </>
              )}
              {q.question_type === 'fill_blank' && (
                <FillBlankBoard
                  question={q}
                  onComplete={handleBoardComplete}
                  onError={handleBoardError}
                  onStateChange={setBoardState}
                />
              )}
              {q.question_type === 'find_bug' && (
                <FindBugBoard
                  question={q}
                  onComplete={handleBoardComplete}
                  onError={handleBoardError}
                  onStateChange={setBoardState}
                />
              )}
              {/* Step-hint from the ordering decision chain (first-wrong anchor) */}
              {orderingHint && !isCorrect && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
                  <p className="text-red-600 text-sm">
                    {orderingHint.kind === 'operation' ? '🧭 ' : '💡 '}
                    {orderingHint.kind === 'step' && orderingHint.lineIdx != null
                      ? `Check the step "${q.pseudocode[orderingHint.lineIdx]}" — ${orderingHint.text}`
                      : orderingHint.text}
                  </p>
                </div>
              )}
            </div>

            {/* Col 3: Concept mastery + Tutor (pet/XP layer parked — no research value) */}
            <div className="flex flex-col gap-4">
              <ConceptMasteryPanel conceptMastery={conceptMastery} />
              {showTutor && sessionId && (
                <TutorChat
                  sessionId={sessionId}
                  questionTitle={q.title ?? ''}
                  operation={q.operation ?? ''}
                  questionType={q.question_type ?? 'ordering'}
                  yourAnswer={
                    (!q.question_type || q.question_type === 'ordering')
                      ? assemblyToText(assemblyArea, q.pseudocode, q.distractors)
                      : (boardState?.lines ?? [])
                  }
                  boardNote={boardState?.note ?? null}
                  correctAnswer={
                    (!q.question_type || q.question_type === 'ordering')
                      ? closestCorrectLines(q, assemblyToText(assemblyArea, q.pseudocode, q.distractors))
                      : q.question_type === 'fill_blank'
                        // fill_blank pseudocode arrives pre-blanked — restore answers
                        ? q.pseudocode.map((line, i) => {
                            const b = (q.blanks ?? []).find(x => x.line === i);
                            return b ? line.replace('___', b.answer) : line;
                          })
                        : (q.correctOrder ?? []).map(i => q.pseudocode[i])
                  }
                  errorCount={errorCount}
                  errorDiagnosis={null}
                  initialMessages={proactiveHistory}
                  initialInput={tutorSeed}
                  onClose={() => { setShowTutor(false); setTutorSeed(null); }}
                />
              )}
            </div>
          </div>
        )}

        {/* Between-question loading overlay */}
        {loading && question && (
          <div className="fixed inset-0 bg-white/70 flex items-center justify-center z-50">
            <div className="text-center">
              <div className="text-5xl mb-3 animate-pulse">🤖</div>
              <p className="text-gray-600 font-semibold">Loading next question…</p>
            </div>
          </div>
        )}
      </div>

      {/* Analysis panel — floating, never blocks the board (LC-style) */}
      {showSuccess && showAnalysis && q && (
        <AnalysisCard
          q={q}
          errorCount={errorCountRef.current}
          timeMs={answerTimeMsRef.current}
          xpGained={xpGained}
          questionNumber={questionNumber}
          plannedQuestions={plannedQuestions}
          analysis={analysisData}
          masteryDelta={masteryDelta}
          isCompetitive={isCompetitive}
          livesArr={livesArr}
          onClose={() => setShowAnalysis(false)}
          onAskTutor={() => {
            setTutorSeed(q.consider ?? null);
            setShowTutor(true);
            markUsedTutor();
          }}
        />
      )}

      {showHintAnim && q && (
        <LinkedListHintAnimation
          question={q}
          onClose={() => setShowHintAnim(false)}
        />
      )}

      {showToast && !showTutor && proactiveMessage && (
        <TutorToast
          message={proactiveMessage}
          onOpen={() => {
            setShowToast(false);
            setShowTutor(true);
            markUsedTutor();
          }}
          onDismiss={() => setShowToast(false)}
        />
      )}

      {showLevelUp && (
        <UnlockPopup
          currentLevel={activeLevel}
          unlockedLevel={typeUnlocked}
          onAdvance={handleLevelUp}
          onStay={() => setShowLevelUp(false)}
        />
      )}

      {showSessionSummary && (
        <SessionSummaryOverlay
          questionsCompleted={questionsCompletedRef.current}
          perfectCount={sessionPerfectCountRef.current}
          totalXp={totalXpRef.current}
          onContinue={onComplete}
        />
      )}
    </div>
  );
}

// Some operations accept multiple valid step orders (q.validOrders — e.g.
// createNode before vs. after traversal). The tutor's error analysis compares
// positionally, so give it the valid order CLOSEST to the student's attempt —
// otherwise it confidently "corrects" a legal alternative (found by tutor-sim
// sweep on insertAtPosition).
function closestCorrectLines(q, attemptLines) {
  const orders = (q.validOrders?.length ? q.validOrders : null) ?? (q.correctOrder ? [q.correctOrder] : []);
  let best = null, bestScore = -1;
  for (const ord of orders) {
    const lines = ord.map(i => q.pseudocode[i]);
    const score = lines.reduce((s, l, i) => s + ((attemptLines[i] ?? null) === l ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = lines; }
  }
  return best ?? [];
}

// Human-readable task line — professor feedback: "Insert at Position" alone
// doesn't tell the student WHICH position/value. Indices match the 0-based
// labels shown under the nodes.
function questionInstruction(q) {
  const v = q.operationValue, p = q.operationPosition;
  switch (q.operation) {
    case 'insertAtHead':     return v != null ? `Insert ${v} at the head` : null;
    case 'insertAtTail':     return v != null ? `Insert ${v} at the tail` : null;
    case 'insertIntoEmpty':  return v != null ? `Insert ${v} into the empty list` : null;
    case 'insertAtPosition': return `Insert ${v ?? '?'} at position ${p ?? '?'}`;
    case 'removeAtPosition': return `Remove the node at position ${p ?? '?'}`;
    case 'removeAtHead':     return 'Remove the head node';
    case 'removeAtTail':     return 'Remove the last node';
    case 'deleteEntireList': return 'Delete every node in the list';
    default:                 return null;   // reverse/merge/cycle/sort — title + goal state suffice
  }
}

function _opLevel(operation) {
  const L = {
    1: ['insertAtHead','insertAtTail','removeAtHead','removeAtTail'],
    2: ['insertIntoEmpty','deleteEntireList','insertAtPosition','removeAtPosition'],
    3: ['reverseList','mergeSortedLists','detectCycle','sortList'],
  };
  return Number(Object.entries(L).find(([, ops]) => ops.includes(operation))?.[0] ?? 1);
}
