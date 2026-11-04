# TODOS

Follow-ups from the pre-merge review of `feat/tutor-harness` (2026-11-03). Each was found by
the review and deliberately left for later; the PR description lists them too.

## Recording and mastery

### Make attempt recording atomic and race-free

**What:** Back the "one attempt per (session, question)" rule with a unique index, and write the attempt, its mastery update and the intervention outcome in one transaction.

**Why:** The current guard is check-then-insert. A slow `/session/record` and the `/session/next` resend can both insert, applying mastery twice. Also, if the request fails after the attempt commits but before mastery, the resend now sees the attempt and returns, so that clean pass never reaches mastery.

**Context:** `game_master._record_attempt` (early `return existing`), `update_mastery` and `_close_intervention_loop` each commit on their own. Needs an Alembic migration for `uq_question_attempts_session_question`; the local DB had no duplicate rows on 2026-11-03. On `IntegrityError`, roll back and return the existing row.

**Effort:** M
**Priority:** P1
**Depends on:** None. Do this before switching `MISCONCEPTION_MODE` to `ab`.

## Tutor

### Save the "cancelled" status when a student disconnects mid-reply

**What:** Make sure `tutor_turns` rows reach `cancelled` (or `ok`) when the client aborts the stream.

**Why:** Starlette never closes the sync `generate()`; it is finalized later on the event-loop thread after `get_db` closed the session, so the row stays `started` with no tokens or timings. This skews the tutor telemetry for the paper.

**Context:** `routes/tutor.py` stream route `finally`. Fix with an async wrapper that closes the generator in a thread, or write the final status from a fresh `SessionLocal()`. Add a test that simulates `http.disconnect`.

**Effort:** M
**Priority:** P2
**Depends on:** None

### Tie the answer-reveal gates to the question being asked about

**What:** Bind the "reviewing" phase and the final-hint mistake count to the served item (operation and title), not only to a client-sent question id.

**Why:** `POST /api/progress/sessions/{id}/attempts` lets a client create an attempt row with any question id, which unlocks "reviewing". An earlier question of the same operation can unlock the final hint. The answer already reaches the client in the payload, so the cost is mostly wrong telemetry.

**Context:** `routes/tutor._honoured_phase`, `_board_mistakes`; look up `served_items` for (user, question_id), or stop the legacy attempts route from writing into agentic sessions.

**Effort:** S
**Priority:** P2
**Depends on:** None

### Count tokens for failed and partial tutor calls

**What:** Record usage from stream events as they arrive, or mark tokens unknown on non-ok turns.

**Why:** Tokens are only added after `get_final_message()`, so errors, timeouts and partial replies record 0 tokens although they were billed.

**Context:** `routes/tutor._stream_react`.

**Effort:** S
**Priority:** P3
**Depends on:** None

### Make the chat-emotion limit atomic and recognisable

**What:** Reserve the `emotion_logs` row before the model call, and return something the client can tell apart from a real inference when over the limit.

**Why:** The 8-per-minute cap on `/api/emotion/infer-chat` counts rows written after the model call, so a concurrent burst can exceed it. Over the cap, the neutral label is applied by `TutorChat` as if it were inferred.

**Context:** `routes/emotion.infer_chat`, `TutorChat.jsx` (`setEmotion(res.emotion, 'chat')`).

**Effort:** S
**Priority:** P3
**Depends on:** None

## Teach Quinn (before turning on NPC_ENABLED)

### Don't hold a DB transaction across Quinn's model calls; reserve the rate-limit slot first

**What:** Commit or close the transaction before `translate` / `voice`, and write the explain event (or a reservation) before the model calls.

**Why:** An explanation can hold a pooled connection for up to ~90 s, and the 8-per-minute limit counts events written after the spend, so parallel requests all pass it.

**Context:** `npc_agent.explain` (`_over_rate` vs the event insert near the end).

**Effort:** M
**Priority:** P1
**Depends on:** Needed only before NPC_ENABLED is on for a class.

### Recover open cases after catalog or template edits

**What:** On load, abandon and redraw a case whose program, misconception ids or `npc_version` no longer match.

**Why:** `state()` indexes `CATALOG` unguarded, so a dropped misconception makes `GET /api/npc/case` return 500 for that student permanently. After a TEMPLATES edit, explanations are judged against the new template, and correct ones are logged as wrong in the research data.

**Context:** `npc_agent.state`, `current`, `adjudicate`; `npc_cases.npc_version` is stored but never checked.

**Effort:** M
**Priority:** P1
**Depends on:** Needed only before NPC_ENABLED is on for a class.

## Question pool

### Count only servable rows toward the low-water mark

**What:** Count rows that `_servable` accepts toward `LOW_WATER` and refill targets, cache the verdict per row, and log a malformed row once per process.

**Why:** Rows that `_sanitize` always rejects still count, so such a combo never self-heals and every serve falls back to live generation; the new skip logs a traceback per request.

**Context:** `question_pool.serve`, `refill_combo`, `_servable`.

**Effort:** S
**Priority:** P2
**Depends on:** None

### Refuse ordering rows whose distractors were all filtered

**What:** Return None from `_sanitize` when an ordering row is left with fewer distractors than the difficulty knob asks for.

**Why:** find_bug rows in that state are refused; ordering rows are served with no distractor.

**Context:** `question_pool._sanitize`.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Misconception diagnosis

### Make evidence writes race-free

**What:** Dedupe `picked` events and update `misconception_state` atomically.

**Why:** Two quick wrong picks can log duplicate `picked` events for one question; two first-time state inserts can collide and silently drop evidence.

**Context:** `misconception_model.record_pick`, `_apply`, `record_outcome`.

**Effort:** M
**Priority:** P3
**Depends on:** None

### Don't count the stale load-time prefetch as served

**What:** Stop the question-load prefetch from incrementing `times_served` and writing `served_items` when it is replaced.

**Why:** It skews the least-served ordering; `misconception_eval` already filters unseen items.

**Context:** `AgenticSession.startPrefetch` at question load; `game_master.prefetch_question`.

**Effort:** S
**Priority:** P3
**Depends on:** None

## API hygiene

### Stop returning exception text from the game-master routes

**What:** Replace `HTTPException(503, detail=str(e))` with a generic message and log the exception.

**Why:** Internal error text (including database errors) reaches the client. Pre-existing on `main`.

**Context:** `routes/game_master.py`: session start, next, prefetch, level-up.

**Effort:** S
**Priority:** P2
**Depends on:** None

## Frontend design

### Review text size, heading levels and emoji icons on the new screens

**What:** Run `/design-review` on Teach Quinn and the practice-purpose banners.

**Why:** Body text is 12–13 px in places, the Teach Quinn view starts at `h3`, and emoji serve as icons.

**Context:** `TeachSession.jsx`, `AgenticSession.jsx` banners.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Completed
