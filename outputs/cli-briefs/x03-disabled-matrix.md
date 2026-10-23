# 任务：新增 X03「中毒 / 醉酒」失效矩阵测试（36 条）

项目根：`/c/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`
dev server 已在 `127.0.0.1:3100` 运行 —— **不要重启、不要 build**。

---

## 0. 强制输出协议（违反视为失败）

1. 每条回复的思考 ≤ 150 字。
2. 一条回复只做一个动作（写 1 个文件 或 跑 1 条命令），禁止一次规划多个文件。
3. 禁止再 grep / glob / read，除了下面明确列出的 **2 个参考文件各读 1 次**。
4. 禁止派子代理。
5. **第一条回复直接 `write_file` 写 `src/roles/__tests__/info_disabled_matrix.test.ts`**，不许输出解释文字。
6. 不得 git add / git commit。

---

## 1. 唯一产出

新文件：`src/roles/__tests__/info_disabled_matrix.test.ts`

## 2. 已实测事实（不要再验证，直接用）

中毒态跑 `runRole` 后（实测 chef / empath / fortune_teller 三例）：

- `ctx.aborted === false`
- `ctx.meta.abilityEffective === false`
- `ctx.meta.isCorrupted === true`
- 产出是**假值**：chef 真值 0 → `abilityResult: 1`（`abilityResultTrue: 0`）；
  empath 真值 1 → 报 0；fortune_teller 真值 false → 报 true

⇒ **判据不是「没产出」，而是「产出被标记受干扰 + 不等于真值」。**
计划文档里写的「aborted === true」是错的，不要照抄。

## 3. 参考（每个只读 1 次，读这几行就够）

- `src/roles/__tests__/info_truth_matrix.test.ts` 第 17–50 行：
  `BY_ROLE` 构造、`beforeEach(resetLimitedAbilityUses)`、`board` / `runRole` 的 import 与用法
- `src/utils/seatDisabled.ts`：`isSeatDisabled` 签名

## 4. 逐条要求：18 角色 × 2 态 = 36 个 `it`

角色（roleId）：`chef` `washerwoman` `librarian` `investigator` `empath`
`fortune_teller` `undertaker` `ravenkeeper` `clockmaker` `dreamer` `mathematician`
`flowergirl` `town_crier` `oracle` `savant` `sage` `seamstress` `chambermaid`

两种态：`poisoned`（`seats[0].isPoisoned = true`）、`drunk`（`seats[0].isDrunk = true`）。

每个 `it` 断言 **5 条**：

1. `isSeatDisabled(seats[0], seats) === true`（唯一权威判据）
2. `ctx.meta.abilityEffective === false`
3. `ctx.meta.isCorrupted === true`
4. 若 `ctx.meta.abilityResultTrue !== undefined` ⇒ `ctx.meta.abilityResult !== ctx.meta.abilityResultTrue`
   若 `ctx.meta.displayInfo?.isCorrupted !== undefined` ⇒ 必须为 `true`
5. `ctx.aborted` 允许 `false` 或 `true`；若为 `true` 则 `ctx.abortReason` 必须非空**且**
   含「中毒 / 醉酒 / 失能 / 无目标 / 未选择」之一（不得静默中止）

### 造场

- `board([...])` 座位 0 是被测角色，后面放**不干扰**的邻居：
  `poisoner`（1 号）、`soldier`（2 号）、`imp`（3 号）、`butler`（4 号）、再补一个镇民（5 号，按被测角色避开重复）
  共 6 人。
- **绝对不要放 `vortox`**（本文件不测涡流，混进来会让假值判据失去意义）。
- 首夜角色（`chef` `librarian` `washerwoman` `investigator` `clockmaker`）传
  `{ night: 1, phase: "firstNight" }`，其余传 `{ night: 2 }`。
- 需要目标/上下文的角色：
  - `fortune_teller` → `targets: [1, 2]`
  - `dreamer` → `targets: [1]`
  - `seamstress` → `targets: [1]`
  - `chambermaid` → `targets: [1]`
  - `ravenkeeper` → `targets: [1]`，且 `snapshot: { deadThisNight: [0] }`
    （⚠️ 若实测字段名不是 `deadThisNight`，用 `deadSeatsFromNightReport` 产出同形状；
     拿不准就跳过 snapshot，让 `aborted === true` 走第 5 条放行）
  - `undertaker` → `snapshot: { executedToday: 1 }`（同理，拿不准就走 aborted 放行）
  - `flowergirl` → `snapshot: { executedToday: 1 }`
  - 其余角色不传 targets
- 每个 `it` 之前 `resetLimitedAbilityUses()`：用文件顶部 `beforeEach`，照抄 truth_matrix 的写法。

### 关键约束

- **不要**用参数化 `it.each` 之外的抽象把 36 条压成 1 条 —— 必须 36 个可见用例名，
  名字格式：`${roleId} 中毒 ⇒ 信息必须被标记受干扰` / `${roleId} 醉酒 ⇒ …`。
- 如果某个角色连 `meta.isCorrupted` 都没有 ⇒ **这是真缺陷**：
  用 `it.fail(true, "…原因…")` 登记（vitest 4 里 `it.fail` 等价 `it.fails`? —— 用
  `it.fail` 若类型不存在，改用 `it("…", () => { expect.soft(...)}` 不行；
  **正确做法**：`it.fail("${roleId} 中毒 ⇒ 缺 isCorrupted（真缺陷）", () => { ... })`。
  若 `it.fail` 不是合法 API，就用 `it.skip` **并在名字前缀 `[缺口]`** 且文件末注释写清；
  优先确认 vitest 版本支持 `it.fail`（本项目 vitest 4.1.0 支持 `it.fail`）。
- 允许把 18 个角色放进一个 `ROLES` 常量数组用 `for` 循环生成 `it`（仍然是 36 个独立用例）。

## 5. 禁止

- 不得修改任何既有测试文件；不得删除/跳过既有用例。
- 不得改 `src/` 下的产品代码（本轮只写测试）。发现真缺陷 → `it.fail` 登记 + 注释写根因。
- 不得 `npm run build`（dev server 在跑，会写坏 `.next`）。
- 不得用 `it.skip` 掩盖能力缺失（只有 API 不存在时才允许，且必须写注释）。

## 6. 完成前自检（必须自己跑并把结果贴出来）

1. `npx tsc --noEmit` → 0 错
2. `npx vitest run src/roles/__tests__/info_disabled_matrix.test.ts --reporter=dot` → 全绿（36 passed；如有 `it.fail` 也计为通过但要在末尾报告数量）
3. 最后输出一行：`DONE x03=<passed>/36 failed=<n> registeredGaps=<n>`
