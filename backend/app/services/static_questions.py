"""
Static question generator — instant, no AI, no Ollama.

Used for the first question of every session so the student sees
something immediately. AI-generated questions take over from Q2 onwards
via the pre-fetch pipeline.
"""

import random
import re
import uuid

from .ll_executor import execute_operation
from .concept_graph import concepts_for_op
from .question_spec import resolve_intra


def _distractor_count(consecutive_passes: int, emotion_default: int) -> int:
    if consecutive_passes == 0:
        return 0
    if consecutive_passes == 1:
        return 1
    return emotion_default


def _rand_position(operation: str, node_count: int) -> int:
    """0-based index semantics, matching the on-screen node labels:
    removeAtPosition targets index 1..n-1 (a predecessor must exist);
    insertAtPosition's new node lands at index 2..n."""
    if operation == "removeAtPosition":
        return random.randint(1, node_count - 1)
    return random.randint(2, node_count)


# ── Payload literalisation ────────────────────────────────────────────────────
# TEMPLATES carry {value} where the operation's payload belongs. The literal is
# substituted into the assembled question so the student reads
# `createNode(35)` — the same 35 the prompt asked them to insert — instead of an
# abstract `value` they have to mentally bind.
#
# `index` deliberately stays SYMBOLIC. `index-1` IS the off-by-one rule being
# taught; rendering `3-1` lets the student compute 2 and skip the rule entirely.
# The one exception is the {index} wrong-option on the createNode blank, where
# the whole point is "did you confuse the payload with the index?".
#
# Only CODE fields are rewritten — explanations and hints are English prose
# where "value" is an ordinary noun.
_VALUE_TOKEN = "{value}"
_INDEX_TOKEN = "{index}"


def _filler_value(nodes: list[dict]) -> int:
    """A payload literal for operations that don't take one (removeAtTail etc.).
    Their distractors still borrow `newNode = createNode({value});` from the
    insert family; leaving it symbolic there would mark it as the odd one out
    and hand the student a free elimination."""
    used = {n.get("value") for n in nodes or []}
    return random.choice([v for v in range(1, 100) if v not in used])


def _subst(text: str, value: str, index: str) -> str:
    if not isinstance(text, str):
        return text
    out = text.replace(_VALUE_TOKEN, value).replace(_INDEX_TOKEN, index)
    # A model that wrote bare `value` instead of echoing the placeholder still
    # gets literalised — otherwise its option is the only abstract one on screen.
    return re.sub(r"\bvalue\b", value, out)


def instantiate(q: dict) -> dict:
    """Substitute payload literals into a fully assembled question, in place."""
    raw_v = q.get("operationValue")
    value = str(raw_v) if isinstance(raw_v, int) else str(_filler_value(q.get("initialNodes") or []))
    raw_i = q.get("operationPosition")
    index = str(raw_i) if isinstance(raw_i, int) else "1"

    for key in ("pseudocode", "distractors", "options"):
        if isinstance(q.get(key), list):
            q[key] = [_subst(s, value, index) for s in q[key]]
    if isinstance(q.get("fix"), str):
        q["fix"] = _subst(q["fix"], value, index)
    for blank in q.get("blanks") or []:
        if not isinstance(blank, dict):
            continue
        if isinstance(blank.get("answer"), str):
            blank["answer"] = _subst(blank["answer"], value, index)
        if isinstance(blank.get("options"), list):
            blank["options"] = [_subst(o, value, index) for o in blank["options"]]
    return q


def _node_count_for(tmpl: dict, preferred: int) -> int:
    """Ops flagged startsEmpty (insertIntoEmpty) begin with NO nodes — the
    executor ignores any initial list for them, so rendering one shows a
    'Current state' that contradicts the operation itself."""
    if tmpl.get("startsEmpty"):
        return 0
    return max(preferred, tmpl["minNodes"])

# ── Templates (pseudocode + metadata per operation) ────────────────────────────

TEMPLATES: dict[str, dict] = {
    "insertAtHead": {
        "title": "Insert at Head",
        "pseudocode": ["newNode = createNode({value});", "newNode.next = head;", "head = newNode;"],
        "correctOrder": [0, 1, 2],
        "hint": "What happens to the old head if you overwrite it first?",
        "step_hints": [
            "This step creates the new node — nothing is linked yet.",
            "The new node must point to the old head BEFORE head moves — why?",
            "Only after the new node is linked in can head safely move to it.",
        ],
        "distractors": ["curr.next = newNode;", "free(temp);", "while (curr.next != NULL) curr = curr.next;"],
        "needsValue": True, "needsPosition": False, "minNodes": 1,
    },
    "insertAtTail": {
        "title": "Insert at Tail",
        "pseudocode": ["curr = head;", "while (curr.next != NULL) curr = curr.next;", "newNode = createNode({value});", "curr.next = newNode;", "newNode.next = NULL;"],
        "correctOrder": [0, 1, 2, 3, 4],
        "validOrders": [[0, 1, 2, 3, 4], [0, 2, 1, 3, 4], [2, 0, 1, 3, 4]],
        "hint": "Traverse to the last node before linking.",
        "step_hints": [
            "Traversal needs a starting point — which pointer marks the front of the list?",
            "Where exactly does this loop stop, and why is that the right node?",
            "Creating the node does not modify the list — it only has to exist before linking.",
            "This is the moment the list actually grows — which pointer links to the new node?",
            "A tail node must mark the end of the list — what value does its next hold?",
        ],
        "distractors": ["head = newNode;", "newNode.next = head;", "free(temp);"],
        "needsValue": True, "needsPosition": False, "minNodes": 1,
    },
    "removeAtHead": {
        "title": "Remove at Head",
        "pseudocode": ["temp = head;", "head = head.next;", "free(temp);"],
        "correctOrder": [0, 1, 2],
        "hint": "Save head before advancing the pointer.",
        "step_hints": [
            "Why keep a reference to the node being removed?",
            "head moves forward — which pointer still references the old head?",
            "Memory can only be freed when nothing depends on it — is that true yet?",
        ],
        "distractors": ["curr.next = newNode;", "newNode = createNode({value});", "newNode.next = NULL;"],
        "needsValue": False, "needsPosition": False, "minNodes": 2,
    },
    "removeAtTail": {
        "title": "Remove Last Node",
        "pseudocode": ["curr = head;", "while (curr.next.next != NULL) curr = curr.next;", "temp = curr.next;", "curr.next = NULL;", "free(temp);"],
        "correctOrder": [0, 1, 2, 3, 4],
        "hint": "Stop at the second-to-last node.",
        "step_hints": [
            "A singly linked list cannot be traversed backwards — start at the head.",
            "Why stop at the SECOND-to-last node instead of the last one?",
            "Save a reference to the node being removed — you still need it to free it.",
            "The second-to-last node becomes the new tail — what must its next point to?",
            "Free the old tail only after the list no longer points to it.",
        ],
        "distractors": ["head = head.next;", "newNode = createNode({value});", "curr.next = newNode;"],
        "needsValue": False, "needsPosition": False, "minNodes": 2,
    },
    "insertIntoEmpty": {
        "title": "Insert into Empty List",
        "pseudocode": ["newNode = createNode({value});", "newNode.next = NULL;", "head = newNode;"],
        "correctOrder": [0, 1, 2],
        "hint": "The new node becomes the only element.",
        "step_hints": [
            "The node must exist before it can be linked — creation comes first.",
            "The only node is also the LAST node — what marks the end of a list?",
            "An empty list's head is NULL — when does it point to the new node?",
        ],
        "distractors": ["newNode.next = head;", "free(temp);", "curr = head;"],
        "needsValue": True, "needsPosition": False, "minNodes": 0, "startsEmpty": True,
    },
    "deleteEntireList": {
        "title": "Delete Entire List",
        "pseudocode": ["curr = head;", "while (curr != NULL) { temp = curr.next; free(curr); curr = temp; }", "head = NULL;"],
        "correctOrder": [0, 1, 2],
        "hint": "Traverse and free each node, then null the head.",
        "step_hints": [
            "You need a traversal pointer to visit every node — where does it begin?",
            "Inside the loop: why must temp save curr.next BEFORE the free?",
            "After every node is freed, what value should head hold?",
        ],
        "distractors": ["newNode = createNode({value});", "curr.next = newNode;", "newNode.next = head;"],
        "needsValue": False, "needsPosition": False, "minNodes": 2,
    },
    "insertAtPosition": {
        "title": "Insert at Position",
        "pseudocode": ["curr = head;", "for (int i = 0; i < index-1; i++) curr = curr.next;", "newNode = createNode({value});", "newNode.next = curr.next;", "curr.next = newNode;"],
        "correctOrder": [0, 1, 2, 3, 4],
        "validOrders": [[0, 1, 2, 3, 4], [0, 2, 1, 3, 4], [2, 0, 1, 3, 4]],
        "hint": "Walk to the predecessor, then splice in.",
        "step_hints": [
            "Traversal to an index always starts at the head.",
            "The traversal stops at index-1 — which node must the pointer be at, and why?",
            "Creating the node does not modify the list — it only has to exist before linking.",
            "The new node must point to its successor BEFORE the chain is relinked — what would be lost otherwise?",
            "Now the predecessor's next is redirected — is its old successor already saved somewhere?",
        ],
        "distractors": ["head = newNode;", "free(temp);", "while (curr.next != NULL) curr = curr.next;"],
        "needsValue": True, "needsPosition": True, "minNodes": 2,
    },
    "removeAtPosition": {
        "title": "Remove at Position",
        "pseudocode": ["curr = head;", "for (int i = 0; i < index-1; i++) curr = curr.next;", "temp = curr.next;", "curr.next = temp.next;", "free(temp);"],
        "correctOrder": [0, 1, 2, 3, 4],
        "hint": "Walk to the predecessor, bypass the target.",
        "step_hints": [
            "Start at the head — to remove a node you need the node BEFORE it.",
            "This traversal stops at the target's predecessor — why the predecessor and not the target?",
            "temp marks the node being removed — keep a reference to it for the free.",
            "The chain bypasses the removed node here — trace exactly which node now connects to which.",
            "Free the node only after the list no longer links to it.",
        ],
        "distractors": ["newNode = createNode({value});", "newNode.next = curr.next;", "head = head.next;"],
        "needsValue": False, "needsPosition": True, "minNodes": 3,
    },
    "reverseList": {
        "title": "Reverse Linked List",
        "pseudocode": ["prev = NULL;", "curr = head;", "while (curr != NULL) { temp = curr.next; curr.next = prev; prev = curr; curr = temp; }", "head = prev;"],
        "correctOrder": [0, 1, 2, 3],
        "hint": "Traverse the list and flip each node's next to point at the PREVIOUS node — prev, curr and temp keep the rest of the list reachable while you do it.",
        "step_hints": [
            "The old first node will become the tail — what should it end up pointing to?",
            "The traversal pointer starts at the old head of the list.",
            "Three pointers advance in this loop — why must temp save curr.next FIRST?",
            "When the loop finishes, which variable points to the new head?",
        ],
        "distractors": ["newNode = createNode({value});", "curr.next = newNode;", "free(temp);"],
        "needsValue": False, "needsPosition": False, "minNodes": 2,
    },
    "mergeSortedLists": {
        "title": "Merge Two Sorted Lists",
        "pseudocode": ["dummy = createNode(0); curr = dummy;", "while (l1 != NULL && l2 != NULL) { if (l1.val <= l2.val) { curr.next = l1; l1 = l1.next; } else { curr.next = l2; l2 = l2.next; } curr = curr.next; }", "curr.next = (l1 != NULL) ? l1 : l2;", "return dummy.next;"],
        "correctOrder": [0, 1, 2, 3],
        "hint": "Use a dummy node; always attach the smaller value.",
        "step_hints": [
            "The dummy node gives the result list a fixed anchor — why does that simplify every later step?",
            "Each iteration attaches the smaller front node — then which list advances?",
            "One list is exhausted — what happens to the remaining nodes of the other?",
            "Why return dummy.next and not dummy itself?",
        ],
        "distractors": ["head = prev;", "while (curr.next != NULL) curr = curr.next;", "free(temp);"],
        "needsValue": False, "needsPosition": False, "minNodes": 0, "isMerge": True,
    },
    "detectCycle": {
        "title": "Linked List Cycle",
        "pseudocode": ["slow = head; fast = head;", "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; }", "if (slow == fast) return true;", "return false;"],
        "correctOrder": [0, 1, 2, 3],
        "hint": "Floyd's algorithm: fast pointer moves twice as fast.",
        "step_hints": [
            "Both pointers start at the head — only their speeds differ.",
            "Why must FAST be the one checked against NULL, not slow?",
            "If the two pointers ever meet at the same node, what does that prove?",
            "Fast reached the end of the list — could a cycle have existed?",
        ],
        "distractors": ["newNode = createNode({value});", "curr.next = newNode;", "head = prev;"],
        "needsValue": False, "needsPosition": False, "minNodes": 3,
    },
    "sortList": {
        "title": "Sort Linked List",
        "pseudocode": ["if (head == NULL || head.next == NULL) return head;", "slow = head; fast = head.next;", "while (fast && fast.next) { slow = slow.next; fast = fast.next.next; }", "mid = slow.next; slow.next = NULL;", "return merge(sortList(head), sortList(mid));"],
        "correctOrder": [0, 1, 2, 3, 4],
        "hint": "Split at midpoint using slow/fast, then merge sort.",
        "step_hints": [
            "Recursion needs a base case — which lists are already sorted by definition?",
            "The slow/fast pointers appear again — but what are they locating this time?",
            "When fast reaches the end of the list, where exactly is slow?",
            "The split must truly CUT the list in two — why set slow.next to NULL?",
            "Two sorted halves remain — which earlier operation joins them into one?",
        ],
        "distractors": ["head = prev;", "newNode = createNode({value});", "curr.next = newNode;"],
        "needsValue": False, "needsPosition": False, "minNodes": 3,
    },
}


# ── Fill-blank definitions (answer + 2 wrong options per pseudocode step) ─────
# Each list entry corresponds to the same-index pseudocode step.
# Each operation has 4 blank sets, rotated deterministically by variant_seed.
# "a" = correct answer (must be findable via str.replace(a, "___", 1) in the step text)
# "w" = two wrong options
_BLANKS: dict[str, list[list[dict]]] = {
    # ["newNode = createNode({value});", "newNode.next = head;", "head = newNode;"]
    "insertAtHead": [
        [  # A: what does each var point to?
            {"a": "newNode",          "w": ["head",    "temp"]},
            {"a": "head",             "w": ["head.next","NULL"]},
            {"a": "newNode",          "w": ["head",    "temp"]},
        ],
        [  # B: which role does each var play?
            {"a": "createNode({value})","w": ["NULL",    "head"]},
            {"a": "newNode",          "w": ["head",    "temp"]},
            {"a": "head",             "w": ["newNode", "NULL"]},
        ],
        [  # C: fields & call arguments
            {"a": "{value}", "w": ["head",  "newNode"]},
            {"a": "next",    "w": ["val",          "prev"]},
            {"a": "newNode", "w": ["newNode.next", "head.next"]},
        ],
        [  # D: functions & assignment targets
            {"a": "createNode",   "w": ["free",      "makeNode"]},
            {"a": "newNode.next", "w": ["head.next", "newNode"]},
            {"a": "head",         "w": ["temp",      "curr"]},
        ],
    ],
    # ["curr = head;", "while (curr.next != NULL) curr = curr.next;",
    #  "newNode = createNode({value});", "curr.next = newNode;", "newNode.next = NULL;"]
    "insertAtTail": [
        [  # A: variable name focus
            {"a": "head",    "w": ["NULL",    "newNode"]},
            {"a": "curr.next","w": ["curr",   "curr.next.next"]},
            {"a": "newNode", "w": ["head",    "temp"]},
            {"a": "newNode", "w": ["head.next","NULL"]},
            {"a": "NULL",    "w": ["newNode", "head"]},
        ],
        [  # B: loop termination & pointer roles
            {"a": "head",    "w": ["NULL",    "newNode"]},
            {"a": "NULL",    "w": ["curr",    "curr.next"]},
            {"a": "newNode", "w": ["head",    "temp"]},
            {"a": "curr.next","w": ["curr",   "head"]},
            {"a": "newNode", "w": ["curr",    "head"]},
        ],
        [  # C: fields & call arguments
            {"a": "curr",         "w": ["newNode",  "temp"]},
            {"a": "next",         "w": ["val",      "prev"]},
            {"a": "{value}",     "w": ["curr",  "NULL"]},
            {"a": "next",         "w": ["val",      "prev"]},
            {"a": "newNode.next", "w": ["newNode",  "curr.next"]},
        ],
        [  # D: loop body & functions
            {"a": "head",             "w": ["head.next", "temp"]},
            {"a": "curr = curr.next", "w": ["curr = curr.next.next", "curr.next = curr"]},
            {"a": "createNode",       "w": ["free",      "newNode"]},
            {"a": "newNode",          "w": ["NULL",      "curr"]},
            {"a": "NULL",             "w": ["curr",      "head"]},
        ],
    ],
    # ["temp = head;", "head = head.next;", "free(temp);"]
    "removeAtHead": [
        [  # A: what each step does
            {"a": "head",    "w": ["NULL",    "temp"]},
            {"a": "head.next","w": ["head",   "NULL"]},
            {"a": "temp",    "w": ["head",    "NULL"]},
        ],
        [  # B: which variable to use
            {"a": "temp",    "w": ["curr",    "head"]},
            {"a": "head",    "w": ["temp",    "NULL"]},
            {"a": "temp",    "w": ["curr",    "prev"]},
        ],
        [  # C: fields & functions
            {"a": "head", "w": ["head.next",  "temp.next"]},
            {"a": "next", "w": ["val",        "prev"]},
            {"a": "free", "w": ["createNode", "delete"]},
        ],
        [  # D: what gets saved and freed
            {"a": "temp",      "w": ["curr",      "newNode"]},
            {"a": "head.next", "w": ["temp.next", "head"]},
            {"a": "temp",      "w": ["head.next", "curr.next"]},
        ],
    ],
    # ["curr = head;", "while (curr.next.next != NULL) curr = curr.next;",
    #  "temp = curr.next;", "curr.next = NULL;", "free(temp);"]
    "removeAtTail": [
        [  # A: condition & what to save
            {"a": "head",          "w": ["NULL",   "temp"]},
            {"a": "curr.next.next","w": ["curr.next","curr"]},
            {"a": "curr.next",     "w": ["curr",   "head"]},
            {"a": "NULL",          "w": ["temp",   "curr.next"]},
            {"a": "temp",          "w": ["curr",   "head"]},
        ],
        [  # B: termination value & pointer assignment
            {"a": "head",      "w": ["NULL",     "temp"]},
            {"a": "NULL",      "w": ["curr",     "curr.next"]},
            {"a": "temp",      "w": ["curr",     "head"]},
            {"a": "curr.next", "w": ["curr",     "head"]},
            {"a": "temp",      "w": ["curr",     "prev"]},
        ],
        [  # C: loop body & functions
            {"a": "curr",             "w": ["temp", "tail"]},
            {"a": "curr = curr.next", "w": ["curr = curr.next.next", "curr.next = curr"]},
            {"a": "next",             "w": ["val",  "prev"]},
            {"a": "next",             "w": ["val",  "prev"]},
            {"a": "free",             "w": ["delete", "createNode"]},
        ],
        [  # D: comparison & saved references
            {"a": "head", "w": ["head.next", "NULL"]},
            {"a": "!=",   "w": ["==",        "="]},
            {"a": "temp", "w": ["curr",      "prev"]},
            {"a": "NULL", "w": ["newNode",   "head"]},
            {"a": "temp", "w": ["curr.next", "head"]},
        ],
    ],
    # ["newNode = createNode({value});", "newNode.next = NULL;", "head = newNode;"]
    "insertIntoEmpty": [
        [  # A: pointer values
            {"a": "newNode",          "w": ["head", "temp"]},
            {"a": "NULL",             "w": ["newNode","head"]},
            {"a": "newNode",          "w": ["NULL",  "temp"]},
        ],
        [  # B: variable roles
            {"a": "createNode({value})","w": ["NULL", "head"]},
            {"a": "newNode",          "w": ["head", "temp"]},
            {"a": "head",             "w": ["newNode","NULL"]},
        ],
        [  # C: fields & call arguments
            {"a": "{value}", "w": ["NULL",  "0"]},
            {"a": "next",    "w": ["val",          "prev"]},
            {"a": "newNode", "w": ["newNode.next", "curr"]},
        ],
        [  # D: functions & assignment targets
            {"a": "createNode",   "w": ["free",      "getNode"]},
            {"a": "newNode.next", "w": ["newNode",   "head.next"]},
            {"a": "head",         "w": ["head.next", "temp"]},
        ],
    ],
    # ["curr = head;", "while (curr != NULL) { temp = curr.next; free(curr); curr = temp; }", "head = NULL;"]
    "deleteEntireList": [
        [  # A: condition variable
            {"a": "head",    "w": ["NULL",   "temp"]},
            {"a": "curr",    "w": ["curr.next","temp"]},
            {"a": "NULL",    "w": ["temp",   "head.next"]},
        ],
        [  # B: what temp saves
            {"a": "curr",    "w": ["head",   "temp"]},
            {"a": "curr.next","w": ["curr",  "temp"]},
            {"a": "NULL",    "w": ["temp",   "head"]},
        ],
        [  # C: traversal pointer & the free call
            {"a": "curr", "w": ["temp",   "head.next"]},
            {"a": "free", "w": ["delete", "createNode"]},
            {"a": "NULL", "w": ["curr",   "newNode"]},
        ],
        [  # D: saving before freeing
            {"a": "head", "w": ["head.next", "NULL"]},
            {"a": "temp", "w": ["curr",      "head"]},
            {"a": "head", "w": ["curr",      "temp"]},
        ],
    ],
    # ["curr = head;", "for (int i = 0; i < index-1; i++) curr = curr.next;",
    #  "newNode = createNode({value});", "newNode.next = curr.next;", "curr.next = newNode;"]
    "insertAtPosition": [
        [  # A: what each pointer is set to
            {"a": "head",      "w": ["NULL",    "newNode"]},
            {"a": "index-1","w": ["index","index-2"]},
            {"a": "newNode",   "w": ["head",    "temp"]},
            {"a": "curr.next", "w": ["curr",    "NULL"]},
            {"a": "newNode",   "w": ["curr.next","NULL"]},
        ],
        [  # B: which variable owns the pointer
            {"a": "head",      "w": ["NULL",    "newNode"]},
            {"a": "index-1","w": ["index","index-2"]},
            {"a": "newNode",   "w": ["head",    "temp"]},
            {"a": "newNode",   "w": ["curr",    "head"]},
            {"a": "curr.next", "w": ["curr",    "head"]},
        ],
        [  # C: loop body & call arguments
            {"a": "curr",             "w": ["newNode", "temp"]},
            {"a": "curr = curr.next", "w": ["curr = curr.next.next", "curr.next = curr"]},
            {"a": "{value}",        "w": ["{index}", "NULL"]},
            {"a": "next",             "w": ["val",      "prev"]},
            {"a": "newNode",          "w": ["newNode.next", "temp"]},
        ],
        [  # D: loop start & splice targets
            {"a": "head",         "w": ["NULL",    "head.next"]},
            {"a": "0",            "w": ["1",       "-1"]},
            {"a": "createNode",   "w": ["free",    "newNode"]},
            {"a": "newNode.next", "w": ["newNode", "curr.next"]},
            {"a": "curr.next",    "w": ["newNode.next", "curr"]},
        ],
    ],
    # ["curr = head;", "for (int i = 0; i < index-1; i++) curr = curr.next;",
    #  "temp = curr.next;", "curr.next = temp.next;", "free(temp);"]
    "removeAtPosition": [
        [  # A: what to save and bypass
            {"a": "head",      "w": ["NULL",     "temp"]},
            {"a": "index-1","w": ["index", "index-2"]},
            {"a": "curr.next", "w": ["curr",     "temp"]},
            {"a": "temp.next", "w": ["temp",     "curr.next"]},
            {"a": "temp",      "w": ["curr",     "head"]},
        ],
        [  # B: which variable owns each role
            {"a": "head",      "w": ["NULL",     "temp"]},
            {"a": "index-1","w": ["index", "index-2"]},
            {"a": "temp",      "w": ["curr",     "head"]},
            {"a": "curr.next", "w": ["curr",     "head"]},
            {"a": "temp",      "w": ["curr",     "prev"]},
        ],
        [  # C: loop body & fields
            {"a": "curr",             "w": ["temp", "prev"]},
            {"a": "curr = curr.next", "w": ["curr = curr.next.next", "temp = curr.next"]},
            {"a": "next",             "w": ["val",  "prev"]},
            {"a": "next",             "w": ["val",  "prev"]},
            {"a": "free",             "w": ["delete", "remove"]},
        ],
        [  # D: loop start & bypass targets
            {"a": "head",      "w": ["head.next", "NULL"]},
            {"a": "0",         "w": ["1",         "2"]},
            {"a": "temp",      "w": ["curr",      "mid"]},
            {"a": "temp.next", "w": ["temp",      "temp.next.next"]},
            {"a": "temp",      "w": ["curr.next", "head"]},
        ],
    ],
    # ["prev = NULL;", "curr = head;",
    #  "while (curr != NULL) { temp = curr.next; curr.next = prev; prev = curr; curr = temp; }",
    #  "head = prev;"]
    "reverseList": [
        [  # A: what prev is set to at each step
            {"a": "NULL", "w": ["head",  "temp"]},
            {"a": "head", "w": ["NULL",  "prev"]},
            {"a": "prev", "w": ["curr",  "temp"]},
            {"a": "prev", "w": ["curr",  "temp"]},
        ],
        [  # B: what saves the next pointer
            {"a": "NULL", "w": ["head",  "temp"]},
            {"a": "head", "w": ["NULL",  "prev"]},
            {"a": "temp", "w": ["prev",  "curr"]},
            {"a": "prev", "w": ["curr",  "temp"]},
        ],
        [  # C: the reversal assignment itself
            {"a": "prev",             "w": ["temp", "curr"]},
            {"a": "curr",             "w": ["temp", "prev"]},
            {"a": "curr.next = prev", "w": ["prev = curr.next", "curr = prev"]},
            {"a": "prev",             "w": ["temp", "curr.next"]},
        ],
        [  # D: saving before overwriting
            {"a": "NULL",             "w": ["head",      "curr"]},
            {"a": "head",             "w": ["head.next", "temp"]},
            {"a": "temp = curr.next", "w": ["temp = curr", "curr = curr.next"]},
            {"a": "head",             "w": ["curr",      "head.next"]},
        ],
    ],
    # ["dummy = createNode(0); curr = dummy;",
    #  "while (l1 != NULL && l2 != NULL) { ... }",
    #  "curr.next = (l1 != NULL) ? l1 : l2;",
    #  "return dummy.next;"]
    "mergeSortedLists": [
        [  # A: l1 conditions
            {"a": "dummy",     "w": ["head", "NULL"]},
            {"a": "l1",        "w": ["l2",   "NULL"]},
            {"a": "l1",        "w": ["l2",   "NULL"]},
            {"a": "dummy.next","w": ["dummy","curr"]},
        ],
        [  # B: l2 conditions
            {"a": "dummy",     "w": ["head", "NULL"]},
            {"a": "l2",        "w": ["l1",   "NULL"]},
            {"a": "l2",        "w": ["l1",   "NULL"]},
            {"a": "dummy.next","w": ["dummy","curr"]},
        ],
        [  # C: comparison & guard conditions
            {"a": "createNode(0)",    "w": ["createNode(l1.val)", "NULL"]},
            {"a": "l1.val <= l2.val", "w": ["l1.val >= l2.val",  "l1 <= l2"]},
            {"a": "l1 != NULL",       "w": ["l1 == NULL",        "l2 != NULL"]},
            {"a": "dummy.next",       "w": ["dummy",             "curr.next"]},
        ],
        [  # D: anchors & the advance step
            {"a": "dummy",            "w": ["head",         "curr"]},
            {"a": "curr = curr.next", "w": ["curr = dummy", "l1 = l1.next"]},
            {"a": "NULL",             "w": ["l2",           "dummy"]},
            {"a": "dummy",            "w": ["curr",         "head"]},
        ],
    ],
    # ["slow = head; fast = head;",
    #  "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; }",
    #  "if (slow == fast) return true;",
    #  "return false;"]
    "detectCycle": [
        [  # A: how fast pointer advances
            {"a": "head",          "w": ["NULL",  "fast"]},
            {"a": "fast.next.next","w": ["fast.next","slow.next"]},
            {"a": "true",          "w": ["false", "NULL"]},
            {"a": "false",         "w": ["true",  "NULL"]},
        ],
        [  # B: pointer names and condition
            {"a": "fast",  "w": ["slow",  "curr"]},
            {"a": "NULL",  "w": ["head",  "slow"]},
            {"a": "slow",  "w": ["fast",  "head"]},
            {"a": "false", "w": ["true",  "NULL"]},
        ],
        [  # C: pointer advances & the comparison
            {"a": "slow",      "w": ["fast",  "curr"]},
            {"a": "slow.next", "w": ["slow",  "fast.next"]},
            {"a": "==",        "w": ["!=",    "="]},
            {"a": "false",     "w": ["true",  "0"]},
        ],
        [  # D: guard conditions & return values
            {"a": "fast",         "w": ["slow",         "fast.next"]},
            {"a": "fast != NULL", "w": ["fast == NULL", "slow != NULL"]},
            {"a": "true",         "w": ["false",        "slow"]},
            {"a": "false",        "w": ["fast",         "true"]},
        ],
    ],
    # ["if (head == NULL || head.next == NULL) return head;",
    #  "slow = head; fast = head.next;",
    #  "while (fast && fast.next) { slow = slow.next; fast = fast.next.next; }",
    #  "mid = slow.next; slow.next = NULL;",
    #  "return merge(sortList(head), sortList(mid));"]
    "sortList": [
        [  # A: midpoint and recursion targets
            {"a": "NULL",          "w": ["head",  "mid"]},
            {"a": "head.next",     "w": ["head",  "NULL"]},
            {"a": "fast.next.next","w": ["fast.next","slow.next"]},
            {"a": "slow.next",     "w": ["slow",  "fast.next"]},
            {"a": "mid",           "w": ["head",  "slow"]},
        ],
        [  # B: split and first-half recursion
            {"a": "NULL",          "w": ["head",  "mid"]},
            {"a": "head.next",     "w": ["head",  "NULL"]},
            {"a": "fast.next.next","w": ["fast.next","slow.next"]},
            {"a": "NULL",          "w": ["mid",   "slow"]},
            {"a": "head",          "w": ["mid",   "slow"]},
        ],
        [  # C: base case & the merge call
            {"a": "return head", "w": ["return NULL", "return head.next"]},
            {"a": "slow",        "w": ["fast",   "mid"]},
            {"a": "slow.next",   "w": ["slow",   "fast.next"]},
            {"a": "NULL",        "w": ["head",   "mid"]},
            {"a": "merge",       "w": ["append", "sortList"]},
        ],
        [  # D: guards & the recursive split
            {"a": "head == NULL",      "w": ["head != NULL", "head.next == NULL"]},
            {"a": "fast",              "w": ["slow",  "mid"]},
            {"a": "fast && fast.next", "w": ["fast",  "fast.next && fast.next.next"]},
            {"a": "slow.next",         "w": ["slow",  "head.next"]},
            {"a": "sortList",          "w": ["merge", "sort"]},
        ],
    ],
}

# ── Bug definitions (subtlety-tagged variants per operation) ───────────────────
_BUGS: dict[str, list[dict]] = {
    # Each op holds a LIST of bug variants tagged with subtlety
    # (1 = careless / 2 = conceptual / 3 = one-token). Selection picks the
    # nearest subtlety to intra_difficulty and rotates by variant_seed.
    "insertAtHead": [
        {"subtlety": 3, "line": 1, "buggy": "newNode.next = head.next;",
         "fix": "newNode.next = head;",
         "explanation": "head.next skips the original head, losing it from the list",
         "options": ["newNode.next = head;", "newNode.next = NULL;", "head.next = newNode;"]},
        {"subtlety": 1, "line": 1, "buggy": "newNode.next = newNode;",
         "fix": "newNode.next = head;",
         "explanation": "Pointing the new node at itself creates a self-loop — the rest of the list is never attached",
         "options": ["newNode.next = head;", "newNode.next = NULL;", "head = newNode.next;"]},
        {"subtlety": 2, "line": 1, "buggy": "newNode.next = NULL;",
         "fix": "newNode.next = head;",
         "explanation": "Treating the list as empty: newNode.next = NULL severs the entire existing list",
         "options": ["newNode.next = head;", "newNode.next = newNode;", "head.next = newNode;"]},
    ],
    "insertAtTail": [
        {"subtlety": 1, "line": 3, "buggy": "curr.next = curr.next;",
         "fix": "curr.next = newNode;",
         "explanation": "curr.next = curr.next is a no-op — the new node is never linked into the list",
         "options": ["curr.next = newNode;", "curr.next = NULL;", "newNode.next = curr;"]},
        {"subtlety": 2, "line": 1, "buggy": "while (curr != NULL) curr = curr.next;",
         "fix": "while (curr.next != NULL) curr = curr.next;",
         "explanation": "Checking curr instead of curr.next walks off the end — curr is NULL after the loop, so there is nothing to link from",
         "options": ["while (curr.next != NULL) curr = curr.next;",
                     "while (curr.next.next != NULL) curr = curr.next;",
                     "while (curr != NULL) curr = curr.next.next;"]},
        {"subtlety": 3, "line": 4, "buggy": "newNode.next = head;",
         "fix": "newNode.next = NULL;",
         "explanation": "Pointing the new tail back at head creates a cycle — the list must end at NULL",
         "options": ["newNode.next = NULL;", "newNode.next = curr;", "curr.next = NULL;"]},
    ],
    "removeAtHead": [
        {"subtlety": 1, "line": 1, "buggy": "head = head;",
         "fix": "head = head.next;",
         "explanation": "head = head doesn't advance the pointer — the old head is never removed",
         "options": ["head = head.next;", "head = NULL;", "head = temp.next;"]},
        {"subtlety": 2, "line": 2, "buggy": "free(head);",
         "fix": "free(temp);",
         "explanation": "head has already advanced — free(head) destroys the NEW first node while the removed one leaks",
         "options": ["free(temp);", "free(head.next);", "free(temp.next);"]},
        {"subtlety": 3, "line": 0, "buggy": "temp = head.next;",
         "fix": "temp = head;",
         "explanation": "temp must save the node being removed (the old head) — saving head.next means free(temp) later destroys the new head instead",
         "options": ["temp = head;", "temp = NULL;", "temp = head.next.next;"]},
    ],
    "removeAtTail": [
        {"subtlety": 2, "line": 1, "buggy": "while (curr.next != NULL) curr = curr.next;",
         "fix": "while (curr.next.next != NULL) curr = curr.next;",
         "explanation": "Stopping at curr.next == NULL lands on the last node, not its predecessor",
         "options": ["while (curr.next.next != NULL) curr = curr.next;",
                     "while (curr != NULL) curr = curr.next;",
                     "while (curr.next != NULL) curr = curr.next.next;"]},
        {"subtlety": 1, "line": 3, "buggy": "curr.next = curr;",
         "fix": "curr.next = NULL;",
         "explanation": "Pointing the new tail at itself creates a one-node cycle instead of ending the list",
         "options": ["curr.next = NULL;", "curr = NULL;", "curr.next = temp;"]},
        {"subtlety": 3, "line": 2, "buggy": "temp = curr.next.next;",
         "fix": "temp = curr.next;",
         "explanation": "The loop stopped where curr.next.next is NULL, so temp is set to NULL — the old tail is never freed",
         "options": ["temp = curr.next;", "temp = curr;", "temp = head;"]},
    ],
    "insertIntoEmpty": [
        {"subtlety": 1, "line": 2, "buggy": "head = NULL;",
         "fix": "head = newNode;",
         "explanation": "Setting head = NULL discards the new node; head must point to newNode",
         "options": ["head = newNode;", "head = head.next;", "head = temp;"]},
        {"subtlety": 2, "line": 2, "buggy": "head.next = newNode;",
         "fix": "head = newNode;",
         "explanation": "head is NULL in an empty list — head.next dereferences NULL; head itself must be reassigned",
         "options": ["head = newNode;", "head = newNode.next;", "newNode = head;"]},
        {"subtlety": 3, "line": 1, "buggy": "newNode.next = newNode;",
         "fix": "newNode.next = NULL;",
         "explanation": "The only node must terminate the list — pointing it at itself creates a cycle that breaks every traversal",
         "options": ["newNode.next = NULL;", "newNode.next = head.next;", "newNode = NULL;"]},
    ],
    "deleteEntireList": [
        {"subtlety": 2, "line": 0, "buggy": "curr = head.next;",
         "fix": "curr = head;",
         "explanation": "Starting at head.next skips the first node, causing a memory leak",
         "options": ["curr = head;", "curr = NULL;", "curr = head.next.next;"]},
        {"subtlety": 1, "line": 2, "buggy": "head = head;",
         "fix": "head = NULL;",
         "explanation": "head = head changes nothing — head still points at freed memory (dangling pointer)",
         "options": ["head = NULL;", "head = temp;", "head = curr;"]},
        {"subtlety": 3, "line": 1,
         "buggy": "while (curr != NULL) { temp = curr.next; free(curr); curr = curr.next; }",
         "fix":   "while (curr != NULL) { temp = curr.next; free(curr); curr = temp; }",
         "explanation": "After free(curr), reading curr.next touches freed memory — temp exists to save the next pointer before the free",
         "options": ["while (curr != NULL) { temp = curr.next; free(curr); curr = temp; }",
                     "while (curr != NULL) { free(curr); curr = curr.next; }",
                     "while (curr != NULL) { temp = curr; free(curr); curr = temp; }"]},
    ],
    "insertAtPosition": [
        {"subtlety": 3, "line": 3, "buggy": "newNode.next = curr;",
         "fix": "newNode.next = curr.next;",
         "explanation": "Pointing to curr (predecessor) instead of curr.next (successor) corrupts the list",
         "options": ["newNode.next = curr.next;", "newNode.next = NULL;", "newNode.next = curr.next.next;"]},
        {"subtlety": 1, "line": 4, "buggy": "curr.next = curr.next;",
         "fix": "curr.next = newNode;",
         "explanation": "Self-assignment is a no-op — the new node is created but never linked into the list",
         "options": ["curr.next = newNode;", "curr = newNode;", "newNode.next = newNode;"]},
        {"subtlety": 2, "line": 1, "buggy": "for (int i = 0; i < index; i++) curr = curr.next;",
         "fix": "for (int i = 0; i < index-1; i++) curr = curr.next;",
         "explanation": "Looping to index walks one node too far — you land on the target index itself instead of its predecessor",
         "options": ["for (int i = 0; i < index-1; i++) curr = curr.next;",
                     "for (int i = 0; i < index-2; i++) curr = curr.next;",
                     "for (int i = 0; i <= index-1; i++) curr = curr.next;"]},
    ],
    "removeAtPosition": [
        {"subtlety": 3, "line": 3, "buggy": "curr.next = temp;",
         "fix": "curr.next = temp.next;",
         "explanation": "curr.next = temp creates a cycle; it must skip temp by pointing to temp.next",
         "options": ["curr.next = temp.next;", "curr.next = NULL;", "curr.next = temp.next.next;"]},
        {"subtlety": 1, "line": 4, "buggy": "free(curr);",
         "fix": "free(temp);",
         "explanation": "curr is the predecessor, still part of the list — freeing it corrupts the chain while the removed node leaks",
         "options": ["free(temp);", "free(temp.next);", "free(head);"]},
        {"subtlety": 2, "line": 1, "buggy": "for (int i = 0; i < index; i++) curr = curr.next;",
         "fix": "for (int i = 0; i < index-1; i++) curr = curr.next;",
         "explanation": "Looping to index stops ON the target — the node AFTER the target gets removed instead",
         "options": ["for (int i = 0; i < index-1; i++) curr = curr.next;",
                     "for (int i = 0; i < index-2; i++) curr = curr.next;",
                     "for (int i = 1; i < index-1; i++) curr = curr.next;"]},
    ],
    "reverseList": [
        {"subtlety": 3, "line": 2,
         "buggy": "while (curr != NULL) { temp = curr.next; curr.next = prev; prev = curr; curr = curr.next; }",
         "fix":   "while (curr != NULL) { temp = curr.next; curr.next = prev; prev = curr; curr = temp; }",
         "explanation": "After curr.next = prev, curr.next has been overwritten — using curr.next instead of temp loses the rest of the list",
         "options": ["while (curr != NULL) { temp = curr.next; curr.next = prev; prev = curr; curr = temp; }",
                     "while (curr != NULL) { curr.next = prev; prev = curr; curr = curr.next; }",
                     "while (curr != NULL) { temp = curr.next; prev = curr; curr.next = prev; curr = temp; }"]},
        {"subtlety": 1, "line": 3, "buggy": "head = curr;",
         "fix": "head = prev;",
         "explanation": "When the loop exits curr is NULL — head = curr discards the reversed list; prev points to the new head",
         "options": ["head = prev;", "head = temp;", "head = curr.next;"]},
        {"subtlety": 2, "line": 0, "buggy": "prev = head;",
         "fix": "prev = NULL;",
         "explanation": "prev must start as NULL so the old head becomes the tail — starting at head makes the first node point to itself (a cycle)",
         "options": ["prev = NULL;", "prev = head.next;", "prev = temp;"]},
    ],
    "mergeSortedLists": [
        {"subtlety": 2, "line": 2, "buggy": "curr.next = (l1 != NULL) ? l2 : l1;",
         "fix": "curr.next = (l1 != NULL) ? l1 : l2;",
         "explanation": "Conditions are swapped: attaches l2 when l1 remains and vice versa",
         "options": ["curr.next = (l1 != NULL) ? l1 : l2;", "curr.next = l1;", "curr.next = l2;"]},
        {"subtlety": 1, "line": 3, "buggy": "return dummy;",
         "fix": "return dummy.next;",
         "explanation": "dummy is the placeholder anchor holding value 0 — the merged list starts at dummy.next",
         "options": ["return dummy.next;", "return curr;", "return l1;"]},
        {"subtlety": 3, "line": 1,
         "buggy": "while (l1 != NULL || l2 != NULL) { if (l1.val <= l2.val) { curr.next = l1; l1 = l1.next; } else { curr.next = l2; l2 = l2.next; } curr = curr.next; }",
         "fix":   "while (l1 != NULL && l2 != NULL) { if (l1.val <= l2.val) { curr.next = l1; l1 = l1.next; } else { curr.next = l2; l2 = l2.next; } curr = curr.next; }",
         "explanation": "With || the loop keeps running after one list is exhausted — l1.val then dereferences NULL",
         "options": ["while (l1 != NULL && l2 != NULL) { if (l1.val <= l2.val) { curr.next = l1; l1 = l1.next; } else { curr.next = l2; l2 = l2.next; } curr = curr.next; }",
                     "while (l1 != NULL) { if (l1.val <= l2.val) { curr.next = l1; l1 = l1.next; } else { curr.next = l2; l2 = l2.next; } curr = curr.next; }",
                     "while (l1 != NULL && l2 != NULL) { if (l1.val <= l2.val) { curr.next = l1; l2 = l2.next; } else { curr.next = l2; l1 = l1.next; } curr = curr.next; }"]},
    ],
    "detectCycle": [
        {"subtlety": 2, "line": 1,
         "buggy": "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next; }",
         "fix":   "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; }",
         "explanation": "fast = fast.next moves at the same speed as slow — they never meet in an acyclic list and loop forever in a cycle",
         "options": ["while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; }",
                     "while (fast != NULL) { slow = slow.next; fast = fast.next.next; }",
                     "while (fast != NULL && fast.next != NULL) { slow = slow.next.next; fast = fast.next.next; }"]},
        {"subtlety": 1, "line": 2, "buggy": "if (slow == fast) return false;",
         "fix": "if (slow == fast) return true;",
         "explanation": "The pointers meeting is the PROOF of a cycle — returning false inverts the answer",
         "options": ["if (slow == fast) return true;", "if (slow != fast) return true;", "if (fast == NULL) return true;"]},
        {"subtlety": 3, "line": 1,
         "buggy": "while (fast != NULL && slow.next != NULL) { slow = slow.next; fast = fast.next.next; }",
         "fix":   "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; }",
         "explanation": "fast is the pointer that jumps two nodes — guarding slow.next instead of fast.next lets fast.next.next dereference NULL",
         "options": ["while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; }",
                     "while (fast.next != NULL) { slow = slow.next; fast = fast.next.next; }",
                     "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next; }"]},
    ],
    "sortList": [
        {"subtlety": 3, "line": 3, "buggy": "mid = slow; slow.next = NULL;",
         "fix": "mid = slow.next; slow.next = NULL;",
         "explanation": "mid = slow splits at slow (predecessor of midpoint) instead of slow.next",
         "options": ["mid = slow.next; slow.next = NULL;",
                     "mid = slow; slow = NULL;",
                     "mid = fast; slow.next = NULL;"]},
        {"subtlety": 1, "line": 4, "buggy": "return merge(sortList(head), sortList(head));",
         "fix": "return merge(sortList(head), sortList(mid));",
         "explanation": "Recursing on head twice sorts the first half twice — the second half is dropped entirely",
         "options": ["return merge(sortList(head), sortList(mid));",
                     "return merge(sortList(mid), sortList(mid));",
                     "return sortList(merge(head, mid));"]},
        {"subtlety": 2, "line": 3, "buggy": "mid = slow.next;",
         "fix": "mid = slow.next; slow.next = NULL;",
         "explanation": "Without cutting slow.next, sortList(head) still sees the whole list — the recursion never shrinks and never terminates",
         "options": ["mid = slow.next; slow.next = NULL;",
                     "mid = slow.next; slow = NULL;",
                     "mid = slow; slow.next = NULL;"]},
    ],
}


def _pick_bug_variant(variants: list[dict], intra: int | None, seed: int) -> dict:
    """Nearest-subtlety selection with deterministic rotation among ties."""
    target = intra if intra in (1, 2, 3) else 2
    best_dist = min(abs(v.get("subtlety", 2) - target) for v in variants)
    pool = [v for v in variants if abs(v.get("subtlety", 2) - target) == best_dist]
    return pool[seed % len(pool)]


CONCEPT_HINTS: dict[str, str] = {
    "pointer_assignment": "Focus on which pointer gets overwritten — once you reassign it, can you still reach the original node?",
    "node_creation":      "Think about when the new node needs to exist before you can link it into the list.",
    "traversal":          "Think about where your loop should stop — one node too early or too late changes everything.",
    "memory_management":  "Make sure you save a reference before you overwrite the pointer that points there.",
    "list_structure":     "Consider the whole list state — what does head point to after each step?",
}

# ── Post-question extension questions (analysis card "Consider" section) ───────
# One is picked at random per question; "Ask the tutor" seeds the chat with it.
CONSIDER: dict[str, list[str]] = {
    "insertAtHead": [
        "What would change if the list were empty when this ran?",
        "Why must newNode.next = head happen before head = newNode?",
    ],
    "insertAtTail": [
        "Which line would break if the list were empty, and how would you guard it?",
        "How could a tail pointer make this O(1) instead of walking the whole list?",
    ],
    "removeAtHead": [
        "What should happen if the list is already empty?",
        "Why do we save head into temp before advancing it?",
    ],
    "removeAtTail": [
        "Why does the loop check curr.next.next instead of curr.next?",
        "What happens if the list has only one node?",
    ],
    "insertIntoEmpty": [
        "How is this different from insertAtHead on a non-empty list?",
        "Why must newNode.next be NULL here rather than head?",
    ],
    "deleteEntireList": [
        "Why do we save curr.next into temp before freeing the node?",
        "What would go wrong if we set head = NULL first and then tried to free the nodes?",
    ],
    "insertAtPosition": [
        "What should happen if index is larger than the list length?",
        "Why does the loop walk to index-1 instead of index?",
    ],
    "removeAtPosition": [
        "Why does the loop stop at the node BEFORE the target?",
        "Would this code still work if the target were the head node?",
    ],
    "reverseList": [
        "Why do we need THREE pointers (prev, curr, temp) instead of two?",
        "What does head point to at the moment the loop finishes?",
    ],
    "mergeSortedLists": [
        "Why does the dummy-node technique simplify this code?",
        "What happens to the leftover nodes when one list runs out first?",
    ],
    "detectCycle": [
        "Why are the fast and slow pointers guaranteed to meet if there is a cycle?",
        "How would you find WHERE the cycle starts, not just whether one exists?",
    ],
    "sortList": [
        "Why is merge sort a better fit for linked lists than quicksort?",
        "How do you find the middle of a linked list in a single pass?",
    ],
}


def consider_for(operation: str) -> list[str]:
    return CONSIDER.get(operation, ["What edge case could break this operation?"])


def step_hints_for(operation: str) -> list[str]:
    """Per-line Socratic hints, parallel to TEMPLATES[op]['pseudocode'].
    One table serves all three question types (they render the same lines):
    fill_blank keys by the blank's line, find_bug by the clicked/bug line,
    ordering by the misplaced step (see frontend stepHints.js)."""
    return TEMPLATES.get(operation, {}).get("step_hints") or []


def generate_static_question(
    operation: str,
    emotion: str = "engaged",
    consecutive_passes: int = 0,
    concept_mastery: dict[str, float] | None = None,
    intra_level: int | None = None,
) -> dict:
    """
    Instant question generation — no AI, no network calls.
    Returns a valid question dict compatible with the frontend game board.

    intra_level (state axis): when set, node count + distractor count come from
    INTRA_KNOBS["ordering"]. When None, legacy behaviour (emotion → nodes,
    consecutive_passes → distractors) is used.
    """
    tmpl = TEMPLATES.get(operation)
    if not tmpl:
        raise ValueError(f"Unknown operation: {operation}")

    is_merge     = tmpl.get("isMerge", False)
    needs_value  = tmpl["needsValue"]
    needs_pos    = tmpl["needsPosition"]

    knobs = resolve_intra("ordering", intra_level)
    if knobs:
        node_count = _node_count_for(tmpl, knobs["node_count"])
        n_dist     = min(knobs["distractors"], len(tmpl["distractors"]))
    else:
        # Legacy: node count from emotion, distractor count from consecutive passes
        base_nodes = {"frustrated": 2, "confused": 2, "engaged": 3, "bored": 4}.get(emotion, 3)
        node_count = _node_count_for(tmpl, base_nodes)
        n_dist     = _distractor_count(consecutive_passes, 2)

    # Pick hint targeting the student's weakest concept for this operation
    hint = tmpl["hint"]
    if concept_mastery:
        concepts = concepts_for_op(operation)
        if concepts:
            weakest = min(concepts, key=lambda c: concept_mastery.get(c, 0.0))
            hint = CONCEPT_HINTS.get(weakest, hint)

    if is_merge:
        n = max(2, node_count - 1)
        l1 = sorted(random.sample(range(1, 50), n))
        l2 = sorted(random.sample([v for v in range(1, 50) if v not in l1], n))
        goal = sorted(l1 + l2)
        initial_nodes = [{"id": i + 1, "value": v, "next": i + 2 if i + 1 < len(l1) else None} for i, v in enumerate(l1)]
        return instantiate({
            "id": str(uuid.uuid4()), "title": tmpl["title"], "operation": operation,
            "operationValue": {"l1Values": l1, "l2Values": l2}, "operationPosition": None,
            "pseudocode": tmpl["pseudocode"], "correctOrder": tmpl["correctOrder"],
            "validOrders": tmpl.get("validOrders", [tmpl["correctOrder"]]),
            "distractors": _pick(tmpl["distractors"], n_dist),
            "initialNodes": initial_nodes, "goalPattern": goal,
            "hint": hint, "isMerge": True, "l1Values": l1, "l2Values": l2,
        })

    # Build random initial nodes
    if node_count > 0:
        vals = random.sample(range(1, 100), node_count)
        nodes = [{"id": i + 1, "value": v, "next": i + 2 if i + 1 < node_count else None}
                 for i, v in enumerate(vals)]
    else:
        nodes = []

    op_value = None
    op_pos   = None

    if needs_value:
        used = {n["value"] for n in nodes}
        op_value = random.choice([v for v in range(1, 100) if v not in used])

    if needs_pos and node_count >= 2:
        op_pos = _rand_position(operation, node_count)

    # Compute goalPattern via executor (ground truth)
    result = execute_operation(operation, nodes, op_value, op_pos)
    goal   = result["values"]

    return instantiate({
        "id": str(uuid.uuid4()), "title": tmpl["title"], "operation": operation,
        "operationValue": op_value, "operationPosition": op_pos,
        "pseudocode": tmpl["pseudocode"], "correctOrder": tmpl["correctOrder"],
        "validOrders": tmpl.get("validOrders", [tmpl["correctOrder"]]),
        "distractors": _pick(tmpl["distractors"], n_dist),
        "initialNodes": nodes, "goalPattern": goal,
        "hint": hint, "isMerge": False,
        **({"cycleTo": 1} if operation == "detectCycle" and node_count >= 2 else {}),
    })


def _pick(pool: list, k: int = 2) -> list:
    return random.sample(pool, min(k, len(pool)))


def _build_nodes_and_goal(operation: str, tmpl: dict, node_count: int):
    """Shared helper: build random nodes + op_value/pos + goalPattern.
    Returns (nodes, op_value, op_pos, goal, extra) — extra carries op-specific
    payload fields (merge's l1Values/l2Values, detectCycle's cycleTo)."""
    if tmpl.get("isMerge"):
        n  = max(2, node_count - 1)
        l1 = sorted(random.sample(range(1, 50), n))
        l2 = sorted(random.sample([v for v in range(1, 50) if v not in l1], n))
        nodes = [{"id": i + 1, "value": v, "next": i + 2 if i + 1 < len(l1) else None}
                 for i, v in enumerate(l1)]
        op_value = {"l1Values": l1, "l2Values": l2}
        return nodes, op_value, None, sorted(l1 + l2), {"l1Values": l1, "l2Values": l2}

    needs_value = tmpl["needsValue"]
    needs_pos   = tmpl["needsPosition"]

    if node_count > 0:
        vals  = random.sample(range(1, 100), node_count)
        nodes = [{"id": i + 1, "value": v, "next": i + 2 if i + 1 < node_count else None}
                 for i, v in enumerate(vals)]
    else:
        nodes = []

    op_value = None
    op_pos   = None
    if needs_value:
        used = {n["value"] for n in nodes}
        op_value = random.choice([v for v in range(1, 100) if v not in used])
    if needs_pos and node_count >= 2:
        op_pos = _rand_position(operation, node_count)

    result = execute_operation(operation, nodes, op_value, op_pos)
    # display metadata: the tail loops back to index 1 (LeetCode pos-style);
    # initialNodes stay LINEAR so board/executor logic never walks a real cycle
    extra = {"cycleTo": 1} if operation == "detectCycle" and len(nodes) >= 2 else {}
    return nodes, op_value, op_pos, result["values"], extra


def generate_fill_blank_question(operation: str, spec) -> dict:
    """Static fill-in-the-blank using predefined blank sets (randomly chosen)."""
    tmpl      = TEMPLATES.get(operation)
    blank_sets = _BLANKS.get(operation)
    if not tmpl or not blank_sets:
        return generate_static_question(operation, spec.emotion)

    knobs = resolve_intra("fill_blank", getattr(spec, "intra_difficulty", None))
    if knobs:
        node_count = _node_count_for(tmpl, knobs["node_count"])
        n_opts     = knobs["options"]
        num_blanks = knobs["num_blanks"]
    else:
        node_count = _node_count_for(tmpl, 2)
        n_opts     = 3
        num_blanks = None   # blank every step

    nodes, op_value, op_pos, goal, extra = _build_nodes_and_goal(operation, tmpl, node_count)

    # deterministic rotation: attempt N gets set N % n — consecutive plays of the
    # same operation never repeat the same blank set
    set_idx  = getattr(spec, "variant_seed", 0) % len(blank_sets)
    blanks_d = blank_sets[set_idx]
    pseudocode = tmpl["pseudocode"]
    total = len(pseudocode)
    # Which steps to blank: a subset (easier) or all. Non-blanked steps show the
    # correct code, so the student only fills the chosen ones (completion problem).
    if num_blanks is None or num_blanks >= total:
        blank_idxs = set(range(total))
    else:
        blank_idxs = set(random.sample(range(total), max(1, num_blanks)))

    blanked: list[str] = []
    blanks:  list[dict] = []
    for i, (step, bd) in enumerate(zip(pseudocode, blanks_d)):
        if i not in blank_idxs:
            blanked.append(step)   # full correct step, no blank
            continue
        answer  = bd["a"]
        blanked_step = step.replace(answer, "___", 1)
        options = [answer] + bd["w"][:max(1, n_opts - 1)]
        random.shuffle(options)
        blanked.append(blanked_step)
        blanks.append({"line": i, "answer": answer, "options": options})

    return instantiate({
        "id":              str(uuid.uuid4()),
        "question_type":   "fill_blank",
        "variant":         f"blanks{set_idx}",
        "operation":       operation,
        "title":           tmpl["title"],
        "difficulty":      spec.difficulty,
        "pseudocode":      blanked,
        "blanks":          blanks,
        "initialNodes":    nodes,
        "operationValue":  op_value,
        "operationPosition": op_pos,
        "goalPattern":     goal,
        "hint":            tmpl["hint"],
        "isMerge":         tmpl.get("isMerge", False),
        **extra,
    })


def generate_find_bug_question(operation: str, spec) -> dict:
    """Static find-the-bug fallback using predefined bug variants (selected by
    subtlety ≈ intra_difficulty, rotated deterministically by variant_seed)."""
    tmpl     = TEMPLATES.get(operation)
    variants = _BUGS.get(operation)
    if not tmpl or not variants:
        return generate_static_question(operation, spec.emotion)

    intra = getattr(spec, "intra_difficulty", None)
    seed  = getattr(spec, "variant_seed", 0)
    bug_d = _pick_bug_variant(variants, intra, seed)

    knobs = resolve_intra("find_bug", intra)
    if knobs:
        node_count = _node_count_for(tmpl, knobs["node_count"])
        n_opts     = knobs["options"]
    else:
        node_count = _node_count_for(tmpl, 3)
        n_opts     = None
    nodes, op_value, op_pos, goal, extra = _build_nodes_and_goal(operation, tmpl, node_count)

    # Inject the selected bug into the pseudocode
    pseudocode = list(tmpl["pseudocode"])
    bug_line   = bug_d["line"]
    pseudocode[bug_line] = bug_d["buggy"]

    options = list(bug_d["options"])
    if n_opts and n_opts < len(options):
        fix   = bug_d["fix"]
        wrong = [o for o in options if o != fix][:max(1, n_opts - 1)]
        options = [fix] + wrong
    random.shuffle(options)

    return instantiate({
        "id":              str(uuid.uuid4()),
        "question_type":   "find_bug",
        "operation":       operation,
        "title":           tmpl["title"],
        "difficulty":      spec.difficulty,
        "variant":         f"bug{variants.index(bug_d)}-s{bug_d.get('subtlety', 2)}",
        "pseudocode":      pseudocode,
        "bug_line":        bug_line,
        "bug_explanation": bug_d["explanation"],
        "fix":             bug_d["fix"],
        "options":         options,
        "initialNodes":    nodes,
        "operationValue":  op_value,
        "operationPosition": op_pos,
        "goalPattern":     goal,
        "hint":            tmpl["hint"],
        "isMerge":         tmpl.get("isMerge", False),
        **extra,
    })
