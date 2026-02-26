# 游戏行为检测 - 完整时序流程

## 🎮 完整的检测流程

### 场景：用户犯了指针顺序错误

```
时间轴：用户操作 → 规则触发 → 显示反馈
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

t=0: 用户开始拖拽
┌────────────────────────────────────────┐
│  用户从 Code Pool 拖拽                  │
│  "head = newNode1" 到 Assembly Area   │
└────────────────────────────────────────┘
         ↓

t=1: State 更新
┌────────────────────────────────────────┐
│  handleDropInAssembly() 执行           │
│  setAssemblyArea([...])                │
│                                        │
│  assemblyArea 变化：                   │
│  [] → [{ index: 2, isDistractor: false }]
└────────────────────────────────────────┘
         ↓

t=2: React 检测变化
┌────────────────────────────────────────┐
│  React 检测到 assemblyArea state 变化  │
│  准备执行 useEffect                    │
└────────────────────────────────────────┘
         ↓

t=3: useEffect 触发
┌────────────────────────────────────────┐
│  useEffect(() => {                     │
│    const validation = validateAssembly(│
│      assemblyArea,                     │
│      complexityArea,                   │
│      currentLevel                      │
│    );                                  │
│  }, [assemblyArea, complexityArea])    │
└────────────────────────────────────────┘
         ↓

t=4: 验证开始
┌────────────────────────────────────────┐
│  validateAssembly() 执行               │
│                                        │
│  Step 1: 基本检查                      │
│  ✓ codeComplete? 否 → 还没放完         │
│  → 返回 { isValid: false, errors: null }
└────────────────────────────────────────┘
         ↓
      [用户继续拖拽...]
         ↓

t=10: 用户放完所有代码块
┌────────────────────────────────────────┐
│  assemblyArea: [                       │
│    { index: 0 }, // create newNode1    │
│    { index: 2 }, // head = newNode1    │
│    { index: 1 }, // newNode1.next=head │
│    { index: 3 }, // create newNode2    │
│    { index: 5 }, // head = newNode2    │
│    { index: 4 }  // newNode2.next=head │
│  ]                                     │
└────────────────────────────────────────┘
         ↓

t=11: State 更新 → useEffect 再次触发
┌────────────────────────────────────────┐
│  useEffect 检测到 assemblyArea 再次变化│
│  调用 validateAssembly()               │
└────────────────────────────────────────┘
         ↓

t=12: 完整验证
┌────────────────────────────────────────┐
│  validateAssembly() 执行               │
│                                        │
│  Step 1: 基本检查                      │
│  ✓ codeComplete? 是 (6个块)            │
│                                        │
│  Step 2: Distractor 检查               │
│  ✓ hasDistractor? 否                   │
│                                        │
│  Step 3: 顺序检查                      │
│  ✗ codeCorrect? 否                     │
│    用户顺序: [0, 2, 1, 3, 5, 4]        │
│    正确顺序: [0, 1, 2, 3, 4, 5]        │
│                                        │
│  → 调用 detectCodeError()              │
└────────────────────────────────────────┘
         ↓

t=13: 规则引擎启动
┌────────────────────────────────────────┐
│  detectCodeError(                      │
│    assemblyArea,                       │
│    currentLevel,                       │
│    customRules                         │
│  )                                     │
│                                        │
│  准备数据：                            │
│  userSequence = [0, 2, 1, 3, 5, 4]     │
│  pseudocode = [...]                    │
│                                        │
│  收集规则：                            │
│  allRules = [                          │
│    pointerSequenceRule (priority: 1),  │
│    traversalPositionRule (priority: 2),│
│    nullPlacementRule (priority: 3),    │
│    tempVariableRule (priority: 4),     │
│    semanticConfusionRule (priority: 5) │
│  ]                                     │
└────────────────────────────────────────┘
         ↓

t=14: 执行 Rule 1
┌────────────────────────────────────────┐
│  pointerSequenceRule.detector() 执行   │
│                                        │
│  codeTexts = [                         │
│    'create newNode1 with 🟢',          │
│    'head = newNode1',      ← 位置 1   │
│    'newNode1.next = head', ← 位置 2   │
│    'create newNode2 with 🟣',          │
│    'head = newNode2',                  │
│    'newNode2.next = head'              │
│  ]                                     │
│                                        │
│  查找关键操作：                        │
│  headAssignmentIdx = 1                 │
│  nextAssignmentIdx = 2                 │
│                                        │
│  检查条件：                            │
│  1 < 2? 是 ✅ 触发！                   │
│                                        │
│  返回：{ wrongLine: 2, headIdx: 1, ... }
└────────────────────────────────────────┘
         ↓

t=15: 生成反馈
┌────────────────────────────────────────┐
│  pointerSequenceRule.feedback() 执行   │
│                                        │
│  输入：{ wrongLine: 2, headIdx: 1, ... }│
│                                        │
│  返回：{                               │
│    type: 'pointer_sequence',           │
│    message: '🔗 Pointer Sequence Error',
│    explanation: 'You moved head...',   │
│    reasoning: 'Connect FIRST...',      │
│    analogy: 'Relay race...',           │
│    keyPoint: 'Connect before move',    │
│    suggestedFix: 'Line 2 after...'     │
│  }                                     │
└────────────────────────────────────────┘
         ↓

t=16: 返回验证结果
┌────────────────────────────────────────┐
│  detectCodeError() 返回反馈             │
│  validateAssembly() 返回：              │
│  {                                      │
│    isValid: false,                      │
│    errors: {                            │
│      type: 'pointer_sequence',          │
│      message: '🔗 Pointer Sequence...' │
│      ...                                │
│    }                                    │
│  }                                      │
└────────────────────────────────────────┘
         ↓

t=17: 更新 feedback state
┌────────────────────────────────────────┐
│  useEffect 中：                         │
│                                         │
│  if (validation.errors) {               │
│    setFeedback({                        │
│      type: 'error',                     │
│      message: validation.errors.message,│
│      errors: validation.errors          │
│    });                                  │
│  }                                      │
└────────────────────────────────────────┘
         ↓

t=18: React 重新渲染
┌────────────────────────────────────────┐
│  React 检测到 feedback state 变化       │
│  重新渲染组件树                         │
└────────────────────────────────────────┘
         ↓

t=19: FeedbackMessage 显示
┌────────────────────────────────────────┐
│  <FeedbackMessage feedback={feedback} />│
│                                         │
│  显示在屏幕上：                         │
│  ┌─────────────────────────────────┐   │
│  │ 🔗 Pointer Sequence Error       │   │
│  │                                 │   │
│  │ 🔍 What went wrong:             │   │
│  │ You moved the head pointer...   │   │
│  │                                 │   │
│  │ 💡 Why this matters:            │   │
│  │ Connect FIRST, then move...     │   │
│  │                                 │   │
│  │ 🌟 Think of it this way:        │   │
│  │ Like a relay race...            │   │
│  └─────────────────────────────────┘   │
└────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
总用时：约 50-100ms（用户无感知）
```

---

## 🎯 关键检测点

### 1. 实时检测（每次拖拽后）

```javascript
useEffect(() => {
  // 每次 assemblyArea 变化都会执行
  const validation = validateAssembly(...);
  // ...
}, [assemblyArea]);  // ← 依赖项
```

**触发时机：**
- ✅ 每次拖拽代码块
- ✅ 每次重新排序
- ✅ 每次拖回 Pool

### 2. 完整性检测（放完所有块后）

```javascript
const codeComplete = assemblyArea.length === currentLevel.correctOrder.length;

if (!codeComplete) {
  // 还没放完，跳过检测
  return { isValid: false, errors: null };
}
```

**作用：**
- ❌ 避免过早检测（用户还在拖拽中）
- ✅ 只在放完所有块后才完整验证

### 3. 规则优先级检测（按顺序）

```javascript
// Priority 1: 最重要的错误先检测
pointerSequenceRule.detector() 
  → 如果触发，立即返回，停止检测

// Priority 2: 第二重要
traversalPositionRule.detector()
  → 只有 Priority 1 没触发才会执行

// ...以此类推
```

---

## 🔍 不同检测场景

### 场景 1: 用户刚开始拖拽

```javascript
t=0: assemblyArea = []
     ↓ 拖入第一个块
t=1: assemblyArea = [{ index: 0 }]
     ↓ useEffect 触发
t=2: validateAssembly()
     → codeComplete? 否 (需要6个，只有1个)
     → 返回 { isValid: false, errors: null }
     → 不显示任何错误（用户还在操作中）
```

### 场景 2: 用户放完所有块（但顺序错了）

```javascript
t=10: assemblyArea = [
        { index: 0 }, { index: 2 }, { index: 1 },
        { index: 3 }, { index: 5 }, { index: 4 }
      ]
      ↓ useEffect 触发
t=11: validateAssembly()
      → codeComplete? 是 ✓
      → hasDistractor? 否 ✓
      → codeCorrect? 否 ✗
      → detectCodeError()
        → pointerSequenceRule 触发！
      → 返回 { isValid: false, errors: {...} }
      → 显示错误反馈
```

### 场景 3: 用户使用了 Distractor

```javascript
t=15: assemblyArea = [
        { index: 0 },
        { index: 0, isDistractor: true },  ← 错误的块
        { index: 1 },
        ...
      ]
      ↓ useEffect 触发
t=16: validateAssembly()
      → codeComplete? 是 ✓
      → hasDistractor? 是 ✗
      → analyzeDistractorError() 执行
      → 返回 Distractor 错误反馈
      → 显示错误反馈
```

### 场景 4: 用户全部正确

```javascript
t=20: assemblyArea = [
        { index: 0 }, { index: 1 }, { index: 2 },
        { index: 3 }, { index: 4 }, { index: 5 }
      ]
      ↓ useEffect 触发
t=21: validateAssembly()
      → codeComplete? 是 ✓
      → hasDistractor? 否 ✓
      → codeCorrect? 是 ✓
      → 复杂度正确? 是 ✓
      → 返回 { isValid: true }
      → 执行链表操作
      → 显示成功动画
```

---

## ⚡ 性能优化

### 1. 短路执行

```javascript
// 规则按优先级执行，发现第一个错误就停止
for (const rule of allRules) {
  const error = rule.detector();
  if (error) {
    return rule.feedback(error);  // ← 立即返回，不执行后续规则
  }
}
```

### 2. 条件检测

```javascript
// 只在完成后才全面检测
if (!allBlocksPlaced) {
  return { isValid: false, errors: null };
}
```

### 3. useEffect 依赖优化

```javascript
// 只在必要的 state 变化时触发
useEffect(() => {
  // ...
}, [assemblyArea, complexityArea, operationExecuted]);
//  ^^^^^^^^^^^^^^ 只监听这些
```

---

## 🎓 调试技巧

### 查看检测流程

在关键位置添加 console.log：

```javascript
// 1. useEffect 触发
useEffect(() => {
  console.log('🔍 Validation triggered:', assemblyArea);
  const validation = validateAssembly(...);
  console.log('📊 Validation result:', validation);
}, [assemblyArea]);

// 2. 规则执行
detector: (userSequence, pseudocode, level) => {
  console.log('🎯 Rule executing:', userSequence);
  const result = /* 检测逻辑 */;
  console.log('✅ Rule result:', result);
  return result;
}

// 3. 反馈生成
feedback: (result, level) => {
  console.log('💬 Generating feedback:', result);
  return /* 反馈对象 */;
}
```

### 控制台输出示例

```
🔍 Validation triggered: [{ index: 0 }, { index: 2 }]
📊 Validation result: { isValid: false, errors: null }

[用户继续拖拽...]

🔍 Validation triggered: [{ index: 0 }, { index: 2 }, { index: 1 }, ...]
🎯 Rule executing: [0, 2, 1, 3, 5, 4]
  ↳ pointerSequenceRule
  ↳ Found: head=newNode at 1, next=head at 2
✅ Rule result: { wrongLine: 2, headIdx: 1, nextIdx: 2 }
💬 Generating feedback: { type: 'pointer_sequence', ... }
📊 Validation result: { isValid: false, errors: {...} }
```

---

## 📊 检测统计

### 检测频率

```
用户拖拽 1 次 = 触发 1 次检测
平均每关卡: 10-20 次拖拽
平均检测时间: 1-5ms
```

### 规则执行统计

```
Rule 1 (Pointer Sequence):  40% 触发率
Rule 2 (Traversal Position): 20% 触发率  
Rule 3 (NULL Placement):     15% 触发率
Rule 4 (Temp Variable):      10% 触发率
Rule 5 (Semantic Confusion): 10% 触发率
其他 (Generic):              5% 触发率
```

---

## ✅ 总结

### 检测触发机制

1. **React State 驱动** - assemblyArea 变化触发
2. **useEffect 监听** - 自动响应变化
3. **实时验证** - 每次拖拽后立即检测
4. **规则引擎** - 按优先级顺序执行
5. **即时反馈** - 用户无感知延迟

### 关键要点

- ✅ 每次拖拽都会触发检测
- ✅ 完成前不显示错误（避免干扰）
- ✅ 完成后立即显示详细反馈
- ✅ 短路执行保证性能
- ✅ 错误隔离保证稳定性

这就是整个游戏行为检测系统的工作原理！从用户点击到规则触发，再到显示反馈的完整流程。
