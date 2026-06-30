import { useMemo } from 'react';

/**
 * Scaffold orchestrator — the single source of truth for "how much help to show".
 *
 * scaffold_level ∈ [0, 4]:
 *   0  nothing (let the student think)
 *   1  point at the wrong step (no fix)            → existing error highlight
 *   2  Socratic question / proactive tutor push    → tutor_agent (doesn't reveal)
 *   3  concept hint + animation auto-opens
 *   4  near-reveal + encouragement                 → only on real impasse
 *
 * Design (grounded in scaffolding literature — see docs/research-difficulty-adaptation.md §4.2):
 *   - emotion sets the BASELINE (confused/frustrated start higher; engaged/bored start at 0)
 *   - each error CLIMBS one level        → Wood's contingent shift rule
 *   - mastery CAPS the ceiling (fading)  → experts get less hand-holding (expertise reversal)
 *
 * Pure function of (emotion, errorCount, masteryForOp); no side effects.
 * Subscribers (proactive push, animation auto-open, …) read `level` to decide whether to fire.
 */

const EMOTION_BASELINE = {
  engaged:    0,
  confused:   1,   // confusion is a learning signal → add support, don't lower difficulty
  frustrated: 2,   // danger signal → support sooner
  bored:      0,
};

// Fading: the higher the mastery of the current operation, the lower the help ceiling.
function scaffoldCap(masteryForOp) {
  if (masteryForOp == null) return 4;   // unknown → full support available
  if (masteryForOp >= 0.7)  return 2;   // expert → never auto-reveal
  if (masteryForOp < 0.3)   return 4;   // novice → full ladder
  return 3;
}

export function useScaffold(emotion, errorCount, masteryForOp = null) {
  return useMemo(() => {
    const baseline = EMOTION_BASELINE[emotion] ?? 0;
    const cap      = scaffoldCap(masteryForOp);
    const level    = Math.max(0, Math.min(baseline + errorCount, cap));
    return { level, cap, baseline };
  }, [emotion, errorCount, masteryForOp]);
}
