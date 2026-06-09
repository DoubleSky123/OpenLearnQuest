/**
 * Operation-aware pet message bank.
 *
 * Structure per operation:
 *   wrong        — shown on wrong answer (all emotions, unless stressed overrides)
 *   stepCorrect  — shown after each correct step (stressed only)
 *   success      — shown on full question completion (all emotions)
 *
 * Keyed by question ID (q.id from TutorialGame) or operation string (q.operation
 * from Training/Challenge). Falls back to `_default` if key not found.
 *
 * Coverage so far:
 *   Phase 0  → Tutorial: tut-insert-head, tut-remove-head
 *   Phase 0+ → Training / Challenge: to be added
 *   Phase 2  → replace hardcoded banks with Claude API call
 */

export const OPERATION_MESSAGES = {

  // ── Tutorial: Insert at Head ────────────────────────────────────────────────
  // Steps: create newNode → newNode.next = head → head = newNode
  'tut-insert-head': {
    wrong: [
      'All three lines use the same variable — the one you just created.',
      'Think: what name did you give the new node when creating it?',
      'Every blank in this operation refers to the same new variable.',
    ],
    stepCorrect: [
      'Right — keep going. What does the next line need to do?',
      'Good. One step done — now think about the next pointer.',
      'Correct! You\'re building the insertion step by step.',
    ],
    success: [
      'Key rule: newNode.next = head BEFORE head = newNode. Swap those two and the rest of the list is gone.',
      'Head insertion is O(1) — no traversal, just 2 pointer changes. Fast because nothing needs to be scanned.',
      'Pattern to remember: create → link to existing → update entry point. You\'ll see this in many insertions.',
    ],
  },

  // ── Tutorial: Remove at Head ────────────────────────────────────────────────
  // Steps: temp = head → head = head.next → free(temp)
  'tut-remove-head': {
    wrong: [
      'Before moving head, you need to save it — what variable do we use to hold a node temporarily?',
      'You want to advance head to the second node. Which property of head gets you there?',
      'free() needs a reference to the node being deleted. Did you save that reference in an earlier line?',
    ],
    stepCorrect: [
      'Good — the old head is saved. Now head can safely move forward.',
      'Right — head is now at the second node. One last thing to do.',
      'Correct! Almost there — what needs to be cleaned up?',
    ],
    success: [
      'Pattern: save → advance → free. Skip "save" and free() has nothing to work with — memory leak.',
      'Without temp, after head = head.next the original first node is unreachable AND unfree-able in C.',
      'In C nothing is automatic — you save it, you free it. This 3-step pattern appears in every deletion.',
    ],
  },

  // ── Fallback (used when operationId not in the bank yet) ───────────────────
  _default: {
    wrong: [
      'Check the hint — it describes exactly what this line needs to accomplish.',
      'Think about what state the list is in right now, and what needs to change.',
      'Re-read the line: what variable or keyword belongs in the blank?',
    ],
    stepCorrect: [
      'Good — keep going, you\'re on the right track.',
      'Correct! What does the next step need to do?',
      'Right — one piece at a time.',
    ],
    success: [
      'Well done — you got the order right. Think about why this specific order matters.',
      'Completed! Try to explain the logic of each step to yourself.',
      'Nice work! The tricky part is always the ORDER of pointer updates.',
    ],
  },
};

/**
 * Pick a random message from an array.
 * @param {string[]} arr
 * @returns {string}
 */
export function pickRandom(arr) {
  if (!arr?.length) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get a message for a specific operation + event + emotion combination.
 *
 * @param {string} operationId   — q.id or q.operation
 * @param {'wrong'|'stepCorrect'|'success'} event
 * @param {string} emotion       — EMOTIONS constant
 * @returns {string}
 */
export function getOperationMessage(operationId, event, emotion) {
  const bank   = OPERATION_MESSAGES[operationId] ?? OPERATION_MESSAGES._default;
  const msgs   = bank[event] ?? OPERATION_MESSAGES._default[event] ?? [];
  return pickRandom(msgs);
}
