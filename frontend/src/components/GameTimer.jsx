import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Timer } from 'lucide-react';

const GameTimer = forwardRef(function GameTimer({ isRunning = true }, ref) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef           = useRef(null);
  const startRef              = useRef(Date.now());
  const frozenRef             = useRef(null);

  const clearTick = () => {
    if (intervalRef.current !== null) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  const startTick = (fromSeconds = 0) => {
    clearTick();
    startRef.current = Date.now() - fromSeconds * 1000;
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 200);
  };

  useImperativeHandle(ref, () => ({
    getElapsed: () => frozenRef.current !== null ? frozenRef.current : Math.floor((Date.now() - startRef.current) / 1000),
    reset: () => { frozenRef.current = null; setElapsed(0); startTick(0); },
    stop:  () => { const t = Math.floor((Date.now() - startRef.current) / 1000); frozenRef.current = t; clearTick(); setElapsed(t); },
  }), []); // eslint-disable-line

  useEffect(() => {
    if (isRunning && frozenRef.current === null) startTick(elapsed);
    else if (!isRunning) clearTick();
    return clearTick;
  }, [isRunning]); // eslint-disable-line

  useEffect(() => { startTick(0); return clearTick; }, []); // eslint-disable-line

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono">
      <Timer size={14} className="text-violet-500 shrink-0" />
      <span className="text-gray-700 font-semibold">{mm}:{ss}</span>
    </div>
  );
});

export default GameTimer;

export const formatTime = (seconds) => {
  const s  = seconds ?? 0;
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};
