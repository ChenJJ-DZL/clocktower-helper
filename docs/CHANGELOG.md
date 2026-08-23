# 更新日志

## W8.23.2 — 规则严谨性重构 + 弹窗体系标准化 + 自建剧本全流程打通 (2026-08-23)

> 详细工程复盘与根因分析请见文档：[POSTMORTEM_AND_ENGINEERING_GUIDELINES.md](./POSTMORTEM_AND_ENGINEERING_GUIDELINES.md)

### 修复与优化

1. **幽灵票资产全局唯一性**：修复死者幽灵票跨天被异常重置恢复的问题，严格锁定每局游戏只能使用一次。
2. **处决计票门槛公式纠正**：修正 14 人等特定存活人数下门槛计算与比较条件，确保达到 $\lceil N/2 \rceil$ 票数玩家正确进入处决席。
3. **处决不可跳过流转拦截**：处决未结算前禁止直接入夜，弹窗操作收敛为「返回」与「执行处决」。
4. **管家主人自选三层拦截**：首夜与非首夜全面禁止管家选择自己作为主人，交互层、夜间信息层与能力中间件层三重阻断。
5. **提名取消原子回滚**：实现 `cancelNomination`，取消提名时自动解除当个黄昏的发起人和被提名人限制并清除标记。
6. **游戏结束结算弹窗受控展示**：修复 `GameOverOverlay` 上下文读取，大标题展示阵营胜利与详细依据，支持本局复盘、长图导出与随时重唤。
7. **自建剧本全流程标准化**：`CustomScriptBuilderModal` 接入 `ModalWrapper`，支持官方模板快捷载入、角色实时搜索及「🚀 保存并立即开局」。
8. **座位状态标签布局体系重构**：“已提”与“被提”严格定位在序号右侧等高展示，状态标签沿圆环切线左对齐纵向并列。

---

## W8.8.2 — 暗流涌动 4 轮补测 + 信息一致性 + 死亡报告/恶魔队列修复 (2026-08-09)

> 针对「暗流涌动」剧本补测 4 轮完整对局（15/14/10/9 人随机标准配比，全部 FINISHED），
> 全程真实 UI 点击（Playwright + Chromium），重点核对技能结算与各处信息一致性。

### 修复

#### 🔴 P0: 死亡报告跨夜累积（deadThisNight 未重置）

**症状**：夜晚报告"昨晚15号、8号、5号玩家死亡"连续多夜重复出现旧死者名单，
第 1 局第 3 夜起每夜报告都包含此前所有死者。

**根本原因**：`deadThisNight` 只在游戏重置时清空，`enterNightPhase`（useGameFlow.ts）
与处决后自动入夜 `startSubsequentNight`（useExecutionHandlers.ts）都未清空，
导致死亡名单跨夜累积，送葬者等依赖 deadThisNight 的功能读取到历史数据。

**修复**：
- `useGameFlow.ts` `enterNightPhase`：进入夜晚时 `deadThisNight: []`
- `useExecutionHandlers.ts` `startSubsequentNight`（含队列为空兜底分支）：同样清空

**验证**：15 人局死亡报告"昨晚2号玩家死亡"单夜独立、无累积 ✅

#### 🔴 P0: 红唇女郎继承后新恶魔不在夜间队列

**症状**：第 1 天处决小恶魔 → 红唇女郎继承（魔典显示"5号 小恶魔"）→ 但第 2 夜
队列 [占卜师, 送葬者, 间谍] 完全没有新恶魔的杀人步骤，游戏拖长无法结束。

**根本原因**：`startSubsequentNight` 调用 `nightLogic.startNight(false)` 时，
`useNightEngine` 的 `startNight` 闭包捕获的是**旧 gameState**（处决/继承状态变更后
React 尚未重渲染），引擎快照未同步红唇继承 → `generateDynamicNightQueue` 找不到
存活恶魔 → 恶魔步骤缺失。

**修复**：`useNightEngine.ts` 新增 `gameStateRef` 持有最新 gameState；
`startNight`/`finalizeNightStart` 在启动前先用 ref 中的最新状态重建引擎快照，
确保红唇继承/处决死亡等最新状态进入引擎队列。

**验证**：固定阵容（红唇女郎+小恶魔）处决小恶魔后，第 2 夜队列
`[imp(5), fortune_teller(9), spy(4)]` 新恶魔 5 号正常在队列 ✅

#### 🟡 红唇女郎被动能力被错误排入夜间队列

**症状**：红唇女郎（纯被动触发）出现在夜间队列第一位（`scarlet_woman(5)`），
占用夜间步骤。

**根本原因**：`scarlet_woman.ability.ts` `otherNightPriority: 37` 误设数值，
而能力是 `triggerTiming: [PASSIVE]`（被动，无需唤醒），队列生成器按
`on > 0` 判定将其入队。

**修复**：`otherNightPriority: null`（与 firstNightPriority 一致，被动能力不入队）。

### 测试

- 4 轮完整对局（15/14/10/9 人）全部 FINISHED，0 console error / 0 pageerror
- 信息一致性核对：第 3 局投毒者毒调查员——控制台 guide"行动（受干扰）"与
  结算弹窗"【受干扰】"完全一致（受干扰标记 2+2 次同步）
- 幽灵票每日恢复、管家规则、间谍魔典、圣徒处决、酒鬼伪装全部正常
- 11 条记录均为预期行为（管家 alert + 酒鬼 warning）

---

## W8.8.1 — 真实UI随机对局测试修复 + 管家/投票/持久化/新角色 (2026-08-08)

> 本轮通过真实浏览器（Puppeteer + Edge）对「暗流涌动」剧本执行随机对局测试（随机落座、随机技能、随机提名/投票/处决），发现并修复以下问题。

### 修复

#### 🔴 P0: 管家（Butler）选主人后 masterId 从未同步到座位

**症状**：管家夜晚选择主人后，白天投票时弹窗报错「管家(1号)的票不计入：主人(1号)未投票」——主人显示为管家自己；且「移除管家投票后无有效投票者，本次投票作废」拦截 0 票结果。

**根本原因**：
1. 管家选主人后 `masterId` 只存在于引擎执行上下文，从未写回 `seat`，座位上的 `masterId` 一直为初始值 `null`；
2. `null !== undefined` 为 `true`，导致投票校验误判「主人未投票」；
3. 弹窗文案 `主人(${masterId + 1}号)` 中 `null + 1 === 1`，所以显示成管家自己（1号）。

**修复**：
- `useNightActionHandler.ts`：管家（及 Q宝）执行后，将 `masterId` 同步写回对应 `seat`
- `useExecutionHandlers.ts`：管家投票校验增加防御——`masterId` 为 `null/undefined/等于自己` 时不触发拦截
- `useExecutionHandlers.ts`：移除管家票后若剩余投票者为 0，不再弹「投票作废」，允许 0 票结果（无人举手 → 不处决，符合规则）

#### 🔴 P0: 0 票被拦截（不符合规则）

**症状**：提名后计票为 0 票时，系统弹窗「票数必须是自然数大于等于1的整数」，拒绝提交。

**根本原因**：`useExecutionHandlers.ts` 中校验 `v < 1` 拦截了 0 票；但规则上提名后 0 票合法（无人举手则无人上台、无人被处决）。

**修复**：`useExecutionHandlers.ts` 校验改为 `v < 0`，允许 0 票提交；下游 `isCandidate: v >= threshold` 逻辑本就能正确处理 0 票（不产生候选人）。

#### 🟡 localStorage 配额溢出（QuotaExceededError）

**症状**：长时间对局（数百步）后页面报 `QuotaExceededError`，快照保存失败，测试脚本 500 步后崩溃。

**根本原因**：每步操作都向 localStorage 写入完整快照（含完整 `history`），数据无限膨胀超出 5MB 配额。

**修复**：
- `useHistoryController.ts`：`history` 限长 200 条（`slice(-200)`），并防御 `JSON.parse(undefined)` 崩溃
- `persistence.ts`：游戏记录限长 30 条；`createSnapshotFromState` 增加 `safeJsonClone` 安全深拷贝（undefined/null 原样返回）

#### 🟡 能力管道 `meta.stateUpdates` 从未被消费

**症状**：赌徒/水手/吟游诗人/吟游歌手/造谣者/月之子等能力「计算了但不生效」（标记死亡、醉酒等不落地）。

**根本原因**：部分能力通过 `meta.stateUpdates` 下发结构化变更指令，但全项目无消费点。

**修复**：`useNightActionHandler.ts` 新增 `applyStateUpdates()`，在 `executeViaNewEngine` 执行完整管道后应用指令：
- `MARK_FOR_DEATH` → 标记目标死亡（赌徒猜错/造谣者声明正确/月之子诅咒）
- `CANCEL_DEATH` → 取消死亡（和平主义者处决不死亡）
- `ADD_DRUNK` / `MARK_ALL_FOR_DRUNK` → 使目标醉酒（水手/吟游诗人·吟游歌手）

#### 🟡 吟游诗人（Bard）被动未触发

**修复**：`useExecutionHandlers.ts` 处决处理中新增——爪牙死于处决时，除吟游诗人/爪牙/旅行者外的存活玩家醉酒直到明天黄昏。

#### 🟡 吟游歌手（Minstrel）被动未触发

**修复**：`useGameController.ts` 夜晚死亡结算中新增——夜晚有镇民死亡时，爪牙醉酒直到明天黄昏。

#### 🟡 造谣者（Gossip）白天声明缺失

**修复**：
- `GameStage.tsx`：白天新增「🗣 造谣声明」按钮（每天一次，说书人裁定真假，为真当晚额外死亡一人）
- `useGameFlow.ts`：每天重置造谣者声明状态（`gossipStatementToday/gossipTrueTonight/gossipSourceSeatId`）
- `useDayActions.ts`：`gossip` 加入白天技能列表
- `useGameController.ts`：新增 `setGossipTrueTonight/setGossipSourceSeatId/setGossipStatementToday` 状态

#### 🟡 其他

- `useGameState.ts`：`setDayAbilityForm` 支持函数式更新（`(f) => ({...f, info1})` 形式），修复白天技能弹窗状态覆盖
- `useGameFlow.ts`：新增过期引擎状态效果清理（`expiresAtNight/expiresAtDusk` 及数字 duration 的效果）

### 新增功能

- **新角色 Q宝（Qutler）**：管家（Butler）变体，能力与管家完全相同（每晚选主人，主人投票时 Q宝才能投票），复用管家能力管道：
  - `src/roles/new_engine/qutler.ability.ts`（新增）
  - `abilityRegistry.ts`：注册 `qutlerAbility`
  - `useExecutionHandlers.ts` / `useNightActionHandler.ts`：投票校验与主人同步兼容 `qutler`

### 数据完善

- `app/data.ts` + `json/full/*.json`：角色数据完善（所属剧本、能力类型等字段补全）

### 测试

- `src/roles/__tests__/librarian.test.ts`、`washerwoman.test.ts`：适配修正
- 全量单元测试 163 个通过 ✅
- 真实浏览器随机对局测试：流程 night → day → dusk → night 循环全部打通（提名 → 举手投票 → 计票 → 处决 → 入夜）

---

## W7.3.1 — 投毒者中毒标记修复 + 占卜师干扰项修复 (2025-07-02)

### 修复

#### 🔴 P0: 投毒者中毒标记不显示

**症状**：投毒者选择目标并确认后，目标座位不显示"中毒"标记，技能/信息未受干扰。

**根本原因**：`useGameState` 的 `setSeats` 在调用 `dispatch` 时使用闭包中捕获的旧 `state.seats`。当 `executeViaNewEngine` 设置中毒后 `markAbilityUsed` 又调用 `setSeats` 时，后者基于旧状态映射，覆盖了中毒状态。

**修复**：
- `GameContext.tsx`：新增 `UPDATE_SEATS` action 类型 + reducer handler，dispatch 时直接执行 `updater(state.seats)`
- `useGameState.ts`：`setSeats` 对 functional updater 改用 `UPDATE_SEATS` dispatch
- `useNightActionHandler.ts`：导出核心函数供测试

**测试**：4 个新增单元测试全部通过 ✅

#### 🟡 占卜师干扰项修复

**症状**：占卜师选择"红罗刹"（干扰项）时，结果应显示"有"但未体现。

**修复**：`GameStage.tsx` 引入 `FortuneTellerBoonManager`，同时检查恶魔 + 干扰项 + 陌客三重判定。

---

## W6.22.4+ — 全角色覆盖 + 游戏记录修复 (2026-06-22)

### 新增功能

#### Layer 4 仿真对局引擎
- **`tests/headlessGameEngine.ts`** — 无头游戏引擎
  - 不依赖浏览器，直接通过新引擎能力注册表执行游戏
  - 支持多剧本、随机AI决策、能力触发追踪、错误检测
  - 支持 `__all__` 混池模式（从全部角色中随机分配）
- **`tests/layer4_simulation.test.ts`** — 仿真对局测试（5 剧本 × 20 局 = 100 场）
  - 自动生成覆盖度报告：触发角色数、错误列表、可靠率统计
- **`tests/role_coverage.test.ts`** — 全角色能力覆盖验证
  - 177 个核心角色（排除传奇角色/旅行者）逐个验证
  - 验证能力已注册 + 能力管道可执行不崩溃
  - 覆盖率：**100%**
- **`tests/passive_day_roles.test.ts`** — 8个被动/日间角色场景测试

#### 补全能力文件
| 文件 | 角色 | 说明 |
|:----|:-----|:-----|
| `src/roles/new_engine/missionary.ability.ts` | 传教士(Missionary) | 每晚选爪牙，封禁其能力 |
| `src/roles/new_engine/leech.ability.ts` | 痢蛭(Lleech) | 每晚选宿主，寄生机制 |
| `src/roles/new_engine/shaman.ability.ts` | 灵言师(Shaman) | 首夜给关键词，转化触发 |
