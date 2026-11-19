import { describe, expect, it } from 'vitest';
import { answeredCount, elapsedMs, firstUnanswered, TEST_TEXT } from './studyTest';

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('study test helpers', () => {
  it('resumes at the first unanswered item', () => {
    expect(firstUnanswered(items, {})).toBe(0);
    expect(firstUnanswered(items, { a: 'x' })).toBe(1);
    expect(firstUnanswered(items, { a: 'x', c: 'y' })).toBe(1);
  });

  it('goes to the review when everything is answered', () => {
    expect(firstUnanswered(items, { a: 'x', b: 'y', c: 'z' })).toBe(3);
    expect(answeredCount(items, { a: 'x', c: 'z' })).toBe(2);
  });

  it('caps the time on an item and never goes negative', () => {
    expect(elapsedMs(1000, 4000)).toBe(3000);
    expect(elapsedMs(5000, 4000)).toBe(0);
    expect(elapsedMs(0, 10 * 60 * 60 * 1000)).toBe(30 * 60 * 1000);
  });

  it('has a title and an intro for every test', () => {
    for (const kind of ['pre', 'post', 'delayed']) {
      expect(TEST_TEXT[kind].title).toBeTruthy();
      expect(TEST_TEXT[kind].intro).toBeTruthy();
    }
  });
});
