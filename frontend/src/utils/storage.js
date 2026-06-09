// ─── OpenLearnQuest localStorage helpers ─────────────────────────────────────

const XP_KEY       = 'olq_xp';
const MISTAKES_KEY = 'olq_mistakes';
const MAX_MISTAKES = 100;

// ── XP ────────────────────────────────────────────────────────────────────────

export function loadXP() {
  try {
    const v = localStorage.getItem(XP_KEY);
    return v !== null ? parseInt(v, 10) : 0;
  } catch { return 0; }
}

export function saveXP(xp) {
  try { localStorage.setItem(XP_KEY, String(xp)); } catch {}
}

// ── Mistake book ──────────────────────────────────────────────────────────────

/**
 * Returns all stored mistakes, newest first.
 * Each entry: { id, date, source, title, yourAnswer, correctAnswer, explanation }
 * source: 'quiz' | 'daily' | 'tutorial' | 'training' | 'challenge'
 */
export function getMistakes() {
  try {
    const v = localStorage.getItem(MISTAKES_KEY);
    return v ? JSON.parse(v) : [];
  } catch { return []; }
}

export function addMistake({ source, title, yourAnswer, correctAnswer, explanation }) {
  try {
    const list  = getMistakes();
    const entry = {
      id:            `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date:          Date.now(),
      source,
      title,
      yourAnswer,
      correctAnswer,
      explanation,
    };
    const updated = [entry, ...list].slice(0, MAX_MISTAKES);
    localStorage.setItem(MISTAKES_KEY, JSON.stringify(updated));
  } catch {}
}

export function clearMistakes() {
  try { localStorage.removeItem(MISTAKES_KEY); } catch {}
}
