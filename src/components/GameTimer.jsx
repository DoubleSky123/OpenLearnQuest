import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Timer } from 'lucide-react';

/**
 * GameTimer — counts up from 0 when mounted / reset.
 * Exposes { getElapsed, reset, stop } via ref so the parent
 * can read the final time when the level is completed.
 */
const GameTimer = forwardRef(function GameTimer({ isRunning = true }, ref) {
  const [elapsed, setElapsed]   = useState(0);
  const intervalRef             = useRef(null);   // holds the setInterval id
  const startRef                = useRef(Date.now());
  const frozenRef               = useRef(null);   // non-null when stopped

  // ── helpers ────────────────────────────────────────────────────────────────
  const clearTick = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startTick = (fromSeconds = 0) => {
    clearTick();
    startRef.current = Date.now() - fromSeconds * 1000;
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 200);
  };

  // ── imperative API ─────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getElapsed: () =>
      frozenRef.current !== null
        ? frozenRef.current
        : Math.floor((Date.now() - startRef.current) / 1000),

    reset: () => {
      frozenRef.current = null;
      setElapsed(0);
      startTick(0);
    },

    stop: () => {
      const t = Math.floor((Date.now() - startRef.current) / 1000);
      frozenRef.current = t;
      clearTick();
      setElapsed(t);
    },
  }), []); // eslint-disable-line

  // ── auto-start / pause when isRunning changes ──────────────────────────────
  useEffect(() => {
    if (isRunning && frozenRef.current === null) {
      startTick(elapsed);
    } else if (!isRunning) {
      clearTick();
    }
    return clearTick;
  }, [isRunning]); // eslint-disable-line

  // ── auto-start on first mount ──────────────────────────────────────────────
  useEffect(() => {
    startTick(0);
    return clearTick;
  }, []); // eslint-disable-line

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-sm font-mono">
      <Timer size={14} className="text-blue-400 shrink-0" />
      <span className="text-blue-300 font-bold">{mm}:{ss}</span>
    </div>
  );
});

export default GameTimer;

/** Utility: format a raw second count as MM:SS string */
export const formatTime = (seconds) => {
  const s = seconds ?? 0;
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};
