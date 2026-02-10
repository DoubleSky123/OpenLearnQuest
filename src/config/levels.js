// Color mappings for emoji circles
export const COLORS = {
  red: '🔴',
  blue: '🔵',
  green: '🟢',
  yellow: '🟡',
  purple: '🟣',
};

// All level configurations
export const LEVELS = [
{
  id: 1,
  title: 'Insert Two Nodes at Head - O(1)',
  description: 'Add 🟢 and 🟣 to the beginning - Execute two insertions in sequence!',
  
  // 目标：4个节点
  goalPattern: ['🟣', '🟢', '🔴', '🔵'],
  
  // 初始：2个节点
  initialNodes: [
    { id: 1, value: '🔴', next: 2 },
    { id: 2, value: '🔵', next: null }
  ],
  
  operation: 'insertAtHead',
  operationValue: ['green', 'purple'],  // ✅ 数组！插入2个
  
  // 6行代码（插入2次）
  pseudocode: [
    'create newNode1 with 🟢',
    'newNode1.next = head',
    'head = newNode1',
    'create newNode2 with 🟣',
    'newNode2.next = head',
    'head = newNode2'
  ],
  
  distractors: [
    'head.next = newNode1',
    'newNode2.next = newNode1'
  ],
  
  correctOrder: [0, 1, 2, 3, 4, 5],
  hasComplexity: false,
  hint: 'First insert 🟢, making it the new head. Then insert 🟣, making it the newest head.'
},
  {
    id: 2,
    title: 'Insert at Tail - O(n)',
    description: 'Add 🟡 to the end - O(n) Requires traversing the entire list to find the tail.',
    goalPattern: ['🔴', '🔵', '🟢', '🟡'],
    initialNodes: [
      { id: 1, value: '🔴', next: 2 },
      { id: 2, value: '🔵', next: 3 },
      { id: 3, value: '🟢', next: null }
    ],
    operation: 'insertAtTail',
    operationValue: 'yellow',
    pseudocode: [
      'traverse to last node',
      'create newNode with 🟡',
      'lastNode.next = newNode',
      'newNode.next = NULL'
    ],
    distractors: [
      'head = newNode',
      'newNode.next = head'
    ],
    correctOrder: [0, 1, 2, 3],
    hasComplexity: false,
    hint: 'You need to find the tail first, then create and attach the new node'
  },
  {
    id: 3,
    title: 'Remove at Head - O(1)',
    description: 'Remove first element - O(1) Fast operation! Direct access to head pointer.',
    goalPattern: ['🔵', '🟢', '🟡'],
    initialNodes: [
      { id: 1, value: '🔴', next: 2 },
      { id: 2, value: '🔵', next: 3 },
      { id: 3, value: '🟢', next: 4 },
      { id: 4, value: '🟡', next: null }
    ],
    operation: 'removeAtHead',
    pseudocode: [
      'temp = head',
      'head = head.next',
      'free temp'
    ],
    distractors: [
      'traverse to second-last node',
      'free head'
    ],
    correctOrder: [0, 1, 2],
    hasComplexity: false,
    hint: 'Save the old head, move head pointer, then free memory'
  },
  {
    id: 4,
    title: 'Remove at Tail',
    description: 'Remove the last element - analyze the time complexity of each step!',
    goalPattern: [1, 2, 3, 4],
    initialNodes: [
      { id: 1, value: 1, next: 2 },
      { id: 2, value: 2, next: 3 },
      { id: 3, value: 3, next: 4 },
      { id: 4, value: 4, next: 5 },
      { id: 5, value: 5, next: null }
    ],
    operation: 'removeAtTail',
    pseudocode: [
      'traverse to second-last node',
      'temp = node.next',
      'node.next = NULL',
      'free temp'
    ],
    distractors: [
      'head = head.next',
      'create newNode'
    ],
    complexity: ['O(n)', 'O(1)', 'O(1)', 'O(1)'],
    correctOrder: [0, 1, 2, 3],
    hasComplexity: true,
    useNumbers: true,
    hint: 'Which step requires traversing the list? That\'s your O(n) operation!'
  },
  {
    id: 5,
    title: 'Insert at Position',
    description: 'Insert 9 at position 2 - match each operation with its time complexity!',
    goalPattern: [1, 2, 9, 3, 4, 5],
    initialNodes: [
      { id: 1, value: 1, next: 2 },
      { id: 2, value: 2, next: 3 },
      { id: 3, value: 3, next: 4 },
      { id: 4, value: 4, next: 5 },
      { id: 5, value: 5, next: null }
    ],
    operation: 'insertAtPosition',
    operationValue: 9,
    operationPosition: 2,
    pseudocode: [
      'traverse to position 1',
      'create newNode with 9',
      'newNode.next = node.next',
      'node.next = newNode'
    ],
    distractors: [
      'head = newNode',
      'free node.next'
    ],
    complexity: ['O(n)', 'O(1)', 'O(1)', 'O(1)'],
    correctOrder: [0, 1, 2, 3],
    hasComplexity: true,
    useNumbers: true,
    hint: 'Traversal is O(n), pointer operations are O(1)'
  },
  {
    id: 6,
    title: 'Remove at Position',
    description: 'Remove node at position 3 - identify which operations take linear time!',
    goalPattern: [1, 2, 3, 5, 6],
    initialNodes: [
      { id: 1, value: 1, next: 2 },
      { id: 2, value: 2, next: 3 },
      { id: 3, value: 3, next: 4 },
      { id: 4, value: 4, next: 5 },
      { id: 5, value: 5, next: 6 },
      { id: 6, value: 6, next: null }
    ],
    operation: 'removeAtPosition',
    operationPosition: 3,
    pseudocode: [
      'traverse to position 2',
      'temp = node.next',
      'node.next = temp.next',
      'free temp'
    ],
    distractors: [
      'traverse to last node',
      'newNode.next = NULL'
    ],
    complexity: ['O(n)', 'O(1)', 'O(1)', 'O(1)'],
    correctOrder: [0, 1, 2, 3],
    hasComplexity: true,
    useNumbers: true,
    hint: 'Only traversal requires visiting multiple nodes - everything else is constant time'
  }
];