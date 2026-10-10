import { useState, useRef, useEffect } from "react";
import { streamTutorChat, emotionApi, tutorApi } from "../services/api";
import { useEmotion } from "../contexts/EmotionContext";

/**
 * Floating Socratic tutor chat panel.
 *
 * Props:
 *   questionTitle  – e.g. "Insert at Head"
 *   operation      – e.g. "insert-head"
 *   yourAnswer     – string[] of code lines the student assembled
 *   correctAnswer  – string[] of correct code lines (never shown to student)
 *   errorCount     – how many wrong attempts so far
 *   onClose        – callback to hide the panel
 */
/**
 * Opening message, built client-side with no AI call.
 *
 * Professor feedback: opening with "which blank are you unsure about?" wastes the
 * one thing we already know — the board tells us exactly which step they're on.
 * So the greeting names the step, shows the line, and states what that step is
 * FOR. The purpose text comes from the question's `step_hints`, which are written
 * as Socratic prompts rather than answer statements, so this stays inside the
 * no-leak rule even while the exercise is open.
 *
 * In reviewing mode the exercise is done, so "where are you stuck?" is the wrong
 * question to open with.
 */
function buildGreeting({ phase, questionTitle, questionType, boardFocus: f }) {
  if (phase === "reviewing") {
    return `Nice work finishing "${questionTitle}". Ask me anything about it — why a step goes where it does, or what happens in an edge case.`;
  }

  // A wrong pick already prints the step hint under the line on the board.
  // Repeating it verbatim here reads like a broken record, so when they've just
  // missed, open on what they tried instead.
  const closer = (hint, fallback) =>
    hint ? (hint.trim().endsWith("?") ? hint : `${hint}\n\n${fallback}`) : fallback;

  if (f?.kind === "blank") {
    const parts = [];
    if (f.solved > 0) {
      parts.push(f.solved === 1
        ? "Nice — the first blank is filled in correctly."
        : `Nice — the first ${f.solved} blanks are filled in correctly.`);
    }
    parts.push(`You're on step ${f.stepNo} of ${f.total}:\n\n    ${f.line}`);
    parts.push(f.lastWrong
      ? `You tried '${f.lastWrong}' there. Tell me what you expected that to do, and we'll start from what actually happens.`
      : closer(f.hint, "What are you thinking for this blank?"));
    return parts.join("\n\n");
  }

  if (f?.kind === "fix") {
    return [
      `You've found the buggy line — step ${f.stepNo} of ${f.total}:\n\n    ${f.line}`,
      f.lastWrong
        ? `The fix you tried, '${f.lastWrong}', isn't the one. What did you expect that version to change?`
        : closer(f.hint, "What would you change it to?"),
    ].join("\n\n");
  }

  if (f?.kind === "hunting" && f.lastWrong) {
    return `Step ${f.lastWrong} turned out to be fine. Instead of checking line by line — walk a small list through the code in your head, and tell me the first moment the picture stops matching what you expect.`;
  }

  return {
    fill_blank: `Hi! I'm your tutor for "${questionTitle}". Which blank are you unsure about — and what do you think belongs there?`,
    find_bug:   `Hi! I'm your tutor for "${questionTitle}". Which line looks suspicious to you so far?`,
    ordering:   `Hi! I'm your tutor for "${questionTitle}". Which step are you stuck on — or tell me the order you're considering?`,
  }[questionType] ?? `Hi! I'm your tutor for "${questionTitle}". Which step are you stuck on?`;
}

export default function TutorChat({
  sessionId,
  questionTitle,
  operation,
  questionType = null,
  yourAnswer = [],
  correctAnswer = [],
  errorCount = 0,
  errorDiagnosis = null,
  boardNote = null,      // one-line "where the student is right now" from the board
  boardFocus = null,     // structured form of the same — anchors the opening message
  initialMessages = null,
  initialInput = null,   // pre-typed question (e.g. the analysis card's "Consider")
  phase = "solving",     // "reviewing" once the answer is on screen — lets the tutor explain it
  onClose,
}) {
  const { setEmotion } = useEmotion();
  const greeting = buildGreeting({ phase, questionTitle, questionType, boardFocus });
  const [messages, setMessages] = useState(
    initialMessages ?? [{ role: "assistant", content: greeting }]
  );
  const [input, setInput] = useState(initialInput ?? "");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const bottomRef = useRef(null);
  const cancelRef = useRef(null);
  const inputRef = useRef(null);
  const accumulatedRef = useRef("");

  useEffect(() => {
    inputRef.current?.focus();
    // Restore persisted conversation for this question (memory survives close/reopen)
    if (sessionId && questionTitle) {
      tutorApi.getHistory(sessionId, questionTitle)
        .then((h) => {
          if (h.messages?.length) setMessages(h.messages);
        })
        .catch((e) => console.warn("[tutor history restore failed]", e));
    }
    // Cancel any in-flight stream when the component unmounts
    return () => cancelRef.current?.();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  function sendMessage(text) {
    if (!text.trim() || streaming) return;
    const userMsg = { role: "user", content: text.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setStreaming(true);
    setStreamingText("");
    accumulatedRef.current = "";

    cancelRef.current = streamTutorChat(
      {
        session_id:      sessionId,   // conversation memory key (backend persists by it)
        question_title:  questionTitle,
        operation,
        question_type:   questionType,
        your_answer:     yourAnswer,
        board_note:      boardNote,
        correct_answer:  correctAnswer,
        error_count:     errorCount,
        messages:        messages,   // legacy fallback; DB history is authoritative
        user_message:    text.trim(),
        error_diagnosis: messages.length === 0 ? errorDiagnosis : null,
        phase,
      },
      (token) => {
        accumulatedRef.current += token;
        setStreamingText(accumulatedRef.current);
      },
      () => {
        const finalText = accumulatedRef.current;
        accumulatedRef.current = "";
        setMessages((m) => {
          const next = [...m, { role: "assistant", content: finalText }];
          // Infer emotion from chat text after each exchange (LLM, async).
          // question_title makes the backend read the persisted conversation.
          if (sessionId) {
            emotionApi.inferChat(sessionId, next, questionTitle)
              .then(res => setEmotion(res.emotion, 'llm'))
              .catch(e => console.warn('[inferChat failed]', e));
          }
          return next;
        });
        setStreamingText("");
        setStreaming(false);
      },
      (err) => {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: `⚠️ Tutor unavailable: ${err}` },
        ]);
        setStreaming(false);
        setStreamingText("");
      }
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 max-h-[600px] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 z-[60] overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 shrink-0">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg">🧑‍🏫</div>
        <div className="flex-1">
          <p className="text-white font-semibold text-sm">Algorithm Tutor</p>
          <p className="text-white/70 text-xs truncate">{questionTitle}</p>
        </div>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white transition-colors text-xl leading-none"
        >
          ×
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages
          .filter(m => !(m.role === "user" && m.content.startsWith("[PROACTIVE_INIT]")))
          .map((msg, i) => (
            <Bubble key={i} role={msg.role} content={msg.content} />
          ))}
        {streamingText && <Bubble role="assistant" content={streamingText} streaming />}
        {streaming && !streamingText && (
          <div className="flex gap-1 px-3 py-2">
            <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="shrink-0 border-t border-gray-100 flex gap-2 px-3 py-2.5">
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask tutor... (Enter to send)"
          className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-gray-50"
          disabled={streaming}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="shrink-0 w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          ↑
        </button>
      </form>
    </div>
  );
}

const YT_REGEX = /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[A-Za-z0-9_-]+/g;

function renderContent(text) {
  const parts = [];
  let last = 0;
  let m;
  YT_REGEX.lastIndex = 0;
  while ((m = YT_REGEX.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const url = m[0];
    parts.push(
      <a
        key={m.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 rounded-lg px-2.5 py-1 my-1 text-xs font-semibold hover:bg-red-100 transition-colors no-underline"
        style={{ display: 'inline-flex' }}
      >
        <span style={{ fontSize: 11 }}>▶</span>
        Watch on YouTube ↗
      </a>
    );
    last = m.index + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function Bubble({ role, content, streaming }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-indigo-600 text-white rounded-br-sm"
            : "bg-gray-100 text-gray-800 rounded-bl-sm"
        } ${streaming ? "opacity-90" : ""}`}
      >
        {isUser ? content : renderContent(content)}
        {streaming && <span className="inline-block w-1 h-3 bg-indigo-400 ml-0.5 animate-pulse rounded" />}
      </div>
    </div>
  );
}
