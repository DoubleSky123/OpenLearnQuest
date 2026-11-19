/**
 * Final hint (scaffold level 4): the answer for the ONE step the student is on,
 * and why. Built from the question's own data (TEMPLATES-derived), never from the
 * tutor model, so it is correct by construction.
 *   fill_blank  the current blank's token, shown in its line
 *   find_bug    which line is the bug while they hunt, then that line's fix
 *   ordering    the step that belongs at the first wrong position of their assembly
 * Returns { stepNo, label, answer, why } or null when there is nothing to show.
 */
export function finalHintFor({ question: q, focus = null, attempt = [], correct = [] }) {
  if (!q) return null;
  const type = q.question_type ?? 'ordering';

  if (type === 'fill_blank') {
    if (focus?.kind !== 'blank') return null;
    const lineIdx = focus.stepNo - 1;
    const blank = (q.blanks ?? []).find((b, i) => (b.line ?? i) === lineIdx);
    if (!blank) return null;
    return {
      stepNo: focus.stepNo,
      label:  `Step ${focus.stepNo} is`,
      answer: q.pseudocode[lineIdx].replace('___', blank.answer),
      why:    q.step_hints?.[lineIdx] ?? null,
    };
  }

  if (type === 'find_bug') {
    if (q.bug_line == null) return null;
    const stepNo = q.bug_line + 1;
    if (focus?.kind === 'fix')
      return { stepNo, label: `Line ${stepNo} should read`, answer: q.fix, why: q.bug_explanation ?? null };
    return { stepNo, label: `The bug is on line ${stepNo}`, answer: q.pseudocode[q.bug_line], why: q.step_hints?.[q.bug_line] ?? null };
  }

  // ordering: first position where their assembly leaves the closest correct order
  if (!correct.length) return null;
  let k = 0;
  while (k < correct.length && attempt[k] === correct[k]) k++;
  if (k >= correct.length) return null;
  return {
    stepNo: k + 1,
    label:  `Step ${k + 1} is`,
    answer: correct[k],
    why:    q.step_hints?.[q.pseudocode.indexOf(correct[k])] ?? null,
  };
}
