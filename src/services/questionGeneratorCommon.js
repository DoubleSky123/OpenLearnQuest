/**
 * SHARED HELPERS — used by both questionGenerator.js (SLL) and doublyQuestionGenerator.js (DLL)
 */

import { shuffleArray } from '../utils/helpers.js';

/** Return n unique integers sampled from [min, max]. */
export const uniqueInts = (n, min, max) => {
  const pool = [];
  for (let i = min; i <= max; i++) pool.push(i);
  return shuffleArray(pool).slice(0, n);
};

/** Pick one element at random from an array. */
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Build a singly linked list node array from a values array. */
export const buildSLLNodes = (values) =>
  values.map((v, i) => ({
    id:    i + 1,
    value: v,
    next:  i + 1 < values.length ? i + 2 : null,
  }));

/** Build a doubly linked list node array from a values array. */
export const buildDLLNodes = (values) =>
  values.map((v, i) => ({
    id:    i + 1,
    value: v,
    next:  i + 1 < values.length ? i + 2 : null,
    prev:  i > 0 ? i : null,
  }));
