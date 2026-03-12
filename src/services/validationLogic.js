/**
 * Validation logic — "fill-to-trigger" model
 *
 * Validation only runs when the student has placed exactly
 * correctOrder.length blocks in the assembly area.
 * Before that, nothing is checked and no errors are shown.
 *
 * When the assembly is full, two things are checked in order:
 *   1. Distractor present  → show educational feedback for that error type
 *   2. Wrong order         → show sequence error feedback
 */

import { analyzeDistractorError } from './distractorAnalyzer.js';
import { detectCodeError } from './errorDetectionEngine.js';

export const validateAssembly = (assemblyArea, complexityArea, currentLevel) => {
  const required = currentLevel.correctOrder.length;

  // ── Not full yet — stay silent ──────────────────────────────────────
  if (assemblyArea.length < required) {
    return { isValid: false, errors: null };
  }

  // ── Too many blocks ─────────────────────────────────────────────────
  if (assemblyArea.length > required) {
    return {
      isValid: false,
      errors: {
        type: 'too_many_blocks',
        message: '🧩 Too Many Code Blocks',
        explanation: `You need exactly ${required} blocks, but you have ${assemblyArea.length}.`,
        hint: 'Drag the extra block back to the pool.',
      }
    };
  }

  // ── Assembly is exactly full — now validate ─────────────────────────

  // 1. Check for distractors
  const hasDistractor = assemblyArea.some(item => item.isDistractor);
  if (hasDistractor) {
    const wrongBlocks = assemblyArea
      .map((item, idx) => item.isDistractor ? { item, position: idx + 1 } : null)
      .filter(Boolean)
      .map(({ item, position }) => ({
        position,
        code: currentLevel.distractors[item.index]
      }));

    const fb = analyzeDistractorError(wrongBlocks, currentLevel);
    return {
      isValid: false,
      errors: {
        type: 'distractor',
        message: '❌ Incorrect Code Block Detected',
        explanation: fb.explanation,
        reasoning:   fb.reasoning,
        keyPoint:    fb.keyPoint,
        hint:        fb.hint,
        wrongBlocks,
      }
    };
  }

  // 2. Check code order
  const codeCorrect = assemblyArea.every(
    (item, pos) => !item.isDistractor && item.index === currentLevel.correctOrder[pos]
  );

  if (!codeCorrect) {
    // Try specific pattern detection first
    const patternError = detectCodeError(
      assemblyArea,
      currentLevel,
      currentLevel.errorRules || []
    );
    if (patternError) {
      return { isValid: false, errors: patternError };
    }

    return {
      isValid: false,
      errors: {
        type: 'code_order',
        message: '📝 Code Sequence Incorrect',
        hint: 'Check the order of each step. Think about what must be set up before the next line can work correctly.',
      }
    };
  }

  // ── All correct ─────────────────────────────────────────────────────
  return { isValid: true, errors: null };
};
