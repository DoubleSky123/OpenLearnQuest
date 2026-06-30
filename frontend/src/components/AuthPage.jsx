import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login"); // 'login' | 'register'
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, username, password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔗</div>
          <h1 className="text-3xl font-bold text-white">OpenLearnQuest</h1>
          <p className="text-purple-300 mt-1 text-sm">Master Linked Lists through Play</p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 shadow-xl border border-white/20">
          {/* Tabs */}
          <div className="flex gap-1 bg-white/10 rounded-xl p-1 mb-6">
            {["login", "register"].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  mode === m
                    ? "bg-white text-purple-900 shadow"
                    : "text-white/70 hover:text-white"
                }`}
              >
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-white/80 text-sm block mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400"
                placeholder="you@example.com"
              />
            </div>

            {mode === "register" && (
              <div>
                <label className="text-white/80 text-sm block mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400"
                  placeholder="coolcoder42"
                />
              </div>
            )}

            <div>
              <label className="text-white/80 text-sm block mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-400/40 rounded-xl px-4 py-2 text-red-200 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold py-3 rounded-xl hover:from-purple-400 hover:to-indigo-400 transition-all disabled:opacity-50 shadow-lg"
            >
              {loading ? "Loading..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
