import { useState } from 'react';

/**
 * LeetCode-style "Definition for singly-linked list" comment block.
 *
 * Professor feedback: students read `createNode(46)` and `curr.next` without ever
 * having seen what a Node actually is. LeetCode solves this by pinning a
 * commented-out class definition above the editor — you don't write it, but it's
 * always there to look at. Same idea here.
 *
 * The createNode body only appears when the exercise actually calls it (a delete
 * operation showing a constructor is just noise). Everything is rendered as a
 * comment, greyed out, so it reads as reference material and not as a step the
 * student is meant to fill in.
 */
export default function NodeClassComment({ pseudocode = [] }) {
  const [open, setOpen] = useState(true);
  const usesCreateNode = pseudocode.some(l => typeof l === 'string' && l.includes('createNode'));

  const lines = [
    'class Node {',
    '    int  value;   // the data this node holds',
    '    Node next;    // the next node, or null at the end of the list',
    '}',
  ];
  if (usesCreateNode) {
    lines.push(
      '',
      'Node createNode(int v) {   // given to you — you never write this one',
      '    Node n = new Node();',
      '    n.value = v;',
      '    n.next  = null;        // a brand-new node points at nothing yet',
      '    return n;',
      '}',
    );
  }

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-2.5">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 text-left"
      >
        <span className="text-gray-400 text-[10px] w-3 shrink-0">{open ? '▾' : '▸'}</span>
        <span className="font-mono text-[11px] text-gray-400">
          // Definition for a singly-linked list node — reference only
        </span>
      </button>

      {open && (
        <pre className="font-mono text-[11px] leading-[1.6] text-gray-400 mt-1.5 ml-5 overflow-x-auto whitespace-pre">
          {lines.map(l => (l ? `// ${l}` : '//')).join('\n')}
        </pre>
      )}
    </div>
  );
}
