// Pure helpers for the study test screen (StudyTest.jsx); tested in studyTest.test.js.

export const TEST_TEXT = {
  pre: {
    title: 'Before you start: a short test',
    intro: 'This shows where you are starting from. Lots of it may be new, and that is fine: answer as well as you can.',
  },
  post: {
    title: 'End-of-course test',
    intro: 'The same kind of questions as at the start, about what you practised.',
  },
  delayed: {
    title: 'Follow-up test',
    intro: 'One last short test, to see what stayed with you.',
  },
};

// Where to resume: the first item without an answer (items.length = all answered).
export function firstUnanswered(items, answers) {
  const i = items.findIndex((it) => !answers[it.id]);
  return i === -1 ? items.length : i;
}

export function answeredCount(items, answers) {
  return items.filter((it) => answers[it.id]).length;
}

// Time spent on an item since it was shown (or last answered), capped so a tab
// left open overnight does not count as thinking time.
export function elapsedMs(start, now, cap = 30 * 60 * 1000) {
  return Math.max(0, Math.min(Math.round(now - start), cap));
}
