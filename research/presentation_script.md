# OpenLearnQuest – NodeForge: Presentation Script
### "Sell it" version — pitch-first, research-backed

---

## Slide 1 — Hook & Motivation (~35 sec)

Have you ever stared at a linked list problem on LeetCode and had no idea where to even start — not because you didn't try, but because nobody ever actually showed you what a pointer *is*?

That's the gap I set out to close.

LeetCode gives you rigor, but no hand-holding. Duolingo gives you engagement, but zero CS content. CodeCombat gamifies coding, but it teaches syntax — not data structure reasoning. No platform combines all three. So I built one.

---

## Slide 2 — The Core Problem (~20 sec)

The specific failure mode I kept seeing: students hit a knowledge gap mid-module, and there's no structured path back. They either quit or push through without understanding. Every platform I studied either lets you fail silently, or doesn't challenge you enough to fail at all.

NodeForge is my answer to that.

---

## Slide 3 — The Initial Prototype: Where It All Started (~75 sec)

Let me show you where this began — because the initial design is what makes every iteration make sense.

*(point to the screenshot on the poster)*

The first prototype had one mode: drag-and-drop code blocks into an assembly area, arrange them in the right order, and the game auto-executes and checks your output. That was it. One mechanic, two operations — insert at head and remove at head — and no introduction whatsoever. Students landed on this screen and were expected to just figure it out.

There was a pixel pet, Algo, in the corner. But at this stage Algo was pure decoration — it reacted to right and wrong answers, but there was no XP, no evolution, no reason to care about it.

When I sat back and looked at this honestly — and tested it with real students and got feedback from my advisor — five problems jumped out immediately. And each one became a design question I had to answer.

---

## Slide 4 — Problem 1: You Can't Practice What You've Never Seen (~90 sec)

The most fundamental issue: the prototype assumed prior knowledge it had no right to assume.

There was no explanation of what a linked list is. No diagram showing what a node contains. No model of why pointer reassignment matters. Students who didn't already know the material saw a screen full of code blocks and froze.

That's not productive struggle — that's just confusion.

So I redesigned the entire flow into four stages:

- **Intro** — concept slides with visuals and a mandatory quiz. You can't skip it. If you can't pass the quiz, you don't proceed.
- **Tutorial** — the blocks are already in the assembly area. Your job is just to place them in the right order. Step-by-step instructions guide you through.
- **Training** — this is where the original prototype lived. Now it's stage three, after you've built a mental model. Hints are available on demand.
- **Challenge** — no hints, timed, lives system, star rating. You're on your own.

*(point to the four-stage flow on the poster)*

Each stage removes one layer of support. By the time you hit Challenge, you've seen the concept, practiced with guidance, and rehearsed independently. The scaffolding research calls this gradual release of responsibility — I think of it as not throwing students into the deep end without first showing them what water is.

---

## Slide 5 — Problem 2: The Ceiling Was Way Too Low (~55 sec)

The prototype covered two operations. Two. That's not a curriculum — that's a demo.

I mapped out every operation a singly linked list actually requires and made sure each one had a Tutorial and Training exercise. But more importantly, I raised the ceiling at the top end.

Challenge Level 3 now includes four classic algorithm problems: Reverse Linked List, Detect Cycle, Merge Two Sorted Lists, and Sort List. I chose these directly from LeetCode problem-set analysis — these are the linked list problems that show up most in technical interviews.

So now the platform serves a student who has never heard of a linked list *and* a student who's prepping for a FAANG interview. That's the range I wanted.

---

## Slide 6 — Problem 3: After Day One, Why Come Back? (~70 sec)

After the first session, there was no reason to return. No progress was saved. No goals. Algo the pet just sat there doing nothing.

The best engagement research — Duolingo at scale, StudyGotchi's Tamagotchi-style study companion — points to the same thing: students return when something is waiting for them, when progress feels real and visible.

So I turned Algo into a real system. Five evolution stages. XP earned per question based on performance. A star rating you can beat. Lives that create real stakes in Challenge mode. A daily rotating problem set so there's always something new.

*(point to the winding path on the poster screenshot)*

And this path — every node is a question, every step is visible. Students can see exactly where they are and what's locked ahead. That one visual replaced two paragraphs of onboarding text that nobody was reading.

---

## Slide 7 — Problem 4: The Smartest Thing I Built (~90 sec)

This one I'm most proud of, so let me explain it carefully.

When I added the doubly linked list module, I hit a new problem: what do you do when a student is struggling with DLL, but the real issue is that they never properly understood SLL?

Every other platform I looked at handles this the same way: mark it wrong, move on. Maybe show a hint. That's not adaptive — that's just a grader.

What I did instead: I categorized the *type* of error.

*(point to the adaptive architecture table on the poster)*

Lost reference, off-by-one pointer, null pointer dereference, self-loop, memory leak from mismanaged prev pointers — when the system sees a pattern of these errors in DLL, it surfaces a suggestion: *"It looks like you might want to revisit the singly linked list module. Want to go back?"*

Framed as a player choice. Not a penalty, not a forced redirect. The student stays in control — but the system has created a structured path back to the prerequisite.

The difference between this and just marking you wrong: this tells you *why* you're struggling and gives you somewhere to go. That's the gap no other platform closes. That's the thing I built.

---

## Slide 8 — Problem 5: The Interface Was Getting in the Way (~50 sec)

The last gap was the most practical, but it was killing the experience.

Drag-and-drop sounds intuitive. But on a laptop trackpad, during a timed exercise, when you're already stressed — it's friction. Students were dropping blocks in the wrong slot, fumbling with undo, and losing track of what they were actually trying to learn.

Three fixes: click-to-place in Tutorial, doubled font sizes across the board, and a unified light theme that's consistent whether you're in Intro, Training, or Challenge.

Small changes. Large impact. Because if the interface is fighting you, the learning stops.

---

## Slide 9 — Where This Is Going (~30 sec)

Seven iterations. Five gaps closed. The result is a platform that takes a student from zero — no concept, no vocabulary, no mental model — all the way to algorithm-level problems, with a system that watches how they fail and routes them back when they need it.

Next: evaluation. Pre/post quiz scores against unguided LeetCode practice, auto-logged engagement metrics — session length, hint usage, lives lost — and a self-reported confidence survey. The goal is to show that scaffolding plus adaptivity outperforms raw practice.

That's NodeForge. Happy to take questions.

---

*Total estimated time: ~8–9 minutes. Speak slowly on Slides 4 and 7 — those are your two strongest moments.*

---

### Quick-Reference: Likely Judge Questions

| Question | Your answer |
|---|---|
| "How do you know this actually works?" | "That's exactly what the evaluation is designed to test — pre/post quiz against LeetCode, plus session logs and confidence surveys." |
| "Why not just use LeetCode with better documentation?" | "LeetCode tells you if you're wrong. It doesn't tell you why, and it doesn't help you build the mental model before you practice. That's the entire gap." |
| "What's the hardest design decision?" | "The adaptive routing — deciding when to suggest vs. force a redirect. I landed on suggestion because autonomy matters for engagement, but the detection has to be accurate enough that the suggestion feels helpful, not annoying." |
| "What's next after DLL?" | "The architecture already has a slot for Tree/Graph — you can see it locked on the module path. The adaptive routing generalizes: the same error-categorization logic applies." |
