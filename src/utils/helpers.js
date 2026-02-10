/**
 * Shuffle an array randomly using Fisher-Yates algorithm
 * @param {Array} array - The array to shuffle
 * @returns {Array} A new shuffled array
 */
export const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Format a pattern value for display (numbers stay as numbers, strings stay as strings)
 * @param {number|string} value - The value to format
 * @returns {number|string} The formatted value
 */
export const formatPatternValue = (value) => {
  return typeof value === 'number' ? value : value;
};

/**
 * Get the current pattern of values in the linked list
 * @param {Array} nodes - Array of node objects with id, value, and next properties
 * @returns {Array} Array of values in linked list order
 */
export const getCurrentPattern = (nodes) => {
  const pattern = [];
  const allIds = new Set(nodes.map(n => n.id));
  const pointedIds = new Set(nodes.map(n => n.next).filter(n => n !== null));
  
  // Find the head node (not pointed to by any other node)
  let head = null;
  for (let id of allIds) {
    if (!pointedIds.has(id)) {
      head = id;
      break;
    }
  }
  
  // Fallback: if no head found, use first node
  if (head === null && nodes.length > 0) {
    head = nodes[0].id;
  }
  
  // Traverse the linked list and collect values
  let current = head;
  while (current !== null) {
    const node = nodes.find(n => n.id === current);
    if (!node) break;
    pattern.push(node.value);
    current = node.next;
  }
  
  return pattern;
};