# 如何添加新的错误检测器 - 实用指南

## 🎯 系统完全支持扩展！

当前系统有 **5个检测器**，你可以轻松添加第 **6, 7, 8...** 个检测器。

---

## 📋 添加新检测器的3个步骤

### Step 1: 编写检测函数

```javascript
/**
 * Pattern 6: Your New Detector
 * 检测：描述你要检测的错误模式
 */
const detectYourNewError = (userSequence, pseudocode, level) => {
  // 1. 将索引转换为实际代码
  const codeTexts = userSequence.map(idx => pseudocode[idx]);
  
  // 2. 实现你的检测逻辑
  // 例如：查找特定的代码模式
  const problemLine = codeTexts.findIndex(text => 
    text.includes('你要检测的关键字')
  );
  
  // 3. 判断是否有错误
  if (/* 你的错误条件 */) {
    return {
      type: 'your_error_type',
      category: 'Error Category',
      message: '🔥 Error Title',
      explanation: '详细解释哪里错了',
      reasoning: '为什么这样是错的（概念层面）',
      analogy: '生活中的类比帮助理解',
      keyPoint: '核心学习要点',
      suggestedFix: '具体如何修复'
    };
  }
  
  // 4. 没有错误就返回null
  return null;
};
```

### Step 2: 添加到主检测函数

在 `validationLogic.js` 中找到 `detectCodeErrorPattern()` 函数：

```javascript
const detectCodeErrorPattern = (assemblyArea, currentLevel) => {
  const userSequence = assemblyArea.map(item => item.index);
  const correctSequence = currentLevel.correctOrder;
  const pseudocode = currentLevel.pseudocode;
  
  // Pattern 1-5: 现有的检测器
  const pointerSequenceError = detectPointerSequenceError(...);
  if (pointerSequenceError) return pointerSequenceError;
  
  const traversalError = detectTraversalError(...);
  if (traversalError) return traversalError;
  
  const nullPlacementError = detectNullPlacementError(...);
  if (nullPlacementError) return nullPlacementError;
  
  const tempVariableError = detectTempVariableError(...);
  if (tempVariableError) return tempVariableError;
  
  const semanticError = detectSemanticError(...);
  if (semanticError) return semanticError;
  
  // 👇 添加你的新检测器（Pattern 6）
  const yourNewError = detectYourNewError(userSequence, pseudocode, currentLevel);
  if (yourNewError) return yourNewError;
  
  // 👇 可以继续添加 Pattern 7, 8, 9...
  
  return null;
};
```

### Step 3: 测试

1. 运行游戏
2. 故意制造你想检测的错误
3. 检查是否显示了正确的反馈

---

## 💡 实际例子：添加 Memory Leak Detector

### 需求
检测用户创建了节点但忘记连接到链表的情况

### 实现

```javascript
/**
 * Pattern 6: Memory Leak Detector
 * 检测：创建了节点但没有连接到链表
 */
const detectMemoryLeakError = (userSequence, pseudocode, level) => {
  const codeTexts = userSequence.map(idx => pseudocode[idx]);
  
  // 查找所有创建节点的操作
  const createNodeLines = codeTexts
    .map((text, idx) => ({ text, idx }))
    .filter(({ text }) => text.includes('create newNode'));
  
  // 对每个创建的节点，检查是否有连接操作
  for (const { text, idx } of createNodeLines) {
    // 提取节点名称（newNode, newNode1, newNode2等）
    const nodeNameMatch = text.match(/create (\w+)/);
    if (!nodeNameMatch) continue;
    
    const nodeName = nodeNameMatch[1];
    
    // 检查这个节点是否在后续的代码中被使用
    const subsequentLines = codeTexts.slice(idx + 1);
    const isConnected = subsequentLines.some(line => 
      line.includes(`${nodeName}.next =`) || 
      line.includes(`= ${nodeName}`)
    );
    
    if (!isConnected) {
      return {
        type: 'memory_leak',
        category: 'Memory Management',
        message: '💾 Memory Leak Detected',
        explanation: `You created "${nodeName}" but never connected it to the list!`,
        reasoning: 'Creating a node without connecting it wastes memory. The node exists in memory but is unreachable from the list.',
        analogy: 'Like building a house but never connecting the road to it. The house exists but nobody can ever reach it or use it!',
        keyPoint: 'Every node you create MUST be connected somewhere in the linked list.',
        suggestedFix: `Add a line after creating ${nodeName} to connect it: "${nodeName}.next = something" or "something = ${nodeName}"`
      };
    }
  }
  
  return null;
};
```

### 添加到主函数

```javascript
const detectCodeErrorPattern = (assemblyArea, currentLevel) => {
  // ... 现有代码 ...
  
  const semanticError = detectSemanticError(userSequence, pseudocode, currentLevel);
  if (semanticError) return semanticError;
  
  // 👇 添加新检测器
  const memoryLeakError = detectMemoryLeakError(userSequence, pseudocode, currentLevel);
  if (memoryLeakError) return memoryLeakError;
  
  return null;
};
```

### 测试场景

用户提交：
```
1. create newNode with 🟢
2. create newNode2 with 🟣  ← 创建了但没用
3. head = newNode
```

检测器会发现 `newNode2` 创建后没有被连接，返回：
```
💾 Memory Leak Detected

🔍 What went wrong:
You created "newNode2" but never connected it to the list!

💡 Why this matters:
Creating a node without connecting it wastes memory. 
The node exists in memory but is unreachable from the list.

🌟 Think of it this way:
Like building a house but never connecting the road to it. 
The house exists but nobody can ever reach it or use it!

🎯 Key Concept:
Every node you create MUST be connected somewhere in the linked list.

💡 Suggested Fix:
Add a line after creating newNode2 to connect it: 
"newNode2.next = something" or "something = newNode2"
```

---

## 🎨 更多检测器创意

### Pattern 7: Disconnection Without Save

**检测：** 断开连接前没有保存引用

```javascript
const detectDisconnectionWithoutSave = (userSequence, pseudocode, level) => {
  const codeTexts = userSequence.map(idx => pseudocode[idx]);
  
  // 查找 node.next = NULL 的行
  const disconnectIdx = codeTexts.findIndex(text => 
    text.includes('.next = NULL')
  );
  
  if (disconnectIdx !== -1) {
    // 检查之前是否有保存引用
    const beforeLines = codeTexts.slice(0, disconnectIdx);
    const hasSaved = beforeLines.some(text => 
      text.includes('temp =') && text.includes('.next')
    );
    
    if (!hasSaved) {
      return {
        type: 'disconnection_without_save',
        message: '⚠️ Lost Reference',
        explanation: 'You set .next = NULL without saving the reference first!',
        reasoning: 'Once you disconnect, you lose access to the rest of the list.',
        keyPoint: 'Always save references before disconnecting: temp = node.next'
      };
    }
  }
  
  return null;
};
```

### Pattern 8: Wrong Order in Multi-Step

**检测：** 多步操作顺序错误

```javascript
const detectMultiStepOrderError = (userSequence, pseudocode, level) => {
  const codeTexts = userSequence.map(idx => pseudocode[idx]);
  
  // 检测两次插入操作是否混在一起
  const firstInsertStart = codeTexts.findIndex(text => 
    text.includes('create newNode1')
  );
  const secondInsertStart = codeTexts.findIndex(text => 
    text.includes('create newNode2')
  );
  
  if (firstInsertStart !== -1 && secondInsertStart !== -1) {
    // 检查第一次插入是否完成
    const firstInsertComplete = codeTexts
      .slice(firstInsertStart, secondInsertStart)
      .some(text => text.includes('head = newNode1'));
    
    if (!firstInsertComplete) {
      return {
        type: 'multi_step_order',
        message: '🔀 Multi-Step Order Error',
        explanation: 'You started the second insertion before completing the first one!',
        reasoning: 'Each insertion should be completed independently: create → connect → update.',
        keyPoint: 'Complete one operation fully before starting the next.'
      };
    }
  }
  
  return null;
};
```

### Pattern 9: Index Off-by-One

**检测：** 位置计算错误

```javascript
const detectOffByOneError = (userSequence, pseudocode, level) => {
  if (!level.operationPosition) return null;
  
  const codeTexts = userSequence.map(idx => pseudocode[idx]);
  const targetPos = level.operationPosition;
  
  // 查找遍历语句
  const traversalLine = codeTexts.find(text => 
    text.includes('traverse to position')
  );
  
  if (traversalLine) {
    const match = traversalLine.match(/position (\d+)/);
    if (match) {
      const traversePos = parseInt(match[1]);
      
      // 检查是否差1
      if (Math.abs(traversePos - targetPos) === 1) {
        return {
          type: 'off_by_one',
          message: '📍 Off-by-One Error',
          explanation: `Close! You traversed to position ${traversePos}, but should go to position ${targetPos - 1}`,
          reasoning: 'Remember: to modify position N, you need access to position N-1',
          keyPoint: 'Position to traverse = Target position - 1'
        };
      }
    }
  }
  
  return null;
};
```

---

## 🔧 检测器模板

复制这个模板来创建新的检测器：

```javascript
/**
 * Pattern X: [Your Detector Name]
 * 检测：[描述要检测的错误]
 * 
 * @param {Array} userSequence - 用户代码的索引顺序
 * @param {Array} pseudocode - 关卡的伪代码数组
 * @param {Object} level - 当前关卡配置
 * @returns {Object|null} 错误对象或null
 */
const detectYourError = (userSequence, pseudocode, level) => {
  // Step 1: 获取实际代码文本
  const codeTexts = userSequence.map(idx => pseudocode[idx]);
  
  // Step 2: 分析代码，查找错误模式
  // 你的检测逻辑...
  
  // Step 3: 如果发现错误，返回详细反馈
  if (/* 错误条件 */) {
    return {
      type: 'error_type_id',           // 唯一标识
      category: 'Category Name',        // 概念类别
      message: '📌 Error Title',        // 错误标题（显示在顶部）
      explanation: '...',               // 详细解释（必需）
      reasoning: '...',                 // 概念推理（必需）
      analogy: '...',                   // 生活类比（可选）
      keyPoint: '...',                  // 核心概念（推荐）
      correctApproach: '...',          // 正确做法（可选）
      suggestedFix: '...',             // 具体修复（推荐）
      examples: { /* ... */ },         // 示例对比（可选）
      comparison: { /* ... */ }        // 对比表格（可选）
    };
  }
  
  // Step 4: 没有发现错误
  return null;
};
```

---

## 📊 检测器优先级建议

按错误的**常见程度**和**严重程度**排序：

```javascript
const detectCodeErrorPattern = (assemblyArea, currentLevel) => {
  // 1. 最常见的错误（优先检测）
  const pointerSequenceError = detectPointerSequenceError(...);
  if (pointerSequenceError) return pointerSequenceError;
  
  // 2. 特定操作的错误
  const traversalError = detectTraversalError(...);
  if (traversalError) return traversalError;
  
  const nullPlacementError = detectNullPlacementError(...);
  if (nullPlacementError) return nullPlacementError;
  
  // 3. 内存管理错误
  const tempVariableError = detectTempVariableError(...);
  if (tempVariableError) return tempVariableError;
  
  const memoryLeakError = detectMemoryLeakError(...);
  if (memoryLeakError) return memoryLeakError;
  
  // 4. 概念混淆错误
  const semanticError = detectSemanticError(...);
  if (semanticError) return semanticError;
  
  // 5. 细节错误
  const offByOneError = detectOffByOneError(...);
  if (offByOneError) return offByOneError;
  
  return null;
};
```

---

## ✅ 最佳实践

### 1. 明确的错误条件
```javascript
// ❌ 模糊的检测
if (something seems wrong) { ... }

// ✅ 具体的检测
if (headAssignmentIdx !== -1 && nextAssignmentIdx !== -1 
    && headAssignmentIdx < nextAssignmentIdx) { ... }
```

### 2. 详细的反馈
```javascript
// ❌ 不够详细
return { message: 'Wrong order' };

// ✅ 教育性强
return {
  message: '🔗 Pointer Sequence Error',
  explanation: 'You moved head before connecting...',
  reasoning: 'Order matters because...',
  analogy: 'Like a relay race...',
  keyPoint: 'Always connect before moving'
};
```

### 3. 防御性编程
```javascript
// ✅ 检查边界条件
if (!level.operationPosition) return null;
if (codeTexts.length === 0) return null;
if (!nodeNameMatch) continue;
```

### 4. 可读的代码
```javascript
// ✅ 清晰的变量名和注释
// 查找所有创建节点的操作
const createNodeLines = codeTexts
  .map((text, idx) => ({ text, idx }))
  .filter(({ text }) => text.includes('create newNode'));

// 对每个创建的节点，检查是否有连接操作
for (const { text, idx } of createNodeLines) {
  // ...
}
```

---

## 🎯 总结

### 添加新检测器只需3步：
1. ✅ 写检测函数（使用模板）
2. ✅ 添加到 `detectCodeErrorPattern()`
3. ✅ 测试

### 系统优势：
- 🔧 **模块化** - 每个检测器独立
- 🎨 **灵活** - 可以自由添加新字段
- 📈 **可扩展** - 无限制地添加新检测器
- 🎓 **教育性** - 统一的反馈格式

### 你可以做的：
- ✅ 添加新的错误模式检测
- ✅ 改进现有检测器的逻辑
- ✅ 自定义反馈内容和格式
- ✅ 调整检测器的优先级

**系统完全开放，随时可以扩展！** 🚀
