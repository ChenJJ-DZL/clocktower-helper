# 官方规则细节映射文档

本文档记录了官方规则中的"细节说明"如何映射到代码逻辑和UI渲染上。

## 一、规则特例

### 1. 玩家可以对自己发起提名 ✅

**规则说明**：如果规则书中没有提及"你不能做某件事情"，那么你就可以做这件事情。玩家可以对自己发起提名。

**实现位置**：
- `src/hooks/useGameController.ts` - `executeNomination` 函数
- `src/components/game/GameModals.tsx` - 提名选择UI

**代码变更**：
- 移除了禁止提名自己的限制
- 允许 `sourceId === id` 的情况
- 添加了注释说明这是规则特例

### 2. 玩家可以在对自己的提名中投票 ✅

**规则说明**：玩家可以在对自己的提名中投票。

**实现位置**：
- `src/hooks/useGameController.ts` - `submitVotes` 函数

**代码说明**：
- 当前代码没有禁止玩家在自己的提名中投票
- 投票逻辑允许任何玩家投票，包括提名者自己

### 3. 恶魔可以攻击一名已死亡的玩家 ✅

**规则说明**：恶魔可以攻击一名已死亡的玩家（如果能力允许）。

**实现位置**：
- `src/hooks/useGameController.ts` - `isTargetDisabled` 函数
- `src/utils/nightLogic.ts` - `canSelectDead` 元数据

**代码说明**：
- `isTargetDisabled` 函数返回 `false`，允许选择任何目标（包括已死亡的玩家）
- 角色的 `canSelectDead` 元数据控制是否可以选择已死亡的玩家
- 如果 `canSelectDead: true`，则允许选择已死亡的玩家

### 4. 在夜晚选择"任意玩家"时可以选择自己或已死亡的玩家 ✅

**规则说明**：在夜晚选择"任意玩家"，意思就是可以选择自己或是选择已死亡的玩家。

**实现位置**：
- `src/utils/nightLogic.ts` - `canSelectSelf` 和 `canSelectDead` 元数据
- `src/hooks/useGameController.ts` - `toggleTarget` 函数

**代码说明**：
- 角色的 `canSelectSelf` 和 `canSelectDead` 元数据控制选择限制
- `isTargetDisabled` 函数不限制选择，允许选择自己或已死亡的玩家（如果元数据允许）

### 5. 死亡玩家不能发起提名 ✅

**规则说明**：死亡玩家不能发起提名，且只能在有投票标记时进行一次处决投票。

**实现位置**：
- `src/hooks/useGameController.ts` - `executeNomination` 函数

**代码说明**：
- `executeNomination` 函数检查 `nominatorSeat.isDead`，如果为 `true` 则拒绝提名
- 这是规则书中明确提及的限制

### 6. 死亡玩家只能在有投票标记时进行一次处决投票 ✅

**规则说明**：死亡玩家只能在有投票标记时进行一次处决投票。

**实现位置**：
- `src/hooks/useGameController.ts` - `submitVotes` 函数
- `app/data.ts` - `Seat` 接口的 `hasGhostVote` 字段

**代码说明**：
- `submitVotes` 函数检查死亡玩家的 `hasGhostVote` 字段
- 如果死亡玩家没有 `hasGhostVote`，则不能投票
- 投票后会将 `hasGhostVote` 设置为 `false`

## 二、角色能力

### 1. 当角色使用能力时，它会立即生效 ✅

**规则说明**：如果恶魔攻击占卜师，那么占卜师会立即死亡，无法在当晚稍后时分醒来以使用自己的能力。

**实现位置**：
- `src/hooks/useGameController.ts` - `handleConfirmAction` 函数
- `src/hooks/roleActionHandlers.ts` - 各种角色能力处理函数

**代码说明**：
- 能力执行是同步的，立即生效
- 击杀等效果会立即更新座位状态

### 2. 说书人仅需要告诉玩家他通过自己的角色能力能够得知的信息 ✅

**规则说明**：秘密就是秘密。如果小恶魔死亡后红唇女郎变成了小恶魔，其他玩家会知道这件事情发生了吗？他们不知道。

**实现位置**：
- `src/utils/nightLogic.ts` - `calculateNightInfo` 函数
- 各个角色的夜晚信息生成逻辑

**代码说明**：
- 只显示角色能力应该知道的信息
- 不显示其他角色的变化或能力使用情况

### 3. 角色能力会在死亡、中毒或醉酒的那一刻立即失去 ✅

**规则说明**：如果一名玩家死亡，他会立即失去自己的能力，并且因他能力而产生的所有持续性效果都会终止。

**实现位置**：
- `src/hooks/useGameController.ts` - `killPlayer` 函数
- `src/utils/gameRules.ts` - `computeIsPoisoned` 函数
- 各个角色能力处理函数

**代码说明**：
- 死亡时立即移除角色的提示标记和持续型效果
- 中毒和醉酒时能力失效，但恢复后可以继续生效

### 4. 如果一项能力描述中没有"选择"一词，这项能力就由说书人来做出选择 ✅

**规则说明**：如果一项能力描述是"每个夜晚，会有一名玩家中毒"，那么由说书人来选择是哪名玩家中毒。

**实现位置**：
- `src/hooks/useGameController.ts` - `handleConfirmAction` 函数
- `src/components/modals/StorytellerSelectModal.tsx` - 说书人选择弹窗组件
- `src/components/game/GameModals.tsx` - 弹窗集成
- `src/types/modal.ts` - `STORYTELLER_SELECT` Modal类型

**代码说明**：
- 在`handleConfirmAction`函数中检测能力描述是否包含"选择"关键词
- 如果能力描述中没有"选择"且当前没有选中目标，触发说书人选择弹窗
- 弹窗参考投票计票环节的设计，显示所有玩家列表供说书人选择
- 选择完成后设置选中的目标，用户需要再次点击"确认"按钮继续处理行动
- 弹窗会显示角色名称、能力描述、需要选择的目标数量等信息

### 5. 如果一名玩家尝试以错误的方式使用他的能力，立刻提醒他 ✅

**规则说明**：如果是在白天，那么口头告诉他，如果是在夜晚，那么摇头来表示不可以这么做。

**实现位置**：
- `src/hooks/useGameController.ts` - `handleConfirmAction` 函数
- `src/components/game/GameModals.tsx` - 各种弹窗和提示

**代码说明**：
- 通过弹窗和日志提示玩家错误使用能力
- UI 中禁用不符合规则的选择

### 6. 如果一名玩家在游戏过程中复活、变化或交换了角色，视为他获得了一个新的角色 ✅

**规则说明**：他会立即获得这个新角色的能力，并失去原本的角色能力。

**实现位置**：
- `src/hooks/useGameController.ts` - `changeRole` 和 `swapRoles` 函数
- `src/hooks/useGameController.ts` - `cleanseSeatStatuses` 函数

**代码说明**：
- `changeRole` 和 `swapRoles` 函数会更新角色
- `cleanseSeatStatuses` 函数清理旧角色的状态
- 新角色立即生效

### 7. 有的角色能力可能会在不同于夜晚顺序表列出的时机触发效果 ✅

**规则说明**：如果带有"当你死亡时"能力的角色死亡，且能力位于夜晚顺序表上时，这个夜晚顺序表的位置通常来说意味着"结算该角色死亡效果的最晚时机"。

**实现位置**：
- `src/utils/nightLogic.ts` - `generateNightTimeline` 函数
- 各个角色的死亡触发能力

**代码说明**：
- 死亡触发能力会在角色死亡时立即触发
- 不严格按照夜晚顺序表执行

## 三、状态

### 1. 存活与死亡 ✅

**规则说明**：在任意时间点，一名玩家一定会处于存活或死亡两种状态之一。

**实现位置**：
- `app/data.ts` - `Seat` 接口的 `isDead` 字段
- `src/hooks/useGameController.ts` - `killPlayer` 函数

**代码说明**：
- `isDead` 字段表示玩家是否死亡
- 死亡状态立即生效

### 2. 阵营与角色 ✅

**规则说明**：在任意时间点，一名玩家一定会处于善良或邪恶两种状态之一。

**实现位置**：
- `src/utils/gameRules.ts` - `isEvil` 和 `isGoodAlignment` 函数
- `app/data.ts` - `Seat` 接口的 `isEvilConverted` 和 `isGoodConverted` 字段

**代码说明**：
- 阵营与角色相对独立
- 角色变化不会自动改变阵营

### 3. 醉酒与中毒 ✅

**规则说明**：醉酒或中毒的玩家会失去能力。如果一名醉酒的玩家恢复清醒，或一名中毒的玩家恢复健康，那么他就能恢复自己的能力。

**实现位置**：
- `src/utils/gameRules.ts` - `computeIsPoisoned` 函数
- `app/data.ts` - `Seat` 接口的 `isDrunk` 和 `isPoisoned` 字段
- `src/hooks/useGameController.ts` - `isActorDisabledByPoisonOrDrunk` 函数

**代码说明**：
- 中毒和醉酒状态会禁用角色能力
- 恢复后能力可以继续生效

### 4. 疯狂 ⚠️

**规则说明**：当一名玩家需要"疯狂"地证明某件事情时，意味着他应该去努力说服其他玩家那件事情是真的。

**实现位置**：
- `src/hooks/useGameState.ts` - `showMadnessCheckModal` 状态
- `src/components/modals/MadnessCheckModal.tsx` - 疯狂检查弹窗

**待完善**：
- 需要更完善的疯狂机制实现
- 需要添加疯狂状态的追踪和判定逻辑

## 已实现的代码注释

代码中已添加注释说明规则特例：
- `src/hooks/useGameController.ts` - `executeNomination` 函数：说明可以对自己提名
- `src/hooks/useGameController.ts` - `submitVotes` 函数：说明可以在自己的提名中投票
- `src/hooks/useGameController.ts` - `isTargetDisabled` 函数：说明可以选择自己或已死亡的玩家
- `src/hooks/useGameController.ts` - `killPlayer` 函数：说明可以攻击已死亡的玩家

## 待实现的功能

1. ~~**说书人选择逻辑**：如果能力描述中没有"选择"一词，由说书人选择目标~~ ✅ 已实现
   - ✅ 解析能力描述文本
   - ✅ 检测是否包含"选择"关键词
   - ✅ 如果不包含，弹窗让说书人选择目标

2. **疯狂机制完善**：更完善的疯狂状态判定和奖励/惩罚机制
   - 当前已有基础实现（`showMadnessCheckModal`）
   - 需要更完善的判定逻辑和UI提示

3. **能力立即生效验证**：确保所有能力都立即生效，没有延迟
   - 当前代码中能力执行是同步的
   - 需要验证所有角色能力都符合此规则

4. **持续型效果终止**：确保角色死亡/中毒/醉酒时，所有持续型效果立即终止
   - 当前代码中已有部分实现
   - 需要确保所有持续型效果都能正确终止

## 注意事项

1. **规则特例优先**：如果规则书中没有明确禁止，则允许该行为
2. **说书人裁决权**：说书人对规则有最终解释权
3. **角色能力优先**：角色能力与核心规则冲突时，以角色能力为准
4. **状态独立性**：不同状态之间互不干涉，都属于玩家的持续型要素

