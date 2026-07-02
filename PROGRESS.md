# 血染钟楼说书人助手 — 开发进度

> 最后更新：W7.3.0 (2025-07-02)

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

---

## 质量状态

| 检查项 | 结果 |
|--------|------|
| TypeScript (`tsc --noEmit`) | ✅ 0 errors |
| 生产构建 (`next build`) | ✅ 0 warnings |
| 单元测试 (Vitest) | ✅ 260/260 passed, 2 skipped |
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
