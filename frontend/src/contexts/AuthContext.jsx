import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authApi } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("olq_token");
    if (!token) { setLoading(false); return; }
    authApi.me()
      .then(setUser)
      .catch(() => localStorage.removeItem("olq_token"))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password);
    localStorage.setItem("olq_token", data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (email, username, password) => {
    const data = await authApi.register(email, username, password);
    localStorage.setItem("olq_token", data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("olq_token");
    setUser(null);
  }, []);

  const updateXP = useCallback((xp) => {
    setUser((u) => u ? { ...u, xp } : u);
  }, []);

  const patchUser = useCallback((fields) => {
    setUser((u) => u ? { ...u, ...fields } : u);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateXP, patchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
