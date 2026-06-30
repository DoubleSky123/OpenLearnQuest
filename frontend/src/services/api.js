const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getToken() {
  return localStorage.getItem("olq_token");
}

async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

// Auth
export const authApi = {
  register: (email, username, password) =>
    request("POST", "/api/auth/register", { email, username, password }),
  login: (email, password) =>
    request("POST", "/api/auth/login", { email, password }),
  me: () => request("GET", "/api/auth/me"),
  completeOnboarding: (moduleId) =>
    request("PATCH", "/api/auth/me/onboarding", { module_id: moduleId }),
};

// Progress
export const progressApi = {
  getXP: () => request("GET", "/api/progress/xp"),
  addXP: (amount) => request("POST", "/api/progress/xp", { amount }),
  getStats: () => request("GET", "/api/progress/stats"),

  createSession: (module_id, mode) =>
    request("POST", "/api/progress/sessions", { module_id, mode }),
  completeSession: (session_id, body) =>
    request("PATCH", `/api/progress/sessions/${session_id}/complete`, body ?? undefined),
  recordAttempt: (session_id, data) =>
    request("POST", `/api/progress/sessions/${session_id}/attempts`, data),

  getMistakes: (source) =>
    request("GET", `/api/progress/mistakes${source ? `?source=${source}` : ""}`),
  addMistake: (data) => request("POST", "/api/progress/mistakes", data),
  clearMistakes: () => request("DELETE", "/api/progress/mistakes"),

  getLeaderboard: () => request("GET", "/api/progress/leaderboard"),
};


// Emotion inference
export const emotionApi = {
  inferBehavior: (signals) => request("POST", "/api/emotion/infer-behavior", signals),
  inferChat: (sessionId, messages) =>
    request("POST", "/api/emotion/infer-chat", { session_id: sessionId, messages }),
  logSelfReport: (emotion, sessionId) =>
    request("POST", "/api/emotion/log-self-report", { emotion, session_id: sessionId }),
};

// Game Master (multi-agent learning system)
export const gameMasterApi = {
  startSession: (moduleId, mode, emotion = "engaged", operation = null) =>
    request("POST", "/api/gm/session/start", { module_id: moduleId, mode, emotion, operation }),

  recordResult: (sessionId, operation, questionId, questionNumber, passed, errorCount, timeMs, telemetry = {}) =>
    request("POST", "/api/gm/session/record", {
      session_id: sessionId, operation, question_id: questionId,
      question_number: questionNumber, passed, error_count: errorCount,
      time_ms: timeMs,
      intra_difficulty: telemetry.intraDifficulty ?? null,
      scaffold_level: telemetry.scaffoldLevel ?? null,
      emotion: telemetry.emotion ?? null,
    }),

  nextQuestion: (sessionId, operation, questionId, questionNumber, passed, errorCount, timeMs, emotion, skipRecord = false, plannedQuestions = 3, pinnedOperation = null, telemetry = {}) =>
    request("POST", "/api/gm/session/next", {
      session_id: sessionId, operation, question_id: questionId,
      question_number: questionNumber, passed, error_count: errorCount,
      time_ms: timeMs, emotion, skip_record: skipRecord, planned_questions: plannedQuestions,
      pinned_operation: pinnedOperation,
      intra_difficulty: telemetry.intraDifficulty ?? null,
      scaffold_level: telemetry.scaffoldLevel ?? null,
      question_type: telemetry.questionType ?? null,
    }),

  prefetchNext: (sessionId, lastOperation, emotion, pinnedOperation = null) =>
    request("POST", "/api/gm/session/prefetch", { session_id: sessionId, last_operation: lastOperation, emotion, pinned_operation: pinnedOperation }),

  levelUp: (sessionId, operation, emotion = "engaged") =>
    request("POST", "/api/gm/session/level-up", { session_id: sessionId, operation, emotion }),

  getHint: (operation, pseudocode, correctAnswer, wrongAssembly, distractors, errorCount, emotion) =>
    request("POST", "/api/gm/session/hint", {
      operation, pseudocode, correct_answer: correctAnswer,
      wrong_assembly: wrongAssembly, distractors, error_count: errorCount, emotion,
    }),

  getMastery: (moduleId = "singly") =>
    request("GET", `/api/gm/mastery?module_id=${moduleId}`),

  testGeneration: (operation, n = 5, emotion = "engaged") =>
    request("POST", "/api/gm/test-generation", { operation, n, emotion }),
};

// Admin
export const adminApi = {
  getOverview: () => request("GET", "/api/admin/overview"),
  getStudents: () => request("GET", "/api/admin/users"),
  getEmotionTimeline: (userId) => request("GET", `/api/admin/users/${userId}/emotion-timeline`),
  registerAdmin: (email, username, password, adminKey) =>
    request("POST", "/api/auth/register-admin", { email, username, password, admin_key: adminKey }),
};

// Tutor agent (streaming)
export function streamTutorChat(data, onToken, onDone, onError) {
  const token = getToken();
  const ctrl = new AbortController();

  fetch(`${BASE}/api/ai/tutor/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
    signal: ctrl.signal,
  })
    .then(async (res) => {
      if (!res.ok) { onError("Tutor unavailable"); return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") { onDone(); return; }
          try {
            const obj = JSON.parse(payload);
            if (obj.token) onToken(obj.token);
            if (obj.error) onError(obj.error);
          } catch { /* ignore malformed SSE line */ }
        }
      }
      onDone();
    })
    .catch((e) => { if (e.name !== "AbortError") onError(e.message); });

  return () => ctrl.abort(); // returns cancel fn
}
