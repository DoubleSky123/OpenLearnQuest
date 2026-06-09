/**
 * DOUBLY LINKED LIST OPERATIONS
 * Each node: { id, value, next, prev }
 * prev === null  → head node
 * next === null  → tail node
 */

// ─── helpers ────────────────────────────────────────────────────────────────

/** Find the head node (prev === null). */
const findHead = (nodes) => nodes.find(n => n.prev === null) ?? nodes[0] ?? null;

/** Traverse from head and return ordered node array. */
const toOrderedArray = (nodes) => {
  const result = [];
  let cur = findHead(nodes);
  const visited = new Set();
  while (cur && !visited.has(cur.id)) {
    result.push(cur);
    visited.add(cur.id);
    cur = cur.next !== null ? nodes.find(n => n.id === cur.next) : null;
  }
  return result;
};

const nextId = (nodes) => Math.max(0, ...nodes.map(n => n.id)) + 1;

// ─── operations ─────────────────────────────────────────────────────────────

export const executeDLLOperation = (operation, nodes, operationValue, operationPosition) => {
  // deep-clone to avoid mutation
  let ns = nodes.map(n => ({ ...n }));

  // ── insertAtHead ──────────────────────────────────────────────────────────
  if (operation === 'insertAtHead') {
    const values = Array.isArray(operationValue) ? operationValue : [operationValue];
    for (const val of values) {
      const head = findHead(ns);
      const id   = nextId(ns);
      const node = { id, value: val, next: head ? head.id : null, prev: null };
      if (head) ns = ns.map(n => n.id === head.id ? { ...n, prev: id } : n);
      ns = [node, ...ns];
    }
    return { nodes: ns, message: `✓ ${values.length === 1 ? 'Node' : values.length + ' nodes'} inserted at head` };
  }

  // ── insertAtTail ──────────────────────────────────────────────────────────
  if (operation === 'insertAtTail') {
    const values = Array.isArray(operationValue) ? operationValue : [operationValue];
    for (const val of values) {
      const tail = ns.find(n => n.next === null) ?? null;
      const id   = nextId(ns);
      const node = { id, value: val, next: null, prev: tail ? tail.id : null };
      if (tail) ns = ns.map(n => n.id === tail.id ? { ...n, next: id } : n);
      ns = [...ns, node];
    }
    return { nodes: ns, message: `✓ ${values.length === 1 ? 'Node' : values.length + ' nodes'} inserted at tail` };
  }

  // ── removeAtHead ──────────────────────────────────────────────────────────
  if (operation === 'removeAtHead') {
    const count = 1;
    let removed = 0;
    for (let i = 0; i < count && ns.length > 0; i++) {
      const head = findHead(ns);
      if (!head) break;
      const second = head.next !== null ? ns.find(n => n.id === head.next) : null;
      ns = ns.filter(n => n.id !== head.id);
      if (second) ns = ns.map(n => n.id === second.id ? { ...n, prev: null } : n);
      removed++;
    }
    return { nodes: ns, message: `✓ ${removed === 1 ? 'Head node' : removed + ' nodes'} removed` };
  }

  // ── removeAtTail ──────────────────────────────────────────────────────────
  if (operation === 'removeAtTail') {
    const count = 1;
    let removed = 0;
    for (let i = 0; i < count && ns.length > 0; i++) {
      const tail = ns.find(n => n.next === null);
      if (!tail) break;
      const prev = tail.prev !== null ? ns.find(n => n.id === tail.prev) : null;
      ns = ns.filter(n => n.id !== tail.id);
      if (prev) ns = ns.map(n => n.id === prev.id ? { ...n, next: null } : n);
      removed++;
    }
    return { nodes: ns, message: `✓ ${removed === 1 ? 'Tail node' : removed + ' nodes'} removed` };
  }

  // ── insertAtPosition ──────────────────────────────────────────────────────
  if (operation === 'insertAtPosition') {
    const values    = Array.isArray(operationValue)    ? operationValue    : [operationValue];
    const positions = Array.isArray(operationPosition) ? operationPosition : [operationPosition];
    const ops = values.map((v, i) => ({ value: v, position: positions[i] ?? positions[0] }));

    for (const op of ops) {
      const ordered = toOrderedArray(ns);
      const pred    = ordered[op.position - 1]; // node at position-1 (0-indexed)
      if (!pred) continue;
      const succ = pred.next !== null ? ns.find(n => n.id === pred.next) : null;
      const id   = nextId(ns);
      const node = { id, value: op.value, next: succ ? succ.id : null, prev: pred.id };
      ns = ns.map(n => {
        if (n.id === pred.id)             return { ...n, next: id };
        if (succ && n.id === succ.id)     return { ...n, prev: id };
        return n;
      });
      ns = [...ns, node];
    }
    return { nodes: ns, message: `✓ Node inserted at position ${ops[0].position}` };
  }

  // ── removeAtPosition ─────────────────────────────────────────────────────
  if (operation === 'removeAtPosition') {
    const positions = Array.isArray(operationPosition) ? operationPosition : [operationPosition];
    const sorted = [...positions].sort((a, b) => b - a); // remove back-to-front

    let removed = 0;
    for (const pos of sorted) {
      const ordered = toOrderedArray(ns);
      const target  = ordered[pos - 1]; // 1-indexed position
      if (!target) continue;
      const pred = target.prev !== null ? ns.find(n => n.id === target.prev) : null;
      const succ = target.next !== null ? ns.find(n => n.id === target.next) : null;
      ns = ns.filter(n => n.id !== target.id);
      ns = ns.map(n => {
        if (pred && n.id === pred.id) return { ...n, next: succ ? succ.id : null };
        if (succ && n.id === succ.id) return { ...n, prev: pred ? pred.id : null };
        return n;
      });
      removed++;
    }
    return { nodes: ns, message: `✓ ${removed === 1 ? 'Node' : removed + ' nodes'} removed at position ${positions[0]}` };
  }

  return { nodes, message: '' };
};
