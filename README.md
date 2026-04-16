# OpenLearnQuest

A gamified web app for learning linked list data structures through interactive code-assembly challenges.

Built with React 19 + Vite + Tailwind CSS.

---

## What it does

OpenLearnQuest teaches linked list operations step-by-step using a drag-and-drop pseudocode assembly mechanic. Instead of writing code from scratch, learners arrange pseudocode blocks in the correct order — keeping the focus on logic and pointer reasoning rather than syntax.

**Learning path (Singly Linked List):**

| Stage | Mode | Description |
|-------|------|-------------|
| 1 | **Intro** | Concept slides with a quiz at the end |
| 2 | **Tutorial** | Guided word-assembly exercises with per-step hints |
| 3 | **Training** | Predict-then-assemble exercises with inline error feedback |
| 4 | **Challenge** | Timed solo mode — no hints, lives system, XP rewards |

A **Daily Debug Challenge** rotates a bug-finding exercise each day of the week.

---

## Tech stack

- **React 19** — UI and state management
- **Vite** — build tooling
- **Tailwind CSS** — styling
- **Lucide React** — icons

No backend. All question data, validation logic, and error detection run entirely in the browser.

---

## Project structure

```
src/
├── App.jsx                        # Root routing and Challenge mode (SinglyLinkedListGame)
├── components/
│   ├── ModuleSelector.jsx         # Main menu (Singly / Doubly LL selection)
│   ├── ModeSelector.jsx           # Mode path map (Intro → Tutorial → Training → Challenge)
│   ├── TutorialIntroPage.jsx      # Intro concept slides + quiz
│   ├── TutorialGame.jsx           # Tutorial mode
│   ├── TrainingGame.jsx           # Training mode with predict-verify mechanic
│   ├── DailyChallenge.jsx         # Daily debug challenge
│   ├── DoublyLinkedListGame.jsx   # Doubly linked list game
│   ├── DLL*.jsx                   # DLL intro, tutorial, and training variants
│   ├── shared/
│   │   ├── GameTopBar.jsx         # Sticky header (XP, lives, timer, back button)
│   │   └── GamePetCard.jsx        # Companion pet with speech bubble
│   └── ...modals, assembly UI
├── services/
│   ├── questionGenerator.js       # Generates SLL questions (Levels 1–3)
│   ├── doublyQuestionGenerator.js # Generates DLL questions
│   ├── validationLogic.js         # Fill-to-trigger assembly validation
│   ├── errorDetectionEngine.js    # 5 rule-based error detectors
│   ├── distractorAnalyzer.js      # Feedback for wrong code blocks
│   ├── linkedListOperations.js    # Executes SLL operations on node arrays
│   ├── doublyLinkedListOperations.js
│   ├── operations.js              # Shared operation name constants
│   └── questionGeneratorCommon.js # Shared question-generation helpers
└── utils/
    └── helpers.js                 # shuffleArray, getCurrentPattern, XP constants
```

---

## Getting started

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

---

## Validation model

**Training mode** gives immediate per-block feedback — a wrong block is rejected the moment it is placed.

**Challenge mode** uses a fill-to-trigger model — the assembly stays silent until all slots are filled, then validates in one pass. This is intentional: Challenge mode offers no hand-holding.

When an error is detected, the engine runs 5 pattern-matching rules (pointer sequence, traversal position, null placement, temp variable, semantic confusion) to generate specific educational feedback instead of a generic "wrong order" message.

---

## Question levels (Singly Linked List)

| Level | Operations |
|-------|------------|
| 1 — Beginner | Insert at Head/Tail, Remove at Head/Tail |
| 2 — Intermediate | Insert/Remove at Position, Insert into Empty List, Delete Entire List |
| 3 — Advanced | Reverse, Merge Sorted Lists, Detect Cycle, Sort |
