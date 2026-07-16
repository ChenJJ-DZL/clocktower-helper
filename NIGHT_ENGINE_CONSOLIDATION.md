# 夜晚执行封装「安全合并」记录

> 目标：合并 `useNightActionHandler.executeViaNewEngine`（UI 能力解析器）与 `NightEngine.submitAction`（夜晚队列编排器）中**重复**的"查能力 → 构造上下文 → 跑管道"逻辑。
> 决策：**保留编排/解析分工**（二者职责互补，并非冗余，直接二合一会改崩游戏），仅抽出共用的单一函数。

## 关键认知纠正

- 两条链路**不是冗余**，是互补：
  - `executeViaNewEngine` = 单条能力**效果解析器**（预览弹窗 / markedForDeath / 状态同步）。
  - `NightEngine.submitAction` = 整夜**队列编排器**的一步（其 `processDemonKill` 还是空桩，真正的击杀效果由前者处理）。
- 二者唯一的真·重复：各自独立实现"查 `getRawAbilityMap` → 构造 `MiddlewareContext` → `runFullAbilityPipeline`"。
- 另有**第三套仍在跑的** `src/utils/nightLogic.ts`（旧生产系统），以及 `nightEngineFacade.ts` 顶部自注"实验性、生产勿用"与 `useNightEngine.ts` 顶部"生产就绪"**注释互相打架**——属更大的遗留债，本次未动。

## 改动清单（4 个文件）

| 文件 | 改动 |
|------|------|
| `src/roles/new_engine/abilityRegistry.ts` | 新增 `getAbilityForRole(roleId)`：统一的按角色查能力入口（原 executeViaNewEngine 内联的 `find` 逻辑提取至此） |
| `src/utils/middlewarePipeline.ts` | 新增 `runAbilityPipeline(ability, context)`：包装 `runFullAbilityPipeline`，统一"4 段中间件 → 管道"的调用 |
| `src/hooks/useNightActionHandler.ts` | `executeViaNewEngine` 改用 `getAbilityForRole` + `runAbilityPipeline`，删除内联查找与重复拼装 |
| `src/utils/nightEngineFacade.ts` | `NightEngine.submitAction` 改用 `runAbilityPipeline(this._currentAbility, context)` |

> 两处调用点的**上下文构造保持不变**（来源不同：前者翻译遗留状态字段、用 `nightInfo`；后者用状态机的 `currentNode`），只把"能力查找"和"管道调用"收口到共享函数。

## 验证

- `npx tsc --noEmit`：**0 个类型错误**。
- 残留引用检查：两文件中已无 `runFullAbilityPipeline` / `abilityKey` 残留。
- V7 全流程 E2E（`next build` + `next start` 生产服务器）：**EXIT=0，无 500、无崩溃**，夜晚→黄昏→处决链路正常，单局 4 次处决，行为与原先一致 → **无回归**。

## 遗留（可选后续，未本次处理）

> ⚠️ 更正：本节早前版本曾误判"136 个老角色文件为死代码可删"——**错误**。
> 经 `tsc` 复核，`src/roles/index.ts` 有 **155 处相对导入**（`./demon/imp`、`./townsfolk/...` 等）依赖这些文件来构建 `roleRegistry`（角色**定义**元数据）；`useExecutionHandlers.ts` 也直接 import 了单数版 `useExecutionHandler`。二者均为**活代码**，不可删。误删后已从 git 立即恢复并回到 0 类型错误。

1. **老角色文件（136 个）= 活代码**：提供角色定义（`roleRegistry`），与新引擎的"能力实现"（`abilityRegistry`）互补共存，**不要删除**。真正的长期收口是把"定义"也迁入新引擎统一管理（大工程，待规划）。
2. **`useExecutionHandler`（单数）= 活代码**：被 `useExecutionHandlers.ts` 直接 import，命名撞车但非死文件，不可删。
3. ✅ **已本次清理**：`nightEngineFacade.ts`/`useNightEngine.ts` 矛盾注释已统一为诚实口径；`processDemonKill` 空桩注释已更正；`useNightEngine` 未用 `_actions` 参数（及调用点实参）已移除；`tests/architecture.test.ts` 已精简（移除测试已废弃旧引擎 handler 的 `test.skip` 与无用 import）。
4. ✅ **唯一真·死文件 `src/hooks/useGameQueueAdapter.ts` 已删除**（全仓库 0 引用、未再导出，tsc/build/测试均通过）。
5. 仍在大量引用的旧系统 `src/utils/nightLogic.ts` 与"新引擎"的长期收口策略待���。
