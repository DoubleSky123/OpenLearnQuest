/**
 * QUESTION GENERATOR
 * Generates linked list questions for all three levels.
 *
 * Level 1 — 4 sub-questions: insertAtHead / insertAtEnd / removeAtHead / removeLastNode
 * Level 2 — 4 sub-questions: insertIntoEmpty / deleteEntireList / insertAtPosition / removeAtPosition
 * Level 3 — 4 sub-questions: reverseList / mergeSortedLists / detectCycle / sortList
 *
 * VARIABLE NAMING CONVENTION (enforced throughout):
 *   traversal pointer : node
 *   saved for free    : temp
 *   new node          : newNode
 *   head pointer      : head
 *   loop counter      : i
 */

import { shuffleArray } from '../utils/helpers.js';
import { uniqueInts, pick, buildSLLNodes as buildNodes } from './questionGeneratorCommon.js';

// ─────────────────────────────────────────────────────────────────────────────
// PSEUDOCODE TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATES = {

  // ── Level 1 ──────────────────────────────────────────────────────────────

  insertAtHead: () => ({
    pseudocode: [
      'create newNode',
      'newNode.next = head',
      'head = newNode',
    ],
    correctOrder: [0, 1, 2],
    hint: 'Insert the new node to the existing list at the head.',
  }),

  insertAtTail: () => ({
    pseudocode: [
      'node = head',
      'while (node.next != NULL): node = node.next',
      'create newNode',
      'node.next = newNode',
      'newNode.next = NULL',
    ],
    correctOrder: [0, 1, 2, 3, 4],
    validOrders: [
      [0, 1, 2, 3, 4],   // node=head, while, create, connect, NULL
      [0, 2, 1, 3, 4],   // node=head, create, while, connect, NULL
      [2, 0, 1, 3, 4],   // create, node=head, while, connect, NULL
    ],
    hint: 'Insert the new node at the end of the existing list.',
  }),

  removeAtHead: () => ({
    pseudocode: [
      'temp = head',
      'head = head.next',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2],
    hint: 'Remove the first node and update head to the second node.',
  }),

  removeAtTail: () => ({
    pseudocode: [
      'node = head',
      'while (node.next.next != NULL): node = node.next',
      'temp = node.next',
      'node.next = NULL',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2, 3, 4],
    hint: 'Remove the last node by traversing to the second-to-last node.',
  }),

  // ── Level 2 ──────────────────────────────────────────────────────────────

  insertIntoEmpty: () => ({
    pseudocode: [
      'create newNode',
      'newNode.next = NULL',
      'head = newNode',
    ],
    correctOrder: [0, 1, 2],
    hint: 'Given the list is empty, create the head node.',
  }),

  deleteEntireList: () => ({
    pseudocode: [
      'while (head != NULL):',
      'temp = head',
      'head = head.next',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2, 3],
    hint: 'Iteratively free each node starting from the head until the list is empty.',
  }),

  insertAtPosition: ({ position }) => ({
    pseudocode: [
      'node = head',
      'i = 0',
      `while (i < ${position - 1}): node = node.next`,
      'create newNode',
      'newNode.next = node.next',
      'node.next = newNode',
    ],
    correctOrder: [0, 1, 2, 3, 4, 5],
    validOrders: [
      [0, 1, 2, 3, 4, 5],   // node=head, i=0, while, create, link1, link2
      [1, 0, 2, 3, 4, 5],   // i=0, node=head, while, create, link1, link2
      [0, 1, 3, 2, 4, 5],   // node=head, i=0, create, while, link1, link2
      [1, 0, 3, 2, 4, 5],   // i=0, node=head, create, while, link1, link2
    ],
    hint: `Insert the new node at position ${position}.`,
  }),

  removeAtPosition: ({ position }) => ({
    pseudocode: [
      'node = head',
      'i = 0',
      `while (i < ${position - 1}): node = node.next`,
      'temp = node.next',
      'node.next = temp.next',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2, 3, 4, 5],
    validOrders: [
      [0, 1, 2, 3, 4, 5],   // node=head, i=0, while, ...
      [1, 0, 2, 3, 4, 5],   // i=0, node=head, while, ...
    ],
    hint: `Remove the node at position ${position}.`,
  }),

  // ── Level 3 ──────────────────────────────────────────────────────────────

  reverseList: () => ({
    pseudocode: [
      'prev = NULL',
      'curr = head',
      'while (curr != NULL):',
      'next = curr.next',
      'curr.next = prev',
      'prev = curr',
      'curr = next',
      'head = prev',
    ],
    correctOrder: [0, 1, 2, 3, 4, 5, 6, 7],
    hint: 'Reverse the list by iteratively changing each node\'s .next pointer to its predecessor.',
  }),

  mergeSortedLists: () => ({
    pseudocode: [
      'create dummy node',
      'curr = dummy',
      'while (l1 != NULL && l2 != NULL):',
      'if (l1.val <= l2.val): curr.next = l1; l1 = l1.next',
      'else: curr.next = l2; l2 = l2.next',
      'curr = curr.next',
      'curr.next = l1 if l1 != NULL else l2',
      'return dummy.next',
    ],
    correctOrder: [0, 1, 2, 3, 4, 5, 6, 7],
    hint: 'Merge two sorted lists in non-decreasing order.',
  }),

  detectCycle: () => ({
    pseudocode: [
      'slow = head',
      'fast = head',
      'while (fast != NULL && fast.next != NULL):',
      'slow = slow.next',
      'fast = fast.next.next',
      'if (slow == fast): return True',
      'return False',
    ],
    correctOrder: [0, 1, 2, 3, 4, 5, 6],
    hint: "Detect if there's a cycle in the list.",
  }),

  // LeetCode 148 — Sort List (merge sort on linked list)
  sortList: () => ({
    pseudocode: [
      'if (head == NULL || head.next == NULL): return head',
      'slow = head; fast = head.next',
      'while (fast != NULL && fast.next != NULL):',
      'slow = slow.next; fast = fast.next.next',
      'mid = slow.next',
      'slow.next = NULL',
      'left = sortList(head)',
      'right = sortList(mid)',
      'return merge(left, right)',
    ],
    correctOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    hint: 'Use slow/fast pointers to find the midpoint, split the list, recursively sort both halves, then merge.',
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// DISTRACTOR CATALOGUE  (Level 1 only)
// ─────────────────────────────────────────────────────────────────────────────

export const ERROR_TYPES = {

  LOST_REFERENCE: {
    id: 'lost_reference',
    label: 'Lost Reference Error',
    generateDistractor: (op) => {
      if (op === 'insertAtHead') return {
        code: 'newNode.next = NULL',
        feedback: {
          type: 'lost_reference',
          message: '🔗 Lost Reference Error',
          explanation: 'Setting newNode.next = NULL severs the connection to the rest of the list!',
          reasoning: 'newNode.next must point to the current head so the existing list stays reachable.',
          keyPoint: 'newNode.next = NULL is only correct at the tail. Here you need newNode.next = head.',
          hint: 'What does newNode.next need to point to so the existing list is not lost?',
        },
      };
      if (op === 'insertAtTail') return {
        code: 'newNode.next = newNode',
        feedback: {
          type: 'lost_reference',
          message: '🔗 Lost Reference Error',
          explanation: 'newNode.next = newNode makes the new tail point back to itself — an infinite loop!',
          reasoning: 'The new tail must end the list by pointing to NULL.',
          keyPoint: 'The new tail must have newNode.next = NULL, not newNode.next = newNode.',
          hint: 'What should the very last node in a linked list point to?',
        },
      };
      return {
        code: 'free(head)',
        feedback: {
          type: 'lost_reference',
          message: '🔗 Lost Reference Error',
          explanation: 'Freeing head directly loses the entire list!',
          reasoning: 'free(head) releases the head node immediately without saving a reference to the next node.',
          keyPoint: 'Always: temp = head → advance pointers → free(temp).',
          hint: 'Save the node in temp BEFORE freeing anything.',
        },
      };
    },
  },

  OFF_BY_ONE: {
    id: 'off_by_one',
    label: 'Off-by-One Error',
    generateDistractor: (op, _pc, params) => {
      if (op === 'insertAtTail') return {
        code: 'while (node != NULL): node = node.next',
        feedback: {
          type: 'off_by_one',
          message: '📍 Off-by-One Error',
          explanation: 'This loop overshoots — node becomes NULL and the next line crashes!',
          reasoning: 'You need node to be the last valid node (node.next == NULL), not NULL itself.',
          keyPoint: 'Correct: while (node.next != NULL): node = node.next',
          hint: 'What is the value of node when this loop exits?',
        },
      };
      if (op === 'removeAtTail') return {
        code: 'while (node.next != NULL): node = node.next',
        feedback: {
          type: 'off_by_one',
          message: '📍 Off-by-One Error',
          explanation: 'Your loop stops at the LAST node, but you need the SECOND-TO-LAST!',
          reasoning: 'To remove the last node you must update the second-to-last node\'s .next pointer.',
          keyPoint: 'Use while (node.next.next != NULL): node = node.next to stop one node early.',
          hint: 'Which node do you actually need to modify?',
        },
      };
      const pos = params?.position ?? 2;
      return {
        code: `while (i < ${pos}): node = node.next`,
        feedback: {
          type: 'off_by_one',
          message: '📍 Off-by-One Error',
          explanation: `Your loop goes to position ${pos} but should stop at position ${pos - 1}!`,
          reasoning: 'You need the predecessor node so you can rewire its .next pointer.',
          keyPoint: `Correct loop condition: i < ${pos - 1}, not i < ${pos}.`,
          hint: 'You always need the node BEFORE the target. Stop one step earlier.',
        },
      };
    },
  },

  SELF_LOOP: {
    id: 'self_loop',
    label: 'Self-Pointing Loop Error',
    generateDistractor: () => ({
      code: 'newNode.next = newNode',
      feedback: {
        type: 'self_loop',
        message: '🔄 Self-Pointing Loop Error',
        explanation: 'newNode.next = newNode makes the new node point to itself — traversal loops forever!',
        reasoning: 'newNode.next must point to the old head, not back to newNode.',
        keyPoint: 'Correct: newNode.next = head  (the OLD head, not newNode itself).',
        hint: 'What node should follow newNode in the list?',
      },
    }),
  },

  NULL_POINTER: {
    id: 'null_pointer',
    label: 'NULL Pointer Error',
    generateDistractor: (op) => {
      if (op === 'removeAtHead') return {
        code: 'head = NULL',
        feedback: {
          type: 'null_pointer',
          message: '⚠️ NULL Pointer Error',
          explanation: 'Setting head = NULL wipes out every node in the list!',
          reasoning: 'head is the sole entry point. Nulling it destroys your only reference to everything.',
          keyPoint: 'To remove just the head: head = head.next.',
          hint: 'What should head point to after the first node is removed?',
        },
      };
      if (op === 'removeAtTail') return {
        code: 'while (node != NULL && node.next != NULL): node = node.next',
        feedback: {
          type: 'null_pointer',
          message: '⚠️ NULL Pointer Error',
          explanation: 'This loop still stops at the LAST node — one step too late!',
          reasoning: 'You need node.next.next != NULL to halt one node earlier.',
          keyPoint: 'Correct: while (node.next != NULL && node.next.next != NULL): node = node.next',
          hint: 'NULL safety and correct stopping position are two separate concerns.',
        },
      };
      return {
        code: 'node.next = node.next.next',
        feedback: {
          type: 'null_pointer',
          message: '⚠️ NULL Pointer Error',
          explanation: 'Skipping temp means you bypass the node without freeing it — and crash if it is the last node!',
          reasoning: 'node.next.next is NULL when the target is the last node, so dereferencing it crashes.',
          keyPoint: 'Always: temp = node.next → node.next = temp.next → free(temp).',
          hint: 'What does node.next.next equal when node.next is the last node?',
        },
      };
    },
  },

  MEMORY_LEAK: {
    id: 'memory_leak',
    label: 'Memory Leak Error',
    generateDistractor: (op) => {
      if (op === 'removeAtHead') return {
        code: 'head = temp',
        feedback: {
          type: 'memory_leak',
          message: '💧 Memory Leak Error',
          explanation: 'head = temp assigns an uninitialised temp to head — you never saved the old head first!',
          reasoning: 'The correct sequence is: temp = head, then head = head.next, then free(temp).',
          keyPoint: 'Order matters: temp = head → head = head.next → free(temp).',
          hint: 'Which direction should the assignment go to save the old head?',
        },
      };
      if (op === 'removeAtTail') return {
        code: 'temp = node',
        feedback: {
          type: 'memory_leak',
          message: '💧 Memory Leak Error',
          explanation: 'temp = node saves the predecessor, not the last node you want to remove!',
          reasoning: 'You need temp to point to node.next (the actual last node) so you can free it.',
          keyPoint: 'Correct: temp = node.next  (save the last node, not its predecessor).',
          hint: 'Which node are you trying to free — node, or the node after it?',
        },
      };
      return {
        code: 'free(node.next)',
        feedback: {
          type: 'memory_leak',
          message: '💧 Memory Leak Error',
          explanation: 'free(node.next) releases the target without saving it or bypassing it in the chain!',
          reasoning: 'You must save the target in temp and rewire node.next = temp.next BEFORE freeing.',
          keyPoint: 'Always: temp = node.next → node.next = temp.next → free(temp).',
          hint: 'What needs to happen to node.next BEFORE you free the target?',
        },
      };
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DISTRACTOR PICKER  (Level 1 only)
// ─────────────────────────────────────────────────────────────────────────────

const OP_ERROR_TYPES = {
  insertAtHead: ['LOST_REFERENCE', 'SELF_LOOP'],
  insertAtTail: ['LOST_REFERENCE', 'OFF_BY_ONE'],
  removeAtHead: ['LOST_REFERENCE', 'NULL_POINTER', 'MEMORY_LEAK'],
  removeAtTail: ['LOST_REFERENCE', 'OFF_BY_ONE', 'NULL_POINTER', 'MEMORY_LEAK'],
};

const pickErrorTypes = (op, count = 2) => {
  const applicable = OP_ERROR_TYPES[op] ?? [];
  return shuffleArray([...applicable]).slice(0, Math.min(count, applicable.length));
};

const buildLevel1Question = (op) => {
  const tpl         = TEMPLATES[op]();
  const errorKeys   = pickErrorTypes(op, 2);
  const values      = uniqueInts(pick([3, 4]), 1, 20);
  const insertValue = pick(uniqueInts(1, 21, 50));

  const distractors = [];
  const distractorFeedbackMap = {};
  errorKeys.forEach((key) => {
    const d = ERROR_TYPES[key].generateDistractor(op, tpl.pseudocode, {});
    if (!distractors.includes(d.code) && !tpl.pseudocode.includes(d.code)) {
      distractors.push(d.code);
      distractorFeedbackMap[d.code] = d.feedback;
    }
  });

  const goalValues =
    op === 'insertAtHead' ? [insertValue, ...values] :
    op === 'insertAtTail' ? [...values, insertValue] :
    op === 'removeAtHead' ? values.slice(1) :
    values.slice(0, -1);

  return {
    pseudocode: tpl.pseudocode,
    correctOrder: tpl.correctOrder,
    ...(tpl.validOrders && { validOrders: tpl.validOrders }),
    distractors,
    distractorFeedbackMap,
    hint: tpl.hint,
    operation: op,
    operationValue: insertValue,
    operationPosition: null,
    goalPattern: goalValues,
    hasComplexity: false,
    useNumbers: true,
    initialNodes: buildNodes(values),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// LEVEL GENERATORS
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL1_OPS = ['insertAtHead', 'insertAtTail', 'removeAtHead', 'removeAtTail'];
const LEVEL2_OPS = ['insertIntoEmpty', 'deleteEntireList', 'insertAtPosition', 'removeAtPosition'];
const LEVEL3_OPS = ['reverseList', 'mergeSortedLists', 'detectCycle', 'sortList'];

export const generateLevel1Question = (subIndex = 0) => {
  const idx = subIndex % 4;
  const op  = LEVEL1_OPS[idx];
  const q   = buildLevel1Question(op);

  const titles = {
    insertAtHead: 'Insert at Head',
    insertAtTail: 'Insert at End',
    removeAtHead: 'Remove at Head',
    removeAtTail: 'Remove Last Node',
  };
  const descriptions = {
    insertAtHead: `Insert ${q.operationValue} at the beginning of [${q.initialNodes.map(n => n.value).join(' → ')}]`,
    insertAtTail: `Insert ${q.operationValue} at the end of [${q.initialNodes.map(n => n.value).join(' → ')}]`,
    removeAtHead: `Remove the first node from [${q.initialNodes.map(n => n.value).join(' → ')}]`,
    removeAtTail: `Remove the last node from [${q.initialNodes.map(n => n.value).join(' → ')}]`,
  };

  return {
    id: `L1-${Date.now()}`,
    levelDifficulty: 1,
    subQuestionIndex: idx,
    title: titles[op],
    description: descriptions[op],
    ...q,
  };
};

export const generateLevel2Question = (subIndex = 0) => {
  const idx = subIndex % 4;
  const op  = LEVEL2_OPS[idx];
  const tpl = op === 'insertAtPosition' || op === 'removeAtPosition'
    ? null
    : TEMPLATES[op]();

  const baseShared = {
    distractors: [],
    distractorFeedbackMap: {},
    hasComplexity: false,
    useNumbers: true,
    id: `L2-${Date.now()}`,
    levelDifficulty: 2,
    subQuestionIndex: idx,
  };

  if (op === 'insertIntoEmpty') {
    const val = pick(uniqueInts(1, 1, 99));
    return {
      ...baseShared,
      pseudocode: tpl.pseudocode,
      correctOrder: tpl.correctOrder,
      hint: tpl.hint,
      operation: op,
      operationValue: val,
      operationPosition: null,
      title: 'Insert into Empty List',
      description: `Given an empty list, insert the value ${val}.`,
      initialNodes: [],
      goalPattern: [val],
    };
  }

  if (op === 'deleteEntireList') {
    const values = uniqueInts(pick([3, 4, 5]), 1, 99);
    return {
      ...baseShared,
      pseudocode: tpl.pseudocode,
      correctOrder: tpl.correctOrder,
      hint: tpl.hint,
      operation: op,
      operationValue: null,
      operationPosition: null,
      title: 'Delete Entire List',
      description: `Given the list [${values.join(' → ')}], delete all nodes.`,
      initialNodes: buildNodes(values),
      goalPattern: [],
    };
  }

  if (op === 'insertAtPosition') {
    const values      = uniqueInts(5, 1, 50);
    const position    = pick([2, 3, 4]);
    const insertValue = pick(uniqueInts(1, 51, 99));
    const template    = TEMPLATES.insertAtPosition({ position });
    const goalValues  = [
      ...values.slice(0, position),
      insertValue,
      ...values.slice(position),
    ];
    return {
      ...baseShared,
      pseudocode: template.pseudocode,
      correctOrder: template.correctOrder,
      ...(template.validOrders && { validOrders: template.validOrders }),
      hint: template.hint,
      operation: op,
      operationValue: insertValue,
      operationPosition: position,
      title: 'Insert at Position',
      description: `Insert ${insertValue} at position ${position} in the list [${values.join(' → ')}].`,
      initialNodes: buildNodes(values),
      goalPattern: goalValues,
    };
  }

  // removeAtPosition
  const values   = uniqueInts(5, 1, 99);
  const position = pick([2, 3, 4]);
  const template = TEMPLATES.removeAtPosition({ position });
  const goalValues = [
    ...values.slice(0, position - 1),
    ...values.slice(position),
  ];
  return {
    ...baseShared,
    pseudocode: template.pseudocode,
    correctOrder: template.correctOrder,
    ...(template.validOrders && { validOrders: template.validOrders }),
    hint: template.hint,
    operation: op,
    operationValue: null,
    operationPosition: position,
    title: 'Remove at Position',
    description: `Remove the node at position ${position} from the list [${values.join(' → ')}].`,
    initialNodes: buildNodes(values),
    goalPattern: goalValues,
  };
};

export const generateLevel3Question = (subIndex = 0) => {
  const idx = subIndex % 4;
  const op  = LEVEL3_OPS[idx];
  const tpl = TEMPLATES[op]();

  const base = {
    pseudocode: tpl.pseudocode,
    correctOrder: tpl.correctOrder,
    distractors: [],
    distractorFeedbackMap: {},
    hint: tpl.hint,
    operation: op,
    operationValue: null,
    operationPosition: null,
    hasComplexity: false,
    useNumbers: true,
    id: `L3-${Date.now()}`,
    levelDifficulty: 3,
    subQuestionIndex: idx,
  };

  if (op === 'reverseList') {
    const values = uniqueInts(pick([4, 5, 6]), 1, 99);
    return {
      ...base,
      title: 'Reverse Linked List',
      description: `Reverse the linked list [${values.join(' → ')}].`,
      initialNodes: buildNodes(values),
      goalPattern: [...values].reverse(),
    };
  }

  if (op === 'mergeSortedLists') {
    const l1     = uniqueInts(pick([2, 3]), 1, 49).sort((a, b) => a - b);
    const l2     = uniqueInts(pick([2, 3]), 51, 99).sort((a, b) => a - b);
    const merged = [...l1, ...l2].sort((a, b) => a - b);
    return {
      ...base,
      title: 'Merge Two Sorted Lists',
      description: `Merge l1: [${l1.join(' → ')}] and l2: [${l2.join(' → ')}] into one sorted list.`,
      initialNodes: buildNodes(l1),
      l1Values: l1,
      l2Values: l2,
      goalPattern: merged,
      isMerge: true,
    };
  }

  if (op === 'detectCycle') {
    const values         = uniqueInts(pick([4, 5, 6]), 1, 99);
    const cycleBackTo    = pick([0, 1, 2]);
    const cycleNodeValue = values[cycleBackTo];
    return {
      ...base,
      title: 'Linked List Cycle',
      description: `Detect whether the linked list [${values.join(' → ')}] contains a cycle. The last node points back to the node with value ${cycleNodeValue}.`,
      initialNodes: buildNodes(values),
      cycleBackTo,
      cycleNodeValue,
      goalPattern: ['CYCLE_DETECTED'],
      isCycle: true,
    };
  }

  // sortList — LeetCode 148
  const size   = pick([5, 6, 7]);
  const values = uniqueInts(size, 1, 99);
  const sorted = [...values].sort((a, b) => a - b);
  return {
    ...base,
    title: 'Sort Linked List',
    description: `Sort the linked list [${values.join(' → ')}] in ascending order using merge sort. (LeetCode 148)`,
    initialNodes: buildNodes(values),
    goalPattern: sorted,
    isSort: true,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export const generateQuestion = (levelDifficulty) => {
  switch (levelDifficulty) {
    case 1:  return generateLevel1Question(0);
    case 2:  return generateLevel2Question(0);
    case 3:  return generateLevel3Question(0);
    default: return generateLevel1Question(0);
  }
};
