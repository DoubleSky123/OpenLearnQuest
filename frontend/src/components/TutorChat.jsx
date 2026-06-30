import { useState, useRef, useEffect } from "react";
import { streamTutorChat, emotionApi } from "../services/api";
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
export default function TutorChat({
  sessionId,
  questionTitle,
  operation,
  questionType = null,
  yourAnswer = [],
  correctAnswer = [],
  errorCount = 0,
  errorDiagnosis = null,
  initialMessages = null,
  onClose,
}) {
  const { setEmotion } = useEmotion();
  const [messages, setMessages] = useState(
    initialMessages ?? [{
      role: "assistant",
      content: `Hi! I'm here to help you with "${questionTitle}". What part are you confused about? Try describing what you think each code block does.`,
    }]
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const bottomRef = useRef(null);
  const cancelRef = useRef(null);
  const inputRef = useRef(null);
  const accumulatedRef = useRef("");

  useEffect(() => {
    inputRef.current?.focus();
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
        question_title:  questionTitle,
        operation,
        question_type:   questionType,
        your_answer:     yourAnswer,
        correct_answer:  correctAnswer,
        error_count:     errorCount,
        messages:        messages,   // history BEFORE this user message
        user_message:    text.trim(),
        error_diagnosis: messages.length === 0 ? errorDiagnosis : null,
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
          // Infer emotion from chat text after each exchange (LLM, async)
          if (sessionId) {
            emotionApi.inferChat(sessionId, next)
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
    <div className="fixed bottom-6 right-6 w-96 max-h-[600px] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden">

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
