/**
 * UNIVERSAL ERROR DETECTION FRAMEWORK
 * A rule-based error detection system for linked-list assembly validation.
 */

import { OP } from './operations.js';

// =====================================================
// BUILT-IN ERROR DETECTION RULES
// =====================================================

/**
 * Rule 1: Pointer Sequence Error
 */
const pointerSequenceRule = {
  id: 'pointer_sequence',
  category: 'Pointer Operations',
  priority: 1,

  detector: (userSequence, pseudocode, level) => {
    const codeTexts = userSequence.map(idx => pseudocode[idx]);

    const headAssignmentIdx = codeTexts.findIndex(text =>
      text.includes('head = newNode') && !text.includes('.next')
    );
    const nextAssignmentIdx = codeTexts.findIndex(text =>
      text.includes('newNode.next = head') ||
      text.includes('newNode1.next = head') ||
      text.includes('newNode2.next = head')
    );

    if (headAssignmentIdx !== -1 && nextAssignmentIdx !== -1 &&
        headAssignmentIdx < nextAssignmentIdx) {
      return {
        wrongLine: headAssignmentIdx + 1,
        headIdx: headAssignmentIdx,
        nextIdx: nextAssignmentIdx
      };
    }

    return null;
  },

  feedback: (detectionResult, level) => ({
    type: 'pointer_sequence',
    message: '🔗 Pointer Sequence Error',
    explanation: 'You moved the head pointer before connecting the new node! This breaks the chain.',
    reasoning: 'When inserting at head: FIRST connect the new node to the existing list (newNode.next = head), THEN update head pointer (head = newNode). Order matters!',
    analogy: 'Think of it like a relay race: the new runner must grab the baton (connect .next) BEFORE the previous runner lets go (update head).',
    keyPoint: 'Always connect before moving. Breaking the chain loses data!',
    suggestedFix: `Line ${detectionResult.wrongLine} should come AFTER the .next assignment`
  })
};

/**
 * Rule 2: Traversal Position Error
 */
const traversalPositionRule = {
  id: 'traversal_position',
  category: 'Access vs Modify',
  priority: 2,

  detector: (userSequence, pseudocode, level) => {
    if (![OP.INSERT_AT_POSITION, OP.REMOVE_AT_POSITION].includes(level.operation)) {
      return null;
    }

    const codeTexts = userSequence.map(idx => pseudocode[idx]);
    const targetPosition = level.operationPosition;
    const traversalLine = codeTexts.find(text => text.includes('traverse to position'));

    if (traversalLine) {
      const match = traversalLine.match(/position (\d+)/);
      if (match) {
        const traverseToPos = parseInt(match[1]);
        if (traverseToPos === targetPosition) {
          return { traverseToPos, targetPosition };
        }
      }
    }

    return null;
  },

  feedback: (result, level) => ({
    type: 'traversal_position',
    message: '📍 Wrong Traversal Position',
    explanation: `To ${level.operation === OP.INSERT_AT_POSITION ? 'insert' : 'delete'} at position ${result.targetPosition}, you need to traverse to position ${result.targetPosition - 1}, not position ${result.targetPosition}!`,
    reasoning: 'In linked lists, to modify a connection, you need access to the PREVIOUS node. You can\'t modify a node\'s .next pointer by standing at that node.',
    analogy: 'To change a train car\'s connection, you need to be at the car BEFORE it, not the car itself.',
    keyPoint: `Access the node at position ${result.targetPosition - 1}, then modify its .next pointer`
  })
};

/**
 * Rule 3: NULL Placement Error
 */
const nullPlacementRule = {
  id: 'null_placement',
  category: 'Pointer Operations',
  priority: 3,

  detector: (userSequence, pseudocode, level) => {
    if (![OP.INSERT_AT_HEAD, OP.INSERT_AT_POSITION].includes(level.operation)) {
      return null;
    }

    const codeTexts = userSequence.map(idx => pseudocode[idx]);
    const hasNullAssignment = codeTexts.some(text =>
      text.includes('newNode.next = NULL') ||
      text.includes('newNode1.next = NULL') ||
      text.includes('newNode2.next = NULL')
    );

    return hasNullAssignment ? { operation: level.operation } : null;
  },

  feedback: (result, level) => ({
    type: 'null_placement',
    message: '⚠️ Incorrect NULL Placement',
    explanation: 'You set newNode.next = NULL, but you\'re inserting in the middle or at head!',
    reasoning: 'NULL should ONLY be used at the tail of the list. When inserting elsewhere, the new node should point to the NEXT node in the chain.',
    correctApproach: result.operation === OP.INSERT_AT_HEAD
      ? 'For head insertion: newNode.next = head (not NULL)'
      : 'For position insertion: newNode.next = current.next (not NULL)',
    keyPoint: 'NULL marks the END of the list. Only the tail node should have .next = NULL.'
  })
};

/**
 * Rule 4: Temporary Variable Error
 */
const tempVariableRule = {
  id: 'temp_variable',
  category: 'Memory Management',
  priority: 4,

  detector: (userSequence, pseudocode, level) => {
    if (![OP.REMOVE_AT_HEAD, OP.REMOVE_LAST_NODE, OP.REMOVE_AT_POSITION].includes(level.operation)) {
      return null;
    }

    const codeTexts = userSequence.map(idx => pseudocode[idx]);
    const hasFree = codeTexts.some(text => text.includes('free'));
    const hasTemp = codeTexts.some(text => text.includes('temp ='));
    const freeLineIdx = codeTexts.findIndex(text => text.includes('free'));
    const tempLineIdx = codeTexts.findIndex(text => text.includes('temp ='));

    if (hasFree && (!hasTemp || tempLineIdx > freeLineIdx)) {
      return { freeLineIdx, tempLineIdx };
    }

    return null;
  },

  feedback: (result, level) => ({
    type: 'temp_variable',
    message: '💾 Missing Temporary Variable',
    explanation: 'You need to save the node to a temporary variable BEFORE disconnecting or freeing it!',
    reasoning: 'Once you disconnect a node (e.g., node.next = NULL), you lose the reference to it. Save it first in a temp variable so you can free it later.',
    correctSequence: [
      '1. Save: temp = node (or temp = head, temp = node.next)',
      '2. Disconnect: update pointers',
      '3. Free: free temp'
    ],
    analogy: 'Like writing down a phone number before erasing it from the board. Once erased, it\'s gone forever!',
    keyPoint: 'Always use temp to hold a reference before you disconnect or modify pointers.'
  })
};

/**
 * Rule 5: Semantic Confusion
 */
const semanticConfusionRule = {
  id: 'semantic_confusion',
  category: 'Operation Semantics',
  priority: 5,

  detector: (userSequence, pseudocode, level) => {
    if (![OP.INSERT_AT_POSITION, OP.INSERT_AT_TAIL].includes(level.operation)) {
      return null;
    }

    const codeTexts = userSequence.map(idx => pseudocode[idx]);
    const usesHeadAssignment = codeTexts.some(text =>
      text.includes('head = newNode') && !text.includes('.next')
    );

    return usesHeadAssignment ? { operation: level.operation } : null;
  },

  feedback: (result, level) => ({
    type: 'semantic_confusion',
    message: '🔀 Wrong Operation Type',
    explanation: `You're using "head = newNode" which is for HEAD insertion, but this level requires ${result.operation}!`,
    reasoning: 'Different positions require different pointer manipulations. Head insertion, tail insertion, and middle insertion all use different patterns.',
    comparison: {
      'Insert at Head': 'newNode.next = head → head = newNode',
      'Insert at Tail': 'traverse to last → lastNode.next = newNode → newNode.next = NULL',
      'Insert at Position': 'traverse to prev → newNode.next = prev.next → prev.next = newNode'
    },
    keyPoint: 'Each insertion position has its own unique pointer pattern. Don\'t mix them up!'
  })
};

// =====================================================
// ERROR DETECTION ENGINE
// =====================================================

const builtInRules = [
  pointerSequenceRule,
  traversalPositionRule,
  nullPlacementRule,
  tempVariableRule,
  semanticConfusionRule
];

/**
 * Runs all built-in rules plus any level-specific custom rules.
 * Returns the first matching error's feedback, or null if the assembly is correct.
 *
 * @param {Array}  assemblyArea  - User's assembled code blocks
 * @param {Object} currentLevel  - Current level configuration
 * @param {Array}  customRules   - Optional level-specific rules (highest priority)
 * @returns {Object|null}
 */
export function detectCodeError(assemblyArea, currentLevel, customRules = []) {
  const userSequence = assemblyArea.map(item => item.index);
  const pseudocode = currentLevel.pseudocode;

  const allRules = [...customRules, ...builtInRules];
  allRules.sort((a, b) => (a.priority || 999) - (b.priority || 999));

  for (const rule of allRules) {
    try {
      const detectionResult = rule.detector(userSequence, pseudocode, currentLevel);
      if (detectionResult) {
        const feedback = rule.feedback(detectionResult, currentLevel);
        if (!feedback.category) feedback.category = rule.category;
        return feedback;
      }
    } catch (error) {
      console.error(`Error in rule ${rule.id}:`, error);
    }
  }

  return null;
}
