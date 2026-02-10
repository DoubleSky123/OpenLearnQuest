// Color mappings for operations that use emoji values
const COLORS_MAP = {
  red: '🔴',
  blue: '🔵',
  green: '🟢',
  yellow: '🟡',
  purple: '🟣',
};

/**
 * Execute a linked list operation and return the new state
 * Supports multiple operations by accepting arrays for operationValue and operationPosition
 * @param {string} operation - The operation to perform
 * @param {Array} nodes - Current array of nodes
 * @param {string|number|Array} operationValue - Value(s) to insert (if applicable)
 * @param {number|Array} operationPosition - Position(s) for insert/remove (if applicable)
 * @returns {Object} Object with new nodes array and success message
 */
export const executeLinkedListOperation = (operation, nodes, operationValue, operationPosition) => {
  
  if (operation === 'insertAtHead') {
    // ✅ 支持单个值或数组
    const values = Array.isArray(operationValue) ? operationValue : [operationValue];
    
    let currentNodes = [...nodes];
    let nextId = Math.max(...nodes.map(n => n.id), 0) + 1;
    
    // 按顺序插入每个值
    for (const val of values) {
      const value = typeof val === 'number' ? val : COLORS_MAP[val];
      // 找到当前的头节点ID
      const allIds = new Set(currentNodes.map(n => n.id));
      const pointedIds = new Set(currentNodes.map(n => n.next).filter(n => n !== null));
      let headId = null;
      for (let id of allIds) {
        if (!pointedIds.has(id)) {
          headId = id;
          break;
        }
      }
      if (headId === null && currentNodes.length > 0) {
        headId = currentNodes[0].id;
      }
      
      const newNode = { id: nextId, value, next: headId };
      currentNodes = [newNode, ...currentNodes];
      nextId++;
    }
    
    const message = values.length === 1 
      ? '✓ Code executed! Node inserted at head'
      : `✓ Code executed! ${values.length} nodes inserted at head`;
    
    return {
      nodes: currentNodes,
      message
    };
  } 
  
  if (operation === 'insertAtTail') {
    // ✅ 支持单个值或数组
    const values = Array.isArray(operationValue) ? operationValue : [operationValue];
    
    let currentNodes = [...nodes];
    let nextId = Math.max(...nodes.map(n => n.id), 0) + 1;
    
    for (const val of values) {
      const value = typeof val === 'number' ? val : COLORS_MAP[val];
      const lastNode = currentNodes.find(n => n.next === null);
      if (lastNode) {
        lastNode.next = nextId;
      }
      currentNodes.push({ id: nextId, value, next: null });
      nextId++;
    }
    
    const message = values.length === 1
      ? '✓ Code executed! Node inserted at tail'
      : `✓ Code executed! ${values.length} nodes inserted at tail`;
    
    return {
      nodes: currentNodes,
      message
    };
  } 
  
  if (operation === 'removeAtHead') {
    // ✅ 支持单次或多次删除
    const count = typeof operationValue === 'number' ? operationValue : 1;
    
    let currentNodes = [...nodes];
    let removed = 0;
    
    for (let i = 0; i < count && currentNodes.length > 0; i++) {
      // 找到头节点
      const allIds = new Set(currentNodes.map(n => n.id));
      const pointedIds = new Set(currentNodes.map(n => n.next).filter(n => n !== null));
      let headId = null;
      for (let id of allIds) {
        if (!pointedIds.has(id)) {
          headId = id;
          break;
        }
      }
      if (headId === null && currentNodes.length > 0) {
        headId = currentNodes[0].id;
      }
      
      currentNodes = currentNodes.filter(n => n.id !== headId);
      removed++;
    }
    
    const message = removed === 1
      ? '✓ Code executed! Head node removed'
      : `✓ Code executed! ${removed} nodes removed from head`;
    
    return {
      nodes: currentNodes,
      message
    };
  } 
  
  if (operation === 'removeAtTail') {
    // ✅ 支持单次或多次删除
    const count = typeof operationValue === 'number' ? operationValue : 1;
    
    let currentNodes = [...nodes];
    let removed = 0;
    
    for (let i = 0; i < count && currentNodes.length > 0; i++) {
      const lastNode = currentNodes.find(n => n.next === null);
      if (!lastNode) break;
      
      const secondLast = currentNodes.find(n => n.next === lastNode.id);
      if (secondLast) {
        currentNodes = currentNodes.map(n => n.id === secondLast.id ? { ...n, next: null } : n)
                      .filter(n => n.id !== lastNode.id);
      } else {
        currentNodes = currentNodes.filter(n => n.id !== lastNode.id);
      }
      removed++;
    }
    
    const message = removed === 1
      ? '✓ Code executed! Node removed from tail'
      : `✓ Code executed! ${removed} nodes removed from tail`;
    
    return {
      nodes: currentNodes,
      message
    };
  } 
  
  if (operation === 'insertAtPosition') {
    // ✅ 支持单个或多个插入（位置和值都可以是数组）
    const values = Array.isArray(operationValue) ? operationValue : [operationValue];
    const positions = Array.isArray(operationPosition) ? operationPosition : [operationPosition];
    
    // 确保值和位置数量匹配
    const operations = values.map((val, idx) => ({
      value: val,
      position: positions[idx] !== undefined ? positions[idx] : positions[0]
    }));
    
    let currentNodes = [...nodes];
    let nextId = Math.max(...nodes.map(n => n.id), 0) + 1;
    
    for (const op of operations) {
      const value = typeof op.value === 'number' ? op.value : COLORS_MAP[op.value];
      
      // 找到头节点
      const allIds = new Set(currentNodes.map(n => n.id));
      const pointedIds = new Set(currentNodes.map(n => n.next).filter(n => n !== null));
      let headId = null;
      for (let id of allIds) {
        if (!pointedIds.has(id)) {
          headId = id;
          break;
        }
      }
      if (headId === null && currentNodes.length > 0) {
        headId = currentNodes[0].id;
      }
      
      let current = currentNodes.find(n => n.id === headId);
      for (let i = 0; i < op.position - 1 && current; i++) {
        current = currentNodes.find(n => n.id === current.next);
      }
      
      if (current) {
        currentNodes.push({ id: nextId, value, next: current.next });
        const nodeToUpdate = currentNodes.find(n => n.id === current.id);
        if (nodeToUpdate) nodeToUpdate.next = nextId;
      }
      nextId++;
    }
    
    const message = operations.length === 1
      ? `✓ Code executed! Node inserted at position ${operations[0].position}`
      : `✓ Code executed! ${operations.length} nodes inserted`;
    
    return {
      nodes: currentNodes,
      message
    };
  } 
  
  if (operation === 'removeAtPosition') {
    // ✅ 支持单个或多个删除
    const positions = Array.isArray(operationPosition) ? operationPosition : [operationPosition];
    
    let currentNodes = [...nodes];
    let removed = 0;
    
    // 从后往前删除，避免位置偏移问题
    const sortedPositions = [...positions].sort((a, b) => b - a);
    
    for (const pos of sortedPositions) {
      // 找到头节点
      const allIds = new Set(currentNodes.map(n => n.id));
      const pointedIds = new Set(currentNodes.map(n => n.next).filter(n => n !== null));
      let headId = null;
      for (let id of allIds) {
        if (!pointedIds.has(id)) {
          headId = id;
          break;
        }
      }
      if (headId === null && currentNodes.length > 0) {
        headId = currentNodes[0].id;
      }
      
      let current = currentNodes.find(n => n.id === headId);
      for (let i = 0; i < pos - 1 && current; i++) {
        current = currentNodes.find(n => n.id === current.next);
      }
      
      if (current && current.next) {
        const toRemove = currentNodes.find(n => n.id === current.next);
        currentNodes = currentNodes.map(n => n.id === current.id ? { ...n, next: toRemove?.next || null } : n)
                      .filter(n => n.id !== toRemove?.id);
        removed++;
      }
    }
    
    const message = removed === 1
      ? `✓ Code executed! Node removed at position ${positions[0]}`
      : `✓ Code executed! ${removed} nodes removed`;
    
    return {
      nodes: currentNodes,
      message
    };
  }
  
  return { nodes, message: '' };
};