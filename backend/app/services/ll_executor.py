"""
Python port of frontend/src/services/linkedListOperations.js.

Used as a validation oracle: given a question's (operation, initialNodes,
operationValue, operationPosition), compute the correct final state so we
can verify whether AI-generated goalPattern values are consistent.
"""

from typing import Any


# ── Helpers ────────────────────────────────────────────────────────────────────

def find_head_id(nodes: list[dict]) -> int | None:
    if not nodes:
        return None
    all_ids = {n["id"] for n in nodes}
    pointed = {n["next"] for n in nodes if n.get("next") is not None}
    candidates = all_ids - pointed
    return min(candidates) if candidates else nodes[0]["id"]


def traverse_ids(nodes: list[dict]) -> list[int]:
    order: list[int] = []
    node_map = {n["id"]: n for n in nodes}
    cur = find_head_id(nodes)
    visited: set[int] = set()
    while cur is not None and cur not in visited:
        order.append(cur)
        visited.add(cur)
        cur = node_map.get(cur, {}).get("next")
    return order


def traverse_values(nodes: list[dict]) -> list[int]:
    node_map = {n["id"]: n for n in nodes}
    return [node_map[i]["value"] for i in traverse_ids(nodes) if i in node_map]


def max_id(nodes: list[dict]) -> int:
    return max((n["id"] for n in nodes), default=0)


# ── Operation executor ─────────────────────────────────────────────────────────

def execute_operation(
    operation: str,
    nodes: list[dict],
    operation_value: Any = None,
    operation_position: int | None = None,
) -> dict:
    """
    Mirror of executeLinkedListOperation() in JS.
    Returns {"nodes": [...], "values": [...], "message": "..."}
    where `values` is the final list traversed in order.
    """
    nodes = [dict(n) for n in nodes]   # shallow copy

    # ── Level 3 ───────────────────────────────────────────────────────────────

    if operation == "reverseList":
        if not nodes:
            result = []
        else:
            order = traverse_ids(nodes)
            result = [
                {**n, "next": order[order.index(n["id"]) - 1] if order.index(n["id"]) > 0 else None}
                for n in nodes
            ]
        return _ok(result, "List reversed")

    if operation == "mergeSortedLists":
        l1 = operation_value.get("l1Values", []) if isinstance(operation_value, dict) else []
        l2 = operation_value.get("l2Values", []) if isinstance(operation_value, dict) else []
        merged = sorted(l1 + l2)
        result = [{"id": i + 1, "value": v, "next": i + 2 if i + 1 < len(merged) else None}
                  for i, v in enumerate(merged)]
        return _ok(result, "Lists merged")

    if operation == "detectCycle":
        return _ok(nodes, "Cycle detected")

    if operation == "sortList":
        vals = sorted(traverse_values(nodes))
        result = [{"id": i + 1, "value": v, "next": i + 2 if i + 1 < len(vals) else None}
                  for i, v in enumerate(vals)]
        return _ok(result, "List sorted")

    # ── Level 2 ───────────────────────────────────────────────────────────────

    if operation == "insertIntoEmpty":
        return _ok([{"id": 1, "value": operation_value, "next": None}], "Node inserted into empty list")

    if operation in ("removeSingleNode", "deleteEntireList"):
        return _ok([], "List cleared")

    if operation == "insertAtPosition":
        order = traverse_ids(nodes)
        pos = (operation_position or 1) - 1          # 0-indexed predecessor
        pred_id = order[pos] if 0 <= pos < len(order) else None
        if pred_id is None:
            return _ok(nodes, "No-op: invalid position")
        new_id = max_id(nodes) + 1
        pred = next(n for n in nodes if n["id"] == pred_id)
        result = [
            ({**n, "next": new_id} if n["id"] == pred_id else n)
            for n in nodes
        ] + [{"id": new_id, "value": operation_value, "next": pred["next"]}]
        return _ok(result, f"Node inserted at position {operation_position}")

    if operation == "removeAtPosition":
        order = traverse_ids(nodes)
        pos = (operation_position or 1) - 1           # 0-indexed target
        target_id = order[pos] if 0 <= pos < len(order) else None
        if target_id is None:
            return _ok(nodes, "No-op: invalid position")
        pred_id = order[pos - 1] if pos > 0 else None
        target = next(n for n in nodes if n["id"] == target_id)
        result = [
            ({**n, "next": target["next"]} if n["id"] == pred_id else n)
            for n in nodes
            if n["id"] != target_id
        ]
        return _ok(result, f"Node removed at position {operation_position}")

    # ── Level 1 ───────────────────────────────────────────────────────────────

    if operation == "insertAtHead":
        head_id = find_head_id(nodes)
        new_id  = max_id(nodes) + 1
        return _ok([{"id": new_id, "value": operation_value, "next": head_id}] + nodes,
                   "Node inserted at head")

    if operation == "insertAtTail":
        new_id = max_id(nodes) + 1
        result = [({**n, "next": new_id} if n["next"] is None else n) for n in nodes]
        result.append({"id": new_id, "value": operation_value, "next": None})
        return _ok(result, "Node inserted at tail")

    if operation == "removeAtHead":
        head_id = find_head_id(nodes)
        return _ok([n for n in nodes if n["id"] != head_id], "Head removed")

    if operation == "removeAtTail":
        last = next((n for n in nodes if n["next"] is None), None)
        if not last:
            return _ok(nodes, "No-op")
        second_last = next((n for n in nodes if n["next"] == last["id"]), None)
        result = [
            ({**n, "next": None} if second_last and n["id"] == second_last["id"] else n)
            for n in nodes
            if n["id"] != last["id"]
        ]
        return _ok(result, "Tail removed")

    return _ok(nodes, "Unknown operation")


def _ok(nodes: list[dict], message: str) -> dict:
    return {"nodes": nodes, "values": traverse_values(nodes), "message": message}


# ── Validation helper ──────────────────────────────────────────────────────────

def validate_question(question: dict) -> tuple[bool, list[int]]:
    """
    Run the question's operation through the executor and return
    (is_consistent, computed_goal_pattern).

    A question is consistent if the executor's output matches
    the question's claimed goalPattern.
    """
    try:
        result = execute_operation(
            operation=question["operation"],
            nodes=question["initialNodes"],
            operation_value=question.get("operationValue"),
            operation_position=question.get("operationPosition"),
        )
        computed = result["values"]
        claimed  = question.get("goalPattern", [])
        return (computed == claimed), computed
    except Exception:
        return False, []
