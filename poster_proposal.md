# OpenLearnQuest — Poster Proposal
**Author:** Kunyi Shi · Northeastern University Silicon Valley  
**Date:** April 2026

---

## Layout Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  TITLE + AUTHORS + AFFILIATION + NEU LOGO + POSTER #            │
├──────────────────┬──────────────────────┬───────────────────────┤
│  BACKGROUND &    │   KEY HIGHLIGHTS      │   SCREENSHOTS         │
│  MOTIVATION      │   (3 items)           │   (2×2 grid)          │
├──────────────────┴──────────────────────┴───────────────────────┤
│         FIGURE 1: DESIGN EVOLUTION TIMELINE (full width)        │
├──────────────────┬──────────────────────┬───────────────────────┤
│  METHODOLOGY     │  ADAPTIVE ARCH +     │  CONCLUSIONS +        │
│                  │  ERROR CATEGORIES    │  FUTURE WORK +        │
│                  │  + FIGURE 2          │  REFERENCES           │
└──────────────────┴──────────────────────┴───────────────────────┘
```

---

## Section Text (Bullet Point Format)

### Background & Motivation
*[Figure suggestion: 3-column comparison table of platforms]*

- Most platforms address engagement **or** depth — not both
- **Duolingo / Brilliant** — strong mechanics, no algorithm content [1]
- **LeetCode / Kattis** — rigorous practice, no gamification or adaptive routing [2]
- **CodeCombat / Prodigy** — gamified, but teaches syntax not data structure reasoning [1]
- **Gap:** no platform combines gamified interaction + adaptive prerequisite routing for algorithm learning

---

### Problem Statement

- Students hit prerequisite gaps mid-session — too late to recover gracefully
- No current platform detects gaps and reroutes without breaking learning flow
- **Proposition:** A gamified, adaptive platform combining scaffolded instruction, engagement mechanics, and cross-topic prerequisite routing can provide a more effective and engaging environment for students learning algorithm concepts.

---

### Key Highlights

**1 — Research-Driven Iterative Design**
- 7 design iterations, each traceable to a literature or instructor insight
- Evolved from bare drag-and-drop prototype → fully scaffolded, gamified platform

**2 — Four-Stage Scaffolding**
- Intro (concept slides + mandatory quiz) → Tutorial (guided, step-by-step) → Training (hints on demand) → Challenge (independent)
- Procedurally generated questions, distractor blocks, error category feedback

**3 — Adaptive Cross-Module Routing**
- Repeated fundamental pointer errors in DLL → suggestion to return to SLL
- Framed as player choice, not system redirect

---

### Figure 1: Design Evolution *(full width, primary visual)*
*[Initial prototype mockup on the left, then 5 Gap → Response panels with arrows]*

**Initial Prototype** — drag-and-drop pseudocode blocks for basic SLL operations; validated core mechanic but revealed multiple design gaps *(Informed by: BlockList [5])*

| # | Gap Identified | Design Response | Evidence |
|---|---|---|---|
| 1 | No conceptual baseline; novices dropped straight into exercises | Full scaffolding layer: Intro (slides + quiz) → Tutorial → Training → Challenge | Brilliant [1], CogBooks [3], instructor feedback |
| 2 | Basic operations don't reflect real CS curriculum | Level 3 expanded to classic problems: Reverse, Detect Cycle, Merge, Sort List | LeetCode analysis [2] |
| 3 | No long-term engagement hook | Gamification: pet companion (5 evolution stages), experience points, star ratings, progress path | Duolingo [1], Prodigy [4] |
| 4 | Single module — no prerequisite routing | DLL module + adaptive cross-module suggestion (framed as player choice) | CogBooks [3] |
| 5 | UI friction limiting accessibility | Unified light theme, larger fonts, click-to-place interaction | Instructor feedback |

---

### Methodology

- **Literature review** — Duolingo [1], Brilliant [1], CogBooks [3], Prodigy [4], BlockList [5]
- **Instructor feedback** — regular review sessions; drove onboarding, theme, content scope changes
- **Platform analysis** — selectively adapted features (experience points, lives, path navigation, concept slides, difficulty levels)
- Each stage: prototype → evaluate → iterate

---

### Adaptive Architecture
*[Figure 2: knowledge dependency graph]*

```
Singly Linked List → Doubly Linked List → Trees (planned) → Graph (planned)
        ↑_____________________|
        adaptive suggestion (repeated pointer errors)
```

**Six Error Categories:**

| Category | Routing Effect |
|---|---|
| Lost Reference | → Suggest SLL |
| Off-by-One | → Suggest SLL |
| NULL Pointer | → Suggest SLL |
| Self-Loop | → Suggest SLL |
| Memory Leak | → Suggest SLL |
| Broken Prev *(DLL only)* | Targeted hint only |

---

### Conclusions

- Research-driven iteration produces educationally principled, engaging design
- Key contributions:
  - Six-category error classification mapping game mistakes to CS misconceptions
  - Cross-module adaptive routing preserving learner autonomy
  - Intro → Tutorial → Training → Challenge scaffolding bridging novice-to-practitioner gap
  - Content progression from basic ops to classic algorithm problems
- **Vision:** knowledge graph of algorithm games — students find and choose the prerequisite they need

---

### Future Work

- Backend persistence for cross-session adaptive routing
- Formal user study on learning outcomes
- Expand: Sorting, BST, Graph modules
- Cross-platform routing with teammate's sorting game

---

### References

[1] Duolingo Inc., "Duolingo learning design principles," *duolingo.com*, 2024.

[2] LeetCode, "LeetCode problem set," *leetcode.com*, 2024.

[3] M. Contrino et al., "CogBooks adaptive learning system," *Educational Technology Research*, 2024.

[4] B. Kim and J. Park, "Gamification in CS education: A systematic review," *Computers & Education*, 2022.

[5] S. Murali et al., "BlockList: A game for learning linked list concepts," in *Proc. ACM SIGCSE TS*, 2025.

---

## Screenshots Panel (top right)
*[2×2 grid of actual screenshots]*

- Top-left: module selection path (winding nodes + locked future modules)
- Top-right: Challenge Mode in game (code blocks + Algo pet + experience points bar)
- Bottom-left: Tutorial intro slide
- Bottom-right: Level completion modal (3-star rating)

---

## Figure Specs

**Figure 1 — Design Evolution**
- Initial prototype panel + 5 Gap→Response panels in a horizontal row, connected by arrows
- Each panel: version label (top) + UI screenshot or mockup (center) + colored badge (bottom)
- Badge colors: 🔵 Literature review · 🔴 Instructor feedback · 🟢 Design principle


**Figure 2 — Knowledge Dependency Graph**
- Module nodes: SLL (active) → DLL (active) → Trees / Graph (locked)
- Dashed back-arrow: DLL → SLL labeled "Adaptive suggestion"
- Dashed forward arrow: Sort List → teammate's sorting module (planned)
