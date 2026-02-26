# Universal Error Detection System - 完整指南

## 🎯 系统设计理念

### 从 Hard-coded 到 Rule-based

```
❌ 之前 (Hard-coded):
validationLogic.js 中有 5 个固定函数
├─ detectPointerSequenceError()
├─ detectTraversalError()
├─ detectNullPlacementError()
├─ detectTempVariableError()
└─ detectSemanticError()

添加新错误 = 写新函数 + 修改主逻辑

✅ 现在 (Rule-based):
errorDetectionEngine.js 包含规则引擎
├─ 5 个内置规则 (可扩展)
├─ 支持自定义规则
└─ 统一的检测接口

添加新错误 = 添加规则对象
```

---

## 🏗️ 架构概览

### 核心组件

```javascript
// 1. 规则定义
const myRule = {
  id: 'unique_id',
  category: 'Error Category',
  priority: 1,
  detector: (userCode, pseudocode, level) => { ... },
  feedback: (result, level) => { ... }
};

// 2. 检测引擎
detectCodeError(assemblyArea, level, customRules)
  → 按优先级检查所有规则
  → 返回第一个匹配的错误反馈

// 3. 三种使用方式
- 使用内置规则 (零配置)
- 添加关卡自定义规则 (levels.js)
- 注册全局规则 (扩展系统)
```

---

## 📚 使用方式

### 方式 1: 使用内置规则 (零配置)

**最常见，80% 的情况**

```javascript
// levels.js
{
  id: 1,
  operation: 'insertAtHead',
  pseudocode: [ ... ],
  correctOrder: [ ... ]
  // 不需要任何额外配置！
}
```

内置的 5 个规则会自动检测：
- Pointer Sequence Error
- Traversal Position Error
- NULL Placement Error
- Temp Variable Error
- Semantic Confusion

**示例：**
用户犯了顺序错误 → 自动检测 → 返回教育性反馈

---

### 方式 2: 添加关卡自定义规则

**当你需要检测特定的错误模式**

```javascript
// levels.js
import { createErrorRule } from './services/errorDetectionEngine.js';

{
  id: 7,
  operation: 'customOperation',
  
  // 添加自定义检测规则
  errorRules: [
    createErrorRule({
      id: 'custom_error_1',
      category: 'Custom Category',
      priority: 1, // 优先级，数字越小越先检查
      
      detector: (userSequence, pseudocode, level) => {
        // 你的检测逻辑
        const codeTexts = userSequence.map(idx => pseudocode[idx]);
        
        // 查找特定模式
        const hasError = codeTexts.some(text => 
          text.includes('your_pattern')
        );
        
        if (hasError) {
          return {
            // 返回检测结果，会传给 feedback 函数
            foundPattern: 'your_pattern',
            line: 3
          };
        }
        
        return null; // 没有错误
      },
      
      feedback: (detectionResult, level) => ({
        type: 'custom_error_1',
        message: '🔥 Your Error Title',
        explanation: 'What went wrong',
        reasoning: 'Why this matters',
        analogy: 'Real-world analogy',
        keyPoint: 'Core concept',
        hint: 'How to fix'
      })
    })
  ]
}
```

---

### 方式 3: 注册全局规则

**当你想为所有关卡添加新的检测模式**

```javascript
// 在 errorDetectionEngine.js 或单独文件中

export const myGlobalRule = {
  id: 'global_pattern',
  category: 'New Category',
  priority: 10,
  
  detector: (userSequence, pseudocode, level) => {
    // 通用检测逻辑，适用于所有关卡
    if (someCondition) {
      return { details: '...' };
    }
    return null;
  },
  
  feedback: (result, level) => ({
    type: 'global_pattern',
    message: 'Error Message',
    // ... 其他反馈字段
  })
};

// 注册到系统中
registerGlobalRule(myGlobalRule);
```

或者直接添加到 `builtInRules` 数组。

---

## 🎨 规则结构详解

### 规则对象

```javascript
{
  // ===== 必需字段 =====
  
  id: 'unique_identifier',
  // 唯一标识符，用于调试和追踪
  
  detector: (userSequence, pseudocode, level) => {
    // 检测函数
    // userSequence: [0, 2, 1, 3] 用户的代码顺序
    // pseudocode: ['line1', 'line2', ...] 关卡的代码
    // level: 完整的关卡配置对象
    
    // 返回 null 表示没有错误
    // 返回 object 表示检测到错误，该对象会传给 feedback
    return detectionResult | null;
  },
  
  feedback: (detectionResult, level) => {
    // 反馈生成函数
    // detectionResult: detector 返回的对象
    // level: 关卡配置
    
    // 必须返回包含以下字段的对象
    return {
      type: 'error_type',
      message: 'Error Title',
      explanation: 'What went wrong',
      // ... 其他可选字段
    };
  },
  
  // ===== 可选字段 =====
  
  category: 'Error Category',
  // 错误类别，用于分组显示
  
  priority: 1,
  // 优先级，数字越小越先检查
  // 1 = 最高优先级，999 = 最低优先级
}
```

### 反馈对象字段

```javascript
{
  // 必需字段
  type: 'error_type',           // 错误类型标识
  message: 'Error Title',        // 显示在顶部的标题
  
  // 推荐字段（教育性强）
  explanation: 'What went wrong',     // 具体哪里错了
  reasoning: 'Why this matters',      // 为什么这是错的
  keyPoint: 'Core concept',           // 核心学习点
  
  // 可选字段（增强教育性）
  analogy: 'Real-world analogy',      // 生动的类比
  hint: 'How to fix',                 // 修复提示
  correctApproach: 'Correct way',     // 正确做法
  suggestedFix: 'Specific fix',       // 具体修复
  
  // 特殊字段
  correctSequence: ['step1', 'step2'], // 正确步骤（数组）
  comparison: { ... },                 // 对比表格（对象）
  wrongLines: [ ... ],                 // 错误行详情（数组）
}
```

---

## 💡 实际示例

### 示例 1: 简单的关卡自定义规则

检测用户是否在循环内创建节点（效率低）

```javascript
{
  id: 8,
  title: 'Efficient Node Creation',
  errorRules: [
    createErrorRule({
      id: 'node_in_loop',
      category: 'Efficiency',
      priority: 1,
      
      detector: (userSequence, pseudocode, level) => {
        const codeTexts = userSequence.map(idx => pseudocode[idx]);
        
        // 查找是否有 loop 后面跟着 create
        let inLoop = false;
        for (let i = 0; i < codeTexts.length; i++) {
          if (codeTexts[i].includes('for') || codeTexts[i].includes('while')) {
            inLoop = true;
          }
          if (inLoop && codeTexts[i].includes('create newNode')) {
            return { line: i + 1 };
          }
        }
        return null;
      },
      
      feedback: (result, level) => ({
        type: 'node_in_loop',
        message: '🔄 Inefficient Node Creation',
        explanation: `You're creating nodes inside a loop at line ${result.line}!`,
        reasoning: 'Creating nodes repeatedly in a loop is inefficient. Create all nodes before the loop or use a more efficient pattern.',
        keyPoint: 'Minimize memory allocations in loops for better performance.',
        hint: 'Move node creation outside the loop when possible.'
      })
    })
  ]
}
```

---

### 示例 2: 复杂的全局规则

检测内存泄漏模式（适用于所有关卡）

```javascript
// memoryLeakRule.js
export const memoryLeakRule = {
  id: 'memory_leak',
  category: 'Memory Management',
  priority: 15,
  
  detector: (userSequence, pseudocode, level) => {
    const codeTexts = userSequence.map(idx => pseudocode[idx]);
    
    // 查找所有创建节点的行
    const createdNodes = [];
    codeTexts.forEach((text, idx) => {
      const match = text.match(/create (\w+)/);
      if (match) {
        createdNodes.push({
          name: match[1],
          line: idx + 1
        });
      }
    });
    
    // 检查每个节点是否被使用
    const unusedNodes = createdNodes.filter(node => {
      const isUsed = codeTexts.some(text => 
        text.includes(`${node.name}.next`) || 
        text.includes(`= ${node.name}`)
      );
      return !isUsed;
    });
    
    if (unusedNodes.length > 0) {
      return { unusedNodes };
    }
    
    return null;
  },
  
  feedback: (result, level) => {
    const nodeNames = result.unusedNodes.map(n => n.name).join(', ');
    return {
      type: 'memory_leak',
      message: '💾 Potential Memory Leak',
      explanation: `You created ${nodeNames} but never connected them to the list!`,
      reasoning: 'Created nodes that aren\'t connected become unreachable memory. This wastes memory and can cause leaks.',
      analogy: 'Like building a house but never connecting the road. The house exists but is useless.',
      keyPoint: 'Every created node must be connected to the list or freed.',
      hint: `Make sure to use ${nodeNames} in subsequent operations.`
    };
  }
};

// 在 errorDetectionEngine.js 中注册
registerGlobalRule(memoryLeakRule);
```

---

### 示例 3: 条件性规则

只在特定操作中检测的规则

```javascript
const offByOneRule = createErrorRule({
  id: 'off_by_one',
  category: 'Index Calculation',
  priority: 5,
  
  detector: (userSequence, pseudocode, level) => {
    // 只检测位置操作
    if (!level.operationPosition) return null;
    
    const codeTexts = userSequence.map(idx => pseudocode[idx]);
    const target = level.operationPosition;
    
    // 查找遍历语句
    const traversalLine = codeTexts.find(t => t.includes('traverse to position'));
    if (!traversalLine) return null;
    
    const match = traversalLine.match(/position (\d+)/);
    if (!match) return null;
    
    const traverseTo = parseInt(match[1]);
    
    // 检查是否差 1
    if (Math.abs(traverseTo - target) === 1) {
      return { 
        traverseTo, 
        target,
        shouldBe: target - 1 
      };
    }
    
    return null;
  },
  
  feedback: (result, level) => ({
    type: 'off_by_one',
    message: '📍 Off-by-One Error',
    explanation: `Close! You traversed to position ${result.traverseTo}, but should go to ${result.shouldBe}`,
    reasoning: 'To modify position N, you need the node at position N-1 so you can change its .next pointer.',
    keyPoint: 'Target position - 1 = Traversal position',
    hint: 'Remember: access the previous node to modify connections.'
  })
});
```

---

## 🎯 优先级系统

规则按优先级顺序检查（数字越小越先检查）：

```
Priority 1: 最关键的错误（如指针顺序）
  ↓
Priority 5: 常见错误（如遍历位置）
  ↓
Priority 10: 语义错误（如操作类型混淆）
  ↓
Priority 15: 高级错误（如内存泄漏）
  ↓
Priority 999: 兜底规则
```

**示例：**
```javascript
// 关卡自定义规则的优先级高于内置规则
{
  errorRules: [
    createErrorRule({
      priority: 1,  // 先检查这个
      // ...
    })
  ]
}

// 内置规则
pointerSequenceRule: priority 1
traversalPositionRule: priority 2
nullPlacementRule: priority 3
// ...
```

---

## 🔧 扩展系统

### 添加新的内置规则

```javascript
// 在 errorDetectionEngine.js 中

const yourNewRule = {
  id: 'your_new_rule',
  category: 'New Category',
  priority: 6,
  detector: (userSequence, pseudocode, level) => {
    // 检测逻辑
    return result | null;
  },
  feedback: (result, level) => ({
    // 反馈
  })
};

// 添加到 builtInRules 数组
const builtInRules = [
  pointerSequenceRule,
  traversalPositionRule,
  nullPlacementRule,
  tempVariableRule,
  semanticConfusionRule,
  yourNewRule  // ← 新增
];
```

---

## 📊 对比：Hard-coded vs Rule-based

| 方面 | Hard-coded (之前) | Rule-based (现在) |
|------|------------------|-------------------|
| **添加新错误** | 写新函数 + 修改主逻辑 | 添加规则对象 |
| **关卡定制** | 不支持 | 支持 `errorRules` |
| **扩展性** | 需要修改核心代码 | 添加规则即可 |
| **优先级** | Hard-coded顺序 | 可配置 priority |
| **测试** | 难以单独测试 | 规则独立可测试 |
| **维护** | 耦合严重 | 模块化清晰 |
| **灵活性** | 固定模式 | 完全可定制 |

---

## ✅ 最佳实践

### 1. 何时使用内置规则
- 标准的链表操作错误
- 通用的编程模式错误
- 不需要特殊解释的情况

### 2. 何时添加关卡规则
- 特定关卡的特殊错误
- 需要强调特定教学点
- 内置规则无法覆盖的情况

### 3. 何时注册全局规则
- 新发现的通用错误模式
- 适用于多个关卡的规则
- 扩展系统能力

### 4. 规则编写建议
```javascript
// ✅ 好的规则
- 单一职责（检测一种错误）
- 清晰的检测逻辑
- 详细的教育性反馈
- 防御性编程（处理边界情况）

// ❌ 避免
- 一个规则检测多种错误
- 过于复杂的检测逻辑
- 通用的错误信息
- 没有错误处理
```

---

## 🎓 总结

### 核心优势

1. **完全解耦** - 规则与验证逻辑分离
2. **高度可扩展** - 添加新规则不影响现有代码
3. **灵活配置** - 三种使用方式满足不同需求
4. **易于维护** - 每个规则独立，清晰模块化
5. **强大的教育性** - 统一的反馈结构

### 使用流程

```
1. 创建关卡
   ↓
2. 需要特殊错误检测？
   Yes → 添加 errorRules
   No → 使用内置规则（零配置）
   ↓
3. 测试 → 调整 → 完成
```

### 系统特点

- 🎯 **智能** - 规则引擎按优先级检测
- 🔧 **灵活** - 三种使用方式
- 📚 **教育** - 详细的反馈结构
- 🚀 **可扩展** - 轻松添加新规则
- ✅ **向后兼容** - 现有关卡自动升级

**这是一个真正通用、可配置、可扩展的错误检测系统！** 🎉
