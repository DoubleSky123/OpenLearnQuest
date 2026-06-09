import React, { createContext, useContext, useState, useMemo } from 'react';
import { getAdaptiveConfig, EMOTIONS } from '../services/adaptiveEngine';

/**
 * EmotionContext
 *
 * Holds the current detected/reported emotional state and the derived
 * adaptive-behavior configuration.  Consumed by game screens and the pet
 * companion to adjust difficulty, messages, and UI overlays.
 *
 * Phase 0  → emotion is set by the self-report slider (EmotionCheckIn)
 * Phase 1  → emotion is set by SensorFusionService (camera + HR + temp)
 * Phase 2  → emotion can also be set by AIEmotionService (Claude API)
 *
 * The context API is the same across all phases — only the setter's caller changes.
 */

const EmotionContext = createContext(null);

export function EmotionProvider({ children }) {
  const [emotion, setEmotionState] = useState(EMOTIONS.OK);

  /**
   * Source tracks WHERE the current emotion value came from.
   * Useful for Phase 2 comparison logging.
   * 'self-report' | 'sensor' | 'ai'
   */
  const [emotionSource, setEmotionSource] = useState('self-report');

  /**
   * Full adaptive config derived from current emotion.
   * Re-computed only when emotion changes.
   */
  const adaptiveConfig = useMemo(() => getAdaptiveConfig(emotion), [emotion]);

  /**
   * Set the emotion and record which system detected it.
   * @param {string} newEmotion — EMOTIONS constant
   * @param {'self-report'|'sensor'|'ai'} source
   */
  const setEmotion = (newEmotion, source = 'self-report') => {
    setEmotionState(newEmotion);
    setEmotionSource(source);
  };

  return (
    <EmotionContext.Provider value={{ emotion, setEmotion, emotionSource, adaptiveConfig }}>
      {children}
    </EmotionContext.Provider>
  );
}

/**
 * Hook to consume emotion state and adaptive config from any game component.
 */
export function useEmotion() {
  const ctx = useContext(EmotionContext);
  if (!ctx) throw new Error('useEmotion must be used inside <EmotionProvider>');
  return ctx;
}
