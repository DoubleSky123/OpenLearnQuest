/**
 * LEVEL TEMPLATES
 * No more static questions here — just the three difficulty definitions.
 * Actual questions are generated dynamically by questionGenerator.js
 */

export const LEVEL_TEMPLATES = [
  {
    id: 1,
    label: 'Level 1',
    difficulty: 'Beginner',
    description: 'Single operation on head or tail. Short list (3–4 nodes).',
    operations: ['insertAtHead', 'insertAtTail', 'removeAtHead', 'removeAtTail'],
  },
  {
    id: 2,
    label: 'Level 2',
    difficulty: 'Intermediate',
    description: 'Single operation at a specific position. Medium list (5 nodes).',
    operations: ['insertAtPosition', 'removeAtPosition'],
  },
  {
    id: 3,
    label: 'Level 3',
    difficulty: 'Advanced',
    description: 'Two combined operations in sequence. Longer list (6–8 nodes).',
    operations: ['combined'],
  },
];
