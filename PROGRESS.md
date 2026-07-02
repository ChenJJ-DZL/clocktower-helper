# 血染钟楼说书人助手 — 开发进度

> 最后更新：W7.3.1 (2025-07-02)

---

## W7.3.0 质量修复（本阶段）

### 1. 类型链修复

**问题**：`onSeatClick` 类型不一致，`SeatNode` 期望 `(id: number)`，但 `RoundTable`/`SeatGrid` 期望 `(seat: Seat)`，导致 TypeScript 编译错误。

**修复**：
- `RoundTable.tsx` / `SeatGrid.tsx`：`onSeatClick` 统一为 `(id: number) => void`
- `GameStage.tsx` / `GameBoard.tsx` / `app/page.tsx`：移除不必要的 `(seat) => onSeatClick(seat.id)` 包装
- `SeatGrid.tsx` 矩阵模式：`onSeatClick(seat)` → `onSeatClick(seat.id)`

### 2. E2E 弹窗检测修复

**问题**：`NightActionConfirmModal` 的遮罩层拦截座位点击，因为 `ModalWrapper` 缺少 `role="dialog"` 属性。

**修复**：
- `ModalWrapper.tsx`：添加 `role="dialog"` 属性，使 E2E 辅助函数能正确检测弹窗

### 3. 步骤间状态残留修复

**问题**：`continueToNextAction` 推进队列时不清除 `selectedActionTargets`，下一个步骤沿用旧的已选目标，导致"确认 & 下一步"按钮被禁用。

**修复**：
- `useGameController.ts`：`continueToNextAction` 包装中加入 `setSelectedActionTargets([])`，确保每步开始时目标为空

### 4. E2E 全流程验证通过

- 创建 `tests/full_flow_e2e.spec.ts` — 端到端完整流程测试
- 覆盖：剧本选择 → 快速测试 → 首夜行动 → 间谍步骤 → 天亮进入白天 → 黄昏阶段
- 测试通过 ✅

### 5. 项目清理

- 删除过期的说明文件：`待迁移角色清单.md`、`历史遗留等待解决.md`、`docs/精修进度表.md`、`docs/系统迁移策略.md`、`docs/simulation_issues.md`
- 删除调试截图和日志文件
- 清理 `docs/archive/` 目录

### 6. 占卜师干扰项修复

**问题**：占卜师选择"红罗刹"（干扰项）时，结果应显示"有"但未体现。

**修复**：
- `GameStage.tsx`：引入 `FortuneTellerBoonManager`，同时检查恶魔 + 干扰项 + 陌客三重判定
- 若所选目标中包含恶魔、红罗刹（干扰项）或陌客（50%概率），结果均为"有"

### 7. 投毒者中毒标记不显示修复 🔴 P0

**问题**：投毒者选择目标并确认后，目标座位不显示"中毒"标记，且技能/信息未受干扰。

**根本原因**：`useGameState` 的 `setSeats` 在调用 `dispatch` 时使用闭包中捕获的旧 `state.seats`，而非 Reducer 最新状态。当 `executeViaNewEngine` 设置中毒后 `markAbilityUsed` 又调用 `setSeats` 时，后者基于旧状态映射，覆盖了中毒状态。

**修复**：
- `GameContext.tsx`：新增 `UPDATE_SEATS` action 类型 + reducer handler，在 dispatch 时直接执行 `updater(state.seats)` 获取最新状态
- `useGameState.ts`：`setSeats` 对 functional updater 改用 `UPDATE_SEATS` dispatch，依赖简化为 `[dispatch]`（稳定引用）
- `useNightActionHandler.ts`：导出 `syncStatusEffectsToSeat` 和 `executeViaNewEngine` 供测试使用

**测试**（4 个新增，全部通过）：
| 测试文件 | 覆盖范围 |
|:---------|:---------|
| `tests/poisoner_ability.test.ts` | engine stateUpdate 正确添加中毒效果 |
| `tests/poisoner_pipeline.test.ts` | 完整管道执行后 snapshot 验证 |
| `tests/poisoner_sync.test.ts` | `syncStatusEffectsToSeat` ↔ `isPoisoned` 翻译 |
| `tests/poisoner_integration.test.ts` | 预览→确认→状态同步完整链路 |

---

## 质量状态

| 检查项 | 结果 |
|--------|------|
| TypeScript (`tsc --noEmit`) | ✅ 0 errors |
| 生产构建 (`next build`) | ✅ 0 warnings |
| 单元测试 (Vitest) | ✅ 264/264 passed, 2 skipped |
| 循环依赖 (madge) | ✅ 0 circular |
| E2E 核心流程 | ✅ 通过 |
| E2E 全流程 (首夜→白天→黄昏) | ✅ 通过 |

---

## 架构总览

```
双层架构：
  UI配置层 (src/roles/townsfolk|minion|demon|outsider/*.ts)
    → 角色元数据：id, name, type, night.order, night.target, night.dialog
 新引擎能力层 (src/roles/new_engine/*.ability.ts)
    → 游戏逻辑：preCheck→calculate→stateUpdate→postProcess 中间件管道
    → 207 个能力文件，统一注册在 abilityRegistry.ts

调度器 (useNightActionHandler.ts)
  → 查新引擎 getRawAbilityMap() → 执行新引擎中间件
```

---

## 涉及文件（本阶段）

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/components/game/board/RoundTable.tsx` | 修复 | onSeatClick 签名统一为 (id: number) |
| `src/components/game/board/SeatGrid.tsx` | 修复 | onSeatClick 签名 + 矩阵模式适配 |
| `src/components/modals/ModalWrapper.tsx` | 修复 | 添加 role="dialog" |
| `src/hooks/useGameController.ts` | 修复 | continueToNextAction 清除已选目标 |
| `src/components/game/GameStage.tsx` | 修复 | 移除 onSeatClick 包装器 |
| `src/components/game/GameBoard.tsx` | 修复 | 移除 onSeatClick 包装器 |
| `app/page.tsx` | 修复 | 移除 onSeatClick 包装器 |
| `tests/full_flow_e2e.spec.ts` | **新增** | 首夜→白天→黄昏 E2E 全流程测试 |
| `src/hooks/useNightActionHandler.ts` | 修复 | 导出 syncStatusEffectsToSeat / executeViaNewEngine；占卜师干扰项修复 |
| `src/components/game/GameStage.tsx` | 修复 | 占卜师干扰项（红罗刹）判定 |
| `src/contexts/GameContext.tsx` | 修复 | 新增 UPDATE_SEATS action 支持 functional updater |
| `src/hooks/useGameState.ts` | 修复 | setSeats 批量更新修复（P0 投毒者中毒标记） |
| `tests/poisoner_*.test.ts` | **新增** | 投毒者 4 个单元测试（engine/pipeline/sync/integration） |
