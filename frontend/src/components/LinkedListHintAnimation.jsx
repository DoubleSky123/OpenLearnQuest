import { useState, useEffect, useRef } from 'react';
import { getCurrentPattern } from '../utils/helpers';

// ── Single animated node ───────────────────────────────────────────────────────
export function AnimNode({ v, color, show, isCursor, isHead }) {
  // 'show' drives the CSS transition (scale + opacity)
  const [rendered, setRendered] = useState(show);
  useEffect(() => {
    if (show && !rendered) {
      requestAnimationFrame(() => requestAnimationFrame(() => setRendered(true)));
    } else if (!show) {
      setRendered(false);
    }
  }, [show]); // eslint-disable-line

  const visible = rendered && show;

  const colorClass = {
    new:      'bg-emerald-100 border-emerald-500 text-emerald-800',
    removing: 'bg-red-100 border-red-400 text-red-700',
    active:   'bg-amber-50 border-amber-400 text-amber-800',
    normal:   isCursor
                ? 'bg-amber-50 border-amber-400 text-amber-800'
                : isHead
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'bg-white border-gray-300 text-gray-700',
  }[color] ?? 'bg-white border-gray-300 text-gray-700';

  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0" style={{
      opacity:    visible ? 1 : 0,
      transform:  visible ? 'scale(1)' : 'scale(0.3)',
      transition: 'opacity 0.32s ease, transform 0.32s ease',
    }}>
      {/* label above node */}
      <div className="h-[22px] flex flex-col items-center justify-end">
        {(isHead || isCursor) && (
          <>
            <span className={`text-[10px] font-mono font-semibold leading-none ${isCursor ? 'text-amber-600' : 'text-indigo-500'}`}>
              {isCursor ? 'curr' : 'head'}
            </span>
            <span className={`text-xs leading-none ${isCursor ? 'text-amber-500' : 'text-indigo-400'}`}>↓</span>
          </>
        )}
      </div>
      <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-semibold text-sm
        ${colorClass} ${isCursor ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}>
        {v}
      </div>
    </div>
  );
}

export function Arrow() {
  return <span className="text-gray-400 text-sm mb-1 shrink-0">→</span>;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function LinkedListHintAnimation({ question, onClose }) {
  const { initialNodes, goalPattern, operation, operationValue, operationPosition, l1Values, l2Values } = question;
  const initialValues = getCurrentPattern(initialNodes ?? []);
  const goal = goalPattern ?? [];

  const idRef = useRef(0);
  const nextId = () => ++idRef.current;

  // Each node: { id, v, show, color }
  const makeNodes = (vals, color = 'normal') =>
    vals.map(v => ({ id: nextId(), v, show: true, color }));

  const [nodes, setNodes]   = useState(() => makeNodes(initialValues));
  const [cursor, setCursor] = useState(null);   // index into nodes array
  const [label, setLabel]   = useState('');
  const [replayKey, setReplayKey] = useState(0);

  // ── helpers that mutate nodes state ─────────────────────────────────────────
  const addNode = (setN, idx, val, color = 'new') => {
    const id = nextId();
    setN(prev => {
      const next = [...prev];
      next.splice(idx, 0, { id, v: val, show: false, color });
      return next;
    });
    // trigger enter animation after one paint
    setTimeout(() => setN(prev => prev.map(n => n.id === id ? { ...n, show: true } : n)), 30);
    return id;
  };

  const removeNode = (setN, idx) => {
    // Mark as removing (show=false triggers CSS exit)
    setN(prev => prev.map((n, i) => i === idx ? { ...n, show: false, color: 'removing' } : n));
    // Remove from DOM after transition
    setTimeout(() => setN(prev => {
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    }), 380);
  };

  const markColor = (setN, idx, color) =>
    setN(prev => prev.map((n, i) => i === idx ? { ...n, color } : n));

  const resetNodes = (setN, vals) => setN(makeNodes(vals));

  // ── Animation timeline ───────────────────────────────────────────────────────
  useEffect(() => {
    // Reset
    idRef.current = 0;
    const initN = makeNodes(initialValues);
    setNodes(initN);
    setCursor(null);
    setLabel('');

    const timers = [];
    let t = 400;
    const at = (delay, fn) => { timers.push(setTimeout(fn, t)); t += delay; };

    switch (operation) {

      case 'insertIntoEmpty':
        at(0,   () => setLabel('List is empty'));
        at(700, () => { addNode(setNodes, 0, goal[0]); setLabel(`Create node (${operationValue ?? goal[0]})`); });
        at(800, () => { setCursor(0); setLabel('head = newNode ✓'); });
        break;

      case 'insertAtHead':
        at(0,   () => setLabel('Initial list'));
        at(700, () => { addNode(setNodes, 0, goal[0]); setLabel(`newNode(${goal[0]}).next = old head`); });
        at(800, () => { setCursor(0); setLabel('head = newNode ✓'); });
        break;

      case 'insertAtTail':
        at(0, () => setLabel('Start traversal from head'));
        for (let i = 0; i < initialValues.length; i++) {
          const idx = i;
          at(650, () => {
            setCursor(idx);
            setLabel(idx < initialValues.length - 1 ? 'curr.next ≠ null → move forward' : 'curr.next == null → tail found!');
          });
        }
        at(750, () => { addNode(setNodes, initialValues.length, goal[goal.length - 1]); setLabel(`tail.next = newNode(${operationValue})`); });
        at(800, () => { setCursor(null); setLabel('Done ✓'); });
        break;

      case 'removeAtHead':
        at(0,   () => { setCursor(0); setLabel('curr = head'); });
        at(750, () => { markColor(setNodes, 0, 'removing'); setLabel('head = head.next'); });
        at(450, () => { removeNode(setNodes, 0); setCursor(null); setLabel('Node removed ✓'); });
        break;

      case 'removeAtTail':
        at(0, () => setLabel('Start traversal'));
        for (let i = 0; i < initialValues.length - 1; i++) {
          const idx = i;
          at(650, () => {
            setCursor(idx);
            setLabel(idx === initialValues.length - 2 ? 'curr.next.next == null → stop!' : 'curr.next.next ≠ null → move');
          });
        }
        at(700, () => { markColor(setNodes, initialValues.length - 1, 'removing'); setLabel('curr.next = null'); });
        at(450, () => { removeNode(setNodes, initialValues.length - 1); setCursor(null); setLabel('Tail removed ✓'); });
        break;

      case 'insertAtPosition': {
        const pos = operationPosition ?? 1;
        at(0, () => setLabel('Start traversal'));
        for (let i = 0; i < pos; i++) {
          const idx = i;
          at(650, () => { setCursor(idx); setLabel(`Moving to position ${pos}...`); });
        }
        at(750, () => { addNode(setNodes, pos, operationValue); setLabel(`Insert node(${operationValue}) at position ${pos}`); });
        at(800, () => { setCursor(null); setLabel('Done ✓'); });
        break;
      }

      case 'removeAtPosition': {
        const pos = operationPosition ?? 1;
        at(0, () => setLabel('Start traversal'));
        for (let i = 0; i <= pos; i++) {
          const idx = i;
          at(650, () => {
            setCursor(idx);
            setLabel(idx === pos ? `Found target at position ${pos}` : 'Traverse...');
          });
        }
        at(750, () => { markColor(setNodes, pos, 'removing'); setLabel('prev.next = node.next'); });
        at(450, () => { removeNode(setNodes, pos); setCursor(null); setLabel('Node removed ✓'); });
        break;
      }

      case 'deleteEntireList':
        at(0,   () => setLabel('Initial list'));
        at(700, () => { setNodes(prev => prev.map(n => ({ ...n, show: false, color: 'removing' }))); setLabel('head = null'); });
        at(500, () => { setNodes([]); setLabel('List deleted ✓'); });
        break;

      case 'reverseList':
        at(0,   () => setLabel('Initial list'));
        at(800, () => { setNodes(prev => prev.map(n => ({ ...n, color: 'active' }))); setLabel('Reversing pointers...'); });
        at(900, () => { resetNodes(setNodes, goal); setLabel('List reversed ✓'); });
        break;

      case 'mergeSortedLists': {
        const l1 = l1Values ?? [];
        const l2 = l2Values ?? [];
        at(0,   () => { resetNodes(setNodes, l1); setLabel('List 1'); });
        at(900, () => { setNodes(prev => [...prev, ...makeNodes(l2, 'new')]); setLabel('Merge with List 2...'); });
        at(900, () => { resetNodes(setNodes, goal); setLabel('Merged and sorted ✓'); });
        break;
      }

      default: // reverseList, sortList, detectCycle
        at(0,   () => setLabel('Initial list'));
        at(900, () => { resetNodes(setNodes, goal); setLabel('After operation ✓'); });
        break;
    }

    return () => timers.forEach(clearTimeout);
  }, [replayKey]); // eslint-disable-line

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-gray-800 text-base">💡 Animation Hint</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-7 h-7 flex items-center justify-center">×</button>
        </div>

        <div className="flex justify-center mb-4">
          <span className="text-xs font-mono bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full font-semibold">{operation}</span>
        </div>

        {/* Animated list */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 min-h-[96px] flex items-center overflow-x-auto">
          {nodes.length === 0 ? (
            <div className="flex items-center gap-2 text-gray-400 italic text-sm">
              <span className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-xs">∅</span>
              Empty list
            </div>
          ) : (
            <div className="flex items-center gap-1 flex-nowrap">
              {nodes.map((n, i) => (
                <span key={n.id} className="flex items-center gap-1">
                  <AnimNode
                    v={n.v}
                    color={n.color}
                    show={n.show}
                    isCursor={cursor === i}
                    isHead={i === 0}
                  />
                  {i < nodes.length - 1 && <Arrow />}
                </span>
              ))}
              <span className="text-gray-400 text-xs ml-1">→ null</span>
            </div>
          )}
        </div>

        {/* Step label */}
        <p className="text-sm text-indigo-600 font-medium text-center mt-3 min-h-[20px]">{label}</p>

        {/* Buttons */}
        <div className="flex gap-2 mt-4">
          <button onClick={() => setReplayKey(k => k + 1)} className="flex-1 py-2 text-sm bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors">
            ↺ Replay
          </button>
          <button onClick={onClose} className="flex-1 py-2 text-sm bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
