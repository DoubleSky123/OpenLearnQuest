import React, { useState } from 'react';

/**
 * TutorialQuickLinks
 *
 * Floating "Need help?" panel shown when emotion = Stressed.
 * Renders as a FAB (bottom-right) that expands into a concept card panel.
 * Non-intrusive — doesn't block game content.
 *
 * Props:
 *   operationTitle — (optional) label of the current operation, e.g. "Insert at Tail"
 */

const CONCEPTS = [
  {
    code: 'newNode.next = head',
    body: 'Always link the new node to the existing list BEFORE moving head — otherwise you lose the entire list.',
  },
  {
    code: 'temp = head; head = head.next',
    body: 'Save the old head in temp FIRST, then advance head. Never skip temp — you need it for free().',
  },
  {
    code: 'while (node.next != NULL)',
    body: 'Stops when node is the LAST node. Use node.next.next != NULL to stop at the second-to-last.',
  },
  {
    code: 'Order: link → move → free',
    body: 'Insert: link first, then update head/tail. Delete: save first, then unlink, then free.',
  },
];

export default function TutorialQuickLinks({ operationTitle }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 150 }}>

      {/* ── Expanded panel ── */}
      {isOpen && (
        <div style={{
          marginBottom: 14,
          width: 306,
          background: 'white',
          borderRadius: 18,
          boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
          border: '1.5px solid #BFDBFE',
          overflow: 'hidden',
          animation: 'slideUp 0.2s ease',
        }}>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
            padding: '14px 18px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ color: 'white', fontWeight: 800, fontSize: 15, margin: 0 }}>
                  📚 Quick Concepts
                </p>
                {operationTitle && (
                  <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: '4px 0 0' }}>
                    for: {operationTitle}
                  </p>
                )}
              </div>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, margin: 0, paddingTop: 3 }}>
                You've got this 💙
              </p>
            </div>
          </div>

          {/* Concept cards */}
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            {CONCEPTS.map((c, i) => (
              <div key={i} style={{
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: 10,
                padding: '10px 12px',
              }}>
                <p style={{ margin: '0 0 5px' }}>
                  <code style={{
                    background: '#DBEAFE', color: '#1D4ED8',
                    fontSize: 12, fontWeight: 700,
                    padding: '2px 7px', borderRadius: 5,
                  }}>
                    {c.code}
                  </code>
                </p>
                <p style={{ color: '#374151', fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
                  {c.body}
                </p>
              </div>
            ))}
          </div>

          {/* Footer hint */}
          <div style={{
            padding: '0 14px 14px',
            borderTop: '1px solid #EFF6FF',
            paddingTop: 10,
            marginTop: 2,
          }}>
            <p style={{ color: '#6B7280', fontSize: 11.5, textAlign: 'center', margin: 0 }}>
              Take your time — no rush 🌟
            </p>
          </div>

        </div>
      )}

      {/* ── FAB button ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        {!isOpen && (
          <div style={{
            background: '#1D4ED8', color: 'white',
            borderRadius: 20, padding: '4px 12px',
            fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
            boxShadow: '0 3px 10px rgba(29,78,216,0.4)',
            animation: 'pulse 2s infinite',
          }}>
            Need help?
          </div>
        )}
        <button
          onClick={() => setIsOpen(prev => !prev)}
          title={isOpen ? 'Close' : 'Quick Concepts'}
          style={{
            width: 52, height: 52,
            borderRadius: '50%',
            background: isOpen ? '#1D4ED8' : 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
            border: '3px solid white',
            boxShadow: '0 6px 22px rgba(59,130,246,0.45)',
            cursor: 'pointer', outline: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: isOpen ? 18 : 22,
            transition: 'transform 0.2s, background 0.2s',
            transform: isOpen ? 'rotate(45deg)' : 'none',
            color: 'white',
          }}
        >
          {isOpen ? '✕' : '💡'}
        </button>
      </div>

    </div>
  );
}
