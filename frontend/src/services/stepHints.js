/**
 * Step-hint selection for the ordering board.
 *
 * One decision chain, anchored on the FIRST wrong position against the valid
 * order CLOSEST to the student's attempt (linked-list steps are sequential —
 * fixing left-to-right is the right strategy, and the anchor advances as they
 * repair):
 *
 *   1. distractor at the first wrong slot -> name it as foreign
 *   2. mostly wrong (>= half)             -> altitude up: operation-level hint
 *      (a chaotic board signals a concept gap, not a step slip)
 *   3. otherwise                          -> the misplaced step's own hint
 *      (q.step_hints is parallel to q.pseudocode, authored in TEMPLATES)
 *
 * Pure function — no React, no side effects.
 */
export function selectOrderingHint(q, attemptLines) {
  if (!q?.pseudocode?.length || !attemptLines?.length) return null;

  const orders = q.validOrders?.length ? q.validOrders : (q.correctOrder ? [q.correctOrder] : []);
  let best = null, bestScore = -1;
  for (const ord of orders) {
    const lines = ord.map(i => q.pseudocode[i]);
    const score = lines.reduce((s, l, i) => s + (attemptLines[i] === l ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = lines; }
  }
  if (!best) return null;

  const mismatches = best
    .map((line, i) => (attemptLines[i] !== line ? i : -1))
    .filter(i => i >= 0);
  if (mismatches.length === 0) return null;

  if (mismatches.length >= Math.ceil(best.length / 2)) {
    return q.hint ? { kind: 'operation', text: q.hint } : null;
  }

  const firstWrong = mismatches[0];
  const placed = attemptLines[firstWrong];
  const lineIdx = q.pseudocode.indexOf(placed);
  if (lineIdx === -1) {
    const shown = placed?.length > 40 ? placed.slice(0, 40) + '…' : placed;
    return { kind: 'distractor', text: `"${shown}" isn't part of this operation — it solves a different problem.` };
  }

  const hint = q.step_hints?.[lineIdx];
  return hint
    ? { kind: 'step', text: hint, lineIdx }
    : (q.hint ? { kind: 'operation', text: q.hint } : null);
}
