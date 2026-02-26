/**
 * QUESTION GENERATOR
 * Dynamically generates linked list questions based on difficulty level.
 *
 * Level 1 - Single operation on head or tail, list length 3-4
 * Level 2 - Single operation at position, list length 5
 * Level 3 - Combined operation (2 steps), list length 6-8
 *
 * Each generated question includes:
 *   - initialNodes, goalPattern, operation(s), pseudocode, distractors
 *   - A randomly chosen error type from the 5 categories in the PDF
 *
 * VARIABLE NAMING CONVENTION (enforced throughout):
 *   - All traversal pointer: "node"
 *   - Saved reference for free: "temp"
 *   - New node being inserted: "newNode"
 *   - Head pointer: "head"
 *   - Loop counter for position: "i"
 */

import { shuffleArray } from '../utils/helpers.js';

// ─────────────────────────────────────────────
// 1. HELPERS
// ─────────────────────────────────────────────

const uniqueInts = (n, min, max) => {
  const pool = [];
  for (let i = min; i <= max; i++) pool.push(i);
  return shuffleArray(pool).slice(0, n);
};

const buildNodes = (values) =>
  values.map((v, i) => ({
    id: i + 1,
    value: v,
    next: i + 1 < values.length ? i + 2 : null,
  }));

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ─────────────────────────────────────────────
// 2. CORRECT PSEUDOCODE TEMPLATES
// ─────────────────────────────────────────────
//
// These are the ONLY correct code strings in the system.
// All distractor strings must be checked against these.
//
// insertAtHead:     create newNode | newNode.next = head | head = newNode
// insertAtTail:     while (node.next != NULL): node = node.next | create newNode | node.next = newNode | newNode.next = NULL
// removeAtHead:     temp = head | head = head.next | free(temp)
// removeAtTail:     while (node.next.next != NULL): node = node.next | temp = node.next | node.next = NULL | free(temp)
// insertAtPosition: while (i < N-1): node = node.next | create newNode | newNode.next = node.next | node.next = newNode
// removeAtPosition: while (i < N-1): node = node.next | temp = node.next | node.next = temp.next | free(temp)

const TEMPLATES = {

  insertAtHead: () => ({
    pseudocode: [
      'create newNode',
      'newNode.next = head',
      'head = newNode',
    ],
    correctOrder: [0, 1, 2],
    hint: 'Connect the new node to the existing list BEFORE moving head.',
  }),

  insertAtTail: () => ({
    pseudocode: [
      'while (node.next != NULL): node = node.next',
      'create newNode',
      'node.next = newNode',
      'newNode.next = NULL',
    ],
    correctOrder: [0, 1, 2, 3],
    hint: 'Find the tail first, then append the new node and mark it as the new end.',
  }),

  removeAtHead: () => ({
    pseudocode: [
      'temp = head',
      'head = head.next',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2],
    hint: 'Save old head in temp, advance head, then free(temp) to avoid a memory leak.',
  }),

  removeAtTail: () => ({
    pseudocode: [
      'while (node.next.next != NULL): node = node.next',
      'temp = node.next',
      'node.next = NULL',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2, 3],
    hint: 'The loop stops at the SECOND-TO-LAST node — you need to update its .next, not the tail itself.',
  }),

  insertAtPosition: ({ position }) => ({
    pseudocode: [
      `while (i < ${position - 1}): node = node.next`,
      'create newNode',
      'newNode.next = node.next',
      'node.next = newNode',
    ],
    correctOrder: [0, 1, 2, 3],
    hint: `The loop stops at position ${position - 1} (the predecessor). Save its .next into newNode.next, then link node.next to newNode.`,
  }),

  removeAtPosition: ({ position }) => ({
    pseudocode: [
      `while (i < ${position - 1}): node = node.next`,
      'temp = node.next',
      'node.next = temp.next',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2, 3],
    hint: `The loop stops at position ${position - 1}. Save the target in temp, bypass it, then free(temp).`,
  }),
};

// ─────────────────────────────────────────────
// 3. ERROR TYPE CATALOGUE
// ─────────────────────────────────────────────
//
// DISTRACTOR RULES (enforced):
//   1. Must not match any correct pseudocode line exactly
//   2. Must look like real code (no English descriptions)
//   3. Must use consistent variable names: node, temp, newNode, head, i
//   4. Must be semantically meaningful as a wrong operation
//
// DISTRACTOR VERIFICATION TABLE:
//
// insertAtHead  → [LOST_REFERENCE, SELF_LOOP]
//   LOST_REFERENCE : 'newNode.next = newNode'              ← self-loop, not in correct code ✓
//   SELF_LOOP      : 'head = newNode; newNode.next = head'  ← reversed order causing loop ✓
//
// insertAtTail  → [LOST_REFERENCE, OFF_BY_ONE]
//   LOST_REFERENCE : 'newNode.next = newNode'              ← not in correct code ✓
//   OFF_BY_ONE     : 'while (node != NULL): node = node.next' ← goes one past tail ✓
//
// removeAtHead  → [LOST_REFERENCE, NULL_POINTER, MEMORY_LEAK]
//   LOST_REFERENCE : 'free(head)'                          ← not in correct code ✓
//   NULL_POINTER   : 'head = NULL'                         ← not in correct code ✓
//   MEMORY_LEAK    : 'temp = head; head = head.next'       ← missing free(temp) ✓
//
// removeAtTail  → [LOST_REFERENCE, OFF_BY_ONE, NULL_POINTER, MEMORY_LEAK]
//   LOST_REFERENCE : 'free(head)'                          ← not in correct code ✓
//   OFF_BY_ONE     : 'while (node.next != NULL): node = node.next'  ← stops at tail not second-last ✓
//   NULL_POINTER   : 'while (node != NULL && node.next != NULL): node = node.next' ← wrong stop ✓
//   MEMORY_LEAK    : 'temp = node.next; node.next = NULL'  ← unlinked but not freed ✓
//
// insertAtPosition → [LOST_REFERENCE, OFF_BY_ONE]
//   LOST_REFERENCE : 'node.next = newNode; newNode.next = NULL' ← truncates list ✓
//   OFF_BY_ONE     : 'while (i < N): node = node.next'    ← N is one too many ✓
//
// removeAtPosition → [LOST_REFERENCE, OFF_BY_ONE, NULL_POINTER, MEMORY_LEAK]
//   LOST_REFERENCE : 'free(head)'                          ← not in correct code ✓
//   OFF_BY_ONE     : 'while (i < N): node = node.next'    ← N is one too many ✓
//   NULL_POINTER   : 'node = node.next'                    ← not in correct code ✓
//   MEMORY_LEAK    : 'temp = node.next; node.next = temp.next' ← unlinked but not freed ✓

export const ERROR_TYPES = {

  // ── 1. Lost Reference ────────────────────────────────────────────────
  LOST_REFERENCE: {
    id: 'lost_reference',
    label: 'Lost Reference Error',
    generateDistractor: (op) => {
      if (op === 'insertAtHead') {
        return {
          code: 'newNode.next = newNode',
          feedback: {
            type: 'lost_reference',
            message: '🔗 Lost Reference Error',
            explanation: 'You moved head BEFORE connecting newNode to the list!',
            reasoning: 'Once you do head = newNode without setting newNode.next first, the original list is gone — you have no way to reach it anymore.',
            analogy: 'Like letting go of a rope before grabbing the next one — you fall.',
            keyPoint: 'Rule: connect first (newNode.next = head), THEN move head (head = newNode).',
            hint: 'Which line links newNode into the existing list? That must come first.',
          }
        };
      }
      if (op === 'insertAtTail') {
        return {
          code: 'newNode.next = newNode',
          feedback: {
            type: 'lost_reference',
            message: '🔗 Lost Reference Error',
            explanation: 'newNode points back to itself instead of being linked into the list!',
            reasoning: 'newNode.next should point to NULL (since it becomes the new tail), not back to newNode itself.',
            keyPoint: 'The new tail node must have newNode.next = NULL, not newNode.next = newNode.',
            hint: 'What should the last node in the list point to?',
          }
        };
      }
      if (op === 'insertAtPosition') {
        return {
          code: 'node.next = newNode; newNode.next = NULL',
          feedback: {
            type: 'lost_reference',
            message: '🔗 Lost Reference Error',
            explanation: 'You set newNode.next = NULL, cutting off the rest of the list!',
            reasoning: 'When inserting in the middle, newNode must point to the node that comes after it. Setting newNode.next = NULL orphans everything after the insertion point.',
            analogy: 'Imagine a chain of paper clips — you attach the new clip but forget to re-attach the right half.',
            keyPoint: 'Save the "rest" first: newNode.next = node.next, THEN node.next = newNode.',
            hint: 'newNode.next = NULL is only correct at the tail. What should newNode point to here?',
          }
        };
      }
      if (op === 'removeAtHead' || op === 'removeAtTail' || op === 'removeAtPosition') {
        return {
          code: 'free(head)',
          feedback: {
            type: 'lost_reference',
            message: '🔗 Lost Reference Error',
            explanation: 'You freed the node before saving a reference to what comes next!',
            reasoning: 'Once freed, the memory is gone. You lose access to the rest of the list.',
            keyPoint: 'Always: temp = nodeToFree → update pointers → free(temp).',
            hint: 'Save the node in a temp variable BEFORE disconnecting or freeing it.',
          }
        };
      }
      // fallback
      return {
        code: 'newNode.next = newNode',
        feedback: {
          type: 'lost_reference',
          message: '🔗 Lost Reference Error',
          explanation: 'newNode points back to itself — the list is broken.',
          reasoning: 'A node must point to the next node in the list (or NULL), never to itself.',
          keyPoint: 'Connect to the existing list, not to newNode itself.',
          hint: 'What should newNode.next point to?',
        }
      };
    }
  },

  // ── 2. Off-by-One ─────────────────────────────────────────────────────
  OFF_BY_ONE: {
    id: 'off_by_one',
    label: 'Off-by-One Error',
    generateDistractor: (op, pseudocode, params) => {
      if (op === 'insertAtTail') {
        return {
          code: 'while (node != NULL): node = node.next',
          feedback: {
            type: 'off_by_one',
            message: '📍 Off-by-One Error',
            explanation: 'Your loop runs one step too far — node becomes NULL before you try to use it!',
            reasoning: 'The loop should stop when node.next is NULL so node is the last node. Looping while node != NULL makes node end up as NULL, and the next line crashes.',
            keyPoint: 'Correct condition: while (node.next != NULL). Stop at the last node, not past it.',
            hint: 'What is the value of node when this loop finishes?',
          }
        };
      }
      if (op === 'removeAtTail') {
        return {
          code: 'while (node.next != NULL): node = node.next',
          feedback: {
            type: 'off_by_one',
            message: '📍 Off-by-One Error',
            explanation: 'Your loop stops at the LAST node, but you need the SECOND-TO-LAST!',
            reasoning: 'To remove the tail, you must update the second-to-last node\'s .next to NULL. If the loop stops at the tail itself, you have no way to do that.',
            analogy: 'To cut the last link in a chain, you need to hold the second-to-last link.',
            keyPoint: 'Use while (node.next.next != NULL) to stop one node early.',
            hint: 'Which node do you need to modify? Can you reach it if your loop ends at the tail?',
          }
        };
      }
      if (op === 'insertAtPosition' || op === 'removeAtPosition') {
        const pos = params?.position ?? 2;
        return {
          code: `while (i < ${pos}): node = node.next`,
          feedback: {
            type: 'off_by_one',
            message: '📍 Off-by-One Error',
            explanation: `Your loop goes to position ${pos}, but it should stop at position ${pos - 1}!`,
            reasoning: 'To insert or remove at a position, you need the node BEFORE it so you can update its .next pointer.',
            analogy: 'To add a bead at position 3, you hold position 2 and reach forward — not position 3 itself.',
            keyPoint: `Loop condition should be i < ${pos - 1}, not i < ${pos}.`,
            hint: 'You always need the predecessor node. Stop the loop one step earlier.',
          }
        };
      }
      // fallback
      return {
        code: 'while (node.next != NULL): node = node.next',
        feedback: {
          type: 'off_by_one',
          message: '📍 Off-by-One Error',
          explanation: 'Your loop goes one node too far.',
          reasoning: 'Most list modifications require the node BEFORE the target.',
          keyPoint: 'Adjust the loop condition to stop one node early.',
          hint: 'Check your loop condition — are you stopping at the right node?',
        }
      };
    }
  },

  // ── 3. Self-Loop ──────────────────────────────────────────────────────
  SELF_LOOP: {
    id: 'self_loop',
    label: 'Self-Pointing Loop Error',
    generateDistractor: (op) => {
      if (op === 'insertAtHead') {
        return {
          code: 'head = newNode; newNode.next = head',
          feedback: {
            type: 'self_loop',
            message: '🔄 Self-Pointing Loop Error',
            explanation: 'After head = newNode, head IS newNode — so newNode.next = head makes newNode point to itself!',
            reasoning: 'head = newNode changes head first. Now head and newNode refer to the same object. Setting newNode.next = head is the same as newNode.next = newNode.',
            analogy: 'You change your name tag, then write your new name as "talk to the person on the tag" — that\'s you!',
            keyPoint: 'Do newNode.next = head BEFORE head = newNode.',
            hint: 'What does head point to after "head = newNode"?',
          }
        };
      }
      // fallback (should not be reached given OP_ERROR_TYPES)
      return {
        code: 'newNode.next = newNode',
        feedback: {
          type: 'self_loop',
          message: '🔄 Self-Pointing Loop Error',
          explanation: 'newNode.next points back to newNode itself — traversal will loop forever.',
          reasoning: 'A node must point to the NEXT node in the list (or NULL), never to itself.',
          keyPoint: 'Set newNode.next to the correct existing node, not to newNode.',
          hint: 'What should newNode.next point to in this operation?',
        }
      };
    }
  },

  // ── 4. NULL Pointer ───────────────────────────────────────────────────
  NULL_POINTER: {
    id: 'null_pointer',
    label: 'NULL Pointer Error',
    generateDistractor: (op) => {
      if (op === 'removeAtHead') {
        return {
          code: 'head = NULL',
          feedback: {
            type: 'null_pointer',
            message: '⚠️ NULL Pointer Error',
            explanation: 'Setting head = NULL wipes out the entire list — all nodes become unreachable!',
            reasoning: 'head is the only entry point to the list. Setting it to NULL does not remove just the first node; it destroys your only reference to every node.',
            keyPoint: 'To remove the head: head = head.next. Never set head = NULL unless you intend to clear the whole list.',
            hint: 'What should head point to after removing the first node?',
          }
        };
      }
      if (op === 'removeAtTail') {
        return {
          code: 'while (node != NULL && node.next != NULL): node = node.next',
          feedback: {
            type: 'null_pointer',
            message: '⚠️ NULL Pointer Error',
            explanation: 'This loop has a NULL guard, but still stops at the LAST node, not the second-to-last!',
            reasoning: 'The NULL guard is good practice, but the stopping condition is still wrong. You need node.next.next != NULL to stop one node earlier.',
            keyPoint: 'Correct: while (node != NULL && node.next != NULL && node.next.next != NULL): node = node.next',
            hint: 'NULL safety and stopping position are two separate concerns.',
          }
        };
      }
      if (op === 'removeAtPosition') {
        return {
          code: 'node = node.next',
          feedback: {
            type: 'null_pointer',
            message: '⚠️ NULL Pointer Error',
            explanation: 'You advanced node without checking if node is NULL first!',
            reasoning: 'If node is NULL, accessing node.next will crash. Always guard before dereferencing.',
            keyPoint: 'Guard: if (node != NULL) before accessing node.next.',
            hint: 'Could node ever be NULL at this point in the code?',
          }
        };
      }
      // fallback
      return {
        code: 'node = node.next',
        feedback: {
          type: 'null_pointer',
          message: '⚠️ NULL Pointer Error',
          explanation: 'You advanced node without checking if node is NULL first!',
          reasoning: 'Dereferencing a NULL pointer crashes the program.',
          keyPoint: 'Guard every pointer dereference: if (node != NULL) first.',
          hint: 'Could node be NULL at this point?',
        }
      };
    }
  },

  // ── 5. Memory Leak ────────────────────────────────────────────────────
  MEMORY_LEAK: {
    id: 'memory_leak',
    label: 'Memory Leak Error',
    generateDistractor: (op) => {
      if (op === 'removeAtHead') {
        return {
          code: 'temp = head; head = head.next',
          feedback: {
            type: 'memory_leak',
            message: '💧 Memory Leak Error',
            explanation: 'You saved the old head and advanced the pointer, but never freed the old head node!',
            reasoning: 'temp = head saves the reference and head = head.next advances the pointer — but without free(temp), the old head node stays in memory forever.',
            keyPoint: 'Three steps required: temp = head → head = head.next → free(temp).',
            hint: 'You have temp pointing to the old head. What should you do with it?',
          }
        };
      }
      if (op === 'removeAtTail') {
        return {
          code: 'temp = node.next; node.next = NULL',
          feedback: {
            type: 'memory_leak',
            message: '💧 Memory Leak Error',
            explanation: 'You saved the tail and unlinked it, but never freed it!',
            reasoning: 'temp = node.next saves the tail reference and node.next = NULL unlinks it — but without free(temp), the tail node\'s memory is never returned.',
            keyPoint: 'After unlinking: always call free(temp) to return the memory.',
            hint: 'You have temp pointing to the removed node. What should you do with it?',
          }
        };
      }
      if (op === 'removeAtPosition') {
        return {
          code: 'temp = node.next; node.next = temp.next',
          feedback: {
            type: 'memory_leak',
            message: '💧 Memory Leak Error',
            explanation: 'You saved the target and bypassed it, but never freed it!',
            reasoning: 'temp = node.next saves the target and node.next = temp.next bypasses it — but without free(temp), the removed node\'s memory is never returned.',
            keyPoint: 'After bypassing: always call free(temp) to return the memory.',
            hint: 'You have temp pointing to the removed node. What should you do with it?',
          }
        };
      }
      // fallback
      return {
        code: 'temp = node.next; node.next = temp.next',
        feedback: {
          type: 'memory_leak',
          message: '💧 Memory Leak Error',
          explanation: 'You unlinked the node but never freed its memory!',
          reasoning: 'Unreachable memory that is never freed accumulates and eventually exhausts the heap.',
          keyPoint: 'Every removed node must be explicitly freed with free(temp).',
          hint: 'Is every removed node being freed?',
        }
      };
    }
  },
};

// ─────────────────────────────────────────────
// 4. OPERATION → ERROR TYPE MAPPING
// ─────────────────────────────────────────────

const OP_ERROR_TYPES = {
  insertAtHead:     ['LOST_REFERENCE', 'SELF_LOOP'],
  insertAtTail:     ['LOST_REFERENCE', 'OFF_BY_ONE'],
  removeAtHead:     ['LOST_REFERENCE', 'NULL_POINTER', 'MEMORY_LEAK'],
  removeAtTail:     ['LOST_REFERENCE', 'OFF_BY_ONE', 'NULL_POINTER', 'MEMORY_LEAK'],
  insertAtPosition: ['LOST_REFERENCE', 'OFF_BY_ONE'],
  removeAtPosition: ['LOST_REFERENCE', 'OFF_BY_ONE', 'NULL_POINTER', 'MEMORY_LEAK'],
};

const pickErrorTypes = (op, count = 2) => {
  const applicable = OP_ERROR_TYPES[op] ?? Object.keys(ERROR_TYPES);
  return shuffleArray([...applicable]).slice(0, Math.min(count, applicable.length));
};

// ─────────────────────────────────────────────
// 5. QUESTION BUILDERS
// ─────────────────────────────────────────────

const buildSingleOpQuestion = (op, listValues, params, errorTypeKeys) => {
  const tpl = TEMPLATES[op](params);

  const distractors = [];
  const distractorFeedbackMap = {};

  errorTypeKeys.forEach((key) => {
    const errType = ERROR_TYPES[key];
    const d = errType.generateDistractor(op, tpl.pseudocode, params);
    if (!distractors.includes(d.code) && !tpl.pseudocode.includes(d.code)) {
      distractors.push(d.code);
      distractorFeedbackMap[d.code] = d.feedback;
    }
  });

  let goalValues = [...listValues];
  if (op === 'insertAtHead') {
    goalValues = [params.insertValue, ...listValues];
  } else if (op === 'insertAtTail') {
    goalValues = [...listValues, params.insertValue];
  } else if (op === 'removeAtHead') {
    goalValues = listValues.slice(1);
  } else if (op === 'removeAtTail') {
    goalValues = listValues.slice(0, -1);
  } else if (op === 'insertAtPosition') {
    goalValues = [
      ...listValues.slice(0, params.position),
      params.insertValue,
      ...listValues.slice(params.position),
    ];
  } else if (op === 'removeAtPosition') {
    goalValues = [
      ...listValues.slice(0, params.position - 1),
      ...listValues.slice(params.position),
    ];
  }

  return {
    pseudocode: tpl.pseudocode,
    correctOrder: tpl.correctOrder,
    distractors,
    distractorFeedbackMap,
    hint: tpl.hint,
    operation: op,
    operationValue: params.insertValue ?? null,
    operationPosition: params.position ?? null,
    goalPattern: goalValues,
    hasComplexity: false,
    useNumbers: true,
  };
};

const buildCombinedOpQuestion = (op1, op2, listValues, params1, params2, errorTypeKeys) => {
  const tpl1 = TEMPLATES[op1](params1);
  const tpl2 = TEMPLATES[op2](params2);

  const pseudocode = [...tpl1.pseudocode, ...tpl2.pseudocode];
  const correctOrder = pseudocode.map((_, i) => i);

  const distractors = [];
  const distractorFeedbackMap = {};
  errorTypeKeys.forEach((key) => {
    const errType = ERROR_TYPES[key];
    const d = errType.generateDistractor(op1, pseudocode, params1);
    if (!distractors.includes(d.code) && !pseudocode.includes(d.code)) {
      distractors.push(d.code);
      distractorFeedbackMap[d.code] = d.feedback;
    }
  });

  let mid = [...listValues];
  if (op1 === 'insertAtHead') mid = [params1.insertValue, ...mid];
  else if (op1 === 'insertAtTail') mid = [...mid, params1.insertValue];
  else if (op1 === 'removeAtHead') mid = mid.slice(1);
  else if (op1 === 'removeAtTail') mid = mid.slice(0, -1);
  else if (op1 === 'insertAtPosition') mid = [...mid.slice(0, params1.position), params1.insertValue, ...mid.slice(params1.position)];
  else if (op1 === 'removeAtPosition') mid = [...mid.slice(0, params1.position - 1), ...mid.slice(params1.position)];

  let goal = [...mid];
  if (op2 === 'insertAtHead') goal = [params2.insertValue, ...goal];
  else if (op2 === 'insertAtTail') goal = [...goal, params2.insertValue];
  else if (op2 === 'removeAtHead') goal = goal.slice(1);
  else if (op2 === 'removeAtTail') goal = goal.slice(0, -1);
  else if (op2 === 'insertAtPosition') goal = [...goal.slice(0, params2.position), params2.insertValue, ...goal.slice(params2.position)];
  else if (op2 === 'removeAtPosition') goal = [...goal.slice(0, params2.position - 1), ...goal.slice(params2.position)];

  return {
    pseudocode,
    correctOrder,
    distractors,
    distractorFeedbackMap,
    hint: 'This question combines two operations. Figure out the correct full sequence for both.',
    operation: op1,
    operation2: op2,
    operationValue: params1.insertValue ?? null,
    operationPosition: params1.position ?? null,
    operationValue2: params2.insertValue ?? null,
    operationPosition2: params2.position ?? null,
    goalPattern: goal,
    hasComplexity: false,
    useNumbers: true,
    isCombined: true,
  };
};

// ─────────────────────────────────────────────
// 6. LEVEL GENERATORS
// ─────────────────────────────────────────────

const LEVEL1_OPS = ['insertAtHead', 'insertAtTail', 'removeAtHead', 'removeAtTail'];
const LEVEL2_OPS = ['insertAtPosition', 'removeAtPosition'];

const LEVEL3_PAIRS = [
  ['insertAtHead', 'removeAtTail'],
  ['insertAtTail', 'removeAtHead'],
  ['removeAtHead', 'insertAtTail'],
  ['removeAtTail', 'insertAtHead'],
  ['insertAtPosition', 'removeAtHead'],
  ['removeAtPosition', 'insertAtTail'],
  ['insertAtHead', 'insertAtPosition'],
  ['removeAtPosition', 'removeAtTail'],
];

export const generateLevel1Question = () => {
  const len = pick([3, 4]);
  const values = uniqueInts(len, 1, 20);
  const op = pick(LEVEL1_OPS);
  const errorKeys = pickErrorTypes(op, 2);
  const insertValue = pick(uniqueInts(1, 21, 50));
  const params = { insertValue };
  const q = buildSingleOpQuestion(op, values, params, errorKeys);
  return {
    id: `L1-${Date.now()}`,
    levelDifficulty: 1,
    title: opTitle(op),
    description: opDescription(op, params, values),
    initialNodes: buildNodes(values),
    ...q,
  };
};

export const generateLevel2Question = () => {
  const len = 5;
  const values = uniqueInts(len, 1, 30);
  const op = pick(LEVEL2_OPS);
  const errorKeys = pickErrorTypes(op, 2);
  const position = pick([2, 3, 4]);
  const insertValue = pick(uniqueInts(1, 31, 60));
  const params = { position, insertValue };
  const q = buildSingleOpQuestion(op, values, params, errorKeys);
  return {
    id: `L2-${Date.now()}`,
    levelDifficulty: 2,
    title: opTitle(op),
    description: opDescription(op, params, values),
    initialNodes: buildNodes(values),
    ...q,
  };
};

export const generateLevel3Question = () => {
  const len = pick([6, 7, 8]);
  const values = uniqueInts(len, 1, 50);
  const [op1, op2] = pick(LEVEL3_PAIRS);
  const errorKeys = pickErrorTypes(op1, 2);
  const position1 = pick([2, 3, 4]);
  const position2 = pick([2, 3]);
  const insertValue1 = pick(uniqueInts(1, 51, 80));
  const insertValue2 = pick(uniqueInts(1, 81, 99));
  const params1 = { position: position1, insertValue: insertValue1 };
  const params2 = { position: position2, insertValue: insertValue2 };
  const q = buildCombinedOpQuestion(op1, op2, values, params1, params2, errorKeys);
  return {
    id: `L3-${Date.now()}`,
    levelDifficulty: 3,
    title: `${opTitle(op1)} + ${opTitle(op2)}`,
    description: `Combined: ${opDescription(op1, params1, values)}. Then ${opDescription(op2, params2, values)}.`,
    initialNodes: buildNodes(values),
    ...q,
  };
};

// ─────────────────────────────────────────────
// 7. MAIN ENTRY POINT
// ─────────────────────────────────────────────

export const generateQuestion = (levelDifficulty) => {
  switch (levelDifficulty) {
    case 1: return generateLevel1Question();
    case 2: return generateLevel2Question();
    case 3: return generateLevel3Question();
    default: return generateLevel1Question();
  }
};

// ─────────────────────────────────────────────
// 8. LABEL HELPERS
// ─────────────────────────────────────────────

const OP_TITLES = {
  insertAtHead:     'Insert at Head',
  insertAtTail:     'Insert at Tail',
  removeAtHead:     'Remove at Head',
  removeAtTail:     'Remove at Tail',
  insertAtPosition: 'Insert at Position',
  removeAtPosition: 'Remove at Position',
};

const opTitle = (op) => OP_TITLES[op] ?? op;

const opDescription = (op, params, values) => {
  switch (op) {
    case 'insertAtHead':
      return `Insert ${params.insertValue} at the beginning of the list [${values.join(' → ')}]`;
    case 'insertAtTail':
      return `Insert ${params.insertValue} at the end of the list [${values.join(' → ')}]`;
    case 'removeAtHead':
      return `Remove the first node from [${values.join(' → ')}]`;
    case 'removeAtTail':
      return `Remove the last node from [${values.join(' → ')}]`;
    case 'insertAtPosition':
      return `Insert ${params.insertValue} at position ${params.position} in [${values.join(' → ')}]`;
    case 'removeAtPosition':
      return `Remove the node at position ${params.position} from [${values.join(' → ')}]`;
    default:
      return op;
  }
};
