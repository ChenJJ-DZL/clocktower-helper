# 全局Modal管理系统使用指南

## ✅ 已完成的工作

### 1. 全局Modal管理器（已完成）

- ✅ **文件**: `src/contexts/ModalContext.tsx`
- ✅ **功能**: 统一管理所有弹窗，确保同一时间只有一个最高优先级的弹窗显示
- ✅ **特性**:
  - 优先级管理（LOW, NORMAL, HIGH, CRITICAL）
  - 弹窗栈管理（自动排序，显示最高优先级）
  - 防止弹窗重叠
  - 自动清理相同类型的弹窗

### 2. GlobalModalRenderer（已完成）

- ✅ **文件**: `src/components/GlobalModalRenderer.tsx`
- ✅ **功能**: 全局弹窗渲染器，在根组件统一渲染所有弹窗
- ✅ **位置**: 已在 `app/layout.tsx` 中添加 `ModalProvider`

### 3. SeatNode组件检查（已完成）

- ✅ **状态**: SeatNode 已经是纯函数组件
- ✅ **特性**:
  - 无 `useEffect`
  - 无状态修改（`setSeats`, `setGamePhase` 等）
  - 只负责显示数据和事件传递
  - 通过 `onSeatClick` 等回调通知父组件

## 📝 使用方法

### 基本用法

```tsx
import { useModal } from '@/src/contexts/ModalContext';

function MyComponent() {
  const { showModal, hideModal, currentModal, isModalOpen } = useModal();
  
  // 显示弹窗
  const handleShowKillConfirm = () => {
    showModal({
      type: 'KILL_CONFIRM',
      data: { targetId: 5, isImpSelfKill: false },
    }, MODAL_PRIORITY.CRITICAL); // 使用关键优先级
  };
  
  // 隐藏弹窗
  const handleClose = () => {
    hideModal(); // 隐藏当前最高优先级的弹窗
    // 或 hideModal('KILL_CONFIRM'); // 隐藏指定类型的弹窗
  };
  
  return (
    <div>
      <button onClick={handleShowKillConfirm}>显示击杀确认</button>
      {isModalOpen && <p>当前有弹窗显示</p>}
    </div>
  );
}
```

### 使用便捷函数

```tsx
import { useModal, modalHelpers, MODAL_PRIORITY } from '@/src/contexts/ModalContext';

function MyComponent() {
  const { showModal } = useModal();
  
  // 使用便捷函数
  const handleKill = () => {
    modalHelpers.showKillConfirm(5, false, showModal);
  };
  
  const handlePoison = () => {
    modalHelpers.showPoisonConfirm(3, showModal);
  };
  
  const handleNightDeath = () => {
    modalHelpers.showNightDeathReport('昨晚5号玩家死亡', showModal);
  };
}
```

### 优先级说明

```tsx
import { MODAL_PRIORITY } from '@/src/contexts/ModalContext';

// 优先级从低到高：
MODAL_PRIORITY.LOW      // 1 - 信息展示类弹窗（如角色信息）
MODAL_PRIORITY.NORMAL   // 2 - 普通操作弹窗（默认）
MODAL_PRIORITY.HIGH     // 3 - 重要操作弹窗（如死亡报告）
MODAL_PRIORITY.CRITICAL // 4 - 关键操作弹窗（如处决确认）

// 示例：显示关键弹窗
showModal({
  type: 'KILL_CONFIRM',
  data: { targetId: 5 },
}, MODAL_PRIORITY.CRITICAL);
```

## 🔄 迁移指南

### 旧方式（不推荐）

```tsx
// ❌ 旧方式：直接设置状态
const [showKillModal, setShowKillModal] = useState(false);

<button onClick={() => setShowKillModal(true)}>显示</button>
{showKillModal && <KillConfirmModal ... />}
```

### 新方式（推荐）

```tsx
// ✅ 新方式：使用Modal管理器
const { showModal } = useModal();

<button onClick={() => showModal({
  type: 'KILL_CONFIRM',
  data: { targetId: 5 },
})}>显示</button>
```

## 🎯 优势

### 1. 防止弹窗重叠
- 自动管理弹窗栈
- 同一时间只显示最高优先级的弹窗
- 避免遮罩层残留

### 2. 统一管理
- 所有弹窗通过统一接口控制
- 易于调试和维护
- 可以追踪弹窗状态

### 3. 优先级控制
- 关键操作弹窗可以打断普通弹窗
- 自动处理弹窗顺序

## ⚠️ 注意事项

### 1. 弹窗类型必须匹配

确保使用的弹窗类型在 `ModalType` 中已定义：

```tsx
// ✅ 正确
showModal({ type: 'KILL_CONFIRM', data: { targetId: 5 } });

// ❌ 错误：类型不匹配
showModal({ type: 'UNKNOWN_TYPE', data: {} });
```

### 2. 数据格式必须正确

每个弹窗类型都有对应的数据格式，必须匹配：

```tsx
// ✅ 正确
showModal({
  type: 'KILL_CONFIRM',
  data: { targetId: 5, isImpSelfKill: false },
});

// ❌ 错误：缺少必需字段
showModal({
  type: 'KILL_CONFIRM',
  data: { targetId: 5 }, // 缺少 isImpSelfKill
});
```

### 3. 关闭弹窗

弹窗关闭应该通过 `hideModal()` 而不是直接设置状态：

```tsx
// ✅ 正确
const handleClose = () => {
  hideModal();
};

// ❌ 错误：不要直接操作状态
const handleClose = () => {
  setCurrentModal(null); // 不要这样做
};
```

## 📋 已支持的弹窗类型

查看 `src/types/modal.ts` 获取完整的弹窗类型列表，包括：

- `KILL_CONFIRM` - 击杀确认
- `POISON_CONFIRM` - 投毒确认
- `NIGHT_DEATH_REPORT` - 夜晚死亡报告
- `EXECUTION_RESULT` - 处决结果
- `ATTACK_BLOCKED` - 攻击被阻挡
- ... 等等

## 🔍 调试

### 查看当前弹窗栈

```tsx
const { currentModal, isModalOpen } = useModal();

console.log('当前弹窗:', currentModal);
console.log('是否有弹窗:', isModalOpen);
```

### 控制台日志

Modal管理器会在控制台输出调试信息：
- 弹窗显示/隐藏
- 弹窗栈更新
- 优先级排序

## 🚀 后续优化建议

1. **完全迁移到新系统**
   - 将所有 `showXxxModal` 状态改为使用 `showModal`
   - 移除旧的弹窗状态管理代码

2. **添加弹窗动画**
   - 在 `GlobalModalRenderer` 中添加进入/退出动画

3. **弹窗历史记录**
   - 记录弹窗显示历史，便于调试

4. **弹窗队列管理**
   - 对于非关键弹窗，可以排队显示

