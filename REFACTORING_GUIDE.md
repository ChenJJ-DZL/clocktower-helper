# 游戏状态管理重构指南

## 目标

实现**单一数据源（Single Source of Truth）**和**统一Action派发**，解决当前状态管理混乱导致的控制台卡死问题。

## 核心原则

1. **单一数据源**：所有游戏状态存储在 `GameContext` 中
2. **Action派发**：所有状态修改通过 `dispatch(Action)` 进行
3. **动态队列**：夜间行动队列根据存活角色动态生成，不再硬编码

## 架构概览

### 1. GameContext（单一数据源）

位置：`src/contexts/GameContext.tsx`

- 使用 `useReducer` 管理所有游戏状态
- 提供 `state` 和 `dispatch` 给所有组件
- 所有状态修改都通过 Action 进行

### 2. 动态夜间行动队列

位置：`src/utils/nightQueueGenerator.ts`

- `generateNightActionQueue()`: 根据角色定义动态生成排序后的队列
- 自动处理首夜/后续夜晚的差异
- 自动跳过已死亡且无能力的角色

### 3. 状态迁移路径

#### 旧系统 → 新系统映射

| 旧状态 | 新状态 |
|--------|--------|
| `wakeQueueIds` | `state.nightActionQueue` (Seat[] 而非 ID[]) |
| `currentWakeIndex` | `state.currentQueueIndex` |
| `setCurrentWakeIndex(i)` | `dispatch(gameActions.nextNightAction())` |
| `setWakeQueueIds(ids)` | `dispatch(gameActions.setNightActionQueue(queue))` |

## 使用方法

### 方法1：使用 useNightActionQueue（推荐）

这是最简单的方式，提供了完整的队列管理功能：

```tsx
import { useNightActionQueue } from '@/src/hooks/useNightActionQueue';

function MyComponent() {
  const {
    nightActionQueue,
    currentQueueIndex,
    currentQueueItem,
    wakeQueueIds, // 兼容旧代码
    isAtEndOfQueue,
    isQueueEmpty,
    nextAction,
    prevAction,
    continueToNextAction,
    startNight,
  } = useNightActionQueue();
  
  // 读取状态
  const currentIndex = currentQueueIndex;
  const queue = nightActionQueue;
  
  // 队列操作
  const handleNext = () => {
    nextAction(); // 或使用 continueToNextAction()
  };
  
  // 开始夜晚（自动生成队列）
  const handleStartNight = (isFirst: boolean) => {
    startNight(isFirst);
  };
}
```

### 方法2：直接使用 GameContext

如果需要更细粒度的控制：

```tsx
import { useGameContext, gameActions } from '@/src/contexts/GameContext';
import { generateNightActionQueue } from '@/src/utils/nightQueueGenerator';

function MyComponent() {
  const { state, dispatch } = useGameContext();
  
  // 读取状态
  const currentQueueIndex = state.currentQueueIndex;
  const nightActionQueue = state.nightActionQueue;
  
  // 修改状态（通过Action）
  const handleNext = () => {
    dispatch(gameActions.nextNightAction());
  };
  
  // 手动生成队列并设置
  const handleStartNight = (seats: Seat[], isFirst: boolean) => {
    const queue = generateNightActionQueue(seats, isFirst);
    dispatch(gameActions.startNight(queue, isFirst));
  };
}
```

### 生成夜间行动队列

```tsx
import { generateNightActionQueue } from '@/src/utils/nightQueueGenerator';

// 在进入夜晚时
const queue = generateNightActionQueue(seats, isFirstNight);
dispatch(gameActions.setNightActionQueue(queue));
```

### 队列前进逻辑

```tsx
// 旧方式（❌ 不要这样做）
setCurrentWakeIndex(currentWakeIndex + 1);

// 新方式（✅ 推荐）
dispatch(gameActions.nextNightAction());
// Reducer 会自动跳过已死亡且无能力的角色
```

## 迁移步骤

### 阶段1：基础架构（✅ 已完成）

- [x] 创建 `GameContext.tsx`
- [x] 创建 `nightQueueGenerator.ts`
- [x] 定义核心 Action 类型

### 阶段2：更新夜间逻辑（✅ 已完成）

- [x] 更新 `useNightLogic` 使用新的队列生成器
- [x] 创建 `useNightActionQueue` Hook 封装队列操作
- [x] 扩展 GameContext 添加队列相关 Action
- [ ] 更新 `continueToNextAction` 使用新的队列系统（可选，保持兼容）
- [ ] 更新 `ControlPanel` 使用新的队列系统（可选，保持兼容）

### 阶段3：状态迁移（待进行）

- [ ] 将 `useGameController` 迁移到使用 `GameContext`
- [ ] 更新所有组件通过 Context 读取状态
- [ ] 移除分散的状态管理

## 注意事项

1. **向后兼容**：在完全迁移前，新旧系统可以共存
2. **测试**：每次迁移后都要测试关键流程（入夜、行动、出夜）
3. **性能**：队列生成是 O(n log n) 复杂度，在进入夜晚时执行一次，性能影响可忽略

## 优势

1. **消除状态不一致**：所有状态从单一数据源读取
2. **可预测的状态更新**：所有修改通过 Action，易于调试
3. **动态适应**：队列根据当前角色自动生成，支持角色变化
4. **易于扩展**：新增 Action 只需修改 Reducer，不影响组件
5. **向后兼容**：提供适配器工具，新旧系统可以共存

## 核心文件

### 已创建的文件

1. **`src/contexts/GameContext.tsx`** - 统一的游戏状态管理（Reducer模式）
2. **`src/utils/nightQueueGenerator.ts`** - 动态夜间行动队列生成器
3. **`src/hooks/useNightActionQueue.ts`** - 队列管理 Hook（推荐使用）
4. **`src/hooks/useGameQueueAdapter.ts`** - 队列适配器工具（新旧系统桥接）

### 已更新的文件

1. **`src/hooks/useNightLogic.ts`** - 使用新的队列生成器

## 当前状态

✅ **已完成：**
- GameContext 基础架构
- 动态队列生成器
- useNightActionQueue Hook
- 队列适配器工具
- useNightLogic 使用新队列生成器

🔄 **可选的后续步骤：**
- 完全迁移到 GameContext（需要大范围重构）
- 更新 ControlPanel 使用新系统
- 移除旧的状态管理代码

⚠️ **注意：** 当前新旧系统可以共存，旧代码继续工作，新代码可以使用新系统。这是一个渐进式迁移，可以逐步进行。

