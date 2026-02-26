# Universal Distractor Analyzer - 使用指南

## 🎯 设计理念

新的 distractor 分析系统采用**三层架构**，从最具体到最通用：

```
1. 配置驱动 (Custom Explanations)
   ↓ 如果没有配置
2. 语义分析 (Semantic Analysis)  
   ↓ 如果无法识别
3. 通用反馈 (Generic Feedback)
```

这样无论你添加什么样的 distractor，系统都能给出有意义的反馈！

---

## 📚 支持的语义模式

### 系统自动识别的 8 种错误模式：

| 模式 | 检测规则 | 适用场景 |
|------|---------|---------|
| **1. Free in Insert** | 包含 `free` 且操作是 insert | 所有插入关卡 |
| **2. Traverse in O(1)** | 包含 `traverse` 且操作是 insertAtHead | Head 插入关卡 |
| **3. NULL in Non-Tail** | 包含 `.next = NULL` 且不是尾部插入 | 非尾部插入关卡 |
| **4. Node-to-Node** | `newNode1.next = newNode2` 模式 | 多步插入关卡 |
| **5. Wrong Pointer Direction** | `head.next = ...` 模式 | Head 操作关卡 |
| **6. Create in Delete** | 包含 `create newNode` 且操作是 remove | 所有删除关卡 |
| **7. Head in Tail/Position** | `head = newNode` 在非 head 操作中 | Tail/Position 关卡 |
| **8. Tail Pattern in Head** | `lastNode.next` 或 tail 模式在 head 操作中 | Head 插入关卡 |

---

## 🔧 使用方法

### 方法 1: 完全自动（推荐用于标准情况）

**无需任何配置**，系统会自动分析！

```javascript
// levels.js
{
  id: 2,
  title: 'Insert at Tail',
  operation: 'insertAtTail',
  pseudocode: [
    'traverse to last node',
    'create newNode',
    'lastNode.next = newNode',
    'newNode.next = NULL'
  ],
  distractors: [
    'head = newNode',           // ✅ 自动识别：head 操作在 tail 中
    'newNode.next = head'       // ✅ 自动识别：head 模式在 tail 中
  ]
}
```

**自动生成的反馈：**
```
❌ Incorrect Code Block(s) Detected

🔍 What went wrong:
You're using "head = newNode" which is for HEAD insertion, 
not insertAtTail!

💡 Why this matters:
Different insertion positions use different patterns. 
Head changes head pointer; tail/position changes .next pointers.

🎯 Key Concept:
Insert at Head: newNode.next = head → head = newNode
Insert at Tail: traverse → lastNode.next = newNode → newNode.next = NULL
Insert at Position: traverse to prev → newNode.next = prev.next → prev.next = newNode
```

---

### 方法 2: 自定义解释（用于特殊情况）

当你有**特定的教学目标**或自动分析不够准确时，可以添加自定义解释：

```javascript
// levels.js
{
  id: 1,
  title: 'Insert Two Nodes at Head',
  operation: 'insertAtHead',
  distractors: [
    'head.next = newNode1',
    'newNode2.next = newNode1'
  ],
  
  // 👇 添加自定义解释
  distractorExplanations: {
    'head.next = newNode1': {
      explanation: 'You\'re modifying head.next, but head is a POINTER, not a node!',
      reasoning: 'In head insertion, we reassign the head pointer itself (head = newNode), not modify the node it points to.',
      keyPoint: 'Head is a pointer. Change WHERE it points, not WHAT it points to.',
      hint: 'Think: if head is a pointer variable, you assign to it, not to its properties.'
    },
    'newNode2.next = newNode1': {
      explanation: 'You\'re connecting new nodes directly! But each insertion should connect to the current HEAD.',
      reasoning: 'After inserting newNode1, HEAD changes. The second insertion connects to the NEW head (which is newNode1), not directly to newNode1.',
      keyPoint: 'Always use HEAD, not node variables. HEAD automatically points to the current first node.',
      hint: 'After first insertion: head → newNode1 → ... So second insertion: newNode2.next = head'
    }
  }
}
```

**自定义反馈的好处：**
- ✅ 可以针对具体的教学场景定制
- ✅ 可以强调特定的学习要点
- ✅ 完全控制反馈内容

---

## 📖 完整示例：Level 3 - Remove at Head

```javascript
{
  id: 3,
  title: 'Remove at Head - O(1)',
  operation: 'removeAtHead',
  pseudocode: [
    'temp = head',
    'head = head.next',
    'free temp'
  ],
  distractors: [
    'traverse to second-last node',  // ✅ 自动识别：traversal in O(1) operation
    'free head',                      // ✅ 自动识别：freeing without temp
    'create newNode'                  // ✅ 自动识别：create in delete operation
  ]
  
  // 不需要 distractorExplanations，自动分析已经很好了！
}
```

**对于 `'traverse to second-last node'`，自动生成：**
```
🔍 What went wrong:
You're using "traverse" in a HEAD removal! 
Head removal is O(1) and doesn't need traversal.

💡 Why this matters:
Head removal works directly with the head pointer. 
Only tail or position operations need traversal.

🎯 Key Concept:
Head operations = O(1) (no traversal)
Tail/Position operations = O(n) (need traversal)
```

**对于 `'create newNode'`，自动生成：**
```
🔍 What went wrong:
You're creating a new node, but this is a DELETION operation!

💡 Why this matters:
Deletion removes existing nodes; insertion adds new ones. 
You don't create nodes when deleting.

🎯 Key Concept:
Deletion: find → save → disconnect → free (no "create newNode")
```

---

## 🎓 何时使用自定义 vs 自动

### 使用自动分析（80% 的情况）✅
- Distractor 包含明显的语义标记（free, traverse, NULL, create 等）
- 标准的操作类型混淆（insert code in delete, head pattern in tail, etc.）
- 新关卡的快速开发

### 使用自定义解释（20% 的情况）📝
- 需要强调特定的概念误解
- Distractor 的错误很微妙，自动分析可能不够准确
- 有特殊的教学目标
- Distractor 是完全自创的新模式

---

## 🚀 添加新关卡的工作流

### 简单流程（推荐）：
```
1. 创建关卡配置（只需 distractors 数组）
2. 测试 → 看自动分析的反馈
3. 如果反馈不够好 → 添加 distractorExplanations
4. 完成！
```

### 示例：

```javascript
// Step 1: 初始配置
{
  id: 7,
  title: 'Insert at Middle',
  operation: 'insertAtPosition',
  operationPosition: 3,
  pseudocode: [
    'traverse to position 2',
    'create newNode',
    'newNode.next = node.next',
    'node.next = newNode'
  ],
  distractors: [
    'head = newNode',              // 会自动识别
    'traverse to position 3',      // 会自动识别
    'newNode.next = NULL'          // 会自动识别
  ]
}

// Step 2: 测试后，如果某个反馈不够好，添加自定义
distractorExplanations: {
  'traverse to position 3': {  // 只为这一个添加自定义
    explanation: 'You traversed to position 3, but to INSERT at position 3, you need the node at position 2!',
    reasoning: 'To insert between positions 2 and 3, you need access to position 2\'s node so you can modify its .next pointer.',
    keyPoint: 'To insert at position N, traverse to position N-1',
    hint: 'Think: whose .next pointer needs to change? That\'s the node you need to access.'
  }
}
```

---

## 🔍 语义分析的工作原理

系统通过**正则表达式和关键字匹配**来理解代码语义：

```javascript
// 检测 1: Free in Insert
if (operation.includes('insert') && code.includes('free'))
  → "This is deletion code in insertion!"

// 检测 2: Node-to-Node Connection  
if (/newNode\d+\.next = newNode\d+/.test(code))
  → "Don't connect nodes directly, use head!"

// 检测 3: Wrong Pointer Direction
if (/^head\.next\s*=/.test(code))
  → "head is a pointer, not a node!"

// ... 等等
```

每个检测都返回**完整的教育性反馈**，包括：
- explanation（哪里错了）
- reasoning（为什么错）
- keyPoint（关键概念）
- hint（如何修正）

---

## 💡 设计优势

### 1. **零配置使用**
大多数情况下，只需添加 distractor 代码，系统自动处理

### 2. **完全可扩展**
需要特殊反馈时，可以随时添加自定义解释

### 3. **向后兼容**
现有关卡不需要修改，自动升级到智能分析

### 4. **可维护性**
- 语义规则集中在 `distractorAnalyzer.js`
- 添加新规则不影响现有代码
- 清晰的模块分离

### 5. **智能兜底**
即使新的 distractor 无法识别，也会给出基于操作类型的通用但有意义的反馈

---

## 📝 总结

| 需求 | 解决方案 | 示例 |
|------|---------|------|
| 标准 distractor | 无需配置，自动识别 | `'free temp'` in insert |
| 特殊 distractor | 添加 `distractorExplanations` | 自定义概念解释 |
| 新操作类型 | 系统会使用通用反馈 | 仍然有教育意义 |
| 扩展语义规则 | 修改 `distractorAnalyzer.js` | 添加新的 pattern |

**这个系统既灵活又强大，支持从零配置到完全自定义的所有场景！** 🚀
