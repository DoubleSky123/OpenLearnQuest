"""
Static question generator — instant, no AI, no Ollama.

Used for the first question of every session so the student sees
something immediately. AI-generated questions take over from Q2 onwards
via the pre-fetch pipeline.
"""

import copy
import dataclasses
import random
import re
import uuid

from .ll_executor import execute_operation
from .concept_graph import concepts_for_op
from .question_spec import resolve_intra
from . import item_quality


def valid_orders_for(operation: str) -> list[list[int]]:
    """Every step order that is a correct program — computed by the item
    harness, not hand-listed (the hand-listed ones missed 7 ops' legal orders)."""
    return [list(o) for o in item_quality.template_valid_orders(operation)]


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
#
# Only CODE fields are rewritten — explanations and hints are English prose
# where "value" is an ordinary noun. `.value` is the Node FIELD and is never
# touched (`l1.value <= l2.value` must not become `l1.18 <= l2.18`).
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
    return re.sub(r"(?<!\.)\bvalue\b", value, out)


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


def _board_sizes(tmpl: dict, node_count: int, targeted: bool) -> list[int]:
    """List lengths to try, the knob's first. A targeted item must SHOW its
    misconception, and some only show on one length (`curr = head.next` breaks
    insertAtTail only on a one-node list; `.next.next` steps only on even
    lengths) — so remediation may leave the difficulty knob's length."""
    if not targeted or tmpl.get("startsEmpty"):
        return [node_count]
    lo = max(1, tmpl["minNodes"])
    return [node_count] + [n for n in range(lo, 6) if n != node_count]


def _size_for(sizes: list[int], attempt: int) -> int:
    return sizes[(attempt // 3) % len(sizes)]

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
        # Ordering distractors are near-misses of real steps, using only names the
        # program has — never usable in place of a step (tests/test_item_quality.py).
        "distractors": ["head.next = newNode;", "newNode.next = head.next;", "newNode = head;"],
        # crux: the steps that carry the big idea — blanked first when only a few are
        "crux": [1, 2],
        "needsValue": True, "needsPosition": False, "minNodes": 1,
    },
    "insertAtTail": {
        "title": "Insert at Tail",
        # No `newNode.next = NULL;` step: createNode already sets next = NULL (the
        # Node reference students see says so), so that line was a no-op that
        # made a dozen orders "valid" and let distractors stand in for it.
        "pseudocode": ["curr = head;", "while (curr.next != NULL) curr = curr.next;", "newNode = createNode({value});", "curr.next = newNode;"],
        "correctOrder": [0, 1, 2, 3],
        "hint": "Traverse to the last node before linking.",
        "step_hints": [
            "Traversal needs a starting point — which pointer marks the front of the list?",
            "Where exactly does this loop stop, and why is that the right node?",
            "Creating the node does not modify the list — it only has to exist before linking.",
            "This is the moment the list actually grows — which pointer links to the new node?",
        ],
        "distractors": ["curr.next = NULL;", "newNode.next = curr;", "while (curr != NULL) curr = curr.next;"],
        "crux": [1, 3],
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
        "distractors": ["free(head);", "temp = head.next;", "head = NULL;"],
        "crux": [0, 2],
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
        "distractors": ["temp = curr;", "free(curr);", "while (curr.next != NULL) curr = curr.next;"],
        "crux": [1, 2],
        "needsValue": False, "needsPosition": False, "minNodes": 2,
    },
    "insertIntoEmpty": {
        "title": "Insert into Empty List",
        # The empty list is insertAtHead with head == NULL. `newNode.next = NULL;`
        # is gone for the same reason as in insertAtTail: createNode already did it.
        "pseudocode": ["newNode = createNode({value});", "head = newNode;"],
        "correctOrder": [0, 1],
        "hint": "The new node becomes the only element.",
        "step_hints": [
            "The node must exist before it can be linked — creation comes first.",
            "An empty list's head is NULL — the new node becomes the whole list, so what must head point to?",
        ],
        "distractors": ["head.next = newNode;", "newNode = head;", "newNode.next = head;"],
        "crux": [1],
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
        "distractors": ["free(head);", "curr = head.next;", "head = curr.next;"],
        "crux": [1, 2],
        "needsValue": False, "needsPosition": False, "minNodes": 2,
    },
    "insertAtPosition": {
        "title": "Insert at Position",
        "pseudocode": ["curr = head;", "for (int i = 0; i < index-1; i++) curr = curr.next;", "newNode = createNode({value});", "newNode.next = curr.next;", "curr.next = newNode;"],
        "correctOrder": [0, 1, 2, 3, 4],
        "hint": "Walk to the predecessor, then splice in.",
        "step_hints": [
            "Traversal to an index always starts at the head.",
            "The traversal stops at index-1 — which node must the pointer be at, and why?",
            "Creating the node does not modify the list — it only has to exist before linking.",
            "The new node must point to its successor BEFORE the chain is relinked — what would be lost otherwise?",
            "Now the predecessor's next is redirected — is its old successor already saved somewhere?",
        ],
        "distractors": ["curr.next = newNode.next;", "newNode.next = curr;", "for (int i = 0; i < index; i++) curr = curr.next;"],
        "crux": [1, 3, 4],
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
        "distractors": ["curr.next = temp;", "free(curr);", "temp = curr;"],
        "crux": [1, 3, 4],
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
        "distractors": ["head = curr;", "prev = head;", "curr = head.next;"],
        "crux": [2, 3],
        "needsValue": False, "needsPosition": False, "minNodes": 2,
    },
    "mergeSortedLists": {
        "title": "Merge Two Sorted Lists",
        # .value, not .val: the Node class students see has `value` and `next` only
        "pseudocode": ["dummy = createNode(0); curr = dummy;", "while (l1 != NULL && l2 != NULL) { if (l1.value <= l2.value) { curr.next = l1; l1 = l1.next; } else { curr.next = l2; l2 = l2.next; } curr = curr.next; }", "curr.next = (l1 != NULL) ? l1 : l2;", "return dummy.next;"],
        "correctOrder": [0, 1, 2, 3],
        "hint": "Use a dummy node; always attach the smaller value.",
        "step_hints": [
            "The dummy node gives the result list a fixed anchor — why does that simplify every later step?",
            "Each iteration attaches the smaller front node — then which list advances?",
            "One list is exhausted — what happens to the remaining nodes of the other?",
            "Why return dummy.next and not dummy itself?",
        ],
        "distractors": ["return dummy;", "curr.next = l1;", "dummy = l1; curr = dummy;"],
        "crux": [1, 2],
        "needsValue": False, "needsPosition": False, "minNodes": 0, "isMerge": True,
    },
    "detectCycle": {
        "title": "Linked List Cycle",
        # The meeting check belongs INSIDE the loop. The old template checked it
        # after the loop — on a list that really has a cycle fast never reaches
        # NULL, so that version never stopped (found by the item harness).
        "pseudocode": ["slow = head; fast = head;", "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; if (slow == fast) return true; }", "return false;"],
        "correctOrder": [0, 1, 2],
        "hint": "Floyd's algorithm: fast moves two steps, slow one — check whether they meet on every step.",
        "step_hints": [
            "Both pointers start at the head — only their speeds differ.",
            "Why must FAST be the one checked against NULL — and why is the meeting checked inside the loop?",
            "Fast reached the end of the list — could a cycle have existed?",
        ],
        "distractors": ["slow = head; fast = NULL;", "return true;", "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; }"],
        "crux": [1],
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
        "distractors": ["return merge(head, mid);", "mid = slow; slow.next = NULL;", "slow = head; fast = head;"],
        "crux": [2, 3, 4],
        "needsValue": False, "needsPosition": False, "minNodes": 3,
    },
}


# ── Fill-blank definitions (answer + wrong options per pseudocode step) ───────
# Each list entry corresponds to the same-index pseudocode step; each operation
# has 4 blank sets, rotated by variant_seed. "a" = correct answer (blanked at its
# FIRST occurrence in the step, str.replace contract); "w" = wrong options,
# strongest first (intra level 1 shows only w[0]). None = this step is never
# blanked in that set.
#
# Every blank must pass the item harness (item_quality.py, tests/test_item_quality.py):
# a SEMANTIC slot — which pointer, node or condition — never a fresh variable's
# name, a field name, a function name or the payload; exactly one correct
# option; every distractor fails for a linked-list reason (crash, wrong list,
# leak, cycle) when run, never because it names something that doesn't exist.
# `python item_report.py --all --ops <op>` shows what every option does.
_BLANKS: dict[str, list[list[dict | None]]] = {
    # ["newNode = createNode({value});", "newNode.next = head;", "head = newNode;"]
    # big idea: link the new node to the old head BEFORE moving head
    "insertAtHead": [
        [
            {"a": "createNode({value})", "w": ["head", "NULL"]},
            {"a": "head",                "w": ["head.next", "NULL"]},
            {"a": "newNode",             "w": ["newNode.next", "head.next"]},
        ],
        [
            {"a": "createNode({value})", "w": ["NULL", "head.next"]},
            {"a": "newNode",             "w": ["head", "head.next"]},      # ___.next = head
            {"a": "head",                "w": ["newNode.next", "head.next"]},  # ___ = newNode
        ],
        [
            {"a": "createNode({value})", "w": ["head", "head.next"]},
            {"a": "head",                "w": ["NULL", "newNode"]},
            {"a": "newNode",             "w": ["head.next", "newNode.next"]},
        ],
        [
            {"a": "createNode({value})", "w": ["NULL", "head"]},
            {"a": "newNode",             "w": ["head.next", "head"]},
            {"a": "head",                "w": ["head.next", "newNode.next"]},
        ],
    ],
    # ["curr = head;", "while (curr.next != NULL) curr = curr.next;",
    #  "newNode = createNode({value});", "curr.next = newNode;"]
    # big idea: stop ON the last node (curr.next == NULL), then link
    "insertAtTail": [
        [
            {"a": "head",                "w": ["NULL", "head.next"]},
            {"a": "curr.next",           "w": ["curr", "curr.next.next"]},
            {"a": "createNode({value})", "w": ["curr", "NULL"]},
            {"a": "newNode",             "w": ["NULL", "head"]},
        ],
        [
            {"a": "head",                "w": ["head.next", "NULL"]},
            {"a": "curr = curr.next",    "w": ["curr = curr.next.next", "curr.next = curr"]},
            {"a": "createNode({value})", "w": ["NULL", "curr.next"]},
            {"a": "curr.next",           "w": ["curr", "head"]},           # ___ = newNode
        ],
        [
            {"a": "head",                "w": ["NULL", "head.next"]},
            {"a": "curr.next",           "w": ["curr.next.next", "curr"]},
            {"a": "createNode({value})", "w": ["curr", "NULL"]},
            {"a": "newNode",             "w": ["head", "newNode.next"]},
        ],
        [
            {"a": "head",                "w": ["head.next", "NULL"]},
            {"a": "curr = curr.next",    "w": ["curr.next = curr", "curr = curr.next.next"]},
            {"a": "createNode({value})", "w": ["NULL", "curr"]},
            {"a": "curr.next",           "w": ["head", "curr"]},
        ],
    ],
    # ["temp = head;", "head = head.next;", "free(temp);"]
    # big idea: save the node you are cutting off before you move past it
    "removeAtHead": [
        [
            {"a": "head",      "w": ["head.next", "NULL"]},
            {"a": "head.next", "w": ["head", "NULL"]},
            {"a": "temp",      "w": ["head", "head.next"]},
        ],
        [
            {"a": "head",      "w": ["NULL", "head.next"]},
            {"a": "head",      "w": ["temp", "head.next"]},              # ___ = head.next
            {"a": "temp",      "w": ["head.next", "head"]},
        ],
        [
            {"a": "head",      "w": ["head.next", "NULL"]},
            {"a": "head.next", "w": ["head.next.next", "head"]},
            {"a": "temp",      "w": ["head", "NULL"]},
        ],
        [
            {"a": "head",      "w": ["NULL", "head.next"]},
            {"a": "head",      "w": ["head.next", "temp"]},
            {"a": "temp",      "w": ["NULL", "head.next"]},
        ],
    ],
    # ["curr = head;", "while (curr.next.next != NULL) curr = curr.next;",
    #  "temp = curr.next;", "curr.next = NULL;", "free(temp);"]
    # big idea: to cut the tail you must stand on the node BEFORE it
    "removeAtTail": [
        [
            {"a": "head",             "w": ["NULL", "head.next"]},
            {"a": "curr.next.next",   "w": ["curr.next", "curr"]},
            {"a": "curr.next",        "w": ["curr", "curr.next.next"]},
            {"a": "NULL",             "w": ["temp", "curr"]},
            {"a": "temp",             "w": ["curr", "curr.next"]},
        ],
        [
            {"a": "head",             "w": ["head.next", "NULL"]},
            {"a": "curr = curr.next", "w": ["curr = curr.next.next", "curr.next = curr"]},
            {"a": "curr.next",        "w": ["curr.next.next", "curr"]},
            {"a": "curr.next",        "w": ["curr", "temp"]},             # ___ = NULL
            {"a": "temp",             "w": ["curr.next", "curr"]},
        ],
        [
            {"a": "head",             "w": ["NULL", "head.next"]},
            {"a": "curr.next.next",   "w": ["curr", "curr.next"]},
            {"a": "curr.next",        "w": ["curr", "head"]},
            {"a": "NULL",             "w": ["curr", "temp"]},
            {"a": "temp",             "w": ["curr", "head"]},
        ],
        [
            {"a": "head",             "w": ["head.next", "NULL"]},
            {"a": "curr = curr.next", "w": ["curr.next = curr", "curr = curr.next.next"]},
            {"a": "curr.next",        "w": ["curr.next.next", "head"]},
            {"a": "curr.next",        "w": ["temp", "curr"]},
            {"a": "temp",             "w": ["curr.next", "head"]},
        ],
    ],
    # ["newNode = createNode({value});", "head = newNode;"]
    # big idea: the empty list is just insertAtHead with head == NULL
    "insertIntoEmpty": [
        [
            {"a": "createNode({value})", "w": ["head", "NULL"]},
            {"a": "newNode",             "w": ["newNode.next", "NULL"]},
        ],
        [
            {"a": "createNode({value})", "w": ["NULL", "head"]},
            {"a": "head",                "w": ["head.next", "newNode.next"]},  # ___ = newNode
        ],
        [
            {"a": "createNode({value})", "w": ["head", "NULL"]},
            {"a": "newNode",             "w": ["NULL", "newNode.next"]},
        ],
        [
            {"a": "createNode({value})", "w": ["NULL", "head"]},
            {"a": "head",                "w": ["newNode.next", "head.next"]},
        ],
    ],
    # ["curr = head;", "while (curr != NULL) { temp = curr.next; free(curr); curr = temp; }", "head = NULL;"]
    # big idea: save next BEFORE you destroy the node that holds it
    "deleteEntireList": [
        [
            {"a": "head",        "w": ["head.next", "NULL"]},
            {"a": "curr.next",   "w": ["curr", "head"]},                  # temp = ___
            {"a": "NULL",        "w": ["head", "head.next"]},
        ],
        [
            {"a": "head",        "w": ["NULL", "head.next"]},
            {"a": "free(curr)",  "w": ["free(temp)", "free(head)"]},
            {"a": "head",        "w": ["curr", "temp"]},                  # ___ = NULL
        ],
        [
            {"a": "head",        "w": ["head.next", "NULL"]},
            {"a": "curr = temp", "w": ["curr = curr.next", "temp = curr"]},
            {"a": "NULL",        "w": ["head.next", "head"]},
        ],
        [
            {"a": "head",        "w": ["NULL", "head.next"]},
            {"a": "curr",        "w": ["curr.next", "head"]},             # while (___ != NULL)
            {"a": "head",        "w": ["temp", "curr"]},
        ],
    ],
    # ["curr = head;", "for (int i = 0; i < index-1; i++) curr = curr.next;",
    #  "newNode = createNode({value});", "newNode.next = curr.next;", "curr.next = newNode;"]
    # big idea: stop at the node BEFORE index; hook the new node to its successor first
    "insertAtPosition": [
        [
            {"a": "head",                "w": ["head.next", "NULL"]},
            {"a": "index-1",             "w": ["index", "index-2"]},
            {"a": "createNode({value})", "w": ["curr", "curr.next"]},
            {"a": "curr.next",           "w": ["curr", "NULL"]},
            {"a": "newNode",             "w": ["newNode.next", "NULL"]},
        ],
        [
            {"a": "head",                "w": ["NULL", "head.next"]},
            {"a": "index-1",             "w": ["index-2", "index"]},
            {"a": "createNode({value})", "w": ["NULL", "curr"]},
            {"a": "newNode.next",        "w": ["curr", "newNode"]},       # ___ = curr.next
            {"a": "curr.next",           "w": ["curr", "head"]},          # ___ = newNode
        ],
        [
            {"a": "head",                "w": ["head.next", "NULL"]},
            {"a": "curr = curr.next",    "w": ["curr = curr.next.next", "curr.next = curr"]},
            {"a": "createNode({value})", "w": ["curr.next", "NULL"]},
            {"a": "curr.next",           "w": ["curr.next.next", "curr"]},
            {"a": "newNode",             "w": ["NULL", "newNode.next"]},
        ],
        [
            {"a": "head",                "w": ["NULL", "head.next"]},
            {"a": "0",                   "w": ["1", "2"]},
            {"a": "createNode({value})", "w": ["curr", "NULL"]},
            {"a": "newNode.next",        "w": ["newNode", "curr"]},
            {"a": "curr.next",           "w": ["head", "curr"]},
        ],
    ],
    # ["curr = head;", "for (int i = 0; i < index-1; i++) curr = curr.next;",
    #  "temp = curr.next;", "curr.next = temp.next;", "free(temp);"]
    # big idea: stand on the predecessor, bypass the target, then free it
    "removeAtPosition": [
        [
            {"a": "head",             "w": ["head.next", "NULL"]},
            {"a": "index-1",          "w": ["index", "index-2"]},
            {"a": "curr.next",        "w": ["curr", "curr.next.next"]},
            {"a": "temp.next",        "w": ["temp", "NULL"]},
            {"a": "temp",             "w": ["curr", "curr.next"]},
        ],
        [
            {"a": "head",             "w": ["NULL", "head.next"]},
            {"a": "curr = curr.next", "w": ["curr = curr.next.next", "curr.next = curr"]},
            {"a": "curr.next",        "w": ["curr.next.next", "curr"]},
            {"a": "curr.next",        "w": ["curr", "temp"]},             # ___ = temp.next
            {"a": "temp",             "w": ["curr.next", "curr"]},
        ],
        [
            {"a": "head",             "w": ["head.next", "NULL"]},
            {"a": "index-1",          "w": ["index-2", "index"]},
            {"a": "curr.next",        "w": ["curr", "head"]},
            {"a": "temp.next",        "w": ["temp.next.next", "temp"]},
            {"a": "temp",             "w": ["curr", "head"]},
        ],
        [
            {"a": "head",             "w": ["NULL", "head.next"]},
            {"a": "0",                "w": ["1", "2"]},
            {"a": "curr.next",        "w": ["curr.next.next", "head"]},
            {"a": "curr.next",        "w": ["temp", "curr"]},
            {"a": "temp",             "w": ["curr.next", "head"]},
        ],
    ],
    # ["prev = NULL;", "curr = head;",
    #  "while (curr != NULL) { temp = curr.next; curr.next = prev; prev = curr; curr = temp; }",
    #  "head = prev;"]
    # big idea: save next, flip the link, step both pointers forward
    "reverseList": [
        [
            {"a": "NULL",        "w": ["head", "head.next"]},
            {"a": "head",        "w": ["head.next", "prev"]},
            {"a": "curr.next",   "w": ["curr", "prev"]},                  # temp = ___
            {"a": "prev",        "w": ["curr", "head.next"]},
        ],
        [
            {"a": "NULL",        "w": ["head.next", "head"]},
            {"a": "head",        "w": ["prev", "head.next"]},
            {"a": "prev",        "w": ["temp", "NULL"]},                  # curr.next = ___
            {"a": "prev",        "w": ["head.next", "curr"]},
        ],
        [
            {"a": "NULL",        "w": ["head", "head.next"]},
            {"a": "head",        "w": ["head.next", "prev"]},
            {"a": "prev = curr", "w": ["curr = prev", "prev = temp"]},
            {"a": "prev",        "w": ["curr", "head.next"]},
        ],
        [
            {"a": "NULL",        "w": ["head.next", "head"]},
            {"a": "head",        "w": ["prev", "head.next"]},
            {"a": "curr = temp", "w": ["curr = curr.next", "curr = prev"]},
            {"a": "prev",        "w": ["head.next", "curr"]},
        ],
    ],
    # ["dummy = createNode(0); curr = dummy;",
    #  "while (l1 != NULL && l2 != NULL) { if (l1.value <= l2.value) { ... } curr = curr.next; }",
    #  "curr.next = (l1 != NULL) ? l1 : l2;", "return dummy.next;"]
    # big idea: a dummy head; always attach the smaller front node; then the leftovers
    "mergeSortedLists": [
        [
            {"a": "createNode(0)",             "w": ["NULL", "l1"]},
            {"a": "l1.value <= l2.value",      "w": ["l1.value >= l2.value", "l1 <= l2"]},
            {"a": "(l1 != NULL) ? l1 : l2",    "w": ["(l1 != NULL) ? l2 : l1", "l1"]},
            {"a": "dummy.next",                "w": ["dummy", "curr"]},
        ],
        [
            {"a": "curr = dummy",              "w": ["curr = l1", "curr = NULL"]},
            {"a": "l1 != NULL && l2 != NULL",  "w": ["l1 != NULL || l2 != NULL", "l1 != NULL"]},
            {"a": "(l1 != NULL) ? l1 : l2",    "w": ["l2", "(l2 != NULL) ? l1 : l2"]},
            {"a": "dummy",                     "w": ["curr", "l1"]},     # return ___.next
        ],
        [
            {"a": "createNode(0)",             "w": ["l1", "NULL"]},
            {"a": "l1 = l1.next",              "w": ["l2 = l2.next", "curr = l1"]},
            {"a": "(l1 != NULL) ? l1 : l2",    "w": ["(l1 != NULL) ? l2 : l1", "l2"]},
            {"a": "dummy.next",                "w": ["curr", "l1"]},
        ],
        [
            {"a": "curr = dummy",              "w": ["curr = NULL", "curr = l1"]},
            {"a": "curr = curr.next",          "w": ["curr.next = curr", "curr = l1"]},
            {"a": "(l1 != NULL) ? l1 : l2",    "w": ["l1", "(l1 != NULL) ? l2 : l1"]},
            {"a": "dummy",                     "w": ["l1", "curr"]},
        ],
    ],
    # ["slow = head; fast = head;",
    #  "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; if (slow == fast) return true; }",
    #  "return false;"]
    # big idea: a faster pointer can only catch a slower one if the list loops
    "detectCycle": [
        [
            {"a": "head",              "w": ["NULL"]},                     # slow = ___
            {"a": "fast.next.next",    "w": ["fast.next", "slow.next"]},
            {"a": "false",             "w": ["true"]},
        ],
        [
            {"a": "fast = head",       "w": ["fast = NULL"]},
            {"a": "slow == fast",      "w": ["slow != fast", "fast == NULL"]},
            {"a": "false",             "w": ["true"]},
        ],
        [
            {"a": "head",              "w": ["NULL"]},
            {"a": "fast.next != NULL", "w": ["slow.next != NULL", "fast.next.next != NULL"]},
            {"a": "false",             "w": ["true"]},
        ],
        [
            {"a": "fast = head",       "w": ["fast = NULL"]},
            {"a": "slow.next",         "w": ["slow.next.next", "fast.next"]},  # slow = ___
            {"a": "false",             "w": ["true"]},
        ],
    ],
    # ["if (head == NULL || head.next == NULL) return head;", "slow = head; fast = head.next;",
    #  "while (fast && fast.next) { slow = slow.next; fast = fast.next.next; }",
    #  "mid = slow.next; slow.next = NULL;", "return merge(sortList(head), sortList(mid));"]
    # big idea: find the middle with slow/fast, CUT, sort both halves, merge
    "sortList": [
        [
            {"a": "head == NULL || head.next == NULL", "w": ["head == NULL", "head.next == NULL"]},
            {"a": "head.next",         "w": ["head", "NULL"]},
            {"a": "fast.next.next",    "w": ["fast.next", "slow.next"]},
            {"a": "slow.next",         "w": ["slow", "fast"]},
            {"a": "mid",               "w": ["head", "slow"]},
        ],
        [
            {"a": "return head",       "w": ["return NULL", "return head.next"]},
            {"a": "head.next",         "w": ["NULL", "head"]},
            {"a": "slow.next",         "w": ["slow.next.next", "fast"]},   # slow = ___
            {"a": "NULL",              "w": ["mid", "slow"]},             # slow.next = ___
            {"a": "head",              "w": ["slow", "mid"]},             # sortList(___), sortList(mid)
        ],
        [
            {"a": "head == NULL || head.next == NULL", "w": ["head.next == NULL", "head == NULL && head.next == NULL"]},
            {"a": "head.next",         "w": ["head", "NULL"]},
            {"a": "fast.next.next",    "w": ["slow.next", "fast.next"]},
            {"a": "slow.next",         "w": ["fast", "slow"]},
            {"a": "mid",               "w": ["slow", "head"]},
        ],
        [
            {"a": "return head",       "w": ["return head.next", "return NULL"]},
            {"a": "head.next",         "w": ["NULL", "head"]},
            {"a": "fast && fast.next", "w": ["fast", "fast.next"]},
            {"a": "NULL",              "w": ["slow", "mid"]},
            {"a": "head",              "w": ["mid", "slow"]},
        ],
    ],
}

# ── Bug definitions (subtlety-tagged variants per operation) ───────────────────
_BUGS: dict[str, list[dict]] = {
    # Each op holds a LIST of bug variants tagged with subtlety
    # (1 = careless / 2 = conceptual / 3 = one-token). Selection picks the
    # nearest subtlety to intra_difficulty and rotates by variant_seed.
    # Item harness: the buggy line must really break the program for a
    # linked-list reason on every board a student can be shown, and every
    # wrong fix must be wrong (tests/test_item_quality.py).
    "insertAtHead": [
        {"subtlety": 3, "line": 1, "buggy": "newNode.next = head.next;",
         "fix": "newNode.next = head;",
         "explanation": "head.next skips the original head, losing it from the list",
         "options": ["newNode.next = head;", "newNode.next = NULL;", "head.next = newNode;"]},
        {"subtlety": 1, "line": 1, "buggy": "newNode.next = newNode;",
         "fix": "newNode.next = head;",
         "explanation": "Pointing the new node at itself creates a self-loop — the rest of the list is never attached",
         "options": ["newNode.next = head;", "newNode.next = NULL;", "head.next = newNode;"]},
        {"subtlety": 2, "line": 1, "buggy": "newNode.next = NULL;",
         "fix": "newNode.next = head;",
         "explanation": "Treating the list as empty: newNode.next = NULL severs the entire existing list",
         "options": ["newNode.next = head;", "newNode.next = newNode;", "head.next = newNode;"]},
    ],
    "insertAtTail": [
        {"subtlety": 1, "line": 3, "buggy": "curr.next = curr.next;",
         "fix": "curr.next = newNode;",
         "explanation": "curr.next = curr.next is a no-op — the new node is never linked into the list",
         "options": ["curr.next = newNode;", "curr = newNode;", "newNode.next = curr;"]},
        {"subtlety": 2, "line": 1, "buggy": "while (curr != NULL) curr = curr.next;",
         "fix": "while (curr.next != NULL) curr = curr.next;",
         "explanation": "Checking curr instead of curr.next walks off the end — curr is NULL after the loop, so there is nothing to link from",
         "options": ["while (curr.next != NULL) curr = curr.next;",
                     "while (curr.next.next != NULL) curr = curr.next;",
                     "while (curr != NULL) curr = curr.next.next;"]},
        {"subtlety": 3, "line": 1, "buggy": "while (curr.next.next != NULL) curr = curr.next;",
         "fix": "while (curr.next != NULL) curr = curr.next;",
         "explanation": "curr.next.next stops one node early, on the second-to-last node — the new node replaces the old tail, which is lost",
         "options": ["while (curr.next != NULL) curr = curr.next;",
                     "while (curr != NULL) curr = curr.next;",
                     "while (curr.next != NULL) curr = curr.next.next;"]},
    ],
    "removeAtHead": [
        {"subtlety": 1, "line": 1, "buggy": "head = head;",
         "fix": "head = head.next;",
         "explanation": "head = head doesn't advance the pointer — then free(temp) frees the node head still points to",
         "options": ["head = head.next;", "head = NULL;", "head = head.next.next;"]},
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
        {"subtlety": 1, "line": 1, "buggy": "head = NULL;",
         "fix": "head = newNode;",
         "explanation": "Setting head = NULL discards the new node; head must point to newNode",
         "options": ["head = newNode;", "newNode = head;", "head = newNode.next;"]},
        {"subtlety": 2, "line": 1, "buggy": "head.next = newNode;",
         "fix": "head = newNode;",
         "explanation": "head is NULL in an empty list — head.next dereferences NULL; head itself must be reassigned",
         "options": ["head = newNode;", "head = newNode.next;", "newNode = head;"]},
        {"subtlety": 3, "line": 1, "buggy": "head = newNode.next;",
         "fix": "head = newNode;",
         "explanation": "newNode.next is NULL — head = newNode.next leaves the list empty; head must point at the node itself",
         "options": ["head = newNode;", "newNode.next = head;", "head.next = newNode;"]},
    ],
    "deleteEntireList": [
        {"subtlety": 2, "line": 0, "buggy": "curr = head.next;",
         "fix": "curr = head;",
         "explanation": "Starting at head.next skips the first node, causing a memory leak",
         "options": ["curr = head;", "curr = NULL;", "curr = head.next.next;"]},
        {"subtlety": 1, "line": 2, "buggy": "head = head;",
         "fix": "head = NULL;",
         "explanation": "head = head changes nothing — head still points at freed memory (dangling pointer)",
         "options": ["head = NULL;", "head = head.next;", "head.next = NULL;"]},
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
         "explanation": "Pointing to curr (predecessor) instead of curr.next (successor) creates a cycle and loses the rest of the list",
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
         "explanation": "curr.next = temp changes nothing — temp is still in the list when free(temp) runs",
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
                     "for (int i = 0; i <= index-1; i++) curr = curr.next;"]},
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
         "options": ["prev = NULL;", "prev = head.next;", "prev = head.next.next;"]},
    ],
    "mergeSortedLists": [
        {"subtlety": 2, "line": 2, "buggy": "curr.next = (l1 != NULL) ? l2 : l1;",
         "fix": "curr.next = (l1 != NULL) ? l1 : l2;",
         "explanation": "Conditions are swapped: attaches the empty list and drops the leftovers of the other one",
         "options": ["curr.next = (l1 != NULL) ? l1 : l2;", "curr.next = l1;", "curr.next = l2;"]},
        {"subtlety": 1, "line": 3, "buggy": "return dummy;",
         "fix": "return dummy.next;",
         "explanation": "dummy is the placeholder anchor holding value 0 — the merged list starts at dummy.next",
         "options": ["return dummy.next;", "return curr;", "return l1;"]},
        {"subtlety": 3, "line": 1,
         "buggy": "while (l1 != NULL || l2 != NULL) { if (l1.value <= l2.value) { curr.next = l1; l1 = l1.next; } else { curr.next = l2; l2 = l2.next; } curr = curr.next; }",
         "fix":   "while (l1 != NULL && l2 != NULL) { if (l1.value <= l2.value) { curr.next = l1; l1 = l1.next; } else { curr.next = l2; l2 = l2.next; } curr = curr.next; }",
         "explanation": "With || the loop keeps running after one list is exhausted — l1.value then dereferences NULL",
         "options": ["while (l1 != NULL && l2 != NULL) { if (l1.value <= l2.value) { curr.next = l1; l1 = l1.next; } else { curr.next = l2; l2 = l2.next; } curr = curr.next; }",
                     "while (l1 != NULL) { if (l1.value <= l2.value) { curr.next = l1; l1 = l1.next; } else { curr.next = l2; l2 = l2.next; } curr = curr.next; }",
                     "while (l1 != NULL && l2 != NULL) { if (l1.value <= l2.value) { curr.next = l1; l2 = l2.next; } else { curr.next = l2; l1 = l1.next; } curr = curr.next; }"]},
    ],
    "detectCycle": [
        {"subtlety": 3, "line": 1,
         "buggy": "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next; if (slow == fast) return true; }",
         "fix":   "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; if (slow == fast) return true; }",
         "explanation": "fast = fast.next moves at the same speed as slow — they 'meet' after one step even on a list with no cycle",
         "options": ["while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; if (slow == fast) return true; }",
                     "while (fast != NULL && fast.next != NULL) { slow = slow.next.next; fast = fast.next.next; if (slow == fast) return true; }",
                     "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; if (slow != fast) return true; }"]},
        {"subtlety": 1, "line": 1,
         "buggy": "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; if (slow == fast) return false; }",
         "fix":   "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; if (slow == fast) return true; }",
         "explanation": "The pointers meeting is the PROOF of a cycle — returning false inverts the answer",
         "options": ["while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; if (slow == fast) return true; }",
                     "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; if (slow != fast) return true; }",
                     "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; if (fast == NULL) return true; }"]},
        {"subtlety": 2, "line": 1,
         "buggy": "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; }",
         "fix":   "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; if (slow == fast) return true; }",
         "explanation": "Checking slow == fast only after the loop is too late: in a cycle fast never reaches NULL, so the loop never ends",
         "options": ["while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; if (slow == fast) return true; }",
                     "while (fast != NULL && fast.next != NULL) { slow = slow.next; fast = fast.next.next; if (slow == fast) return false; }",
                     "while (fast != NULL && fast.next != NULL) { if (slow == fast) return true; slow = slow.next; fast = fast.next.next; }"]},
    ],
    "sortList": [
        {"subtlety": 3, "line": 3, "buggy": "mid = slow; slow.next = NULL;",
         "fix": "mid = slow.next; slow.next = NULL;",
         "explanation": "mid = slow makes the last node of the first half ALSO the start of the second half — the halves overlap",
         "options": ["mid = slow.next; slow.next = NULL;",
                     "mid = slow.next; slow = NULL;",
                     "mid = fast; slow.next = NULL;"]},
        {"subtlety": 1, "line": 4, "buggy": "return merge(sortList(head), sortList(head));",
         "fix": "return merge(sortList(head), sortList(mid));",
         "explanation": "Recursing on head twice sorts the first half twice — the second half is dropped entirely",
         "options": ["return merge(sortList(head), sortList(mid));",
                     "return merge(sortList(mid), sortList(mid));",
                     "return merge(head, mid);"]},
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
        "Trace insertAtHead's code on an empty list — does it already handle this case?",
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
        "Why must slow == fast be checked inside the loop rather than after it?",
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
    target_misconception: str | None = None,
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

    # Remediation: every ordering item tests an ORDER misconception (swap); a
    # misconception shown by a distractor gets that distractor forced in.
    met, forced = None, None
    if target_misconception:
        from . import misconceptions as mc
        if mc.authored_target_exists(operation, "ordering", target_misconception):
            met = target_misconception
            if mc.canonical(operation, target_misconception).kind != "swap":
                forced = mc.authored_for(operation, "ordering", target_misconception)[0].option

    def distractors() -> list:
        # drawn where the plain _pick always was: the random stream (and the
        # seeded heap fixtures built from it) must not shift
        if forced is None:
            return _pick(tmpl["distractors"], n_dist)
        return [forced] + _pick([d for d in tmpl["distractors"] if d != forced], max(0, n_dist - 1))

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
            "validOrders": valid_orders_for(operation),
            "distractors": distractors(),
            "initialNodes": initial_nodes, "goalPattern": goal,
            "hint": hint, "isMerge": True, "l1Values": l1, "l2Values": l2,
            "target_misconception": met,
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
        "validOrders": valid_orders_for(operation),
        "distractors": distractors(),
        "initialNodes": nodes, "goalPattern": goal,
        "hint": hint, "isMerge": False,
        "target_misconception": met,
        **_cycle_extra(operation, node_count),
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
    return nodes, op_value, op_pos, result["values"], _cycle_extra(operation, len(nodes))


def _cycle_extra(operation: str, node_count: int) -> dict:
    """detectCycle display metadata: the tail loops back to index 1 (LeetCode
    pos-style) on HALF the boards. A board that always has a cycle teaches that
    the answer is always true — and hides every bug that answers true too
    eagerly. initialNodes stay LINEAR so board/executor logic never walks a
    real cycle; the item harness builds the cycle from cycleTo."""
    if operation == "detectCycle" and node_count >= 2 and random.random() < 0.5:
        return {"cycleTo": 1}
    return {}


def _respec(spec, **changes):
    """The same spec with some fields changed (QuestionSpec, or a test stand-in)."""
    if dataclasses.is_dataclass(spec):
        return dataclasses.replace(spec, **changes)
    out = copy.copy(spec)
    for k, v in changes.items():
        setattr(out, k, v)
    return out


def generate_fill_blank_question(operation: str, spec, _tries: int = 0) -> dict:
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

    # deterministic rotation: attempt N gets set N % n — consecutive plays of the
    # same operation never repeat the same blank set
    seed     = getattr(spec, "variant_seed", 0)
    set_idx  = seed % len(blank_sets)
    # Remediation: a set whose blank offers the targeted misconception's option,
    # that blank forced in, the option offered first among the wrong ones.
    target = getattr(spec, "target_misconception", None)
    forced: dict[int, str] = {}          # line -> the targeted wrong option
    if target:
        from . import misconceptions as mc
        hits = mc.authored_for(operation, "fill_blank", target)
        sets = sorted({w.variant for w in hits})
        if sets:
            set_idx = sets[seed % len(sets)]
            line, opt = min((w.line, w.option) for w in hits if w.variant == set_idx)
            forced = {line: opt}
        else:
            target = None
    blanks_d = blank_sets[set_idx]
    pseudocode = tmpl["pseudocode"]
    total = len(pseudocode)
    blankable = [i for i, bd in enumerate(blanks_d) if bd is not None]
    # Which steps to blank: a subset (easier) or all. Non-blanked steps show the
    # correct code, so the student only fills the chosen ones (completion problem).
    # A subset is drawn from the crux steps first — two random blanks used to
    # land on `curr = head` and miss the step the operation is about.
    if num_blanks is None or num_blanks >= len(blankable):
        blank_idxs = set(blankable)
    else:
        k = max(1, num_blanks)
        must = [i for i in forced if i in blankable]
        crux = [i for i in tmpl.get("crux", []) if i in blankable and i not in must]
        pick = must + random.sample(crux, min(k - len(must), len(crux)))
        rest = [i for i in blankable if i not in pick]
        blank_idxs = set(pick + random.sample(rest, max(0, k - len(pick))))

    # Serve-time gate: on THIS board every offered distractor must visibly fail.
    # Drop the ones that happen to work here; a blank left with no wrong option
    # is shown filled in. Re-roll the board if nothing would be left to ask —
    # or, for a targeted item, until the targeted option visibly fails too.
    sizes = _board_sizes(tmpl, node_count, bool(forced))
    for attempt in range(3 * len(sizes) + 3 if forced else 6):
        nodes, op_value, op_pos, goal, extra = _build_nodes_and_goal(
            operation, tmpl, _size_for(sizes, attempt) if forced else node_count)
        board = item_quality.board_of(operation, nodes, op_value, op_pos, extra)
        blanked: list[str] = []
        blanks:  list[dict] = []
        target_shown = not forced
        for i, step in enumerate(pseudocode):
            bd = blanks_d[i]
            if i not in blank_idxs:
                blanked.append(step)   # full correct step, no blank
                continue
            answer  = bd["a"]
            blanked_step = step.replace(answer, "___", 1)

            def program(opt: str, i=i, blanked_step=blanked_step) -> list[str]:
                lines = list(pseudocode)
                lines[i] = blanked_step.replace("___", opt, 1)
                return lines
            wrong = [w for w in bd["w"] if item_quality.wrong_on_board(operation, program(w), board)]
            if i in forced and forced[i] in wrong:
                wrong = [forced[i]] + [w for w in wrong if w != forced[i]]
                target_shown = True
            if not wrong:
                blanked.append(step)
                continue
            options = [answer] + wrong[:max(1, n_opts - 1)]
            random.shuffle(options)
            blanked.append(blanked_step)
            blanks.append({"line": i, "answer": answer, "options": options})
        if blanks and target_shown:
            break

    if not blanks:
        # Every distractor happened to work on every board drawn for this set:
        # never serve a question with no blank (a free clean pass). Drop the
        # target, then try the other sets; none left is an error the client retries.
        if forced:
            return generate_fill_blank_question(operation, _respec(spec, target_misconception=None), _tries)
        if _tries < len(blank_sets) - 1:
            return generate_fill_blank_question(operation, _respec(spec, variant_seed=seed + 1), _tries + 1)
        raise RuntimeError(f"no askable fill_blank for {operation} on any board drawn")

    return instantiate({
        "id":              str(uuid.uuid4()),
        "question_type":   "fill_blank",
        "variant":         f"blanks{set_idx}",
        "target_misconception": target if (forced and target_shown) else None,
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


def generate_find_bug_question(operation: str, spec, _tries: int = 0) -> dict:
    """Static find-the-bug fallback using predefined bug variants (selected by
    subtlety ≈ intra_difficulty, rotated deterministically by variant_seed)."""
    tmpl     = TEMPLATES.get(operation)
    variants = _BUGS.get(operation)
    if not tmpl or not variants:
        return generate_static_question(operation, spec.emotion)

    intra = getattr(spec, "intra_difficulty", None)
    seed  = getattr(spec, "variant_seed", 0)
    # Remediation: the bug IS the targeted misconception if an authored variant
    # has it; otherwise a variant whose wrong fix shows it, that fix forced in.
    target = getattr(spec, "target_misconception", None)
    forced_fix = None
    bug_d = None
    if target:
        from . import misconceptions as mc
        as_bug = sorted({w.variant for w in mc.authored_for(operation, "find_bug", target, role="bug")})
        as_fix = mc.authored_for(operation, "find_bug", target, role="fix")
        if as_bug:
            bug_d = variants[as_bug[seed % len(as_bug)]]
        elif as_fix:
            w = as_fix[seed % len(as_fix)]
            bug_d, forced_fix = variants[w.variant], w.option
        else:
            target = None
    if bug_d is None:
        bug_d = _pick_bug_variant(variants, intra, seed)

    knobs = resolve_intra("find_bug", intra)
    if knobs:
        node_count = _node_count_for(tmpl, knobs["node_count"])
        n_opts     = knobs["options"]
    else:
        node_count = _node_count_for(tmpl, 3)
        n_opts     = None

    # Inject the selected bug into the pseudocode
    pseudocode = list(tmpl["pseudocode"])
    bug_line   = bug_d["line"]
    pseudocode[bug_line] = bug_d["buggy"]
    fix = bug_d["fix"]

    # Serve-time gate: the bug must visibly break THIS board (detectCycle's
    # "answers true too eagerly" bug is invisible on a board that has a cycle),
    # and every wrong fix offered must fail on it too. Re-roll the board.
    def with_line(code: str) -> list[str]:
        lines = list(tmpl["pseudocode"])
        lines[bug_line] = code
        return lines
    sizes = _board_sizes(tmpl, node_count, bool(target))
    bug_shown = False
    for attempt in range(max(12, 3 * len(sizes) + 3) if target else 12):
        nodes, op_value, op_pos, goal, extra = _build_nodes_and_goal(
            operation, tmpl, _size_for(sizes, attempt) if target else node_count)
        board = item_quality.board_of(operation, nodes, op_value, op_pos, extra)
        wrong = [o for o in bug_d["options"] if o != fix
                 and item_quality.wrong_on_board(operation, with_line(o), board)]
        bug_shown = item_quality.wrong_on_board(operation, pseudocode, board)
        if wrong and bug_shown and (forced_fix is None or forced_fix in wrong):
            break
    if not (wrong and bug_shown):
        # No board showed the bug with a wrong fix left to offer: never serve an
        # invisible bug or a one-option question. Drop the target, then rotate
        # variants; none left is an error the client retries.
        if target:
            return generate_find_bug_question(operation, _respec(spec, target_misconception=None), _tries)
        if _tries < len(variants) - 1:
            return generate_find_bug_question(operation, _respec(spec, variant_seed=seed + 1), _tries + 1)
        raise RuntimeError(f"no askable find_bug for {operation} on any board drawn")
    if forced_fix in wrong:
        wrong = [forced_fix] + [o for o in wrong if o != forced_fix]
    if n_opts:
        wrong = wrong[:max(1, n_opts - 1)]
    options = [fix] + wrong
    random.shuffle(options)
    met = target if target and bug_shown and (forced_fix is None or forced_fix in options) else None

    return instantiate({
        "id":              str(uuid.uuid4()),
        "question_type":   "find_bug",
        "operation":       operation,
        "title":           tmpl["title"],
        "difficulty":      spec.difficulty,
        "variant":         f"bug{variants.index(bug_d)}-s{bug_d.get('subtlety', 2)}",
        "target_misconception": met,
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
