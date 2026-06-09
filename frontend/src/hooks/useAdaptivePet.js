import { useCallback, useRef, useState } from 'react';
import { useEmotion } from '../contexts/EmotionContext';
import { getRandomPetMessage } from '../services/adaptiveEngine';
import { getOperationMessage, OPERATION_MESSAGES } from '../data/petMessages';

/**
 * useAdaptivePet
 *
 * Emotion-aware + operation-aware pet message hook.
 *
 * Usage:
 *   // Generic (Training / Challenge — no operation bank yet)
 *   const { message, showWrong, showSuccess, showStepEncouragement } = useAdaptivePet();
 *
 *   // Operation-aware (Tutorial — has message bank)
 *   const { message, showWrong, showSuccess, showStepEncouragement } = useAdaptivePet(q.id);
 *
 * Priority:
 *   1. If operationId is in petMessages bank → use operation-specific message
 *   2. Else if stressed → use adaptiveConfig.petMessages (supportive)
 *   3. Else → use generic wrong/success pool
 */

const GENERIC_WRONG_MSGS = [
  'Wrong order — think through the steps!',
  'Not quite right, try again!',
  'Almost! Check the pointer logic.',
  'Rethink the sequence 🤔',
];

export function useAdaptivePet(operationId) {
  const { adaptiveConfig, emotion } = useEmotion();
  const [message, setMessage] = useState('');
  const timerRef = useRef(null);

  const hasBank = !!operationId && !!OPERATION_MESSAGES[operationId];

  const show = useCallback((msg) => {
    if (!msg) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(msg);
    timerRef.current = setTimeout(() => setMessage(''), 3500);
  }, []);

  /** Wrong answer */
  const showWrong = useCallback(() => {
    if (hasBank) {
      // Operation-aware message takes priority
      show(getOperationMessage(operationId, 'wrong', emotion));
    } else if (adaptiveConfig.encouragingMessages) {
      // Stressed fallback — supportive tone
      show(getRandomPetMessage(adaptiveConfig));
    } else {
      show(GENERIC_WRONG_MSGS[Math.floor(Math.random() * GENERIC_WRONG_MSGS.length)]);
    }
  }, [hasBank, operationId, emotion, adaptiveConfig, show]);

  /** Full question completion */
  const showSuccess = useCallback(() => {
    if (hasBank) {
      show(getOperationMessage(operationId, 'success', emotion));
    } else {
      show(getRandomPetMessage(adaptiveConfig));
    }
  }, [hasBank, operationId, emotion, adaptiveConfig, show]);

  /**
   * Per-step encouragement after each correct blank/block.
   * Stressed: operation-aware step message if available, else adaptive message.
   * OK / Bored: silent (no message).
   */
  const showStepEncouragement = useCallback(() => {
    if (!adaptiveConfig.encouragingMessages) return;
    if (hasBank) {
      show(getOperationMessage(operationId, 'stepCorrect', emotion));
    } else {
      show(getRandomPetMessage(adaptiveConfig));
    }
  }, [hasBank, operationId, emotion, adaptiveConfig, show]);

  return { message, show, showWrong, showSuccess, showStepEncouragement };
}
