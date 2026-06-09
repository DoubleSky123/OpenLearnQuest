/**
 * Shared operation name constants.
 * All services that compare or reference operation strings should import from here.
 * The source-of-truth values come from questionGenerator.js — keep them in sync.
 */

export const OP = {
  // Level 1
  INSERT_AT_HEAD:     'insertAtHead',
  INSERT_AT_TAIL:     'insertAtTail',
  REMOVE_AT_HEAD:     'removeAtHead',
  REMOVE_LAST_NODE:   'removeLastNode',

  // Level 2
  INSERT_INTO_EMPTY:  'insertIntoEmpty',
  DELETE_ENTIRE_LIST: 'deleteEntireList',
  INSERT_AT_POSITION: 'insertAtPosition',
  REMOVE_AT_POSITION: 'removeAtPosition',

  // Level 3
  REVERSE_LIST:       'reverseList',
  MERGE_SORTED_LISTS: 'mergeSortedLists',
  DETECT_CYCLE:       'detectCycle',
  SORT_LIST:          'sortList',
};
