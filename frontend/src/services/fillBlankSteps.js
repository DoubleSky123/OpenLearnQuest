/**
 * Per-step linked-list states for the fill-in-the-blank board.
 *
 * Given an operation + its inputs, returns one entry PER pseudocode step describing
 * the list state AFTER that step runs, so the board can animate each step as the
 * student fills it in. Aligned to the TEMPLATES pseudocode in static_questions.py.
 *
 * Each entry: { values:number[], cursor:number|null, hi:{value,kind:'new'|'removing'}|null, note:string }
 * Returns null for operations we don't model → the board falls back to end-execution.
 */
export function computeStepStates(operation, initialValues, value, position) {
  const init = [...(initialValues ?? [])];
  const v    = value;
  const pos  = position ?? 1;   // 1-indexed
  const last = init.length - 1;

  switch (operation) {
    case 'insertAtHead': {
      const out = [v, ...init];
      return [
        { values: out, cursor: null, hi: { value: v, kind: 'new' }, note: `newNode = createNode(${v})` },
        { values: out, cursor: 0,    hi: { value: v, kind: 'new' }, note: 'newNode.next → old head' },
        { values: out, cursor: 0,    hi: null,                      note: 'head = newNode ✓' },
      ];
    }
    case 'insertIntoEmpty': {
      return [
        { values: [v], cursor: null, hi: { value: v, kind: 'new' }, note: `newNode = createNode(${v})` },
        { values: [v], cursor: null, hi: { value: v, kind: 'new' }, note: 'newNode.next = NULL' },
        { values: [v], cursor: 0,    hi: null,                      note: 'head = newNode ✓' },
      ];
    }
    case 'insertAtTail': {
      const out = [...init, v];
      return [
        { values: init, cursor: 0,                       hi: null,                      note: 'node = head' },
        { values: init, cursor: last >= 0 ? last : null, hi: null,                      note: 'traverse to tail' },
        { values: out,  cursor: last >= 0 ? last : null, hi: { value: v, kind: 'new' }, note: `newNode = createNode(${v})` },
        { values: out,  cursor: last >= 0 ? last : null, hi: { value: v, kind: 'new' }, note: 'tail.next = newNode' },
        { values: out,  cursor: null,                    hi: null,                      note: 'newNode.next = NULL ✓' },
      ];
    }
    case 'removeAtHead': {
      const rest = init.slice(1);
      return [
        { values: init, cursor: 0,    hi: { value: init[0], kind: 'removing' }, note: 'temp = head' },
        { values: rest, cursor: null, hi: null,                                 note: 'head = head.next' },
        { values: rest, cursor: null, hi: null,                                 note: 'free(temp) ✓' },
      ];
    }
    case 'removeAtTail': {
      const rest = init.slice(0, -1);
      const prev = Math.max(0, last - 1);
      return [
        { values: init, cursor: 0,    hi: null,                                    note: 'node = head' },
        { values: init, cursor: prev, hi: null,                                    note: 'stop at 2nd-last' },
        { values: init, cursor: prev, hi: { value: init[last], kind: 'removing' }, note: 'temp = node.next' },
        { values: rest, cursor: null, hi: null,                                    note: 'node.next = NULL' },
        { values: rest, cursor: null, hi: null,                                    note: 'free(temp) ✓' },
      ];
    }
    case 'deleteEntireList': {
      return [
        { values: init, cursor: 0,    hi: null, note: 'node = head' },
        { values: [],   cursor: null, hi: null, note: 'free every node' },
        { values: [],   cursor: null, hi: null, note: 'head = NULL ✓' },
      ];
    }
    case 'insertAtPosition': {
      const idx = Math.min(Math.max(pos - 1, 0), init.length);
      const out = [...init.slice(0, idx), v, ...init.slice(idx)];
      const prev = Math.max(0, idx - 1);
      return [
        { values: init, cursor: 0,    hi: null,                      note: 'node = head' },
        { values: init, cursor: prev, hi: null,                      note: `traverse to position ${pos}` },
        { values: out,  cursor: prev, hi: { value: v, kind: 'new' }, note: `newNode = createNode(${v})` },
        { values: out,  cursor: prev, hi: { value: v, kind: 'new' }, note: 'newNode.next = node.next' },
        { values: out,  cursor: null, hi: null,                      note: 'node.next = newNode ✓' },
      ];
    }
    case 'removeAtPosition': {
      const idx = Math.min(Math.max(pos - 1, 0), Math.max(0, last));
      const out = [...init.slice(0, idx), ...init.slice(idx + 1)];
      const prev = Math.max(0, idx - 1);
      return [
        { values: init, cursor: 0,    hi: null,                                   note: 'node = head' },
        { values: init, cursor: prev, hi: null,                                   note: 'traverse to predecessor' },
        { values: init, cursor: prev, hi: { value: init[idx], kind: 'removing' }, note: 'temp = node.next' },
        { values: out,  cursor: null, hi: null,                                   note: 'node.next = temp.next' },
        { values: out,  cursor: null, hi: null,                                   note: 'free(temp) ✓' },
      ];
    }
    default:
      return null;   // unsupported (e.g. reverse/merge/sort/cycle) → board falls back
  }
}
