# 血染钟楼说书人助手 — 开发进度

> 最后更新：W7.2.1 (2025-07-02)

---

## W7.2.1 阶段修复（26 文件，+1234/-130 行）

### 1. 预览确认流程重构

**问题**：夜晚技能需要连续点击两次"确认"才能生效，流程混乱。

**根因**：旧的 `nightPreviewConfirmedRef` 双重点击机制与新引擎管道存在逻辑冲突。

**修复**：
- 移除 `useGameController.ts` 中的 `nightPreviewConfirmedRef` 和双重点击分支
- 统一由 `executeViaNewEngine()` 接管：
  - `preview=true` → `preCheck + calculate` → 弹出 `NIGHT_ACTION_CONFIRM` 确认弹窗
  - 用户点击 "确认执行" → 再次调用 `preview=false` → 完整 pipeline → 推进队列
- `GameStage.tsx` 移除死代码 `nightPreviewConfirmed` 按钮渲染分支

### 2. 夜晚流程卡住修复

**问题**：首夜恶魔步骤点击"下一步"无效，游戏卡死。

**根因**：
- 系统步骤（`demon_info`/`minion_info`）的 `effectiveRole.id` 与 `currentWakeSeat.role.id` 不匹配
- `NightActionConfirmModal` 确认按钮文字为 **"确认执行"**，E2E 测试只匹配 "确认" 导致弹窗无法关闭

**修复**：
- `handleNightConfirm` 优先使用 `nightInfo?.effectiveRole?.id`
- 新增 `NightActionConfirmModal.tsx` — 统一确认弹窗组件
- E2E 测试 v7 的 `confirmDialog()` 优先匹配 "确认执行"

### 3. 状态同步桥接

**问题**：新引擎写入 `statusEffects[]`（数组），React 渲染读取 `isPoisoned/isProtected/isDrunk`（布尔值），两面断连导致技能效果不显示状态图标。

**修复**（`useNightActionHandler.ts`）：
- `translateLegacyStatusesToEffects()` — React 布尔字段 → 新引擎 statusEffects
- `syncStatusEffectsToSeat()` — 新引擎 pipeline 结果 → React 布尔字段
- 完整 pipeline 执行后自动调用同步

### 4. 快速测试优化

**问题**：快速测试中酒鬼缺少伪装身份，导致 check 阶段阻塞。

**修复**（`app/page.tsx`）：`handleQuickTest` 自动为酒鬼随机分配一个镇民伪装身份。

### 5. 黄昏流程修复

**问题**：处决台为空时 `alert()` 阻塞，且座位点击类型不匹配。

**修复**：
- 移除 `alert("处决台为空")`，直接调用 `executeJudgment()` 通过 modal 处理
- `onSeatClick` 回调参数从 `Seat` 对象改为 `number`（与 `SeatNode` 实际传参一致）

### 6. 条件唤醒角色

**问题**：掘墓人/守鸦人/僧侣可能在不满足条件时被唤醒。

**修复**：
- 掘墓人：`otherNightOnly: true` + `preCheck` 检查上一天是否有处决
- 守鸦人：`otherNightOnly: true` + `preCheck` 检查是否在当晚死亡
- 僧侣：`otherNightOnly: true`（非首夜专用）

### 7. 交互处理器扩展

- `useInteractionHandler.ts` 新增非阻塞 modal 白名单（`NIGHT_ACTION_CONFIRM` 等）
- `types/modal.ts` 新增 modal 类型注册
- `middlewarePipeline.ts` / `middlewareTypes.ts` 支持 preview 模式字段

---

## 涉及文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `app/page.tsx` | 修改 | 快速测试酒鬼伪装身份自动分配 |
| `src/hooks/useGameController.ts` | 重构 | 移除双重点击，统一 preview 流程 |
| `src/hooks/useNightActionHandler.ts` | 重构 | 状态同步桥接 + executeViaNewEngine 重写 |
| `src/hooks/useInteractionHandler.ts` | 修改 | modal 白名单 |
| `src/hooks/useNightEngine.ts` | 修改 | 管道调整 |
| `src/components/game/GameStage.tsx` | 修复 | roleId/alert/onSeatClick 三处修复 |
| `src/components/game/GameModals.tsx` | 修改 | 注册新弹窗组件 |
| `src/components/modals/NightActionConfirmModal.tsx` | **新增** | 统一夜间行动确认弹窗 |
| `src/roles/new_engine/monk.ability.ts` | 修改 | otherNightOnly |
| `src/roles/new_engine/ravenkeeper.ability.ts` | 修改 | preCheck 死亡条件 |
| `src/roles/new_engine/undertaker.ability.ts` | 修改 | preCheck 处决条件 |
| `src/roles/new_engine/abilityRegistry.ts` | 修改 | 注册映射 |
| `src/roles/core/roleAbility.types.ts` | 修改 | 类型扩展 |
| `src/roles/unifiedRoleDefinition.ts` | 修改 | 类型扩展 |
| `src/types/modal.ts` | 修改 | 新 modal 类型 |
| `src/utils/middlewarePipeline.ts` | 修改 | preview 支持 |
| `src/utils/middlewareTypes.ts` | 修改 | preview 字段 |
| `src/utils/dynamicQueueGenerator.ts` | 修改 | 队列生成调整 |
| `playwright.config.ts` | 修改 | 测试配置 |
| `tests/full_game_v7.spec.ts` | **新增** | 全流程自主 E2E 测试 v7 |
| `tests/v7_p1.ts` / `v7_p2.ts` | **新增** | v7 helper 函数 |
| `tests/debug_*.spec.ts` | **新增** | 调试用测试 |

---

## 遗留问题

| 问题 | 优先级 | 状态 |
|------|--------|------|
| E2E v7 全流程测试未验证通过 | 🔴 高 | 已编写，`NODE_OPTIONS` 环境问题阻塞 Playwright 运行 |
| 黄昏→夜晚完整链路 | 🟡 中 | 源码已修复，待 E2E 验证 |
| 条件唤醒角色（掘墓人/守鸦人/僧侣） | 🟡 中 | 源码已修复，待实战验证 |
| `statusEffects` ↔ 布尔字段 边界情况 | 🟢 低 | 已有双向翻译，待边界测试 |

---

## 下一步

1. 解决 `NODE_OPTIONS` 环境问题，运行 v7 E2E 测试
2. 根据测试反馈修复阻塞 bug，迭代直到完整通关
3. 验证条件唤醒角色不被错误唤醒
4. 通过后 squash 提交并打 W7.3 标签
