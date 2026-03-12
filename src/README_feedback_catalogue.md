# Error Feedback Catalogue

All error messages shown to students in Regular Mode, organised by trigger type.
Triggers only when the student has placed **exactly** the required number of blocks.

---

## Type A — Distractor Errors

Triggered when the student places a **distractor block** (a wrong code block that doesn't belong to the correct solution).  
Source: `questionGenerator.js` → `distractorFeedbackMap` → `distractorAnalyzer.js`

---

### Operation: `insertAtHead`

#### Distractor: `newNode.next = NULL` — LOST_REFERENCE

| Field | Content |
|-------|---------|
| 🔍 What went wrong | Setting `newNode.next = NULL` severs the connection to the rest of the list! |
| 💡 Why this matters | `newNode.next` must point to the current head so the existing list stays reachable. |
| 🎯 Key Concept | `newNode.next = NULL` is only correct at the tail. Here you need `newNode.next = head`. |
| 💭 Hint | What does `newNode.next` need to point to so the existing list is not lost? |

#### Distractor: `newNode.next = newNode` — SELF_LOOP

| Field | Content |
|-------|---------|
| 🔍 What went wrong | `newNode.next = newNode` makes the new node point to itself — traversal loops forever! |
| 💡 Why this matters | `newNode.next` must point to the old head, not back to `newNode`. |
| 🎯 Key Concept | Correct: `newNode.next = head` (the OLD head, not `newNode` itself). |
| 💭 Hint | What node should follow `newNode` in the list? |

---

### Operation: `insertAtTail`

#### Distractor: `newNode.next = newNode` — LOST_REFERENCE

| Field | Content |
|-------|---------|
| 🔍 What went wrong | `newNode.next = newNode` makes the new tail point back to itself — an infinite loop! |
| 💡 Why this matters | The new tail must end the list by pointing to NULL. |
| 🎯 Key Concept | The new tail must have `newNode.next = NULL`, not `newNode.next = newNode`. |
| 💭 Hint | What should the very last node in a linked list point to? |

#### Distractor: `while (node != NULL): node = node.next` — OFF_BY_ONE

| Field | Content |
|-------|---------|
| 🔍 What went wrong | This loop overshoots — `node` becomes NULL and the next line crashes! |
| 💡 Why this matters | You need `node` to be the last valid node (`node.next == NULL`), not NULL itself. |
| 🎯 Key Concept | Correct: `while (node.next != NULL): node = node.next` |
| 💭 Hint | What is the value of `node` when this loop exits? |

---

### Operation: `removeAtHead`

#### Distractor: `free(head)` — LOST_REFERENCE

| Field | Content |
|-------|---------|
| 🔍 What went wrong | Freeing `head` directly loses the entire list! |
| 💡 Why this matters | `free(head)` releases the head node immediately without saving a reference to the next node. |
| 🎯 Key Concept | Always: `temp = head` → advance pointers → `free(temp)`. |
| 💭 Hint | Save the node in `temp` BEFORE freeing anything. |

#### Distractor: `head = NULL` — NULL_POINTER

| Field | Content |
|-------|---------|
| 🔍 What went wrong | Setting `head = NULL` wipes out every node in the list! |
| 💡 Why this matters | `head` is the sole entry point. Nulling it destroys your only reference to everything. |
| 🎯 Key Concept | To remove just the head: `head = head.next`. |
| 💭 Hint | What should `head` point to after the first node is removed? |

#### Distractor: `head = temp` — MEMORY_LEAK

| Field | Content |
|-------|---------|
| 🔍 What went wrong | `head = temp` assigns an uninitialised `temp` to head — you never saved the old head first! |
| 💡 Why this matters | The correct sequence is: `temp = head`, then `head = head.next`, then `free(temp)`. |
| 🎯 Key Concept | Order matters: `temp = head` → `head = head.next` → `free(temp)`. |
| 💭 Hint | Which direction should the assignment go to save the old head? |

---

### Operation: `removeAtTail`

#### Distractor: `free(head)` — LOST_REFERENCE

| Field | Content |
|-------|---------|
| 🔍 What went wrong | Freeing `head` directly loses the entire list! |
| 💡 Why this matters | `free(head)` releases the head node immediately without saving a reference to the next node. |
| 🎯 Key Concept | Always: `temp = head` → advance pointers → `free(temp)`. |
| 💭 Hint | Save the node in `temp` BEFORE freeing anything. |

#### Distractor: `while (node.next != NULL): node = node.next` — OFF_BY_ONE

| Field | Content |
|-------|---------|
| 🔍 What went wrong | Your loop stops at the LAST node, but you need the SECOND-TO-LAST! |
| 💡 Why this matters | To remove the last node you must update the second-to-last node's `.next` pointer. |
| 🎯 Key Concept | Use `while (node.next.next != NULL): node = node.next` to stop one node early. |
| 💭 Hint | Which node do you actually need to modify? |

#### Distractor: `while (node != NULL && node.next != NULL): node = node.next` — NULL_POINTER

| Field | Content |
|-------|---------|
| 🔍 What went wrong | This loop still stops at the LAST node — one step too late! |
| 💡 Why this matters | You need `node.next.next != NULL` to halt one node earlier. |
| 🎯 Key Concept | Correct: `while (node.next != NULL && node.next.next != NULL): node = node.next` |
| 💭 Hint | NULL safety and correct stopping position are two separate concerns. |

#### Distractor: `temp = node` — MEMORY_LEAK

| Field | Content |
|-------|---------|
| 🔍 What went wrong | `temp = node` saves the predecessor, not the last node you want to remove! |
| 💡 Why this matters | You need `temp` to point to `node.next` (the actual last node) so you can free it. |
| 🎯 Key Concept | Correct: `temp = node.next` (save the last node, not its predecessor). |
| 💭 Hint | Which node are you trying to free — `node`, or the node after it? |

---

### Fallback (operation not matched)

Used when no specific distractor feedback exists for the operation.

| Field | Content |
|-------|---------|
| 🔍 What went wrong | This code block does not belong in a `{operation}` operation. |
| 💡 Why this matters | Each step must logically contribute to the operation goal. |
| 🎯 Key Concept | Compare the block with what each step of the operation is supposed to achieve. |
| 💭 Hint | Ask yourself: does this line help create, connect, or clean up in the right order? |

---

## Type B — Pattern Errors (wrong order, specific rule matched)

Triggered when all blocks are correct but placed in the **wrong order**, and the engine detects a known mistake pattern.  
Source: `errorDetectionEngine.js` — 5 rules, checked in priority order.

---

### Rule 1 — Pointer Sequence Error
**Condition:** `head = newNode` appears before `newNode.next = head` in the assembly.

| Field | Content |
|-------|---------|
| 📍 Message | 🔗 Pointer Sequence Error |
| 🔍 What went wrong | You moved the head pointer before connecting the new node! This breaks the chain. |
| 💡 Why this matters | When inserting at head: FIRST connect `newNode.next = head`, THEN update `head = newNode`. Order matters! |
| 🌟 Analogy | Think of it like a relay race: the new runner must grab the baton (connect `.next`) BEFORE the previous runner lets go (update `head`). |
| 🎯 Key Concept | Always connect before moving. Breaking the chain loses data! |
| ✅ Suggested Fix | Line X should come AFTER the `.next` assignment. |

---

### Rule 2 — Traversal Position Error
**Condition:** For `insertAtPosition` / `removeAtPosition`, the traversal targets position N instead of N−1.

| Field | Content |
|-------|---------|
| 📍 Message | 📍 Wrong Traversal Position |
| 🔍 What went wrong | To insert/delete at position N, you need to traverse to position N−1, not N! |
| 💡 Why this matters | You need access to the PREVIOUS node to modify the connection. You can't modify a node's `.next` pointer by standing at that node. |
| 🌟 Analogy | To change a train car's connection, you need to be at the car BEFORE it, not the car itself. |
| 🎯 Key Concept | Access the node at position N−1, then modify its `.next` pointer. |

---

### Rule 3 — NULL Placement Error
**Condition:** `newNode.next = NULL` appears in an `insertAtHead` or `insertAtPosition` operation.

| Field | Content |
|-------|---------|
| 📍 Message | ⚠️ Incorrect NULL Placement |
| 🔍 What went wrong | You set `newNode.next = NULL`, but you're inserting in the middle or at head! |
| 💡 Why this matters | NULL should ONLY be used at the tail of the list. When inserting elsewhere, the new node should point to the NEXT node in the chain. |
| ✅ Correct Approach | For head insertion: `newNode.next = head` / For position insertion: `newNode.next = current.next` |
| 🎯 Key Concept | NULL marks the END of the list. Only the tail node should have `.next = NULL`. |

---

### Rule 4 — Temp Variable Error
**Condition:** `free` appears in a remove operation, but `temp =` is missing or appears after `free`.

| Field | Content |
|-------|---------|
| 📍 Message | 💾 Missing Temporary Variable |
| 🔍 What went wrong | You need to save the node to a temporary variable BEFORE disconnecting or freeing it! |
| 💡 Why this matters | Once you disconnect a node (e.g., `node.next = NULL`), you lose the reference to it. Save it first in a `temp` variable so you can free it later. |
| ✅ Correct Sequence | 1. Save: `temp = node` → 2. Disconnect: update pointers → 3. Free: `free(temp)` |
| 🌟 Analogy | Like writing down a phone number before erasing it from the board. Once erased, it's gone forever! |
| 🎯 Key Concept | Always use `temp` to hold a reference before you disconnect or modify pointers. |

---

### Rule 5 — Semantic Confusion
**Condition:** `head = newNode` appears in an `insertAtTail` or `insertAtPosition` operation.

| Field | Content |
|-------|---------|
| 📍 Message | 🔀 Wrong Operation Type |
| 🔍 What went wrong | You're using `head = newNode` which is for HEAD insertion, but this operation requires a different pattern! |
| 💡 Why this matters | Different positions require different pointer manipulations. Head insertion, tail insertion, and middle insertion all use different patterns. |
| 📊 Comparison | Insert at Head: `newNode.next = head → head = newNode` / Insert at Tail: `traverse to last → lastNode.next = newNode → newNode.next = NULL` / Insert at Position: `traverse to prev → newNode.next = prev.next → prev.next = newNode` |
| 🎯 Key Concept | Each insertion position has its own unique pointer pattern. Don't mix them up! |

---

## Type C — Generic Sequence Error

**Condition:** All blocks are correct, no specific rule was matched, but the order is wrong.  
Source: `validationLogic.js` fallback.

| Field | Content |
|-------|---------|
| 📍 Message | 📝 Code Sequence Incorrect |
| 🔍 What went wrong | The order of operations matters in linked list manipulation! |
| ❌ Wrong Lines | For each misplaced block: `Your code: X` / `Should be: Y` |
| 💭 Hint | Think about what needs to happen first: connecting pointers or moving them? |

---

## Summary Table

| Error Type | Source | Trigger Condition | Fields Shown |
|------------|--------|-------------------|--------------|
| Distractor (specific) | `distractorFeedbackMap` | Wrong block placed | explanation, reasoning, keyPoint, hint |
| Distractor (fallback) | `generateFallbackFeedback` | Wrong block, no map entry | explanation, reasoning, keyPoint, hint |
| Pattern: Pointer Sequence | Rule 1 | head moved before .next set | message, explanation, reasoning, analogy, keyPoint, suggestedFix |
| Pattern: Traversal Position | Rule 2 | Traversed to N not N−1 | message, explanation, reasoning, analogy, keyPoint |
| Pattern: NULL Placement | Rule 3 | NULL used mid-list | message, explanation, reasoning, correctApproach, keyPoint |
| Pattern: Temp Variable | Rule 4 | free without prior temp | message, explanation, reasoning, correctSequence, analogy, keyPoint |
| Pattern: Semantic Confusion | Rule 5 | head=newNode in wrong op | message, explanation, reasoning, comparison, keyPoint |
| Generic Sequence | Fallback | Wrong order, no rule hit | message, explanation, wrongLines list, hint |
