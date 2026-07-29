"""
Static question generator — instant, no AI, no Ollama.

Used for the first question of every session so the student sees
something immediately. AI-generated questions take over from Q2 onwards
via the pre-fetch pipeline.
"""

import random
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
        "pseudocode": ["newNode = createNode(value);", "newNode.next = head;", "head = newNode;"],
        "correctOrder": [0, 1, 2],
        "hint": "What happens to the old head if you overwrite it first?",
        "step_hints": [
            "This step brings a brand-new node into existence — nothing is linked yet.",
            "The new node must grab the old list BEFORE the entry point moves — why?",
            "Only after the new node is wired in can head safely move to it.",
        ],
        "distractors": ["node.next = newNode;", "free(temp);", "while (node.next != NULL) node = node.next;"],
        "needsValue": True, "needsPosition": False, "minNodes": 1,
    },
    "insertAtTail": {
        "title": "Insert at Tail",
        "pseudocode": ["node = head;", "while (node.next != NULL) node = node.next;", "newNode = createNode(value);", "node.next = newNode;", "newNode.next = NULL;"],
        "correctOrder": [0, 1, 2, 3, 4],
        "validOrders": [[0, 1, 2, 3, 4], [0, 2, 1, 3, 4], [2, 0, 1, 3, 4]],
        "hint": "Traverse to the last node before linking.",
        "step_hints": [
            "Traversal needs a starting point — which pointer marks the front?",
            "Where exactly does this loop stop, and why is that the right node?",
            "Creating the node touches nothing in the list — it just has to exist before linking.",
            "This is the moment the list actually grows — who links to whom?",
            "A tail must promise the list ends here — what marks the end?",
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
            "Why keep a reference to the node you're about to abandon?",
            "The entry point skips forward — what still remembers the old head?",
            "Memory can only be freed when nothing depends on it — is that true yet?",
        ],
        "distractors": ["node.next = newNode;", "newNode = createNode(value);", "newNode.next = NULL;"],
        "needsValue": False, "needsPosition": False, "minNodes": 2,
    },
    "removeAtTail": {
        "title": "Remove Last Node",
        "pseudocode": ["node = head;", "while (node.next.next != NULL) node = node.next;", "temp = node.next;", "node.next = NULL;", "free(temp);"],
        "correctOrder": [0, 1, 2, 3, 4],
        "hint": "Stop at the second-to-last node.",
        "step_hints": [
            "You can't walk backwards in a singly linked list — start at the front.",
            "Why stop at the SECOND-to-last node instead of the last one?",
            "Mark the doomed node — you still need a handle on it to free it.",
            "The second-to-last node becomes the new tail — what must its next say?",
            "Free the old tail only after the list no longer points to it.",
        ],
        "distractors": ["head = head.next;", "newNode = createNode(value);", "node.next = newNode;"],
        "needsValue": False, "needsPosition": False, "minNodes": 2,
    },
    "insertIntoEmpty": {
        "title": "Insert into Empty List",
        "pseudocode": ["newNode = createNode(value);", "newNode.next = NULL;", "head = newNode;"],
        "correctOrder": [0, 1, 2],
        "hint": "The new node becomes the only element.",
        "step_hints": [
            "First the node must exist — creation always precedes connection.",
            "The only node is also the LAST node — what ends a list?",
            "An empty list's head is NULL — when does it finally point at something?",
        ],
        "distractors": ["newNode.next = head;", "free(temp);", "node = head;"],
        "needsValue": True, "needsPosition": False, "minNodes": 0, "startsEmpty": True,
    },
    "deleteEntireList": {
        "title": "Delete Entire List",
        "pseudocode": ["node = head;", "while (node != NULL) { temp = node.next; free(node); node = temp; }", "head = NULL;"],
        "correctOrder": [0, 1, 2],
        "hint": "Traverse and free each node, then null the head.",
        "step_hints": [
            "You need a traversal pointer to visit every node — where does it begin?",
            "Inside the loop: why must temp save node.next BEFORE the free?",
            "After every node is gone, what should the entry point say?",
        ],
        "distractors": ["newNode = createNode(value);", "node.next = newNode;", "newNode.next = head;"],
        "needsValue": False, "needsPosition": False, "minNodes": 2,
    },
    "insertAtPosition": {
        "title": "Insert at Position",
        "pseudocode": ["node = head;", "for (int i = 0; i < position-1; i++) node = node.next;", "newNode = createNode(value);", "newNode.next = node.next;", "node.next = newNode;"],
        "correctOrder": [0, 1, 2, 3, 4],
        "validOrders": [[0, 1, 2, 3, 4], [0, 2, 1, 3, 4], [2, 0, 1, 3, 4]],
        "hint": "Walk to the predecessor, then splice in.",
        "step_hints": [
            "Walking to a position always starts at the front.",
            "The walk stops at position-1 — which node do you need to be standing on, and why?",
            "Creating the node doesn't touch the list — it just has to exist before linking.",
            "The new node grabs its future neighbour BEFORE the chain is rewired — what would be lost otherwise?",
            "Now the predecessor lets go of its old neighbour — is that neighbour already saved somewhere?",
        ],
        "distractors": ["head = newNode;", "free(temp);", "while (node.next != NULL) node = node.next;"],
        "needsValue": True, "needsPosition": True, "minNodes": 2,
    },
    "removeAtPosition": {
        "title": "Remove at Position",
        "pseudocode": ["node = head;", "for (int i = 0; i < position-2; i++) node = node.next;", "temp = node.next;", "node.next = temp.next;", "free(temp);"],
        "correctOrder": [0, 1, 2, 3, 4],
        "hint": "Walk to the predecessor, bypass the target.",
        "step_hints": [
            "Start at the front — to remove a node you need the node BEFORE it.",
            "This walk stops at the target's predecessor — why the predecessor and not the target?",
            "temp marks the node being removed — keep a handle on it for the free.",
            "The chain bypasses the doomed node here — trace exactly who now connects to whom.",
            "Free the node only after the list no longer routes through it.",
        ],
        "distractors": ["newNode = createNode(value);", "newNode.next = node.next;", "head = head.next;"],
        "needsValue": False, "needsPosition": True, "minNodes": 3,
    },
    "reverseList": {
        "title": "Reverse Linked List",
        "pseudocode": ["prev = NULL;", "node = head;", "while (node != NULL) { temp = node.next; node.next = prev; prev = node; node = temp; }", "head = prev;"],
        "correctOrder": [0, 1, 2, 3],
        "hint": "Reverse each pointer one at a time.",
        "step_hints": [
            "The old first node will become the tail — what should it end up pointing to?",
            "The traversal pointer starts at the old front of the list.",
            "Three pointers rotate inside this loop — why must temp save node.next FIRST?",
            "When the loop finishes, which variable is standing on the new front?",
        ],
        "distractors": ["newNode = createNode(value);", "node.next = newNode;", "free(temp);"],
        "needsValue": False, "needsPosition": False, "minNodes": 2,
    },
    "mergeSortedLists": {
        "title": "Merge Two Sorted Lists",
        "pseudocode": ["dummy = createNode(0); node = dummy;", "while (l1 != NULL && l2 != NULL) { if (l1.val <= l2.val) { node.next = l1; l1 = l1.next; } else { node.next = l2; l2 = l2.next; } node = node.next; }", "node.next = (l1 != NULL) ? l1 : l2;", "return dummy.next;"],
        "correctOrder": [0, 1, 2, 3],
        "hint": "Use a dummy node; always attach the smaller value.",
        "step_hints": [
            "The dummy gives the result list a fixed anchor — why does that simplify every later step?",
            "Each round attaches the SMALLER front node — and then which list advances?",
            "One list ran out — what happens to everything left in the other?",
            "Why return dummy.next and not dummy itself?",
        ],
        "distractors": ["head = prev;", "while (node.next != NULL) node = node.next;", "free(temp);"],
        "needsValue": False, "needsPosition": False, "minNodes": 0, "isMerge": True,
    },
    "detectCycle": {
        "title": "Linked List Cycle",
        "pseudocode": ["slow = head; fast = head;", "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; }", "if (slow == fast) return true;", "return false;"],
        "correctOrder": [0, 1, 2, 3],
        "hint": "Floyd's algorithm: fast pointer moves twice as fast.",
        "step_hints": [
            "Two runners leave the same starting line — their speeds are what differ.",
            "Why must FAST be the one checked against NULL, not slow?",
            "If the two runners ever stand on the same node, what does that prove?",
            "Fast reached the end of the list — could a cycle have existed?",
        ],
        "distractors": ["newNode = createNode(value);", "node.next = newNode;", "head = prev;"],
        "needsValue": False, "needsPosition": False, "minNodes": 3,
    },
    "sortList": {
        "title": "Sort Linked List",
        "pseudocode": ["if (head == NULL || head.next == NULL) return head;", "slow = head; fast = head.next;", "while (fast && fast.next) { slow = slow.next; fast = fast.next.next; }", "mid = slow.next; slow.next = NULL;", "return merge(sortList(head), sortList(mid));"],
        "correctOrder": [0, 1, 2, 3, 4],
        "hint": "Split at midpoint using slow/fast, then merge sort.",
        "step_hints": [
            "Recursion needs a base case — which lists are already sorted for free?",
            "slow/fast again — but this time the goal is finding what?",
            "When fast hits the end, where exactly is slow standing?",
            "The split must truly CUT the list in two — why set slow.next to NULL?",
            "Two sorted halves remain — which earlier operation joins them into one?",
        ],
        "distractors": ["head = prev;", "newNode = createNode(value);", "node.next = newNode;"],
        "needsValue": False, "needsPosition": False, "minNodes": 3,
    },
}


# ── Fill-blank definitions (answer + 2 wrong options per pseudocode step) ─────
# Each list entry corresponds to the same-index pseudocode step.
# Each operation has 4 blank sets, rotated deterministically by variant_seed.
# "a" = correct answer (must be findable via str.replace(a, "___", 1) in the step text)
# "w" = two wrong options
_BLANKS: dict[str, list[list[dict]]] = {
    # ["newNode = createNode(value);", "newNode.next = head;", "head = newNode;"]
    "insertAtHead": [
        [  # A: what does each var point to?
            {"a": "newNode",          "w": ["head",    "temp"]},
            {"a": "head",             "w": ["head.next","NULL"]},
            {"a": "newNode",          "w": ["head",    "temp"]},
        ],
        [  # B: which role does each var play?
            {"a": "createNode(value)","w": ["NULL",    "head"]},
            {"a": "newNode",          "w": ["head",    "temp"]},
            {"a": "head",             "w": ["newNode", "NULL"]},
        ],
        [  # C: fields & call arguments
            {"a": "value",   "w": ["head",         "newNode"]},
            {"a": "next",    "w": ["val",          "prev"]},
            {"a": "newNode", "w": ["newNode.next", "head.next"]},
        ],
        [  # D: functions & assignment targets
            {"a": "createNode",   "w": ["free",      "makeNode"]},
            {"a": "newNode.next", "w": ["head.next", "newNode"]},
            {"a": "head",         "w": ["temp",      "node"]},
        ],
    ],
    # ["node = head;", "while (node.next != NULL) node = node.next;",
    #  "newNode = createNode(value);", "node.next = newNode;", "newNode.next = NULL;"]
    "insertAtTail": [
        [  # A: variable name focus
            {"a": "head",    "w": ["NULL",    "newNode"]},
            {"a": "node.next","w": ["node",   "node.next.next"]},
            {"a": "newNode", "w": ["head",    "temp"]},
            {"a": "newNode", "w": ["head.next","NULL"]},
            {"a": "NULL",    "w": ["newNode", "head"]},
        ],
        [  # B: loop termination & pointer roles
            {"a": "head",    "w": ["NULL",    "newNode"]},
            {"a": "NULL",    "w": ["node",    "node.next"]},
            {"a": "newNode", "w": ["head",    "temp"]},
            {"a": "node.next","w": ["node",   "head"]},
            {"a": "newNode", "w": ["node",    "head"]},
        ],
        [  # C: fields & call arguments
            {"a": "node",         "w": ["newNode",  "temp"]},
            {"a": "next",         "w": ["val",      "prev"]},
            {"a": "value",        "w": ["node",     "NULL"]},
            {"a": "next",         "w": ["val",      "prev"]},
            {"a": "newNode.next", "w": ["newNode",  "node.next"]},
        ],
        [  # D: loop body & functions
            {"a": "head",             "w": ["head.next", "temp"]},
            {"a": "node = node.next", "w": ["node = node.next.next", "node.next = node"]},
            {"a": "createNode",       "w": ["free",      "newNode"]},
            {"a": "newNode",          "w": ["NULL",      "node"]},
            {"a": "NULL",             "w": ["node",      "head"]},
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
            {"a": "temp",    "w": ["node",    "head"]},
            {"a": "head",    "w": ["temp",    "NULL"]},
            {"a": "temp",    "w": ["node",    "prev"]},
        ],
        [  # C: fields & functions
            {"a": "head", "w": ["head.next",  "temp.next"]},
            {"a": "next", "w": ["val",        "prev"]},
            {"a": "free", "w": ["createNode", "delete"]},
        ],
        [  # D: what gets saved and freed
            {"a": "temp",      "w": ["node",      "newNode"]},
            {"a": "head.next", "w": ["temp.next", "head"]},
            {"a": "temp",      "w": ["head.next", "node.next"]},
        ],
    ],
    # ["node = head;", "while (node.next.next != NULL) node = node.next;",
    #  "temp = node.next;", "node.next = NULL;", "free(temp);"]
    "removeAtTail": [
        [  # A: condition & what to save
            {"a": "head",          "w": ["NULL",   "temp"]},
            {"a": "node.next.next","w": ["node.next","node"]},
            {"a": "node.next",     "w": ["node",   "head"]},
            {"a": "NULL",          "w": ["temp",   "node.next"]},
            {"a": "temp",          "w": ["node",   "head"]},
        ],
        [  # B: termination value & pointer assignment
            {"a": "head",      "w": ["NULL",     "temp"]},
            {"a": "NULL",      "w": ["node",     "node.next"]},
            {"a": "temp",      "w": ["node",     "head"]},
            {"a": "node.next", "w": ["node",     "head"]},
            {"a": "temp",      "w": ["node",     "prev"]},
        ],
        [  # C: loop body & functions
            {"a": "node",             "w": ["temp", "tail"]},
            {"a": "node = node.next", "w": ["node = node.next.next", "node.next = node"]},
            {"a": "next",             "w": ["val",  "prev"]},
            {"a": "next",             "w": ["val",  "prev"]},
            {"a": "free",             "w": ["delete", "createNode"]},
        ],
        [  # D: comparison & saved references
            {"a": "head", "w": ["head.next", "NULL"]},
            {"a": "!=",   "w": ["==",        "="]},
            {"a": "temp", "w": ["node",      "prev"]},
            {"a": "NULL", "w": ["newNode",   "head"]},
            {"a": "temp", "w": ["node.next", "head"]},
        ],
    ],
    # ["newNode = createNode(value);", "newNode.next = NULL;", "head = newNode;"]
    "insertIntoEmpty": [
        [  # A: pointer values
            {"a": "newNode",          "w": ["head", "temp"]},
            {"a": "NULL",             "w": ["newNode","head"]},
            {"a": "newNode",          "w": ["NULL",  "temp"]},
        ],
        [  # B: variable roles
            {"a": "createNode(value)","w": ["NULL", "head"]},
            {"a": "newNode",          "w": ["head", "temp"]},
            {"a": "head",             "w": ["newNode","NULL"]},
        ],
        [  # C: fields & call arguments
            {"a": "value",   "w": ["NULL",         "0"]},
            {"a": "next",    "w": ["val",          "prev"]},
            {"a": "newNode", "w": ["newNode.next", "node"]},
        ],
        [  # D: functions & assignment targets
            {"a": "createNode",   "w": ["free",      "getNode"]},
            {"a": "newNode.next", "w": ["newNode",   "head.next"]},
            {"a": "head",         "w": ["head.next", "temp"]},
        ],
    ],
    # ["node = head;", "while (node != NULL) { temp = node.next; free(node); node = temp; }", "head = NULL;"]
    "deleteEntireList": [
        [  # A: condition variable
            {"a": "head",    "w": ["NULL",   "temp"]},
            {"a": "node",    "w": ["node.next","temp"]},
            {"a": "NULL",    "w": ["temp",   "head.next"]},
        ],
        [  # B: what temp saves
            {"a": "node",    "w": ["head",   "temp"]},
            {"a": "node.next","w": ["node",  "temp"]},
            {"a": "NULL",    "w": ["temp",   "head"]},
        ],
        [  # C: traversal pointer & the free call
            {"a": "node", "w": ["temp",   "head.next"]},
            {"a": "free", "w": ["delete", "createNode"]},
            {"a": "NULL", "w": ["node",   "newNode"]},
        ],
        [  # D: saving before freeing
            {"a": "head", "w": ["head.next", "NULL"]},
            {"a": "temp", "w": ["node",      "head"]},
            {"a": "head", "w": ["node",      "temp"]},
        ],
    ],
    # ["node = head;", "for (int i = 0; i < position-1; i++) node = node.next;",
    #  "newNode = createNode(value);", "newNode.next = node.next;", "node.next = newNode;"]
    "insertAtPosition": [
        [  # A: what each pointer is set to
            {"a": "head",      "w": ["NULL",    "newNode"]},
            {"a": "position-1","w": ["position","position-2"]},
            {"a": "newNode",   "w": ["head",    "temp"]},
            {"a": "node.next", "w": ["node",    "NULL"]},
            {"a": "newNode",   "w": ["node.next","NULL"]},
        ],
        [  # B: which variable owns the pointer
            {"a": "head",      "w": ["NULL",    "newNode"]},
            {"a": "position-1","w": ["position","position-2"]},
            {"a": "newNode",   "w": ["head",    "temp"]},
            {"a": "newNode",   "w": ["node",    "head"]},
            {"a": "node.next", "w": ["node",    "head"]},
        ],
        [  # C: loop body & call arguments
            {"a": "node",             "w": ["newNode", "temp"]},
            {"a": "node = node.next", "w": ["node = node.next.next", "node.next = node"]},
            {"a": "value",            "w": ["position", "NULL"]},
            {"a": "next",             "w": ["val",      "prev"]},
            {"a": "newNode",          "w": ["newNode.next", "temp"]},
        ],
        [  # D: loop start & splice targets
            {"a": "head",         "w": ["NULL",    "head.next"]},
            {"a": "0",            "w": ["1",       "-1"]},
            {"a": "createNode",   "w": ["free",    "newNode"]},
            {"a": "newNode.next", "w": ["newNode", "node.next"]},
            {"a": "node.next",    "w": ["newNode.next", "node"]},
        ],
    ],
    # ["node = head;", "for (int i = 0; i < position-2; i++) node = node.next;",
    #  "temp = node.next;", "node.next = temp.next;", "free(temp);"]
    "removeAtPosition": [
        [  # A: what to save and bypass
            {"a": "head",      "w": ["NULL",     "temp"]},
            {"a": "position-2","w": ["position-1","position"]},
            {"a": "node.next", "w": ["node",     "temp"]},
            {"a": "temp.next", "w": ["temp",     "node.next"]},
            {"a": "temp",      "w": ["node",     "head"]},
        ],
        [  # B: which variable owns each role
            {"a": "head",      "w": ["NULL",     "temp"]},
            {"a": "position-2","w": ["position-1","position"]},
            {"a": "temp",      "w": ["node",     "head"]},
            {"a": "node.next", "w": ["node",     "head"]},
            {"a": "temp",      "w": ["node",     "prev"]},
        ],
        [  # C: loop body & fields
            {"a": "node",             "w": ["temp", "prev"]},
            {"a": "node = node.next", "w": ["node = node.next.next", "temp = node.next"]},
            {"a": "next",             "w": ["val",  "prev"]},
            {"a": "next",             "w": ["val",  "prev"]},
            {"a": "free",             "w": ["delete", "remove"]},
        ],
        [  # D: loop start & bypass targets
            {"a": "head",      "w": ["head.next", "NULL"]},
            {"a": "0",         "w": ["1",         "2"]},
            {"a": "temp",      "w": ["node",      "mid"]},
            {"a": "temp.next", "w": ["temp",      "temp.next.next"]},
            {"a": "temp",      "w": ["node.next", "head"]},
        ],
    ],
    # ["prev = NULL;", "node = head;",
    #  "while (node != NULL) { temp = node.next; node.next = prev; prev = node; node = temp; }",
    #  "head = prev;"]
    "reverseList": [
        [  # A: what prev is set to at each step
            {"a": "NULL", "w": ["head",  "temp"]},
            {"a": "head", "w": ["NULL",  "prev"]},
            {"a": "prev", "w": ["node",  "temp"]},
            {"a": "prev", "w": ["node",  "temp"]},
        ],
        [  # B: what saves the next pointer
            {"a": "NULL", "w": ["head",  "temp"]},
            {"a": "head", "w": ["NULL",  "prev"]},
            {"a": "temp", "w": ["prev",  "node"]},
            {"a": "prev", "w": ["node",  "temp"]},
        ],
        [  # C: the reversal assignment itself
            {"a": "prev",             "w": ["temp", "node"]},
            {"a": "node",             "w": ["temp", "prev"]},
            {"a": "node.next = prev", "w": ["prev = node.next", "node = prev"]},
            {"a": "prev",             "w": ["temp", "node.next"]},
        ],
        [  # D: saving before overwriting
            {"a": "NULL",             "w": ["head",      "node"]},
            {"a": "head",             "w": ["head.next", "temp"]},
            {"a": "temp = node.next", "w": ["temp = node", "node = node.next"]},
            {"a": "head",             "w": ["node",      "head.next"]},
        ],
    ],
    # ["dummy = createNode(0); node = dummy;",
    #  "while (l1 != NULL && l2 != NULL) { ... }",
    #  "node.next = (l1 != NULL) ? l1 : l2;",
    #  "return dummy.next;"]
    "mergeSortedLists": [
        [  # A: l1 conditions
            {"a": "dummy",     "w": ["head", "NULL"]},
            {"a": "l1",        "w": ["l2",   "NULL"]},
            {"a": "l1",        "w": ["l2",   "NULL"]},
            {"a": "dummy.next","w": ["dummy","node"]},
        ],
        [  # B: l2 conditions
            {"a": "dummy",     "w": ["head", "NULL"]},
            {"a": "l2",        "w": ["l1",   "NULL"]},
            {"a": "l2",        "w": ["l1",   "NULL"]},
            {"a": "dummy.next","w": ["dummy","node"]},
        ],
        [  # C: comparison & guard conditions
            {"a": "createNode(0)",    "w": ["createNode(value)", "NULL"]},
            {"a": "l1.val <= l2.val", "w": ["l1.val >= l2.val",  "l1 <= l2"]},
            {"a": "l1 != NULL",       "w": ["l1 == NULL",        "l2 != NULL"]},
            {"a": "dummy.next",       "w": ["dummy",             "node.next"]},
        ],
        [  # D: anchors & the advance step
            {"a": "dummy",            "w": ["head",         "node"]},
            {"a": "node = node.next", "w": ["node = dummy", "l1 = l1.next"]},
            {"a": "NULL",             "w": ["l2",           "dummy"]},
            {"a": "dummy",            "w": ["node",         "head"]},
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
            {"a": "fast",  "w": ["slow",  "node"]},
            {"a": "NULL",  "w": ["head",  "slow"]},
            {"a": "slow",  "w": ["fast",  "head"]},
            {"a": "false", "w": ["true",  "NULL"]},
        ],
        [  # C: pointer advances & the comparison
            {"a": "slow",      "w": ["fast",  "node"]},
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
        {"subtlety": 1, "line": 3, "buggy": "node.next = node.next;",
         "fix": "node.next = newNode;",
         "explanation": "node.next = node.next creates a self-loop instead of linking the new node",
         "options": ["node.next = newNode;", "node.next = NULL;", "newNode.next = node;"]},
        {"subtlety": 2, "line": 1, "buggy": "while (node != NULL) node = node.next;",
         "fix": "while (node.next != NULL) node = node.next;",
         "explanation": "Checking node instead of node.next walks off the end — node is NULL after the loop, so there is nothing to link from",
         "options": ["while (node.next != NULL) node = node.next;",
                     "while (node.next.next != NULL) node = node.next;",
                     "while (node != NULL) node = node.next.next;"]},
        {"subtlety": 3, "line": 4, "buggy": "newNode.next = head;",
         "fix": "newNode.next = NULL;",
         "explanation": "Pointing the new tail back at head creates a cycle — the list must end at NULL",
         "options": ["newNode.next = NULL;", "newNode.next = node;", "node.next = NULL;"]},
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
        {"subtlety": 2, "line": 1, "buggy": "while (node.next != NULL) node = node.next;",
         "fix": "while (node.next.next != NULL) node = node.next;",
         "explanation": "Stopping at node.next == NULL lands on the last node, not its predecessor",
         "options": ["while (node.next.next != NULL) node = node.next;",
                     "while (node != NULL) node = node.next;",
                     "while (node.next != NULL) node = node.next.next;"]},
        {"subtlety": 1, "line": 3, "buggy": "node.next = node;",
         "fix": "node.next = NULL;",
         "explanation": "Pointing the new tail at itself creates a one-node cycle instead of ending the list",
         "options": ["node.next = NULL;", "node = NULL;", "node.next = temp;"]},
        {"subtlety": 3, "line": 2, "buggy": "temp = node.next.next;",
         "fix": "temp = node.next;",
         "explanation": "The loop stopped where node.next.next is NULL, so temp grabs NULL — the old tail is never freed",
         "options": ["temp = node.next;", "temp = node;", "temp = head;"]},
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
        {"subtlety": 2, "line": 0, "buggy": "node = head.next;",
         "fix": "node = head;",
         "explanation": "Starting at head.next skips the first node, causing a memory leak",
         "options": ["node = head;", "node = NULL;", "node = head.next.next;"]},
        {"subtlety": 1, "line": 2, "buggy": "head = head;",
         "fix": "head = NULL;",
         "explanation": "head = head changes nothing — head still points at freed memory (dangling pointer)",
         "options": ["head = NULL;", "head = temp;", "head = node;"]},
        {"subtlety": 3, "line": 1,
         "buggy": "while (node != NULL) { temp = node.next; free(node); node = node.next; }",
         "fix":   "while (node != NULL) { temp = node.next; free(node); node = temp; }",
         "explanation": "After free(node), reading node.next touches freed memory — temp exists to save the next pointer before the free",
         "options": ["while (node != NULL) { temp = node.next; free(node); node = temp; }",
                     "while (node != NULL) { free(node); node = node.next; }",
                     "while (node != NULL) { temp = node; free(node); node = temp; }"]},
    ],
    "insertAtPosition": [
        {"subtlety": 3, "line": 3, "buggy": "newNode.next = node;",
         "fix": "newNode.next = node.next;",
         "explanation": "Pointing to node (predecessor) instead of node.next (successor) corrupts the list",
         "options": ["newNode.next = node.next;", "newNode.next = NULL;", "newNode.next = node.next.next;"]},
        {"subtlety": 1, "line": 4, "buggy": "node.next = node.next;",
         "fix": "node.next = newNode;",
         "explanation": "Self-assignment is a no-op — the new node is created but never linked into the list",
         "options": ["node.next = newNode;", "node = newNode;", "newNode.next = newNode;"]},
        {"subtlety": 2, "line": 1, "buggy": "for (int i = 0; i < position; i++) node = node.next;",
         "fix": "for (int i = 0; i < position-1; i++) node = node.next;",
         "explanation": "Looping to position walks one node too far — you land on the position itself instead of its predecessor",
         "options": ["for (int i = 0; i < position-1; i++) node = node.next;",
                     "for (int i = 0; i < position-2; i++) node = node.next;",
                     "for (int i = 0; i <= position-1; i++) node = node.next;"]},
    ],
    "removeAtPosition": [
        {"subtlety": 3, "line": 3, "buggy": "node.next = temp;",
         "fix": "node.next = temp.next;",
         "explanation": "node.next = temp creates a cycle; it must skip temp by pointing to temp.next",
         "options": ["node.next = temp.next;", "node.next = NULL;", "node.next = temp.next.next;"]},
        {"subtlety": 1, "line": 4, "buggy": "free(node);",
         "fix": "free(temp);",
         "explanation": "node is the predecessor, still part of the list — freeing it corrupts the chain while the removed node leaks",
         "options": ["free(temp);", "free(temp.next);", "free(head);"]},
        {"subtlety": 2, "line": 1, "buggy": "for (int i = 0; i < position-1; i++) node = node.next;",
         "fix": "for (int i = 0; i < position-2; i++) node = node.next;",
         "explanation": "Walking to position-1 stops ON the target — the node AFTER the target gets removed instead",
         "options": ["for (int i = 0; i < position-2; i++) node = node.next;",
                     "for (int i = 0; i < position; i++) node = node.next;",
                     "for (int i = 1; i < position-2; i++) node = node.next;"]},
    ],
    "reverseList": [
        {"subtlety": 3, "line": 2,
         "buggy": "while (node != NULL) { temp = node.next; node.next = prev; prev = node; node = node.next; }",
         "fix":   "while (node != NULL) { temp = node.next; node.next = prev; prev = node; node = temp; }",
         "explanation": "After node.next = prev, node.next has been overwritten — using node.next instead of temp loses the rest of the list",
         "options": ["while (node != NULL) { temp = node.next; node.next = prev; prev = node; node = temp; }",
                     "while (node != NULL) { node.next = prev; prev = node; node = node.next; }",
                     "while (node != NULL) { temp = node.next; prev = node; node.next = prev; node = temp; }"]},
        {"subtlety": 1, "line": 3, "buggy": "head = node;",
         "fix": "head = prev;",
         "explanation": "When the loop exits node is NULL — head = node throws the reversed list away; prev is standing on the new front",
         "options": ["head = prev;", "head = temp;", "head = node.next;"]},
        {"subtlety": 2, "line": 0, "buggy": "prev = head;",
         "fix": "prev = NULL;",
         "explanation": "prev must start as NULL so the old head becomes the tail — starting at head makes the first node point to itself (a cycle)",
         "options": ["prev = NULL;", "prev = head.next;", "prev = temp;"]},
    ],
    "mergeSortedLists": [
        {"subtlety": 2, "line": 2, "buggy": "node.next = (l1 != NULL) ? l2 : l1;",
         "fix": "node.next = (l1 != NULL) ? l1 : l2;",
         "explanation": "Conditions are swapped: attaches l2 when l1 remains and vice versa",
         "options": ["node.next = (l1 != NULL) ? l1 : l2;", "node.next = l1;", "node.next = l2;"]},
        {"subtlety": 1, "line": 3, "buggy": "return dummy;",
         "fix": "return dummy.next;",
         "explanation": "dummy is the placeholder anchor holding value 0 — the merged list starts at dummy.next",
         "options": ["return dummy.next;", "return node;", "return l1;"]},
        {"subtlety": 3, "line": 1,
         "buggy": "while (l1 != NULL || l2 != NULL) { if (l1.val <= l2.val) { node.next = l1; l1 = l1.next; } else { node.next = l2; l2 = l2.next; } node = node.next; }",
         "fix":   "while (l1 != NULL && l2 != NULL) { if (l1.val <= l2.val) { node.next = l1; l1 = l1.next; } else { node.next = l2; l2 = l2.next; } node = node.next; }",
         "explanation": "With || the loop keeps running after one list is exhausted — l1.val then dereferences NULL",
         "options": ["while (l1 != NULL && l2 != NULL) { if (l1.val <= l2.val) { node.next = l1; l1 = l1.next; } else { node.next = l2; l2 = l2.next; } node = node.next; }",
                     "while (l1 != NULL) { if (l1.val <= l2.val) { node.next = l1; l1 = l1.next; } else { node.next = l2; l2 = l2.next; } node = node.next; }",
                     "while (l1 != NULL && l2 != NULL) { if (l1.val <= l2.val) { node.next = l1; l2 = l2.next; } else { node.next = l2; l1 = l1.next; } node = node.next; }"]},
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
        "Why does the loop check node.next.next instead of node.next?",
        "What happens if the list has only one node?",
    ],
    "insertIntoEmpty": [
        "How is this different from insertAtHead on a non-empty list?",
        "Why must newNode.next be NULL here rather than head?",
    ],
    "deleteEntireList": [
        "Why do we save node.next into temp before freeing the node?",
        "What would go wrong if we set head = NULL first and then tried to free the nodes?",
    ],
    "insertAtPosition": [
        "What should happen if position is larger than the list length?",
        "Why does the loop walk to position-1 instead of position?",
    ],
    "removeAtPosition": [
        "Why does the loop stop at the node BEFORE the target?",
        "Would this code still work if the target were the head node?",
    ],
    "reverseList": [
        "Why do we need THREE pointers (prev, node, temp) instead of two?",
        "What does head point to at the moment the loop finishes?",
    ],
    "mergeSortedLists": [
        "Why does the dummy-node trick simplify this code?",
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
        return {
            "id": str(uuid.uuid4()), "title": tmpl["title"], "operation": operation,
            "operationValue": {"l1Values": l1, "l2Values": l2}, "operationPosition": None,
            "pseudocode": tmpl["pseudocode"], "correctOrder": tmpl["correctOrder"],
            "validOrders": tmpl.get("validOrders", [tmpl["correctOrder"]]),
            "distractors": _pick(tmpl["distractors"], n_dist),
            "initialNodes": initial_nodes, "goalPattern": goal,
            "hint": hint, "isMerge": True, "l1Values": l1, "l2Values": l2,
        }

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
        op_pos = random.randint(2, node_count)

    # Compute goalPattern via executor (ground truth)
    result = execute_operation(operation, nodes, op_value, op_pos)
    goal   = result["values"]

    return {
        "id": str(uuid.uuid4()), "title": tmpl["title"], "operation": operation,
        "operationValue": op_value, "operationPosition": op_pos,
        "pseudocode": tmpl["pseudocode"], "correctOrder": tmpl["correctOrder"],
        "validOrders": tmpl.get("validOrders", [tmpl["correctOrder"]]),
        "distractors": _pick(tmpl["distractors"], n_dist),
        "initialNodes": nodes, "goalPattern": goal,
        "hint": hint, "isMerge": False,
    }


def _pick(pool: list, k: int = 2) -> list:
    return random.sample(pool, min(k, len(pool)))


def _build_nodes_and_goal(operation: str, tmpl: dict, node_count: int):
    """Shared helper: build random nodes + op_value/pos + goalPattern."""
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
        op_pos = random.randint(2, node_count)

    result = execute_operation(operation, nodes, op_value, op_pos)
    return nodes, op_value, op_pos, result["values"]


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

    nodes, op_value, op_pos, goal = _build_nodes_and_goal(operation, tmpl, node_count)

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

    return {
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
    }


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
    nodes, op_value, op_pos, goal = _build_nodes_and_goal(operation, tmpl, node_count)

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

    return {
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
    }
