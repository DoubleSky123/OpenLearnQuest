import { useState, useEffect, useRef } from 'react';
import { CONCEPT_PAGES, ConceptSlideCard } from '../TutorialIntroPage';

/**
 * Always-available review of the intro slides, as a top-bar dropdown.
 *
 * Professor feedback: the tutorial slides are only reachable on a brand-new
 * account. After that a student who forgets what HEAD or NULL means has nowhere
 * to look. This pins the same slides to every game screen — pick one from the
 * menu, read it in a modal, page through with the arrows, close and carry on.
 *
 * It renders CONCEPT_PAGES from TutorialIntroPage rather than its own copy, so
 * editing a slide updates both onboarding and review.
 */
export default function ConceptSlidesMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [slideIdx, setSlideIdx] = useState(null);   // null = modal closed
  const wrapRef = useRef(null);

  // Close the menu on an outside click (the modal has its own backdrop)
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  // Esc closes the modal first, then the menu; arrows page through slides
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (slideIdx !== null) setSlideIdx(null);
        else setMenuOpen(false);
      }
      if (slideIdx === null) return;
      if (e.key === 'ArrowRight' && slideIdx < CONCEPT_PAGES.length - 1) setSlideIdx(slideIdx + 1);
      if (e.key === 'ArrowLeft'  && slideIdx > 0)                        setSlideIdx(slideIdx - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [slideIdx]);

  const openSlide = (i) => { setSlideIdx(i); setMenuOpen(false); };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setMenuOpen(v => !v)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors flex items-center gap-1.5"
        title="Review the intro slides"
      >
        📖 Concepts
        <span className="text-[10px] text-gray-400">{menuOpen ? '▲' : '▼'}</span>
      </button>

      {menuOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-72 bg-white rounded-xl border border-gray-200 shadow-xl py-1.5 z-50">
          <p className="px-3 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            Intro slides
          </p>
          {CONCEPT_PAGES.map((p, i) => (
            <button
              key={p.title}
              onClick={() => openSlide(i)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-indigo-50 transition-colors"
            >
              <span className="text-lg shrink-0">{p.icon}</span>
              <span className="text-sm text-gray-700 truncate">{p.title}</span>
            </button>
          ))}
        </div>
      )}

      {slideIdx !== null && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-6"
          onClick={() => setSlideIdx(null)}
        >
          <div
            className="bg-gray-50 rounded-3xl max-w-2xl w-full max-h-[88vh] overflow-y-auto p-5 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Slide {slideIdx + 1} of {CONCEPT_PAGES.length}
              </span>
              <button
                onClick={() => setSlideIdx(null)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1"
              >
                ×
              </button>
            </div>

            <ConceptSlideCard page={CONCEPT_PAGES[slideIdx]} compact />

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => setSlideIdx(i => i - 1)}
                disabled={slideIdx === 0}
                className="px-4 py-2 rounded-xl font-semibold text-gray-500 bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white transition-colors"
              >
                ← Prev
              </button>
              <div className="flex-1 flex justify-center gap-1.5">
                {CONCEPT_PAGES.map((p, i) => (
                  <button
                    key={p.title}
                    onClick={() => setSlideIdx(i)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === slideIdx ? 'bg-indigo-500' : 'bg-gray-300 hover:bg-gray-400'
                    }`}
                    title={p.title}
                  />
                ))}
              </div>
              <button
                onClick={() => setSlideIdx(i => i + 1)}
                disabled={slideIdx === CONCEPT_PAGES.length - 1}
                className="px-4 py-2 rounded-xl font-semibold text-gray-500 bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
