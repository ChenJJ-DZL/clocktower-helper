# 更新日志

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

### 修复

#### 能力执行崩溃/错误 (P0-P2)
| 角色 | 问题 | 修复 |
|:----|:-----|:-----|
| 筑梦师(Dreamer) | 🔴 `Cannot read 'name'` 崩溃 | availableRoles 注入 + postProcess null guard |
| 魔鬼代言人(Devils Advocate) | 🟠 能力未注册 | 文件恢复 + registry 取消注释 |
| 教授(Professor) | 🟠 选死者为目标失败 | selectTargets 支持 allowDead |
| 守鸦人(Ravenkeeper) | 🟠 diedAtNight 标记缺失 | killSeat 设 diedAtNight |
| 送葬者(Undertaker) | 🟠 executedSeatId 缺失 | snapshot 注入处决ID |
| 教父(Godfather) | 🟠 无死亡追踪 | 死亡上下文传到 snapshot |
| 红唇女郎(Scarlet Woman) | 🟠 无恶魔死亡追踪 | 处决/死亡追踪 |
| 哈迪寂亚(Hadesia) | 🟠 死亡上下文缺失 | 同上 |
| 僵怖(Zombuul) | 🟠 lastDuskExecution 缺失 | snapshot 注入 |
| 僧侣(Monk) | 🟡 首夜误计失败 | otherNightOnly 首夜过滤 |
| 小恶魔(Imp) | 🟡 首夜误计失败 | otherNightOnly 首夜过滤 |
| 侍女(Chambermaid) | 🟡 calculate 为桩代码 | 改用 _abilityResults 查询唤醒记录 |

#### 游戏记录系统
- `saveCurrentSnapshot` 从未被调用 → 新增 `useEffect` 在 gamePhase/seats 变化时自动保存
- `createSnapshotFromState` 未保存 `seats` → 补充 seats 字段
- `handleContinueGame` 已实现但未被触发 → 自动保存后点击"继续"可恢复

#### 首夜流程改进
- 新增 `demon_info` 系统步骤（nightOrder.json）
- 爪牙/恶魔互认拆分为独立唤醒步骤（不再与技能选择混合）
- 系统步骤只展示信息，无目标选择，点击确认即可推进

#### 引擎改进
- `selectTargets`：支持 `allowDead: true` 时包含死者
- `killSeat`：标记 `diedAtNight` 和 `deathSource`
- `createSnapshot`：注入 `availableRoles`、`executedSeatId`、`lastDuskExecution`
- `buildFullNightOrder`：新增 `otherNightOnly` 首夜过滤
- `generateDynamicNightQueue`：系统步骤按角色类型匹配座位
- 能力注册表只初始化一次（减少冗余日志）

### 测试覆盖

| 测试文件 | 用例数 | 覆盖内容 |
|:--------|:-----:|:---------|
| `role_coverage.test.ts` | 177 | 全角色能力注册+管道验证 |
| `layer4_simulation.test.ts` | 1 (100局) | 全剧本批量仿真 |
| `passive_day_roles.test.ts` | 14 | 8个被动/日间角色场景 |
| `interaction_tests.test.ts` | 18 | 角色交互逻辑 |
| `jinx_system.test.ts` | 21 | 相克规则 |
| 其他 7 个 | 30 | 架构/唤醒队列/核心逻辑 |
| **总计** | **260** | **全部通过** |

### 架构更新

- **旧引擎角色文件**（`src/roles/minion/*.ts`, `src/roles/townsfolk/*.ts` 等）已全部被新引擎 `.ability.ts` 文件取代，为死代码
- 新引擎能力文件总数：**214 个**
- 核心角色（排除传奇/旅行者）：**177 个**，能力覆盖 **100%**
- 新增 2 个测试文件，总测试数从 83 → 260