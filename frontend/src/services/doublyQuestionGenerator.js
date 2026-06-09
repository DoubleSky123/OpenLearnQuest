/**
 * DOUBLY LINKED LIST — QUESTION GENERATOR
 *
 * Level 1 — Single head/tail operation, list length 3–4
 * Level 2 — Single positional operation, list length 5
 * Level 3 — Two combined operations, list length 6–8
 *
 * Key difference from singly: every operation maintains BOTH next AND prev.
 * Extra error type: BROKEN_PREV (forgetting to wire a prev pointer).
 *
 * VARIABLE NAMING CONVENTION:
 *   traversal pointer : node
 *   saved for free    : temp
 *   new node          : newNode
 *   head pointer      : head
 *   loop counter      : i
 */

import { shuffleArray } from '../utils/helpers.js';
import { uniqueInts, pick, buildDLLNodes as buildNodes } from './questionGeneratorCommon.js';

// ─────────────────────────────────────────────────────────────────────────────
// 2. CORRECT PSEUDOCODE TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────
//
// MASTER LIST — every string that can legally appear as a correct DLL code block:
//
//  insertAtHead     : "create newNode"
//                     "newNode.next = head"
//                     "newNode.prev = NULL"
//                     "head.prev = newNode"
//                     "head = newNode"
//
//  insertAtTail     : "while (node.next != NULL): node = node.next"
//                     "create newNode"
//                     "newNode.prev = node"
//                     "newNode.next = NULL"
//                     "node.next = newNode"
//
//  removeAtHead     : "temp = head"
//                     "head = head.next"
//                     "head.prev = NULL"
//                     "free(temp)"
//
//  removeAtTail     : "while (node.next != NULL): node = node.next"
//                     "temp = node"
//                     "node.prev.next = NULL"
//                     "free(temp)"
//
//  insertAtPosition : "while (i < N-1): node = node.next"
//                     "create newNode"
//                     "newNode.next = node.next"
//                     "newNode.prev = node"
//                     "node.next.prev = newNode"
//                     "node.next = newNode"
//
//  removeAtPosition : "while (i < N-1): node = node.next"
//                     "temp = node.next"
//                     "node.next = temp.next"
//                     "temp.next.prev = node"
//                     "free(temp)"

const TEMPLATES = {

  insertAtHead: () => ({
    pseudocode: [
      'create newNode',
      'newNode.next = head',
      'newNode.prev = NULL',
      'head.prev = newNode',
      'head = newNode',
    ],
    correctOrder: [0, 1, 2, 3, 4],
    hint: 'Wire BOTH newNode.next and newNode.prev, update the old head\'s prev, THEN move head.',
  }),

  insertAtTail: () => ({
    pseudocode: [
      'node = head',
      'while (node.next != NULL): node = node.next',
      'create newNode',
      'newNode.prev = node',
      'newNode.next = NULL',
      'node.next = newNode',
    ],
    correctOrder: [0, 1, 2, 3, 4, 5],
    validOrders: [
      [0, 1, 2, 3, 4, 5],  // node=head, while, create, ...
      [0, 2, 1, 3, 4, 5],  // node=head, create, while, ...
      [2, 0, 1, 3, 4, 5],  // create, node=head, while, ...
    ],
    hint: 'Traverse to the tail, then set BOTH newNode.prev (backward link) and node.next (forward link).',
  }),

  removeAtHead: () => ({
    pseudocode: [
      'temp = head',
      'head = head.next',
      'head.prev = NULL',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2, 3],
    hint: 'Save old head, advance head, clear the new head\'s prev pointer, then free.',
  }),

  removeAtTail: () => ({
    pseudocode: [
      'node = head',
      'while (node.next != NULL): node = node.next',
      'temp = node',
      'node.prev.next = NULL',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2, 3, 4],
    hint: 'Traverse to the tail, save it in temp, disconnect via its predecessor\'s next pointer, then free.',
  }),

  insertAtPosition: ({ position }) => ({
    pseudocode: [
      'node = head',
      'i = 0',
      `while (i < ${position - 1}): node = node.next`,
      'create newNode',
      'newNode.next = node.next',
      'newNode.prev = node',
      'node.next.prev = newNode',
      'node.next = newNode',
    ],
    correctOrder: [0, 1, 2, 3, 4, 5, 6, 7],
    validOrders: [
      [0, 1, 2, 3, 4, 5, 6, 7],  // node=head, i=0, while, create, ...
      [1, 0, 2, 3, 4, 5, 6, 7],  // i=0, node=head, while, create, ...
      [0, 1, 3, 2, 4, 5, 6, 7],  // node=head, i=0, create, while, ...
      [1, 0, 3, 2, 4, 5, 6, 7],  // i=0, node=head, create, while, ...
      [3, 0, 1, 2, 4, 5, 6, 7],  // create, node=head, i=0, while, ...
      [3, 1, 0, 2, 4, 5, 6, 7],  // create, i=0, node=head, while, ...
    ],
    hint: `Stop at position ${position - 1}. Wire newNode's next and prev first, then fix the successor's prev, then link node.next.`,
  }),

  removeAtPosition: ({ position }) => ({
    pseudocode: [
      'node = head',
      'i = 0',
      `while (i < ${position - 1}): node = node.next`,
      'temp = node.next',
      'node.next = temp.next',
      'temp.next.prev = node',
      'free(temp)',
    ],
    correctOrder: [0, 1, 2, 3, 4, 5, 6],
    validOrders: [
      [0, 1, 2, 3, 4, 5, 6],  // node=head, i=0, while, ...
      [1, 0, 2, 3, 4, 5, 6],  // i=0, node=head, while, ...
    ],
    hint: `Stop at position ${position - 1}. Save the target, bypass it in BOTH directions (next and prev), then free.`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. DISTRACTOR CATALOGUE
// ─────────────────────────────────────────────────────────────────────────────
//
// RULES — every distractor MUST satisfy ALL of the following:
//   R1. Single line (no semicolons joining two statements)
//   R2. Must NOT appear anywhere in the MASTER LIST above
//   R3. Must look like real code (no plain-English descriptions)
//   R4. Uses only: node, temp, newNode, head, i  (consistent naming)
//   R5. Represents a semantically meaningful DLL mistake
//
// VERIFICATION TABLE:
//
//  insertAtHead   LOST_REF     "newNode.next = NULL"
//    ✓ R1 single line
//    ✓ R2 not in insertAtHead correct code (insertAtTail has it but
//         buildSingleOpQuestion guard checks tpl.pseudocode at runtime)
//    ✓ R3–R5: severs forward link to existing list
//
//  insertAtHead   BROKEN_PREV  "newNode.prev = head"
//    ✓ R1 single line
//    ✓ R2 not in any correct code ("newNode.prev = NULL" is correct here)
//    ✓ R3–R5: sets prev to old head instead of NULL — wrong for the new head node
//
//  insertAtTail   LOST_REF     "newNode.next = newNode"
//    ✓ R1–R5: self-reference, not in any correct code
//
//  insertAtTail   BROKEN_PREV  "newNode.prev = NULL"
//    ✓ R1 single line
//    ✓ R2 not in insertAtTail correct code ("newNode.prev = node" is correct)
//    ✓ R3–R5: loses backward link to predecessor
//
//  insertAtTail   OFF_BY_ONE   "while (node != NULL): node = node.next"
//    ✓ R1–R5: overshoots tail, not in any correct code
//
//  removeAtHead   LOST_REF     "free(head)"
//    ✓ R1–R5: frees without saving, not in any correct code
//
//  removeAtHead   BROKEN_PREV  "head.prev = head"
//    ✓ R1 single line
//    ✓ R2 not in any correct code ("head.prev = NULL" is correct)
//    ✓ R3–R5: self-loop on prev pointer
//
//  removeAtHead   NULL_PTR     "head = NULL"
//    ✓ R1–R5: wipes entire list, not in any correct code
//
//  removeAtHead   MEMORY_LEAK  "head = temp"
//    ✓ R1 single line
//    ✓ R2 not in any correct code
//    ✓ R3–R5: reverses assignment — temp uninitialised, old head leaked
//
//  removeAtTail   LOST_REF     "free(head)"
//    ✓ R1–R5: not in any correct code
//
//  removeAtTail   BROKEN_PREV  "node.next = NULL"
//    ✓ R1 single line
//    ✓ R2 not in removeAtTail DLL correct code (correct is "node.prev.next = NULL")
//    ✓ R3–R5: uses next direction instead of prev to disconnect tail — wrong in DLL
//
//  removeAtTail   OFF_BY_ONE   "while (node != NULL): node = node.next"
//    ✓ R1–R5: overshoots tail, not in any correct code
//
//  removeAtTail   MEMORY_LEAK  "temp = node.next"
//    ✓ R1 single line
//    ✓ R2 "temp = node.next" is NOT in removeAtTail correct code
//         (removeAtTail correct is "temp = node"; removeAtPosition has
//          "temp = node.next" but runtime guard handles that)
//    ✓ R3–R5: saves wrong node (successor instead of tail itself)
//
//  insertAtPosition LOST_REF   "newNode.next = node"
//    ✓ R1 single line
//    ✓ R2 not in any correct code ("newNode.next = node.next" is correct,
//         "node.next = newNode" is correct — neither equals "newNode.next = node")
//    ✓ R3–R5: points newNode's next to predecessor instead of successor — backward loop
//
//  insertAtPosition BROKEN_PREV "newNode.prev = NULL"
//    ✓ R1 single line
//    ✓ R2 not in insertAtPosition correct code ("newNode.prev = node" is correct)
//    ✓ R3–R5: loses backward link — only valid at head
//
//  insertAtPosition OFF_BY_ONE  "while (i < N): node = node.next"  (N = position)
//    ✓ R1–R5: one step too many, string differs from correct "while (i < N-1)"
//
//  removeAtPosition LOST_REF   "free(head)"
//    ✓ R1–R5
//
//  removeAtPosition OFF_BY_ONE  "while (i < N): node = node.next"  (N = position)
//    ✓ R1–R5
//
//  removeAtPosition MEMORY_LEAK "node.next = temp.next"
//    ✗ REJECTED — "node.next = temp.next" IS in removeAtPosition correct code
//    → use "free(node.next)"
//    ✓ R1 single line
//    ✓ R2 "free(node.next)" not in any correct code
//    ✓ R3–R5: frees target without saving/bypassing first
//
//  removeAtPosition NULL_PTR    "node.next.prev = NULL"
//    ✓ R1 single line
//    ✓ R2 not in any correct code ("temp.next.prev = node" is correct)
//    ✓ R3–R5: sets successor's prev to NULL instead of node — breaks backward chain

export const DLL_ERROR_TYPES = {

  // ── 1. Lost Reference ────────────────────────────────────────────────────
  LOST_REFERENCE: {
    id: 'lost_reference',
    label: 'Lost Reference Error',
    generateDistractor: (op) => {

      if (op === 'insertAtHead') return {
        code: 'newNode.next = NULL',
        feedback: {
          type: 'lost_reference',
          message: '🔗 Lost Reference Error',
          explanation: 'Setting newNode.next = NULL severs the forward link to the existing list!',
          reasoning: 'newNode.next must point to the current head so the existing list stays reachable. NULL here orphans every node that was already in the list.',
          keyPoint: 'newNode.next = NULL is only correct at the tail. Here you need newNode.next = head.',
          hint: 'What does newNode.next need to point to so the existing list is not lost?',
        },
      };

      if (op === 'insertAtTail') return {
        code: 'newNode.next = newNode',
        feedback: {
          type: 'lost_reference',
          message: '🔗 Lost Reference Error',
          explanation: 'newNode.next = newNode makes the new tail point to itself — an infinite forward loop!',
          reasoning: 'The new tail must end the list by pointing to NULL. A self-pointer breaks any forward traversal.',
          keyPoint: 'The new tail must have newNode.next = NULL, not newNode.next = newNode.',
          hint: 'What should the very last node in a linked list point to?',
        },
      };

      if (op === 'removeAtTail') return {
        code: 'free(node)',
        feedback: {
          type: 'lost_reference',
          message: '🔗 Lost Reference Error',
          explanation: 'free(node) releases the predecessor, not the tail — and you never disconnected the tail!',
          reasoning: 'You need to save the tail in temp, then disconnect it via node.prev.next = NULL, then free(temp). Freeing node destroys the wrong node and leaves the tail dangling.',
          keyPoint: 'temp = node → node.prev.next = NULL → free(temp).',
          hint: 'Which node are you trying to remove — node, or node itself? Save it in temp first.',
        },
      };

      // insertAtPosition | removeAtPosition fallback
      return {
        code: 'newNode.next = node',
        feedback: {
          type: 'lost_reference',
          message: '🔗 Lost Reference Error',
          explanation: 'newNode.next = node points the new node back to its predecessor — the successor chain is lost!',
          reasoning: 'newNode.next must point to node.next (the successor), not to node (the predecessor). Using node here creates a backward loop and orphans every node after the insertion point.',
          analogy: 'Like a detour sign pointing back the way you came instead of forward.',
          keyPoint: 'Correct: newNode.next = node.next (point to the SUCCESSOR, not the predecessor).',
          hint: 'newNode comes AFTER node. What node should follow newNode in the list?',
        },
      };
    },
  },

  // ── 2. Broken Prev Pointer ───────────────────────────────────────────────
  BROKEN_PREV: {
    id: 'broken_prev',
    label: 'Broken Prev-Pointer Error',
    generateDistractor: (op) => {

      if (op === 'insertAtHead') return {
        code: 'newNode.prev = head',
        feedback: {
          type: 'broken_prev',
          message: '🔙 Broken Prev-Pointer Error',
          explanation: 'newNode.prev = head points backward to the old head — but newNode IS the new head, so its prev must be NULL!',
          reasoning: 'The head node of a DLL always has prev = NULL. Setting newNode.prev = head creates a backward link to the old head, which is wrong.',
          keyPoint: 'Correct: newNode.prev = NULL — the new head has no predecessor.',
          hint: 'What is the correct prev value for the head node of a doubly linked list?',
        },
      };

      if (op === 'insertAtTail') return {
        code: 'newNode.prev = NULL',
        feedback: {
          type: 'broken_prev',
          message: '🔙 Broken Prev-Pointer Error',
          explanation: 'newNode.prev = NULL loses the backward link to its predecessor!',
          reasoning: 'The new tail must remember the node before it. newNode.prev = node establishes that backward link. NULL here breaks backward traversal.',
          keyPoint: 'newNode.prev = node (the node you stopped at after traversal), not NULL.',
          hint: 'Which node comes right before newNode? newNode should point back to it.',
        },
      };

      if (op === 'removeAtHead') return {
        code: 'head.prev = head',
        feedback: {
          type: 'broken_prev',
          message: '🔙 Broken Prev-Pointer Error',
          explanation: 'head.prev = head makes the new head point back to itself — a backward self-loop!',
          reasoning: 'After advancing head, the new head has no predecessor and must have prev = NULL. Pointing to itself creates an infinite backward cycle.',
          keyPoint: 'Correct: head.prev = NULL — the head node always has prev = NULL.',
          hint: 'What is the correct prev value for the new head node?',
        },
      };

      if (op === 'removeAtTail') return {
        code: 'node.next = NULL',
        feedback: {
          type: 'broken_prev',
          message: '🔙 Broken Prev-Pointer Error',
          explanation: 'node.next = NULL tries to disconnect the tail via the next pointer — but in a DLL you must go through the prev pointer!',
          reasoning: 'node IS the tail, so node.next is already NULL. Setting it again does nothing. The correct way to unlink the tail is node.prev.next = NULL, which uses the prev pointer to reach the predecessor and cut its forward link.',
          keyPoint: 'Correct: node.prev.next = NULL — reach the predecessor via prev, then set its next to NULL.',
          hint: 'node is the tail. How do you reach the node before it to disconnect it?',
        },
      };

      // insertAtPosition | removeAtPosition fallback
      return {
        code: 'newNode.prev = NULL',
        feedback: {
          type: 'broken_prev',
          message: '🔙 Broken Prev-Pointer Error',
          explanation: 'newNode.prev = NULL is only correct at the head — in the middle of the list it breaks backward traversal!',
          reasoning: 'DLL invariant: every non-head node must have prev pointing to its predecessor. newNode.prev = NULL here orphans the left half from backward traversal.',
          keyPoint: 'newNode.prev = node (the predecessor at the insertion point).',
          hint: 'Which node comes right before newNode? That is what newNode.prev should point to.',
        },
      };
    },
  },

  // ── 3. Off-by-One ────────────────────────────────────────────────────────
  OFF_BY_ONE: {
    id: 'off_by_one',
    label: 'Off-by-One Error',
    generateDistractor: (op, _pc, params) => {

      if (op === 'insertAtTail' || op === 'removeAtTail') return {
        code: 'while (node != NULL): node = node.next',
        feedback: {
          type: 'off_by_one',
          message: '📍 Off-by-One Error',
          explanation: 'This loop overshoots — node becomes NULL and the next line crashes!',
          reasoning: 'You need node to be the last valid node (node.next == NULL). Continuing while node != NULL walks one step past the tail into NULL.',
          keyPoint: 'Correct: while (node.next != NULL): node = node.next',
          hint: 'What is the value of node when this loop exits?',
        },
      };

      // insertAtPosition | removeAtPosition
      const pos = params?.position ?? 2;
      return {
        code: `while (i < ${pos}): node = node.next`,
        feedback: {
          type: 'off_by_one',
          message: '📍 Off-by-One Error',
          explanation: `Your loop goes to position ${pos} but should stop at position ${pos - 1}!`,
          reasoning: 'You need the predecessor node so you can rewire its next and the successor\'s prev. Stopping one step too late means you are at the target, not before it.',
          keyPoint: `Correct loop condition: i < ${pos - 1}, not i < ${pos}.`,
          hint: 'You always need the node BEFORE the target. Stop one step earlier.',
        },
      };
    },
  },

  // ── 4. NULL Pointer ──────────────────────────────────────────────────────
  NULL_POINTER: {
    id: 'null_pointer',
    label: 'NULL Pointer Error',
    generateDistractor: (op) => {

      if (op === 'removeAtHead') return {
        code: 'head = NULL',
        feedback: {
          type: 'null_pointer',
          message: '⚠️ NULL Pointer Error',
          explanation: 'Setting head = NULL destroys the entire list — nothing is reachable anymore!',
          reasoning: 'head is the sole entry point to the list. Nulling it does not remove just the first node; it destroys your only reference to everything.',
          keyPoint: 'To remove just the head: head = head.next, then head.prev = NULL.',
          hint: 'What should head point to after the first node is removed?',
        },
      };

      // insertAtPosition | removeAtPosition fallback
      return {
        code: 'node.next.prev = NULL',
        feedback: {
          type: 'null_pointer',
          message: '⚠️ NULL Pointer Error',
          explanation: 'Setting the successor\'s prev to NULL breaks backward traversal through this node!',
          reasoning: 'After inserting or removing, the successor\'s prev must point to the correct predecessor (newNode or node), not NULL. NULL here breaks the backward chain.',
          keyPoint: 'node.next.prev = newNode for insertion, or temp.next.prev = node for removal.',
          hint: 'NULL is only correct for the head\'s prev. What should the successor\'s prev point to here?',
        },
      };
    },
  },

  // ── 5. Memory Leak ───────────────────────────────────────────────────────
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
          reasoning: 'The correct sequence is temp = head (save), then head = head.next (advance). Writing head = temp reverses step 1 and makes no sense — temp has no useful value yet, and the old head is never freed.',
          keyPoint: 'Order matters: temp = head → head = head.next → head.prev = NULL → free(temp).',
          hint: 'Which direction should the assignment go to save the old head?',
        },
      };

      if (op === 'removeAtTail') return {
        code: 'temp = node.next',
        feedback: {
          type: 'memory_leak',
          message: '💧 Memory Leak Error',
          explanation: 'temp = node.next tries to save the node AFTER the tail — but the tail has no next!',
          reasoning: 'In removeAtTail you traverse until node IS the tail (node.next == NULL). node.next is NULL at this point, so temp = node.next gives you NULL, not the tail. The tail is never saved and cannot be freed.',
          keyPoint: 'Correct: temp = node (save the tail itself, not node.next which is NULL).',
          hint: 'After the loop, what does node.next equal? Is that what you want to free?',
        },
      };

      // removeAtPosition fallback
      return {
        code: 'free(node.next)',
        feedback: {
          type: 'memory_leak',
          message: '💧 Memory Leak Error',
          explanation: 'free(node.next) releases the target without saving it or bypassing it first!',
          reasoning: 'You must save the target in temp and rewire both node.next and temp.next.prev BEFORE freeing. Freeing first leaves node.next dangling and loses the pointer to the rest of the list.',
          keyPoint: 'Always: temp = node.next → node.next = temp.next → temp.next.prev = node → free(temp).',
          hint: 'What needs to be rewired BEFORE you free the target node?',
        },
      };
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. OPERATION → APPLICABLE ERROR TYPES
// ─────────────────────────────────────────────────────────────────────────────

const OP_ERROR_TYPES = {
  insertAtHead:     ['LOST_REFERENCE', 'BROKEN_PREV'],
  insertAtTail:     ['LOST_REFERENCE', 'BROKEN_PREV', 'OFF_BY_ONE'],
  removeAtHead:     ['LOST_REFERENCE', 'BROKEN_PREV', 'NULL_POINTER', 'MEMORY_LEAK'],
  removeAtTail:     ['LOST_REFERENCE', 'BROKEN_PREV', 'OFF_BY_ONE', 'MEMORY_LEAK'],
  insertAtPosition: ['LOST_REFERENCE', 'BROKEN_PREV', 'OFF_BY_ONE'],
  removeAtPosition: ['LOST_REFERENCE', 'OFF_BY_ONE', 'MEMORY_LEAK', 'NULL_POINTER'],
};

const pickErrorTypes = (op, count = 2) => {
  const applicable = OP_ERROR_TYPES[op] ?? Object.keys(DLL_ERROR_TYPES);
  return shuffleArray([...applicable]).slice(0, Math.min(count, applicable.length));
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. QUESTION BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

const buildSingleOpQuestion = (op, listValues, params, errorTypeKeys) => {
  const tpl = TEMPLATES[op](params);

  const distractors = [];
  const distractorFeedbackMap = {};

  errorTypeKeys.forEach((key) => {
    const d = DLL_ERROR_TYPES[key].generateDistractor(op, tpl.pseudocode, params);
    // Guard: skip if duplicate or accidentally matches a correct line
    if (!distractors.includes(d.code) && !tpl.pseudocode.includes(d.code)) {
      distractors.push(d.code);
      distractorFeedbackMap[d.code] = d.feedback;
    }
  });

  let goalValues = [...listValues];
  if      (op === 'insertAtHead')     goalValues = [params.insertValue, ...listValues];
  else if (op === 'insertAtTail')     goalValues = [...listValues, params.insertValue];
  else if (op === 'removeAtHead')     goalValues = listValues.slice(1);
  else if (op === 'removeAtTail')     goalValues = listValues.slice(0, -1);
  else if (op === 'insertAtPosition') goalValues = [...listValues.slice(0, params.position), params.insertValue, ...listValues.slice(params.position)];
  else if (op === 'removeAtPosition') goalValues = [...listValues.slice(0, params.position - 1), ...listValues.slice(params.position)];

  return {
    pseudocode:           tpl.pseudocode,
    correctOrder:         tpl.correctOrder,
    ...(tpl.validOrders && { validOrders: tpl.validOrders }),
    distractors,
    distractorFeedbackMap,
    hint:                 tpl.hint,
    operation:            op,
    operationValue:       params.insertValue ?? null,
    operationPosition:    params.position    ?? null,
    goalPattern:          goalValues,
    hasComplexity:        false,
    useNumbers:           true,
  };
};

const buildCombinedOpQuestion = (op1, op2, listValues, params1, params2, errorTypeKeys) => {
  const tpl1 = TEMPLATES[op1](params1);
  const tpl2 = TEMPLATES[op2](params2);
  const pseudocode   = [...tpl1.pseudocode, ...tpl2.pseudocode];
  const correctOrder = pseudocode.map((_, i) => i);

  const distractors = [];
  const distractorFeedbackMap = {};
  errorTypeKeys.forEach((key) => {
    const d = DLL_ERROR_TYPES[key].generateDistractor(op1, pseudocode, params1);
    if (!distractors.includes(d.code) && !pseudocode.includes(d.code)) {
      distractors.push(d.code);
      distractorFeedbackMap[d.code] = d.feedback;
    }
  });

  let mid = [...listValues];
  if      (op1 === 'insertAtHead')     mid = [params1.insertValue, ...mid];
  else if (op1 === 'insertAtTail')     mid = [...mid, params1.insertValue];
  else if (op1 === 'removeAtHead')     mid = mid.slice(1);
  else if (op1 === 'removeAtTail')     mid = mid.slice(0, -1);
  else if (op1 === 'insertAtPosition') mid = [...mid.slice(0, params1.position), params1.insertValue, ...mid.slice(params1.position)];
  else if (op1 === 'removeAtPosition') mid = [...mid.slice(0, params1.position - 1), ...mid.slice(params1.position)];

  let goal = [...mid];
  if      (op2 === 'insertAtHead')     goal = [params2.insertValue, ...goal];
  else if (op2 === 'insertAtTail')     goal = [...goal, params2.insertValue];
  else if (op2 === 'removeAtHead')     goal = goal.slice(1);
  else if (op2 === 'removeAtTail')     goal = goal.slice(0, -1);
  else if (op2 === 'insertAtPosition') goal = [...goal.slice(0, params2.position), params2.insertValue, ...goal.slice(params2.position)];
  else if (op2 === 'removeAtPosition') goal = [...goal.slice(0, params2.position - 1), ...goal.slice(params2.position)];

  return {
    pseudocode,
    correctOrder,
    distractors,
    distractorFeedbackMap,
    hint:               'Two operations combined — wire ALL next and prev pointers correctly for each step.',
    operation:          op1,
    operation2:         op2,
    operationValue:     params1.insertValue ?? null,
    operationPosition:  params1.position    ?? null,
    operationValue2:    params2.insertValue ?? null,
    operationPosition2: params2.position    ?? null,
    goalPattern:        goal,
    hasComplexity:      false,
    useNumbers:         true,
    isCombined:         true,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. LEVEL GENERATORS
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL1_OPS = ['insertAtHead', 'insertAtTail', 'removeAtHead', 'removeAtTail'];
const LEVEL2_OPS = ['insertAtPosition', 'removeAtPosition'];
const LEVEL3_PAIRS = [
  ['insertAtHead',     'removeAtTail'],
  ['insertAtTail',     'removeAtHead'],
  ['removeAtHead',     'insertAtTail'],
  ['removeAtTail',     'insertAtHead'],
  ['insertAtPosition', 'removeAtHead'],
  ['removeAtPosition', 'insertAtTail'],
];

export const generateDLLLevel1Question = () => {
  const values      = uniqueInts(pick([3, 4]), 1, 20);
  const op          = pick(LEVEL1_OPS);
  const insertValue = pick(uniqueInts(1, 21, 50));
  const params      = { insertValue };
  const errorKeys   = pickErrorTypes(op, 2);
  const q           = buildSingleOpQuestion(op, values, params, errorKeys);
  return { id: `DLL-L1-${Date.now()}`, levelDifficulty: 1, title: opTitle(op), description: opDescription(op, params, values), initialNodes: buildNodes(values), ...q };
};

export const generateDLLLevel2Question = () => {
  const values      = uniqueInts(5, 1, 30);
  const op          = pick(LEVEL2_OPS);
  const position    = pick([2, 3, 4]);
  const insertValue = pick(uniqueInts(1, 31, 60));
  const params      = { position, insertValue };
  const errorKeys   = pickErrorTypes(op, 2);
  const q           = buildSingleOpQuestion(op, values, params, errorKeys);
  return { id: `DLL-L2-${Date.now()}`, levelDifficulty: 2, title: opTitle(op), description: opDescription(op, params, values), initialNodes: buildNodes(values), ...q };
};

export const generateDLLLevel3Question = () => {
  const values      = uniqueInts(pick([6, 7, 8]), 1, 50);
  const [op1, op2]  = pick(LEVEL3_PAIRS);
  const params1     = { position: pick([2, 3, 4]), insertValue: pick(uniqueInts(1, 51, 80)) };
  const params2     = { position: pick([2, 3]),    insertValue: pick(uniqueInts(1, 81, 99)) };
  const errorKeys   = pickErrorTypes(op1, 2);
  const q           = buildCombinedOpQuestion(op1, op2, values, params1, params2, errorKeys);
  return {
    id: `DLL-L3-${Date.now()}`,
    levelDifficulty: 3,
    title: `${opTitle(op1)} + ${opTitle(op2)}`,
    description: `Combined: ${opDescription(op1, params1, values)}. Then ${opDescription(op2, params2, values)}.`,
    initialNodes: buildNodes(values),
    ...q,
  };
};

export const generateDLLQuestion = (levelDifficulty) => {
  switch (levelDifficulty) {
    case 1:  return generateDLLLevel1Question();
    case 2:  return generateDLLLevel2Question();
    case 3:  return generateDLLLevel3Question();
    default: return generateDLLLevel1Question();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. LABEL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const OP_TITLES = {
  insertAtHead:     'DLL Insert at Head',
  insertAtTail:     'DLL Insert at Tail',
  removeAtHead:     'DLL Remove at Head',
  removeAtTail:     'DLL Remove at Tail',
  insertAtPosition: 'DLL Insert at Position',
  removeAtPosition: 'DLL Remove at Position',
};

const opTitle = (op) => OP_TITLES[op] ?? op;

const opDescription = (op, params, values) => {
  const list = values.join(' ⇄ ');
  switch (op) {
    case 'insertAtHead':     return `Insert ${params.insertValue} at the head of [${list}]`;
    case 'insertAtTail':     return `Insert ${params.insertValue} at the tail of [${list}]`;
    case 'removeAtHead':     return `Remove the head of [${list}]`;
    case 'removeAtTail':     return `Remove the tail of [${list}]`;
    case 'insertAtPosition': return `Insert ${params.insertValue} at position ${params.position} in [${list}]`;
    case 'removeAtPosition': return `Remove node at position ${params.position} from [${list}]`;
    default:                 return op;
  }
};

export const DLL_LEVEL_TEMPLATES = [
  { id: 1, label: 'Level 1', difficulty: 'Beginner',     description: 'Single head/tail operation. Short list (3–4 nodes).',  operations: ['insertAtHead', 'insertAtTail', 'removeAtHead', 'removeAtTail'] },
  { id: 2, label: 'Level 2', difficulty: 'Intermediate', description: 'Single positional operation. Medium list (5 nodes).', operations: ['insertAtPosition', 'removeAtPosition'] },
  { id: 3, label: 'Level 3', difficulty: 'Advanced',     description: 'Two combined operations. Longer list (6–8 nodes).',   operations: ['combined'] },
];
