# OpenLearnQuest — Improvement Plan

Benchmarked against Duolingo, Brilliant.org, and LeetCode.

---

## Already Implemented
- Concept slides with diagrams and quizzes (Intro)
- Guided fill-in-the-blank exercises (Tutorial)
- Predict-then-assemble mechanic with inline feedback (Training)
- Timed solo challenge with lives, XP, and star rating (Challenge)
- Pet companion reacting to success/failure
- Daily debug challenge (rotates 7 problems by day of week)
- Transition screens between stages

---

## Proposed Improvements

**Retention & Habit**
- **Progress persistence** — XP and completion state reset on page refresh; save to `localStorage`
- **Daily streak counter** — daily challenge exists but has no "🔥 Day N" counter or broken-streak prompt

**Feedback & Motivation**
- **XP gain animation** — correct answers should show a floating "+N XP" label; currently the bar updates silently
- **Achievement badges** — no persistent unlocks; examples: First Perfect Run, 3-Day Streak, SLL Complete, No Hints Used

**Content Coverage**
- **Incomplete exercise set** — Tutorial only covers Insert/Remove at Head; Training skips Head operations entirely; every operation taught in Intro should have a Tutorial and Training exercise

**Discoverability**
- **New user onboarding** — first-time visitors land on the module screen with no explanation of the four-stage path; a single introductory screen on first visit would help

**Revision**
- **Weak-area review** — no mechanism to resurface operations where the student made many errors; a simple "Recommended Review" prompt after Challenge would address this
