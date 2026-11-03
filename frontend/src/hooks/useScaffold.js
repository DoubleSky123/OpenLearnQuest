import { useMemo } from 'react';

/**
 * Scaffold orchestrator — the single source of truth for "how much help to show".
 *
 * scaffold_level ∈ [0, 4]:
 *   0  nothing (let the student think)
 *   1  point at the wrong step (no fix)            → existing error highlight
 *   2  Socratic question / proactive tutor push    → tutor_agent (doesn't reveal)
 *   3  concept hint
 *   4  final hint: the answer for the current step → FinalHintCard + the tutor may say it
 *
 * What actually fires on a question (AgenticSession): the animation opens on the
 * FIRST mistake, the proactive tutor push on the SECOND (and only at level ≥2) —
 * animation before tutor, never one over the other — and the final hint once the
 * level reaches 4 with at least FINAL_HINT_MIN_ERRORS mistakes, so the animation
 * and the tutor have always been tried first.
 *
 * Design (grounded in scaffolding literature — see docs/research-difficulty-adaptation.md §4.2):
 *   - emotion sets the BASELINE (confused/frustrated start higher; engaged/bored start at 0)
 *   - each error CLIMBS one level        → Wood's contingent shift rule
 *   - mastery CAPS the ceiling (fading)  → experts get less hand-holding (expertise reversal)
 *
 * Pure function of (emotion, errorCount, masteryForOp); no side effects.
 * Subscribers (proactive push, animation auto-open, final hint) read it to decide whether to fire.
 */

const EMOTION_BASELINE = {
  engaged:    0,
  confused:   1,   // confusion is a learning signal → add support, don't lower difficulty
  frustrated: 2,   // danger signal → support sooner
  bored:      0,
};

// keep in step with backend tutor_agent.FINAL_HINT_MIN_ERRORS (it re-checks the tutor's side)
export const FINAL_HINT_MIN_ERRORS = 3;

// The final hint listens to the BOARD only. An emotion read from what the student
// typed in the tutor chat ("I don't know", "I'm lost") must not bring it forward,
// or saying you're stuck would become a way to get the answer without trying.
export const countsForFinalHint = (emotionSource) => emotionSource !== 'chat';

// Fading: the higher the mastery of the current operation, the lower the help ceiling.
function scaffoldCap(masteryForOp) {
  if (masteryForOp == null) return 4;   // unknown → full support available
  if (masteryForOp >= 0.7)  return 2;   // expert → never auto-reveal
  if (masteryForOp < 0.3)   return 4;   // novice → full ladder
  return 3;
}

export function scaffoldState(emotion, errorCount, masteryForOp = null) {
  const baseline = EMOTION_BASELINE[emotion] ?? 0;
  const cap      = scaffoldCap(masteryForOp);
  const level    = Math.max(0, Math.min(baseline + errorCount, cap));
  // engaged/bored: 4th mistake; confused/frustrated: 3rd (never sooner than the minimum)
  const finalHint = level >= 4 && errorCount >= FINAL_HINT_MIN_ERRORS;
  return { level, cap, baseline, finalHint };
}

export function useScaffold(emotion, errorCount, masteryForOp = null) {
  return useMemo(() => scaffoldState(emotion, errorCount, masteryForOp), [emotion, errorCount, masteryForOp]);
}
