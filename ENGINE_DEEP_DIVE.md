# errorDetectionEngine.js - 深度解析

## 1️⃣ 规则对象的解剖

### 规则结构

每个规则是一个包含 4 个核心属性的对象：

```javascript
const exampleRule = {
  // ===== 必需属性 =====
  
  id: 'unique_identifier',
  // 作用：唯一标识这个规则
  // 用途：调试、日志记录、规则管理
  // 示例：'pointer_sequence', 'null_placement'
  
  detector: function(userSequence, pseudocode, level) {
    // 作用：检测是否存在这种错误
    // 输入：
    //   - userSequence: [0, 2, 1, 3] 用户的代码顺序索引
    //   - pseudocode: ['line1', 'line2', ...] 关卡的所有代码行
    //   - level: { operation, operationValue, ... } 完整的关卡配置
    // 输出：
    //   - null: 没有发现错误
    //   - object: 发现错误，返回检测结果
    
    // 返回值会传给 feedback 函数
    return { lineNumber: 3, wrongCode: '...' };
  },
  
  feedback: function(detectionResult, level) {
    // 作用：生成教育性反馈
    // 输入：
    //   - detectionResult: detector 返回的对象
    //   - level: 关卡配置
    // 输出：必须返回反馈对象
    
    return {
      type: 'error_type',
      message: 'Error Title',
      explanation: 'What went wrong',
      reasoning: 'Why this matters',
      keyPoint: 'Core concept',
      // ... 其他字段
    };
  },
  
  // ===== 可选属性 =====
  
  category: 'Error Category',
  // 作用：错误分类，用于显示
  // 示例：'Pointer Operations', 'Memory Management'
  
  priority: 1
  // 作用：检测优先级，数字越小越先检查
  // 默认：999（最低优先级）
  // 示例：1 = 最高，5 = 中等，10 = 较低
};
```

---

## 2️⃣ 规则引擎的工作流程

### 核心函数：detectCodeError()

```javascript
export function detectCodeError(assemblyArea, currentLevel, customRules = []) {
  // ===== Step 1: 数据准备 =====
  const userSequence = assemblyArea.map(item => item.index);
  // [0, 2, 1, 3] 用户拖动的代码块顺序
  
  const pseudocode = currentLevel.pseudocode;
  // ['create node', 'node.next = head', 'head = node']
  
  // ===== Step 2: 规则收集 =====
  const allRules = [...customRules, ...builtInRules];
  // 合并：关卡自定义规则 + 内置规则
  
  // ===== Step 3: 优先级排序 =====
  allRules.sort((a, b) => (a.priority || 999) - (b.priority || 999));
  // Priority 1 的规则先执行，999 的最后执行
  
  // ===== Step 4: 规则执行 =====
  for (const rule of allRules) {
    try {
      // 执行检测器
      const detectionResult = rule.detector(userSequence, pseudocode, currentLevel);
      
      if (detectionResult) {
        // 发现错误！生成反馈
        const feedback = rule.feedback(detectionResult, currentLevel);
        
        // 添加类别（如果没有）
        if (!feedback.category) {
          feedback.category = rule.category;
        }
        
        // 返回第一个匹配的错误
        return feedback;
      }
    } catch (error) {
      // 规则执行失败，记录错误但继续检查其他规则
      console.error(\`Error in rule \${rule.id}:\`, error);
    }
  }
  
  // ===== Step 5: 没有发现错误 =====
  return null;
}
```

### 执行流程图

```
用户提交答案
  ↓
assemblyArea: [item0, item2, item1, item3]
  ↓
转换为索引序列: [0, 2, 1, 3]
  ↓
开始规则检测
  ↓
┌─────────────────────────────────┐
│ Rule 1 (Priority 1)             │
│ detector([0,2,1,3], code, level)│
│   ↓                             │
│   返回 { wrongLine: 2 }         │ ← 发现错误！
│   ↓                             │
│ feedback({ wrongLine: 2 })      │
│   ↓                             │
│   生成教育性反馈                │
└─────────────────────────────────┘
  ↓
返回反馈，停止检测
```

---

## 3️⃣ 内置规则详解

### Rule 1: Pointer Sequence Rule

**检测什么：** `head = newNode` 出现在 `newNode.next = head` 之前

```javascript
const pointerSequenceRule = {
  id: 'pointer_sequence',
  priority: 1,
  
  detector: (userSequence, pseudocode, level) => {
    // Step 1: 将索引转换为实际代码
    const codeTexts = userSequence.map(idx => pseudocode[idx]);
    // [0, 2, 1] → ['create node', 'head = newNode1', 'newNode1.next = head']
    
    // Step 2: 查找关键操作的位置
    const headAssignmentIdx = codeTexts.findIndex(text => 
      text.includes('head = newNode') && !text.includes('.next')
    );
    // 找到位置 1: 'head = newNode1'
    
    const nextAssignmentIdx = codeTexts.findIndex(text => 
      text.includes('newNode.next = head')
    );
    // 找到位置 2: 'newNode1.next = head'
    
    // Step 3: 检查顺序
    if (headAssignmentIdx !== -1 && 
        nextAssignmentIdx !== -1 && 
        headAssignmentIdx < nextAssignmentIdx) {
      // headAssignment 在前面！错误！
      return {
        wrongLine: headAssignmentIdx + 1,
        headIdx: headAssignmentIdx,
        nextIdx: nextAssignmentIdx
      };
    }
    
    return null;
  },
  
  feedback: (result, level) => ({
    type: 'pointer_sequence',
    message: '🔗 Pointer Sequence Error',
    explanation: 'You moved head before connecting the new node!',
    reasoning: 'Connect FIRST (newNode.next = head), THEN move (head = newNode)',
    analogy: 'Relay race: grab baton before letting go',
    suggestedFix: \`Line \${result.wrongLine} should come AFTER the .next assignment\`
  })
};
```

**工作示例：**

```
用户的代码顺序：
0. create newNode1
1. head = newNode1        ← 错误位置
2. newNode1.next = head

detector 执行：
  codeTexts = ['create newNode1', 'head = newNode1', 'newNode1.next = head']
  headAssignmentIdx = 1  (找到 'head = newNode1')
  nextAssignmentIdx = 2  (找到 'newNode1.next = head')
  1 < 2 → 返回 { wrongLine: 2, headIdx: 1, nextIdx: 2 }

feedback 执行：
  生成详细的教育性反馈
```

### Rule 2: Traversal Position Rule

**检测什么：** 遍历到错误的位置

```javascript
const traversalPositionRule = {
  id: 'traversal_position',
  priority: 2,
  
  detector: (userSequence, pseudocode, level) => {
    // Step 1: 只检测位置操作
    if (!['insertAtPosition', 'removeAtPosition'].includes(level.operation)) {
      return null;
    }
    
    const codeTexts = userSequence.map(idx => pseudocode[idx]);
    const targetPosition = level.operationPosition;
    // 例如：要在位置 3 插入
    
    // Step 2: 查找遍历语句
    const traversalLine = codeTexts.find(text => 
      text.includes('traverse to position')
    );
    
    if (traversalLine) {
      // Step 3: 提取遍历到的位置
      const match = traversalLine.match(/position (\d+)/);
      if (match) {
        const traverseToPos = parseInt(match[1]);
        
        // Step 4: 检查是否遍历到了目标位置
        // 正确：要在位置 3 操作，应该遍历到位置 2
        // 错误：遍历到了位置 3
        if (traverseToPos === targetPosition) {
          return { 
            traverseToPos,    // 3
            targetPosition    // 3
          };
        }
      }
    }
    
    return null;
  },
  
  feedback: (result, level) => ({
    type: 'traversal_position',
    message: '📍 Wrong Traversal Position',
    explanation: \`To operate at position \${result.targetPosition}, traverse to position \${result.targetPosition - 1}!\`,
    reasoning: 'You need the PREVIOUS node to modify connections',
    analogy: 'To change train car connection, stand at the car BEFORE it',
    keyPoint: \`Access position \${result.targetPosition - 1}, modify its .next\`
  })
};
```

**工作示例：**

```
任务：在位置 3 插入节点

用户的代码：
traverse to position 3  ← 错误！

detector 执行：
  level.operation = 'insertAtPosition'
  level.operationPosition = 3
  traversalLine = 'traverse to position 3'
  match = ['position 3', '3']
  traverseToPos = 3
  3 === 3 → 返回 { traverseToPos: 3, targetPosition: 3 }

feedback 执行：
  explanation: "要在位置 3 操作，遍历到位置 2！"
  reasoning: "你需要前一个节点来修改连接"
```

---

## 4️⃣ 优先级系统

### 为什么需要优先级？

考虑这个场景：

```javascript
用户的代码：
1. head = newNode
2. newNode.next = head
3. newNode.next = NULL

这段代码有多个错误：
❌ 错误 1: 指针顺序错误（priority 1）
❌ 错误 2: NULL 位置错误（priority 3）
```

**没有优先级：**
- 可能先检测到 NULL 错误
- 但指针顺序错误更基础、更严重

**有优先级：**
- Priority 1 的规则先执行
- 返回指针顺序错误（更重要）
- 学生修复后，下次再看 NULL 错误

### 优先级分配原则

```javascript
Priority 1-2:   基础错误（破坏性强）
  ├─ Pointer sequence       (Priority 1)
  └─ Traversal position     (Priority 2)

Priority 3-5:   常见错误（概念性）
  ├─ NULL placement         (Priority 3)
  ├─ Temp variable          (Priority 4)
  └─ Semantic confusion     (Priority 5)

Priority 6-10:  高级错误（优化性）
  ├─ Efficiency issues      (Priority 6)
  └─ Style issues          (Priority 8)

Priority 11-20: 扩展错误（特殊场景）
  ├─ Memory leak           (Priority 15)
  └─ Custom errors         (Priority 18)
```

---

## 5️⃣ 工具函数

### createErrorRule()

**作用：** 创建规则对象的辅助函数

```javascript
export function createErrorRule(config) {
  return {
    id: config.id,
    category: config.category || 'Custom',
    priority: config.priority || 999,
    detector: config.detector,
    feedback: config.feedback
  };
}

// 使用示例
const myRule = createErrorRule({
  id: 'my_error',
  detector: (...) => { ... },
  feedback: (...) => ({ ... })
});
```

**好处：**
- 提供默认值（category, priority）
- 统一的规则结构
- 更清晰的代码

### registerGlobalRule()

**作用：** 将规则注册到全局规则表

```javascript
const builtInRules = [
  pointerSequenceRule,
  traversalPositionRule,
  // ...
];

export function registerGlobalRule(rule) {
  builtInRules.push(rule);
}

// 使用示例
import { registerGlobalRule } from './errorDetectionEngine.js';

const myGlobalRule = { ... };
registerGlobalRule(myGlobalRule);
// 现在所有关卡都能使用这个规则！
```

---

## 6️⃣ 错误处理机制

### Try-Catch 保护

```javascript
for (const rule of allRules) {
  try {
    const detectionResult = rule.detector(...);
    if (detectionResult) {
      return rule.feedback(detectionResult, level);
    }
  } catch (error) {
    // 规则执行失败，但不影响其他规则
    console.error(\`Error in rule \${rule.id}:\`, error);
    // 继续检查下一个规则
  }
}
```

**好处：**
- 单个规则错误不会崩溃整个系统
- 其他规则继续工作
- 错误信息记录到控制台
- 优雅降级

---

## 7️⃣ 完整的执行流程示例

### 场景：用户犯了指针顺序错误

```javascript
// 用户的输入
assemblyArea = [
  { index: 0, isDistractor: false },  // create newNode1
  { index: 2, isDistractor: false },  // head = newNode1 ← 错了
  { index: 1, isDistractor: false },  // newNode1.next = head
  { index: 3, isDistractor: false },  // create newNode2
  { index: 5, isDistractor: false },  // head = newNode2
  { index: 4, isDistractor: false }   // newNode2.next = head
]

currentLevel = {
  operation: 'insertAtHead',
  pseudocode: [
    'create newNode1 with 🟢',      // 0
    'newNode1.next = head',         // 1
    'head = newNode1',              // 2
    'create newNode2 with 🟣',      // 3
    'newNode2.next = head',         // 4
    'head = newNode2'               // 5
  ],
  correctOrder: [0, 1, 2, 3, 4, 5]
}

// ===== 执行流程 =====

// 1. 调用检测引擎
detectCodeError(assemblyArea, currentLevel, [])

// 2. 数据准备
userSequence = [0, 2, 1, 3, 5, 4]
pseudocode = currentLevel.pseudocode

// 3. 规则收集和排序
allRules = [
  pointerSequenceRule (priority: 1),
  traversalPositionRule (priority: 2),
  nullPlacementRule (priority: 3),
  tempVariableRule (priority: 4),
  semanticConfusionRule (priority: 5)
]

// 4. 执行第一个规则（pointerSequenceRule）
detector(userSequence, pseudocode, currentLevel) {
  codeTexts = [
    'create newNode1 with 🟢',
    'head = newNode1',              // 位置 1
    'newNode1.next = head',         // 位置 2
    'create newNode2 with 🟣',
    'head = newNode2',
    'newNode2.next = head'
  ]
  
  headAssignmentIdx = 1   // 找到 'head = newNode1'
  nextAssignmentIdx = 2   // 找到 'newNode1.next = head'
  
  // 1 < 2，发现错误！
  return {
    wrongLine: 2,
    headIdx: 1,
    nextIdx: 2
  }
}

// 5. 生成反馈
feedback({ wrongLine: 2, headIdx: 1, nextIdx: 2 }, currentLevel) {
  return {
    type: 'pointer_sequence',
    message: '🔗 Pointer Sequence Error',
    explanation: 'You moved the head pointer before connecting the new node! This breaks the chain.',
    reasoning: 'When inserting at head: FIRST connect the new node to the existing list (newNode.next = head), THEN update head pointer (head = newNode). Order matters!',
    analogy: 'Think of it like a relay race: the new runner must grab the baton (connect .next) BEFORE the previous runner lets go (update head).',
    keyPoint: 'Always connect before moving. Breaking the chain loses data!',
    suggestedFix: 'Line 2 should come AFTER the .next assignment'
  }
}

// 6. 返回结果
return feedback
// 停止检查其他规则（已经找到错误）
```

---

## 8️⃣ 与其他系统的集成

### 在 validationLogic.js 中的使用

```javascript
import { detectCodeError } from './errorDetectionEngine.js';

export const validateAssembly = (assemblyArea, complexityArea, currentLevel) => {
  // ... 其他验证 ...
  
  // 代码顺序检查
  if (!codeCorrect) {
    // 获取关卡自定义规则
    const customRules = currentLevel.errorRules || [];
    
    // 调用通用引擎
    const patternError = detectCodeError(assemblyArea, currentLevel, customRules);
    
    if (patternError) {
      return {
        isValid: false,
        errors: patternError
      };
    }
    
    // 兜底：通用顺序错误
    return genericSequenceError(...);
  }
  
  // ... 其他验证 ...
};
```

---

## 9️⃣ 设计模式和原则

### 1. 策略模式（Strategy Pattern）

```
每个规则 = 一个策略
引擎 = 策略执行器
```

### 2. 责任链模式（Chain of Responsibility）

```
Rule 1 → 没发现错误 → Rule 2 → 没发现错误 → Rule 3 → 发现了！
```

### 3. 开闭原则（Open-Closed Principle）

```
✅ 对扩展开放：添加新规则
❌ 对修改关闭：不改引擎代码
```

### 4. 单一职责原则（Single Responsibility）

```
引擎：执行规则
规则：检测 + 反馈
验证：组装结果
```

---

## 🎯 总结

### 引擎的核心能力

1. **规则驱动** - 对象配置，不是函数
2. **优先级系统** - 重要错误先检测
3. **灵活扩展** - 三种方式添加规则
4. **错误隔离** - 单个规则失败不影响整体
5. **统一接口** - detectCodeError() 一个入口

### 使用场景

```javascript
// 场景 1: 零配置
detectCodeError(assemblyArea, level, [])
// 使用 5 个内置规则

// 场景 2: 关卡定制
detectCodeError(assemblyArea, level, [myCustomRule])
// 内置规则 + 自定义规则

// 场景 3: 全局扩展
registerGlobalRule(newRule)
detectCodeError(assemblyArea, level, [])
// 内置规则 + 已注册的全局规则
```

### 系统优势

- ✅ 模块化清晰
- ✅ 易于测试
- ✅ 高度可扩展
- ✅ 配置驱动
- ✅ 性能优秀（短路执行）

这就是 errorDetectionEngine.js 的完整工作原理！
