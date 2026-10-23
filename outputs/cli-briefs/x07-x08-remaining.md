# 任务：补齐 X07 剩余 7 条 + X08 剩余 3 条（能力级 vitest 矩阵，10 条）

项目根：`/c/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`
dev server 已在 `127.0.0.1:3100` 运行 —— **不要重启、不要 build**。

---

## 0. 强制输出协议（违反视为失败）

1. 每条回复的思考 ≤ 150 字。
2. 一条回复只做一个动作（写 1 个文件 或 跑 1 条命令）。
3. **不许 grep / glob**。允许 read 下面列出的 10 个 ability 文件，每个只读 1 次。
4. 禁止派子代理。
5. **第一条回复直接 `write_file` 写 `src/roles/__tests__/x07_x08_death_and_madness.test.ts`**。
6. 不得 git add / git commit。

---

## 1. 为什么用 vitest 而不是 E2E

X07/X08 首版已经用 E2E 做了 6 条（`e2e/special/x07_death_chain.spec.ts` /
`x08_madness.spec.ts`），剩下的条目都卡在「需要特定剧本 + 特定阵容 + 多夜驱动」，
随机性高、失败定位差。**能力级契约**能精确验「输入这个局面 ⇒ 输出必须是这样」，
比「点 200 步后看结果」强得多。

⇒ 本文件只测**能力函数**（`runRole`），不写 E2E。

## 2. 唯一产出

`src/roles/__tests__/x07_x08_death_and_madness.test.ts`

## 3. 复用现成夹具（照抄 `src/roles/__tests__/info_disabled_matrix.test.ts` 的写法）

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { board, runRole } from "./_tbHarness";
import { buildAbilityMap } from "../../utils/invariantTesting/engineConfig";
import { resetLimitedAbilityUses } from "../../utils/LimitedAbilityManager";
```

`BY_ROLE`（roleId → ability）的构造方式与那个文件第 51-59 行完全相同。

## 4. 逐条要求（10 条）

### X07-01 教授复活已死镇民
参考：`src/roles/new_engine/professor.ability.ts`
- 造 6 人盘：0 `professor`，1 `soldier`（已死 `isDead: true`），2 `poisoner`，3 `imp`，4 `chef`，5 `butler`
- `runRole(BY_ROLE.professor, seats, 0, { night: 2, targets: [1] })`
- 断言：① 目标 `isDead` 变 `false`（复活）；② `meta.abilityResult` / `stateUpdate` 里有可观测的复活记录（按实现字段名断言，不许猜：读 1 次实现确认字段）
- 反例：目标选**爪牙**（座位 2）⇒ 不得复活（官方只能复活镇民/外来者），断言 `isDead` 仍为 `true`

### X07-04 方古转化外来者
参考：`src/roles/new_engine/fang_gu.ability.ts`
- 造 6 人盘：0 `fang_gu`，1 `butler`（外来者），2 `chef`，3 `soldier`，4 `poisoner`，5 `imp`
- `runRole(BY_ROLE.fang_gu, seats, 0, { night: 2, targets: [1] })`
- 断言：① 外来者存活（方古是「替死」，不是杀死）；② 目标被标记为邪恶方（按实现字段断言，通常是 `isEvilConverted === true`）；③ **仅一次**：同局再跑一次同目标 ⇒ 不得二次转化（看实现是否用 `fangGuUsed` / `hasUsedAbility` 之类字段，读 1 次确认）

### X07-05 理发师死亡换角色
参考：`src/roles/new_engine/barber.ability.ts`
- 造 6 人盘：0 `barber`，1 `chef`，2 `soldier`，3 `poisoner`，4 `imp`，5 `butler`
- 触发死亡：`seats[0].isDead = true`（若实现看 `diedAtNight`，读 1 次确认后用它）
- `runRole(BY_ROLE.barber, seats, 0, { night: 2, targets: [1, 2] })`
- 断言：① 两人角色互换（`seats[1].role.id === "soldier"` && `seats[2].role.id === "chef"`）；
  ② 反例：目标选**恶魔**（座位 4）⇒ 必须拒绝（`aborted === true` 或角色未变），不得把恶魔换走

### X07-07 月之子 / 呆瓜「得知自己死亡」
参考：`src/roles/new_engine/moonchild.ability.ts`、`src/roles/new_engine/klutz.ability.ts`
- 月之子：造 5 人盘，`seats[0].diedAtNight = 2`（或实现用的字段），断言 `meta.displayInfo` 非空且含「死亡/得知」类信息（按实现文案断言）
- 呆瓜：`runRole(BY_ROLE.klutz, seats, 0, { targets: [1] })`（选一名玩家），断言 `meta.abilityResult` 记录了所选目标；**并断言「选邪恶 ⇒ 其阵营落败」的判据函数存在**：
  若实现里有 `klutzLosesGame` / `isKlutzEvilChoice` 之类导出，直接调它正反各 1 次；
  若没有 ⇒ 这一半用 `it.fails` 登记为缺陷，并在文件末写清「呆瓜选邪恶不会导致阵营落败」

### X07-08b/c/d 刺客穿透保护（士兵 / 旅店老板 / 僧侣 / 茶艺师，4 个目标一次验完）
参考：`src/roles/new_engine/assassin.ability.ts` + `src/roles/new_engine/soldier.ability.ts`
- 思路：刺客的能力必须**无视保护**。构造「目标带保护」的座位，跑刺客能力，断言目标 `isDead === true`
- 保护来源按实现字段构造，逐个验：
  - 士兵：`soldier` 自带 `isProtected` / `hasAbilityEvenDead`（读 1 次 `soldier.ability.ts` 确认它靠什么免疫）
  - 旅店老板 / 僧侣：`statusEffects: [{ type: "protected" }]`（若实现用别的类型名，读 1 次确认）
  - 茶艺师：`tea_lady` 的「healthy」判定
- 断言：4 个目标 `isDead === true`，且 `meta.abilityResult` 有击杀记录
- ⚠️ 如果某个保护在**引擎层**（不是刺客层）实现，刺客能力单跑不会经过它 ⇒ 那条改为断言
  「刺客能力**不读**保护字段」（`aborted === false` 且目标死亡），并在注释里说明覆盖边界

### X07-11 死亡同时触发多能力（祖母 + 心上人 + 农夫）
参考：`src/roles/new_engine/grandmother.ability.ts`、`src/roles/new_engine/sweetheart.ability.ts`、`src/roles/new_engine/farmer.ability.ts`
- 不做整局，直接**依次**跑三个能力，输入同一份「某人当夜死亡」的座位表
- 断言：① 祖母：`grandchildId` 存在且孙子死亡时 `meta.abilityResult` 标记「祖母也死」；
  ② 心上人：死亡触发后**另一名**玩家 `isDrunk === true`（或实现字段）；
  ③ 农夫：一名存活善良玩家角色变成 `farmer`
- **关键**：三条依次跑完后，重读 `seats`，断言三处改动**同时存在**（不许后一条覆盖前一条）

### X08-03 小精灵疯狂证明自己是某镇民
参考：`src/roles/new_engine/pixie.ability.ts`
- 首夜：`runRole(BY_ROLE.pixie, seats, 0, { night: 1, phase: "firstNight" })`
- 断言：① `meta.abilityResult` 记录了「被模仿的镇民 id」；
  ② 该镇民死亡时 pixie 获得其能力 —— 按实现字段断言（可能是 `grantedAbility` / `hasAbilityEvenDead`），
  若实现只在「角色死亡事件」里处理（能力本身拿不到）⇒ 用 `it.fails` 登记并写清缺哪一段

### X08-04 疯狂 + 涡流同场（疯狂判定不受涡流影响）
参考：`src/utils/corruptedInfo.ts` 的 `shouldUiRemaskForCorruption` / `classifyCorruptedInfoRole`
- 断言：涡流世界下，`shouldUiRemaskForCorruption` 对**非信息角色**（如 `cerenovus` 洗脑师本身）返回 false；
  对信息角色返回 true
- 再断言：疯狂是**行为判定**，不是信息产出 ⇒ `classifyCorruptedInfoRole("cerenovus")` 必须为 null / 不参与假值
  （具体返回值读 1 次实现确认；断言「不是 number/boolean/targets/text 四种信息形态」）

### X08-02 畸形秀演员（**不写新用例**）
- 已由 `e2e/…` 门禁覆盖；本文件只在末尾注释登记复用位置，不写 `it`

## 5. 禁止

- 不得改既有测试、不得改 `src/` 产品代码。
- 不得 `it.skip`。真缺陷用 `it.fails` + 文件末注释（写清角色 / 现象 / 怀疑根因）。
- 不得 `npm run build`。

## 6. 完成前自检（必须自己跑并贴结果）

1. `npx tsc --noEmit` → 0 错
2. `npx vitest run src/roles/__tests__/x07_x08_death_and_madness.test.ts --reporter=dot`
3. 最后一行：`DONE x07=<n>/7 x08=<n>/3 failed=<n> registeredGaps=<n>`
