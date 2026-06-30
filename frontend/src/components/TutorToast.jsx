import { useState, useEffect } from 'react';

const AUTO_DISMISS_MS = 10000;

export default function TutorToast({ message, onOpen, onDismiss }) {
  const [visible, setVisible] = useState(false);

  // Slide-in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Auto-dismiss
  useEffect(() => {
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  const preview = message.length > 120 ? message.slice(0, 120) + '…' : message;

  return (
    <div
      className="fixed bottom-6 right-6 z-40 w-80 bg-white rounded-2xl shadow-xl border border-indigo-100 overflow-hidden"
      style={{
        transform: visible ? 'translateY(0)' : 'translateY(110%)',
        opacity:   visible ? 1 : 0,
        transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease',
      }}
    >
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 flex items-center gap-2">
        <span className="text-base">🧑‍🏫</span>
        <span className="text-white text-xs font-semibold flex-1">Algorithm Tutor</span>
        <button
          onClick={onDismiss}
          className="text-white/60 hover:text-white text-xl leading-none w-6 h-6 flex items-center justify-center"
        >
          ×
        </button>
      </div>

      <div className="px-4 py-3">
        <p className="text-sm text-gray-700 leading-relaxed">{preview}</p>
        <button
          onClick={onOpen}
          className="mt-3 w-full py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
        >
          Open Chat →
        </button>
      </div>
    </div>
  );
}
