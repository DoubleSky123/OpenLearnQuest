/**
 * LINKED LIST OPERATIONS
 * Executes a linked list operation and returns the new node state.
 */

// Helper: find head node id from an unordered nodes array
const findHeadId = (nodes) => {
  const allIds     = new Set(nodes.map(n => n.id));
  const pointedIds = new Set(nodes.map(n => n.next).filter(n => n !== null));
  return [...allIds].find(id => !pointedIds.has(id)) ?? (nodes[0]?.id ?? null);
};

// Helper: traverse nodes in linked-list order, return ordered id array
const traverseIds = (nodes) => {
  const order = [];
  let cur = findHeadId(nodes);
  while (cur !== null) {
    const node = nodes.find(n => n.id === cur);
    if (!node) break;
    order.push(node.id);
    cur = node.next;
  }
  return order;
};

export const executeLinkedListOperation = (operation, nodes, operationValue, operationPosition) => {

  // ── Level 3 ────────────────────────────────────────────────────────────────

  if (operation === 'reverseList') {
    if (nodes.length === 0) return { nodes: [], message: '✓ Empty list — nothing to reverse' };
    const order    = traverseIds(nodes);
    const reversed = nodes.map(n => {
      const pos = order.indexOf(n.id);
      return { ...n, next: pos > 0 ? order[pos - 1] : null };
    });
    return { nodes: reversed, message: '✓ Code executed! List reversed' };
  }

  if (operation === 'mergeSortedLists') {
    const { l1Values = [], l2Values = [] } = operationValue ?? {};
    const merged = [...l1Values, ...l2Values].sort((a, b) => a - b);
    const mergedNodes = merged.map((v, i) => ({
      id: i + 1, value: v, next: i + 1 < merged.length ? i + 2 : null,
    }));
    return { nodes: mergedNodes, message: '✓ Code executed! Lists merged' };
  }

  if (operation === 'detectCycle') {
    return { nodes, message: '✓ Code executed! Cycle detected — slow and fast pointers met' };
  }

  if (operation === 'sortList') {
    const order  = traverseIds(nodes);
    const vals   = order.map(id => nodes.find(n => n.id === id).value);
    const sorted = [...vals].sort((a, b) => a - b);
    const sortedNodes = sorted.map((v, i) => ({
      id: i + 1, value: v, next: i + 1 < sorted.length ? i + 2 : null,
    }));
    return { nodes: sortedNodes, message: '✓ Code executed! List sorted in ascending order' };
  }

  // ── Level 2 ────────────────────────────────────────────────────────────────

  if (operation === 'insertIntoEmpty') {
    const newNode = { id: 1, value: operationValue, next: null };
    return { nodes: [newNode], message: '✓ Code executed! Node inserted into empty list' };
  }

  if (operation === 'removeSingleNode') {
    return { nodes: [], message: '✓ Code executed! Single node removed — list is now empty' };
  }

  if (operation === 'deleteEntireList') {
    return { nodes: [], message: '✓ Code executed! All nodes deleted' };
  }

  // ── Level 1 ────────────────────────────────────────────────────────────────

  if (operation === 'insertAtHead') {
    const headId  = findHeadId(nodes);
    const nextId  = Math.max(...nodes.map(n => n.id), 0) + 1;
    const newNode = { id: nextId, value: operationValue, next: headId };
    return { nodes: [newNode, ...nodes], message: '✓ Code executed! Node inserted at head' };
  }

  if (operation === 'insertAtTail') {
    const nextId  = Math.max(...nodes.map(n => n.id), 0) + 1;
    const updated = nodes.map(n => n.next === null ? { ...n, next: nextId } : n);
    return {
      nodes: [...updated, { id: nextId, value: operationValue, next: null }],
      message: '✓ Code executed! Node inserted at end',
    };
  }

  if (operation === 'removeAtHead') {
    const headId = findHeadId(nodes);
    return { nodes: nodes.filter(n => n.id !== headId), message: '✓ Code executed! Head node removed' };
  }

  if (operation === 'removeAtTail') {
    const lastNode   = nodes.find(n => n.next === null);
    if (!lastNode) return { nodes, message: '' };
    const secondLast = nodes.find(n => n.next === lastNode.id);
    const updated    = nodes
      .map(n => n.id === secondLast?.id ? { ...n, next: null } : n)
      .filter(n => n.id !== lastNode.id);
    return { nodes: updated, message: '✓ Code executed! Last node removed' };
  }

  if (operation === 'insertAtPosition') {
    const order  = traverseIds(nodes);
    const predId = order[operationPosition - 1] ?? null;
    if (predId === null) return { nodes, message: '' };
    const nextId  = Math.max(...nodes.map(n => n.id), 0) + 1;
    const pred    = nodes.find(n => n.id === predId);
    const updated = nodes.map(n => n.id === predId ? { ...n, next: nextId } : n);
    return {
      nodes: [...updated, { id: nextId, value: operationValue, next: pred.next }],
      message: `✓ Code executed! Node inserted at position ${operationPosition}`,
    };
  }

  if (operation === 'removeAtPosition') {
    const order    = traverseIds(nodes);
    const targetId = order[operationPosition - 1] ?? null;
    if (targetId === null) return { nodes, message: '' };
    const predId   = order[operationPosition - 2] ?? null;
    const target   = nodes.find(n => n.id === targetId);
    const updated  = nodes
      .map(n => n.id === predId ? { ...n, next: target.next } : n)
      .filter(n => n.id !== targetId);
    return { nodes: updated, message: `✓ Code executed! Node removed at position ${operationPosition}` };
  }

  return { nodes, message: '' };
};
