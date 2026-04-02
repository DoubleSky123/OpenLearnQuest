# OpenLearnQuest Poster Proposal
**Research Showcase Poster — Draft for Review**

**Project:** OpenLearnQuest — A Gamified Adaptive Learning Platform for Algorithm Education  
**Subtitle:** Iterative Design of a Linked List Game Module with Cross-Topic Prerequisite Routing  
**Author:** Kunyi Qiu — Northeastern University, Silicon Valley  
**Date:** April 2026  
**Purpose:** Outline proposed poster content, structure, and figures for feedback before final production.

---

## Table of Contents
1. Poster Section Layout
2. Poster Text Draft
3. Suggested Figures / Visual Elements
4. Design Evolution Figure Specification

---

## 1. Poster Section Layout

The poster follows a one-page academic format optimized for 60-second scanning. Emphasis is placed on the **research and design process** rather than system architecture, reflecting the frontend-focused nature of the project.

### Layout Grid

**Top Tier (3 columns)**
- Left: Background & Motivation — market gap + literature review findings
- Center: Key Highlights — 3 bold contribution items (poster centerpiece)
- Right: Current State screenshots — module path, game UI, pet companion, completion modal

**Middle Tier (full width)**
- Full-width row: Figure 1 — Design Evolution Timeline (6-stage UI progression, primary visual)

**Bottom Tier (3 columns)**
- Left: Methodology — how iterative design + literature review drove decisions
- Center: Adaptive Learning Architecture — knowledge dependency graph + error taxonomy
- Right: Conclusions + References + Future Work

**Footer strip:** Key design insights (horizontal bullets)

### Design Rationale
- The design evolution figure is the poster's centerpiece — it tells the research story visually
- Screenshots on the right give reviewers an immediate sense of the final product
- Technical depth (error taxonomy, adaptive routing) is reserved for the bottom tier
- Target reading time: ~60 sec overview, ~3 min full read
- Reading path: Title → Highlights → Evolution Timeline → Architecture → Conclusions

---

## 2. Poster Text Draft

### 2.1 Background & Motivation

Most platforms address either engagement *or* algorithm depth — but not both. Learning tools lack algorithmic rigor; practice platforms are inaccessible to novices; educational games skip data structure reasoning entirely. A literature review of leading platforms revealed:

- **Duolingo / Brilliant.org** — strong engagement and scaffolding mechanics, no algorithm content
- **LeetCode / Kattis** — rigorous algorithm practice, not designed for novice learners and adaptively
- **CodeCombat / Prodigy** — gamified coding, but teaches syntax rather than data structure reasoning

No existing platform combines gamified interaction with adaptive prerequisite routing for algorithm concept learning.

---

### 2.2 Problem Statement

Students learning complex algorithms often hit prerequisite gaps mid-session — realizing too late that foundational concepts are missing. No current platform detects these gaps and reroutes learners without breaking their flow.

**Research Question:** Does a gamified, adaptive learning platform — combining scaffolded instruction, engagement mechanics, and cross-topic prerequisite routing — improve how students learn algorithm concepts compared to existing tools?

---

### 2.3 Key Highlights

**1 — Research-Driven Iterative Design**
Six design iterations, each grounded in literature review findings or direct instructor feedback, evolved the platform from a bare drag-and-drop prototype to a fully scaffolded, gamified learning experience. Every major design decision is traceable to a specific research insight.

**2 — Three-Tier Scaffolding Architecture**
A Tutorial → Training → Challenge progression maps to established learning theory: concept introduction (slides + quiz), guided practice (fill-in-the-blank with hints), and independent challenge (procedurally generated questions with distractor blocks and error taxonomy feedback).

**3 — Adaptive Cross-Module Prerequisite Routing**
When a student accumulates ≥ 2 Type-A errors (pointer logic errors shared with the prerequisite module) in a Doubly Linked List session, the platform surfaces a non-disruptive suggestion to return to the Singly Linked List module — framed as a player choice, not a system redirect.

---

### 2.4 Design Evolution (Figure 1 caption text)

Six iterative stages, each driven by a specific research or feedback trigger:

**Stage 1 — Initial Prototype**
A single-page dark-theme app with drag-and-drop pseudocode blocks for basic singly linked list operations. No feedback, no scaffolding, no distractors. Validated the core mechanic but revealed it was too abrupt for novice learners.
*Trigger: BlockList (ACM SIGCSE 2025) paper — validated code-block assembly as a learnable mechanic.*

**Stage 2 — Three-Mode Architecture**
Introduced Tutorial, Training, and Challenge modes with progressive scaffolding. Challenge mode added three difficulty levels, procedurally generated question values, and distractor blocks mapped to a six-category error taxonomy.
*Trigger: Brilliant.org scaffolding model + CogBooks adaptive design principles.*

**Stage 3 — Tutorial Intro Redesign**
Replaced the welcome popup with a 4-slide concept introduction (linked list structure, node anatomy, HEAD & NULL, key terms) followed by a mandatory 4-question quiz. Drag-and-drop replaced with fill-in-the-blank to reduce cognitive load in the learning phase.
*Trigger: Instructor feedback — students had no conceptual baseline on entry.*

**Stage 4 — Gamification Layer**
Added a pixel husky companion (Algo) with 5 evolution stages driven by a shared XP pool, a star rating system (0–3 stars per question), a lives counter, and a game timer. Duolingo-style winding path replaced flat mode card selection.
*Trigger: Duolingo engagement mechanics + Tamagotchi companion investment research.*

**Stage 5 — Doubly Linked List Module + Adaptive Routing**
Added DLL as the second module with bidirectional node visualization and a new error type (Broken Prev). Implemented cross-module adaptive logic: ≥ 2 Type-A errors in a DLL session triggers a suggestion modal to return to SLL — designed as a player choice, not a forced redirect.
*Trigger: CogBooks adaptive routing research + "player choice" design principle.*

**Stage 6 — UI Unification + Sort Mode**
Converted all screens to a unified light theme, doubled all font sizes, replaced drag-and-drop with click-to-place in Tutorial. Added a standalone Sort Linked List mode with live pseudocode highlighting. Module path now displays locked future modules (Sorting, Tree, Graph) to communicate platform vision.
*Trigger: Instructor usability feedback — dark theme and small fonts created friction.*

---

### 2.5 Adaptive Learning Architecture

The platform models a **knowledge dependency graph** where modules are nodes and prerequisite relationships are directed edges:

```
Singly Linked List  →  Doubly Linked List  →  Trees (planned)  →  Graph (planned)
```

**Error Taxonomy — Six Categories:**

| Category | Description | Routing Effect |
|---|---|---|
| Lost Reference | Incorrect next/prev pointer assignment | Type A — triggers SLL suggestion |
| Off-by-One | Traversal loop boundary errors | Type A — triggers SLL suggestion |
| NULL Pointer | Incorrect NULL assignment or check | Type A — triggers SLL suggestion |
| Self-Loop | Node pointing to itself | Type A — triggers SLL suggestion |
| Memory Leak | Missing or misplaced free() | Type A — triggers SLL suggestion |
| Broken Prev | DLL prev pointer not maintained | Type B — targeted hint only |

Type A errors (shared with SLL) accumulate toward the cross-module routing threshold. Type B errors (DLL-specific) trigger targeted in-game hints without affecting routing.

---

### 2.6 Methodology

The design process followed a three-source iterative loop:

1. **Literature Review** — Identified engagement mechanics (Duolingo), scaffolding models (Brilliant), adaptive routing (CogBooks), companion design (Prodigy/Tamagotchi), and validated the code-block mechanic (BlockList, ACM SIGCSE 2025).

2. **Instructor Feedback** — Regular review sessions with the supervising professor surfaced usability issues (font size, theme, onboarding depth) and shaped module scope decisions (e.g., keeping Sort as a standalone mode rather than integrating into Challenge Mode while requirements were evolving).

3. **Comparative Platform Analysis** — Features from Duolingo (path navigation, XP, lives), Kahoot (timer, competitive framing), Brilliant (concept-first slides), and LeetCode (difficulty levels) were selectively adapted to the algorithm education context.

Each stage produced a testable prototype evaluated against the previous version before proceeding.

---

### 2.7 Conclusions

This project demonstrates that a research-driven iterative design process — grounded in literature review and regular instructor feedback — can produce an educationally principled, engaging gamified learning module. Key contributions:

- A **six-category error taxonomy** that maps game-level mistakes to real CS misconceptions
- A **cross-module adaptive routing design** that preserves learner autonomy
- A **three-tier scaffolding architecture** (Tutorial → Training → Challenge) bridging the novice-to-practitioner gap
- A **modular platform foundation** extensible to Sorting, Tree, and Graph algorithm modules

**Platform Vision:** A knowledge dependency graph of algorithm games where students can always find — and choose — the prerequisite they need, in the form of a game they want to play.

---

### 2.8 Future Work

- Integrate backend persistence to enable cross-session adaptive routing (current logic is session-local)
- Conduct formal user study measuring learning outcomes vs. traditional instruction
- Expand module library: Sorting algorithms, Binary Search Tree, Graph traversal
- Connect with classmate's game platform integration layer for multi-module deployment

---

### 2.9 References

- Contrino et al. (2024). CogBooks adaptive learning system. *Educational Technology Research.*
- Murali et al. (2025). BlockList: A game for learning linked list concepts. *ACM SIGCSE TS 2025.*
- Kim & Park (2022). Gamification in CS education: A systematic review. *Computers & Education.*
- Duolingo Inc. (2024). Learning design principles. duolingo.com
- Brilliant.org (2024). Interactive learning methodology. brilliant.org

---

## 3. Suggested Figures / Visual Elements

### Figure 1: Design Evolution Timeline — FULL WIDTH (primary visual)
**Role:** Tell the entire research story in one horizontal strip. Most important element on the poster.  
**What it shows:** Six UI mockups arranged left to right, each with a version label, a one-line title, and a colored tag indicating the driving trigger (blue = literature, red = instructor feedback, green = design principle).  
**Components:**
- 6 simplified UI screenshots or diagrams (v1 through v6), connected by arrows
- Color-coded driver badges below each stage
- Version label above each stage  

**Caption:** Six design iterations driven by literature review and instructor feedback, evolving from a bare drag-and-drop prototype to a fully scaffolded, gamified adaptive learning platform.

---

### Figure 2: Knowledge Dependency Graph
**Role:** Show the adaptive routing architecture visually.  
**What it shows:** Module nodes (SLL, DLL, Trees, Graph) connected by directed edges. SLL and DLL highlighted as active; others shown as locked. A dashed back-arrow from DLL to SLL labeled "Adaptive suggestion (≥ 2 Type-A errors)".  
**Caption:** Knowledge dependency graph. Students progress forward through modules; repeated Type-A errors in DLL surface a non-disruptive suggestion to revisit SLL.

---

### Figure 3: Screenshots Panel (top right)
**Suggested images (2×2 grid):**
- Module selection path (winding Duolingo-style nodes)
- In-game Challenge Mode (code blocks + pet companion + TopBar)
- Tutorial intro slide
- Level completion modal (3-star rating)

**Caption:** Current platform state. Top-left: module path with locked future modules. Top-right: Challenge Mode with Algo pet companion. Bottom: Tutorial onboarding and completion feedback.

---

## 4. Design Evolution Figure Specification

Detailed spec for drawing Figure 1 (Design Evolution Timeline).

**Layout:** Single horizontal row of 6 panels, connected by right-pointing arrows. Full poster width.

**Each panel contains:**
- Top label: version number + short name (e.g., "v1 · Prototype")
- Center: simplified UI mockup (approx. 120×85px each) — can be actual screenshots or simplified diagrams
- Bottom: colored driver badge (blue/red/green)

**Color coding:**
- Blue badge = "Driven by: Literature review"
- Red badge = "Driven by: Instructor feedback"
- Green badge = "Driven by: Design principle"

**Panel breakdown:**

| Panel | Label | UI Focus | Badge Color |
|---|---|---|---|
| 1 | v1 · Prototype | Dark theme, drag-and-drop, single screen | Blue |
| 2 | v2 · Modes Added | Mode selector, 3 cards (Tutorial/Training/Challenge) | Blue |
| 3 | v3 · Tutorial Redesign | Intro slides + quiz UI | Red |
| 4 | v4 · Gamification | Pet companion + XP bar + TopBar | Blue |
| 5 | v5 · DLL + Adaptive | DLL visualizer + suggestion modal | Green |
| 6 | v6 · Current State | Light theme + winding path + unified UI | Red |

**Arrow style:** Simple right-pointing arrows between panels, labeled with the trigger in small text above the arrow (e.g., "Instructor feedback ↓").
