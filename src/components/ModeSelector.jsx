import React, { useState } from 'react';
import { Star } from 'lucide-react';
import HelpModal from './HelpModal';

// ── Constants ──────────────────────────────────────────────────────────────────
const XP_PER_LEVEL = 500;
const LEVEL_NAMES = [
  'Novice', 'Explorer', 'Learner', 'Practitioner',
  'Skilled', 'Advanced', 'Expert', 'Master',
];

// ── Canvas dimensions ──────────────────────────────────────────────────────────
const W = 1320;   // total SVG width
const H = 380;    // total SVG height (section label + path + node labels)
const R = 38;     // circle node radius

// ── Node definitions ───────────────────────────────────────────────────────────
// type 'level' → pill card style; 'node' → circle; 'chest' → chest circle; 'intro' → book circle
const NODES = [
  { type: 'intro',                            label: 'Guide',       sub: 'Concepts & Quiz' },
  { type: 'node', mode: 'tutorial', qIdx: 0, label: 'Insert Head'                         },
  { type: 'node', mode: 'tutorial', qIdx: 1, label: 'Remove Head'                         },
  { type: 'chest',                            label: 'Step 1 Clear'                        },
  { type: 'node', mode: 'training', qIdx: 0, label: 'Insert Tail'                         },
  { type: 'node', mode: 'training', qIdx: 1, label: 'Remove Tail'                         },
  { type: 'node', mode: 'training', qIdx: 2, label: 'Insert Pos'                          },
  { type: 'node', mode: 'training', qIdx: 3, label: 'Remove Pos'                          },
  { type: 'chest',                            label: 'Step 2 Clear'                        },
  { type: 'node', mode: 'regular', qIdx: 1, label: 'Level 1'                             },
  { type: 'node', mode: 'regular', qIdx: 2, label: 'Level 2'                             },
  { type: 'node', mode: 'regular', qIdx: 3, label: 'Level 3'                             },
];

// Horizontal node positions — path progresses left → right, wobbles vertically
const NODE_POS = [
  { x: 80,   y: 200 },  // 0  intro
  { x: 190,  y: 120 },  // 1  tutorial 0
  { x: 305,  y: 270 },  // 2  tutorial 1
  { x: 400,  y: 200 },  // 3  chest
  { x: 505,  y: 120 },  // 4  training 0
  { x: 610,  y: 270 },  // 5  training 1
  { x: 715,  y: 120 },  // 6  training 2
  { x: 820,  y: 270 },  // 7  training 3
  { x: 910,  y: 200 },  // 8  chest
  { x: 1010, y: 120 },  // 9  level 1
  { x: 1125, y: 270 },  // 10 level 2
  { x: 1230, y: 200 },  // 11 level 3
];

// ── Section definitions ────────────────────────────────────────────────────────
const SECTIONS = [
  {
    label:   'Step 1',
    desc:    'Tutorial — guided practice',
    color:   '#059669',
    bg:      'rgba(16,185,129,0.07)',
    border:  'rgba(16,185,129,0.25)',
    xStart:  20,
    xEnd:    445,
  },
  {
    label:   'Step 2',
    desc:    'Training — hints available',
    color:   '#D97706',
    bg:      'rgba(245,158,11,0.07)',
    border:  'rgba(245,158,11,0.25)',
    xStart:  455,
    xEnd:    940,
  },
  {
    label:   'Step 3',
    desc:    'Challenge — go solo',
    color:   '#7C3AED',
    bg:      'rgba(124,58,237,0.07)',
    border:  'rgba(124,58,237,0.25)',
    xStart:  950,
    xEnd:    1295,
  },
];

// ── Colours ────────────────────────────────────────────────────────────────────
const NODE_COLOR  = '#7C3AED';
const NODE_DARK   = '#5B21B6';
const CHEST_COLOR = '#F59E0B';
const CHEST_DARK  = '#B45309';
const INTRO_COLOR = '#059669';
const INTRO_DARK  = '#047857';
const LEVEL_COLOR = '#7C3AED';

// ── Path builder (horizontal S-curve) ─────────────────────────────────────────
function buildPath(pts) {
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], c = pts[i];
    const midX = (p.x + c.x) / 2;
    d += ` C ${midX} ${p.y}, ${midX} ${c.y}, ${c.x} ${c.y}`;
  }
  return d;
}

// ── Icons ──────────────────────────────────────────────────────────────────────
function BookIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChestIcon({ size = 26 }) {
  return (
    <svg width={size} height={Math.round(size * 0.85)} viewBox="0 0 26 22" fill="none">
      <rect x="2"  y="9"  width="22" height="12" rx="2" fill="rgba(255,255,255,0.9)" />
      <rect x="2"  y="9"  width="22" height="5"  rx="1" fill="rgba(255,255,255,0.7)" />
      <rect x="0"  y="7"  width="26" height="4"  rx="2" fill="rgba(255,255,255,0.6)" />
      <circle cx="13" cy="15" r="1.8" fill={CHEST_COLOR} />
      <rect x="11.5" y="3" width="3" height="5" rx="1.5" fill="rgba(255,255,255,0.6)" />
    </svg>
  );
}

// ── Top bar ────────────────────────────────────────────────────────────────────
function TopBar({ onBack, moduleName, xp }) {
  const level     = Math.floor(xp / XP_PER_LEVEL) + 1;
  const levelName = LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)];
  const xpInLevel = xp % XP_PER_LEVEL;
  const xpPct     = Math.round((xpInLevel / XP_PER_LEVEL) * 100);
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div style={{
      position:   'sticky',
      top:        0,
      zIndex:     100,
      background: '#1E1B4B',
      boxShadow:  '0 3px 14px rgba(0,0,0,0.28)',
    }}>
      <div style={{
        maxWidth:   1480,
        margin:     '0 auto',
        padding:    '13px 36px',
        display:    'flex',
        alignItems: 'center',
      }}>

        {/* Left — Home + Help */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onBack}
            style={{
              background:   'rgba(255,255,255,0.14)',
              border:       '1.5px solid rgba(255,255,255,0.22)',
              borderRadius: 10,
              color:        'white',
              fontSize:     22,
              fontWeight:   600,
              padding:      '6px 20px',
              cursor:       'pointer',
              transition:   'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.24)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
          >
            ⌂ Home
          </button>
          <button
            onClick={() => setShowHelp(true)}
            title="Game Guide"
            style={{
              width:        34,
              height:       34,
              borderRadius: '50%',
              background:   'rgba(255,255,255,0.14)',
              border:       '1.5px solid rgba(255,255,255,0.22)',
              color:        'white',
              fontSize:     18,
              fontWeight:   700,
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              transition:   'background 0.15s',
              flexShrink:   0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.24)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
          >
            ?
          </button>
        </div>

        {/* Center — Module name + step pills */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'white', fontSize: 26, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {moduleName}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {SECTIONS.map((sec, i) => (
              <React.Fragment key={i}>
                <div style={{
                  background:   sec.color,
                  color:        'white',
                  borderRadius: 20,
                  padding:      '3px 14px',
                  fontSize:     19,
                  fontWeight:   700,
                  whiteSpace:   'nowrap',
                }}>
                  {sec.label}
                </div>
                {i < SECTIONS.length - 1 && (
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 20 }}>→</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Right — Level + XP */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14 }}>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 22, fontWeight: 700, whiteSpace: 'nowrap' }}>
            Level {level} · {levelName}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
            <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.2)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${xpPct}%`, background: 'rgba(255,255,255,0.85)', borderRadius: 99, transition: 'width 0.5s ease' }} />
            </div>
            <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {xpInLevel}/{XP_PER_LEVEL} XP
            </span>
          </div>
        </div>

      </div>
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
// ── Progression locking (currently disabled for testing — uncomment to enable) ──
//
// Pass `completedModes` from App.jsx (e.g. a Set of strings like 'intro','tutorial','training').
// Then derive `isLocked` per node and skip onClick / grey out the button.
//
// export default function ModeSelector({ moduleId, onSelect, onBack, xp = 0, onDailyChallenge, completedModes = new Set() }) {
//   const introUnlocked    = true;                         // always open
//   const tutorialUnlocked = true;                         // always open
//   const trainingUnlocked = completedModes.has('intro');  // requires Guide done
//   const challengeUnlocked= completedModes.has('training');// requires Training done
//
//   // In the node render, derive isLocked:
//   //   if (node.mode === 'training' && !trainingUnlocked) isLocked = true;
//   //   if (node.mode === 'regular'  && !challengeUnlocked) isLocked = true;
//   // Then: disabled={isChest || isLocked}  and  cursor: isLocked ? 'not-allowed' : ...
//   // Overlay a 🔒 icon on locked nodes.
// }

export default function ModeSelector({ moduleId, onSelect, onBack, xp = 0, onDailyChallenge, onMistakeBook }) {
  const moduleName = moduleId === 'singly' ? 'Singly Linked List' : 'Doubly Linked List';
  const pathD      = buildPath(NODE_POS);

  return (
    <div style={{
      minHeight:  '100vh',
      background: 'linear-gradient(135deg, #F0F4F8 0%, #E8EEF5 100%)',
    }}>

      {/* Top bar */}
      <TopBar onBack={onBack} moduleName={moduleName} xp={xp} />

      {/* Horizontally scrollable path */}
      <div style={{
        padding:     '48px 60px 80px',
        overflowX:   'auto',
        display:     'flex',
        justifyContent: 'center',
      }}>
        <div style={{
          position:  'relative',
          width:     W,
          height:    H,
          flexShrink: 0,
        }}>

          {/* ── Section background + labels (SVG layer 0) ── */}
          <svg
            style={{ position: 'absolute', inset: 0, zIndex: 0 }}
            width={W} height={H}
          >
            {SECTIONS.map((sec, i) => (
              <g key={i}>
                {/* Tinted background rect */}
                <rect
                  x={sec.xStart} y={12}
                  width={sec.xEnd - sec.xStart} height={H - 24}
                  rx={18}
                  fill={sec.bg}
                  stroke={sec.border}
                  strokeWidth={1.5}
                />
                {/* Step label — top of section */}
                <text
                  x={(sec.xStart + sec.xEnd) / 2} y={48}
                  textAnchor="middle"
                  fill={sec.color}
                  fontSize={21}
                  fontWeight={800}
                  style={{ fontFamily: 'system-ui, -apple-system, sans-serif', letterSpacing: 0.3 }}
                >
                  {sec.label} · {sec.desc}
                </text>
              </g>
            ))}
          </svg>

          {/* ── SVG path track (layer 1) ── */}
          <svg
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
            width={W} height={H}
          >
            <path
              d={pathD} fill="none"
              stroke="#CBD5E1" strokeWidth={14}
              strokeLinecap="round" strokeLinejoin="round"
            />
            <path
              d={pathD} fill="none"
              stroke="white" strokeWidth={4}
              strokeLinecap="round" strokeDasharray="1 22"
            />
          </svg>

          {/* ── Nodes (layer 3) ── */}
          {NODES.map((node, i) => {
            const pos     = NODE_POS[i];
            const isChest = node.type === 'chest';
            const isIntro = node.type === 'intro';
            const isLevel = node.type === 'level';

            // ── Level nodes: pill card ──────────────────────────────────────
            if (isLevel) {
              const pw = 118, ph = 56;
              return (
                <div key={i} style={{
                  position: 'absolute',
                  left:     pos.x - pw / 2,
                  top:      pos.y - ph / 2,
                  width:    pw,
                  height:   ph,
                  zIndex:   3,
                }}>
                  <button
                    onClick={() => onSelect(node.mode, node.qIdx)}
                    style={{
                      width:        '100%',
                      height:       '100%',
                      borderRadius: 14,
                      background:   'white',
                      border:       `2.5px solid ${LEVEL_COLOR}`,
                      boxShadow:    '0 3px 10px rgba(124,58,237,0.18)',
                      display:      'flex',
                      flexDirection: 'column',
                      alignItems:   'center',
                      justifyContent: 'center',
                      cursor:       'pointer',
                      outline:      'none',
                      gap:          1,
                      transition:   'transform 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform  = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow  = '0 7px 18px rgba(124,58,237,0.28)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform  = '';
                      e.currentTarget.style.boxShadow  = '0 3px 10px rgba(124,58,237,0.18)';
                    }}
                  >
                    <span style={{
                      fontSize:   18,
                      fontWeight: 800,
                      color:      LEVEL_COLOR,
                      lineHeight: 1,
                    }}>
                      {node.label}
                    </span>
                    <span style={{
                      fontSize:   13,
                      color:      '#9CA3AF',
                      fontWeight: 500,
                      marginTop:  2,
                    }}>
                      {node.sub}
                    </span>
                  </button>
                </div>
              );
            }

            // ── Circle nodes (intro / chest / tutorial / training) ──────────
            const btnColor = isChest ? CHEST_COLOR : isIntro ? INTRO_COLOR : NODE_COLOR;
            const btnDark  = isChest ? CHEST_DARK  : isIntro ? INTRO_DARK  : NODE_DARK;
            const btnGlow  = `${btnColor}44`;

            return (
              <div key={i} style={{
                position: 'absolute',
                left:     pos.x - R,
                top:      pos.y - R,
                width:    R * 2,
                height:   R * 2,
                zIndex:   3,
              }}>
                <button
                  onClick={() => {
                    if (isIntro) onSelect('intro', 0);
                    else if (!isChest) onSelect(node.mode, node.qIdx);
                  }}
                  disabled={isChest}
                  style={{
                    width:        '100%',
                    height:       '100%',
                    borderRadius: '50%',
                    background:   btnColor,
                    border:       '4px solid rgba(255,255,255,0.55)',
                    boxShadow:    `0 5px 0 ${btnDark}, 0 0 22px ${btnGlow}`,
                    display:      'flex',
                    alignItems:   'center',
                    justifyContent: 'center',
                    cursor:       isChest ? 'default' : 'pointer',
                    transition:   'transform 0.1s, box-shadow 0.1s',
                    outline:      'none',
                  }}
                  onMouseDown={e => {
                    if (!isChest) {
                      e.currentTarget.style.transform  = 'translateY(4px)';
                      e.currentTarget.style.boxShadow  = `0 1px 0 ${btnDark}`;
                    }
                  }}
                  onMouseUp={e   => {
                    e.currentTarget.style.transform  = '';
                    e.currentTarget.style.boxShadow  = `0 5px 0 ${btnDark}, 0 0 22px ${btnGlow}`;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform  = '';
                    e.currentTarget.style.boxShadow  = `0 5px 0 ${btnDark}, 0 0 22px ${btnGlow}`;
                  }}
                >
                  {isChest
                    ? <ChestIcon />
                    : isIntro
                    ? <BookIcon />
                    : <Star size={22} fill="white" color="white" />
                  }
                </button>

                {/* START bubble above intro node */}
                {isIntro && (
                  <div style={{
                    position:     'absolute',
                    top:          -38,
                    left:         '50%',
                    transform:    'translateX(-50%)',
                    background:   INTRO_COLOR,
                    color:        'white',
                    borderRadius: 20,
                    padding:      '4px 16px',
                    fontSize:     18,
                    fontWeight:   900,
                    whiteSpace:   'nowrap',
                    boxShadow:    '0 2px 8px rgba(0,0,0,0.2)',
                    letterSpacing: 1,
                    pointerEvents: 'none',
                  }}>
                    START
                  </div>
                )}

                {/* Label below circle nodes (tutorial / training ops) */}
                {!isChest && !isIntro && (
                  <div style={{
                    position:      'absolute',
                    top:           R * 2 + 7,
                    left:          '50%',
                    transform:     'translateX(-50%)',
                    textAlign:     'center',
                    pointerEvents: 'none',
                    whiteSpace:    'nowrap',
                  }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>
                      {node.label}
                    </span>
                  </div>
                )}

                {/* Label below chest nodes */}
                {isChest && (
                  <div style={{
                    position:      'absolute',
                    top:           R * 2 + 7,
                    left:          '50%',
                    transform:     'translateX(-50%)',
                    textAlign:     'center',
                    pointerEvents: 'none',
                    whiteSpace:    'nowrap',
                  }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: CHEST_DARK }}>
                      {node.label}
                    </span>
                  </div>
                )}

              </div>
            );
          })}

        </div>
      </div>

      {/* Daily Debug Challenge — only shown for Singly LL */}
      {onDailyChallenge && (
        <div style={{ padding: '0 60px 0', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={onDailyChallenge}
            style={{
              width:          '100%',
              maxWidth:       W,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              gap:            24,
              background:     'rgba(251,191,36,0.12)',
              border:         '1.5px solid rgba(251,191,36,0.4)',
              borderRadius:   20,
              padding:        '20px 28px',
              cursor:         'pointer',
              transition:     'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background    = 'rgba(251,191,36,0.22)';
              e.currentTarget.style.borderColor   = 'rgba(251,191,36,0.7)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background    = 'rgba(251,191,36,0.12)';
              e.currentTarget.style.borderColor   = 'rgba(251,191,36,0.4)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{
                width:          52,
                height:         52,
                borderRadius:   14,
                background:     'rgba(251,191,36,0.25)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                fontSize:       26,
                flexShrink:     0,
              }}>
                🐛
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>
                  Daily Challenge
                </p>
                <p style={{ fontSize: 18, fontWeight: 800, color: '#1E1B4B', margin: 0 }}>
                  Daily Debug Challenge
                </p>
                <p style={{ fontSize: 14, color: '#6B7280', marginTop: 3 }}>
                  Find the bug in today's linked list snippet — new question every day.
                </p>
              </div>
            </div>
            <span style={{ fontSize: 22, color: '#D97706', flexShrink: 0 }}>→</span>
          </button>
        </div>
      )}

      {/* Mistake Book — always shown */}
      {onMistakeBook && (
        <div style={{ padding: onDailyChallenge ? '16px 60px 60px' : '0 60px 60px', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={onMistakeBook}
            style={{
              width:          '100%',
              maxWidth:       W,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              gap:            24,
              background:     'rgba(124,58,237,0.07)',
              border:         '1.5px solid rgba(124,58,237,0.25)',
              borderRadius:   20,
              padding:        '20px 28px',
              cursor:         'pointer',
              transition:     'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background  = 'rgba(124,58,237,0.14)';
              e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background  = 'rgba(124,58,237,0.07)';
              e.currentTarget.style.borderColor = 'rgba(124,58,237,0.25)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{
                width:          52,
                height:         52,
                borderRadius:   14,
                background:     'rgba(124,58,237,0.15)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                fontSize:       26,
                flexShrink:     0,
              }}>
                📖
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>
                  Review
                </p>
                <p style={{ fontSize: 18, fontWeight: 800, color: '#1E1B4B', margin: 0 }}>
                  Mistake Book
                </p>
                <p style={{ fontSize: 14, color: '#6B7280', marginTop: 3 }}>
                  Review all wrong answers from quizzes, daily challenges, and exercises.
                </p>
              </div>
            </div>
            <span style={{ fontSize: 22, color: '#7C3AED', flexShrink: 0 }}>→</span>
          </button>
        </div>
      )}

    </div>
  );
}
