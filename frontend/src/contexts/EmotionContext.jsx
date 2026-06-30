import React, { createContext, useContext, useState, useRef, useMemo, useCallback } from 'react';
import { getAdaptiveConfig, EMOTIONS } from '../services/adaptiveEngine';

const EmotionContext = createContext(null);

export function EmotionProvider({ children }) {
  const [emotion, setEmotionState] = useState(EMOTIONS.ENGAGED);
  const [emotionSource, setEmotionSource] = useState('self-report');

  // Behavioral signals accumulated during the current session
  const signals = useRef({
    sessionId: null,
    initialEmotion: EMOTIONS.ENGAGED,
    questionsDone: 0,
    totalErrors: 0,
    totalAttempts: 0,
    consecutiveErrors: 0,
    resets: 0,
    usedTutor: false,
    level: 1,
    totalTimeMs: 0,
  });

  const adaptiveConfig = useMemo(() => getAdaptiveConfig(emotion), [emotion]);

  // ── Emotion setter (self-report, sensor, or LLM) ──────────────────────────
  const setEmotion = useCallback((newEmotion, source = 'self-report') => {
    setEmotionState(newEmotion);
    setEmotionSource(source);
  }, []);

  // ── Session init — call at start of each game session ────────────────────
  const initSession = useCallback((sessionId, initialEmotion) => {
    signals.current = {
      sessionId,
      initialEmotion,
      questionsDone: 0,
      totalErrors: 0,
      totalAttempts: 0,
      consecutiveErrors: 0,
      resets: 0,
      usedTutor: false,
      level: 1,
      totalTimeMs: 0,
    };
  }, []);

  // ── Signal recorders — called by games ───────────────────────────────────
  const recordQuestion = useCallback((timeMs, errorCount, level) => {
    const s = signals.current;
    s.questionsDone += 1;
    s.totalErrors += errorCount;
    s.totalAttempts += errorCount + 1;   // errors + the final correct attempt
    s.consecutiveErrors = errorCount > 0 ? s.consecutiveErrors + 1 : 0;
    s.totalTimeMs += timeMs;
    s.level = level;
  }, []);

  const recordReset = useCallback(() => { signals.current.resets += 1; }, []);

  const markUsedTutor = useCallback(() => { signals.current.usedTutor = true; }, []);

  // ── Snapshot for inference call ──────────────────────────────────────────
  const getSignalsSnapshot = useCallback(() => {
    const s = signals.current;
    const avgTimeS = s.questionsDone > 0 ? (s.totalTimeMs / s.questionsDone) / 1000 : 0;
    const errorRate = s.totalAttempts > 0 ? (s.totalErrors / s.totalAttempts) * 100 : 0;
    return {
      session_id: s.sessionId,
      questions_done: s.questionsDone,
      error_rate: Math.round(errorRate * 10) / 10,
      avg_time_s: Math.round(avgTimeS * 10) / 10,
      consecutive_errors: s.consecutiveErrors,
      resets: s.resets,
      used_tutor: s.usedTutor,
      level: s.level,
      initial_emotion: s.initialEmotion,
    };
  }, []);

  return (
    <EmotionContext.Provider value={{
      emotion, setEmotion, emotionSource, adaptiveConfig,
      initSession, recordQuestion, recordReset, markUsedTutor, getSignalsSnapshot,
    }}>
      {children}
    </EmotionContext.Provider>
  );
}

export function useEmotion() {
  const ctx = useContext(EmotionContext);
  if (!ctx) throw new Error('useEmotion must be used inside <EmotionProvider>');
  return ctx;
}
