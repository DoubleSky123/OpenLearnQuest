# TODOS

Follow-ups from the pre-merge review of `feat/tutor-harness` (2026-11-03). Each was found by
the review and deliberately left for later; the PR description lists them too.

## Tutor

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

### Don't count the stale load-time prefetch as served

**What:** Stop the question-load prefetch from incrementing `times_served` and writing `served_items` when it is replaced.

**Why:** It skews the pool's least-served ordering. The study is not affected: `misconception_eval` and `study_tool.py export` (first exposures) count only items the student answered or tried, and the study serves authored content (`QUESTION_SOURCE=authored`), not the pool.

**Context:** `AgenticSession.startPrefetch` at question load; `game_master.prefetch_question`.

**Effort:** S
**Priority:** P3
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

### Make attempt recording atomic and race-free (P1) — done 2026-11-18

`uq_question_attempts_session_question` (migration `c4f7307a8d70`); `game_master._record_attempt` writes the attempt, its intervention outcome and its mastery update in one transaction (`update_mastery(commit=False)`), and on `IntegrityError` rolls back and returns the winner's row. A resend also repairs a lost misconception outcome. Tests: `tests/test_recording_races.py`; checked with 8 real concurrent requests on Postgres (one attempt, mastery once).

### Make evidence writes race-free (was P3, raised to P1 for the study) — done 2026-11-18

`uq_misconception_events_once` (user, question, misconception, kind); `misconception_model._write_evidence` locks the state row first (`SELECT ... FOR UPDATE`, first insert via `ON CONFLICT DO NOTHING`), then checks whether the question already gave that evidence. 8 concurrent first picks of one misconception on Postgres: `n_picked=8` with the lock, `3` without it (lost updates). Tests: `tests/test_recording_races.py`.

### Stop returning exception text from the game-master routes (P2) — done 2026-11-18

`routes/game_master.py`: session start, next, prefetch and level-up log the exception (`_unavailable`) and return `GENERIC_ERROR`. Also fixed: a 422 with a list of field errors showed `[object Object]` (e.g. an invalid email at registration); `services/api.js` now shows the messages.

### Save the "cancelled" status when a student disconnects mid-reply (P2) — done 2026-11-18

`tutor_telemetry.finish_turn` sees the turn is detached (the request's session was closed before Starlette finalized the stream) and writes it through a session of its own (`_finish_detached`). Test: `test_a_reply_the_student_closed_mid_stream_is_saved_as_cancelled`. The study's dose counts completed turns, so this matters for the paper.

### Tie the answer-reveal gates to the question being asked about (P2) — done 2026-11-18

`_honoured_phase` needs an attempt the game master recorded (server-derived `question_type`, the same `operation`); a legacy `/progress/.../attempts` row can't unlock "reviewing". `_final_hint` refuses for a question that already has an attempt, so an answered question can't lend its mistakes to a new one. The legacy route is idempotent per (session, question) now (the new unique index would otherwise 500). TUTOR_VERSION 2026-11-18.2.
