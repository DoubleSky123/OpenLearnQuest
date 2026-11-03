import { describe, expect, it } from 'vitest';
import { finalHintFor } from './finalHint';
import { FINAL_HINT_MIN_ERRORS, countsForFinalHint, scaffoldState } from '../hooks/useScaffold';

describe('final hint timing (scaffold level 4)', () => {
  const firstFinal = (emotion) => {
    for (let errors = 0; errors <= 10; errors++) if (scaffoldState(emotion, errors).finalHint) return errors;
    return null;
  };

  it('comes after the animation (1st) and the tutor (2nd), never sooner', () => {
    expect(firstFinal('engaged')).toBe(4);
    expect(firstFinal('bored')).toBe(4);
    expect(firstFinal('confused')).toBe(FINAL_HINT_MIN_ERRORS);
    expect(firstFinal('frustrated')).toBe(FINAL_HINT_MIN_ERRORS);   // baseline 2 alone would allow it at 2
  });

  it('is never offered to an expert (mastery fading caps the ladder at 2)', () => {
    expect(scaffoldState('frustrated', 9, 0.8).finalHint).toBe(false);
  });
});

describe('finalHintFor', () => {
  it('fill_blank: the token for the blank they are on, inside its line', () => {
    const q = {
      question_type: 'fill_blank',
      pseudocode: ['newNode = createNode(74);', 'newNode.next = ___;', 'head = ___;'],
      blanks: [{ line: 1, answer: 'head' }, { line: 2, answer: 'newNode' }],
      step_hints: ['a', 'b', 'Only after the new node is linked in can head move to it.'],
    };
    const hint = finalHintFor({ question: q, focus: { kind: 'blank', stepNo: 3 } });
    expect(hint).toEqual({ stepNo: 3, label: 'Step 3 is', answer: 'head = newNode;', why: q.step_hints[2] });
  });

  it('find_bug: the line while hunting, then its fix', () => {
    const q = {
      question_type: 'find_bug', bug_line: 1,
      pseudocode: ['curr = head;', 'while (curr.next != NULL) curr = curr.next;'],
      fix: 'while (curr.next.next != NULL) curr = curr.next;', bug_explanation: 'Stop one node earlier.',
    };
    expect(finalHintFor({ question: q, focus: { kind: 'hunting' } }).label).toBe('The bug is on line 2');
    expect(finalHintFor({ question: q, focus: { kind: 'fix' } }))
      .toMatchObject({ answer: q.fix, why: 'Stop one node earlier.' });
  });

  it('ordering: the step at the first wrong position', () => {
    const correct = ['newNode = createNode(35);', 'newNode.next = head;', 'head = newNode;'];
    const q = { question_type: 'ordering', pseudocode: correct, step_hints: ['x', 'Link it in first.', 'y'] };
    const attempt = ['newNode = createNode(35);', 'head = newNode;'];
    expect(finalHintFor({ question: q, attempt, correct }))
      .toEqual({ stepNo: 2, label: 'Step 2 is', answer: 'newNode.next = head;', why: 'Link it in first.' });
    expect(finalHintFor({ question: q, attempt: correct, correct })).toBeNull();   // nothing wrong
  });
});

describe('the final hint ignores the tutor chat ("I don\'t know" is not a try)', () => {
  it('no board mistakes, no final hint — whatever the chat says or the emotion is', () => {
    for (const emotion of ['engaged', 'confused', 'frustrated', 'bored'])
      for (const errors of [0, 1, 2]) expect(scaffoldState(emotion, errors).finalHint).toBe(false);
  });

  it('an emotion inferred from the chat does not count toward it', () => {
    expect(countsForFinalHint('chat')).toBe(false);
    expect(countsForFinalHint('llm')).toBe(true);           // inferred from board behaviour
    expect(countsForFinalHint('self-report')).toBe(true);
    // why it matters: a "frustrated" read from chat would otherwise pull it from the 4th mistake to the 3rd
    expect(scaffoldState('engaged', 3).finalHint).toBe(false);
    expect(scaffoldState('frustrated', 3).finalHint).toBe(true);
  });
});
