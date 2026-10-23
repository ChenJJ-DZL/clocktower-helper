# 任务：新增 X04「旅行者 15 + 传奇 14」矩阵测试（29 条）

项目根：`/c/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`
dev server 已在 `127.0.0.1:3100` 运行 —— **不要重启、不要 build**。

---

## 0. 强制输出协议（违反视为失败）

1. 每条回复的思考 ≤ 150 字。
2. 一条回复只做一个动作（写 1 个文件 或 跑 1 条命令）。
3. 禁止再 grep / glob / read，除了下面列出的 **3 个参考文件各读 1 次**。
4. 禁止派子代理。
5. **第一条回复直接 `write_file` 写 `src/utils/__tests__/traveler_fabled_matrix.test.ts`**。
6. 不得 git add / git commit。

---

## 1. 唯一产出

新文件：`src/utils/__tests__/traveler_fabled_matrix.test.ts`

**纯 vitest，不写 E2E**（UI 可达性由既有 `e2e/twilight_traveler.spec.ts` /
`e2e/regression/fabled_traveler_flow.spec.ts` 覆盖，本文件只验规则函数与数据契约）。

## 2. 参考（每个只读 1 次）

- `src/utils/travelerHooks.ts` —— 全部被测算法的实现与文档注释（读它，不要读别的）
- `app/data.ts` 的 `FABLED_ROLES`（约 2210 行起）与 `TRAVELER_ROLES`（约 2364 行起）
- `src/utils/seatAlignment.ts` 的 `isPlayerEvil` 签名

## 3. 旅行者 15 条（X04-T-01…15）

id 顺序（**必须一条一个 `it`，名字带编号**）：
```
bureaucrat 官员 / beggar 乞丐 / gunslinger 枪手 / thief 窃贼 /
scapegoat_traveler 替罪羊 / butcher 屠夫 / bone_collector 集骨者 / harlot 流莺 /
barista 咖啡师 / deviant 怪咖 / apprentice 学徒 / matron 女舍监 /
voudon 巫毒师 / judge 法官 / bishop 主教
```

每条 `it("X04-T-nn <name>：槽位/阵营/处决命名空间契约")` 断言 5 条：

1. `TRAVELER_ROLES.find(r => r.id === id)` 存在，且 `role.type === "traveler"`
2. `travelerSlotId(i)` → `travelerIndexOfSlotId(...)` 往返一致（i = 0..3）
3. `listAliveTravelerSlots([null, ROLE, null, null])` 恰好 1 项，`index === 1`，
   `slotId === travelerSlotId(1)`；`hasTravelerRole([null, ROLE, null, null], id) === true`
4. `isTravelerEvil(undefined, 0) === false`；`isTravelerEvil({0:"evil"}, 0) === true`；
   `isTravelerEvil({0:"good"}, 0) === false`
5. `travelerExecutedId(i)` 的**命名空间不与座位 id 冲突**：
   `travelerIndexOfExecutedId(travelerExecutedId(i)) === i`
   且对 `i = 0..3` 逐个验证往返

## 4. 三个有真实规则的旅行者（同文件，各 1 条，也计入 15 条之外）

- **枪手** `X04-T-03b`：
  - 无枪手（`[null,null,null,null]`）⇒ `travelerGunslingerCanShoot(...) === false`
  - 有枪手 + 目标不在 `justVotedSeatIds` ⇒ `false`
  - 有枪手 + 目标在 `justVotedSeatIds` ⇒ `true`
  - `travelerGunslingerEligibleTargets` 必须等于 `justVotedSeatIds` 原样（含枪手时）
- **替罪羊** `X04-T-16`（**P0-3 验收**）：
  - 善良替罪羊 + 善良被处决者 ⇒ 非 null
  - 善良替罪羊 + 邪恶被处决者 ⇒ null
  - **邪恶替罪羊 + 邪恶被处决者 ⇒ 非 null**（这是 2026-10-16 修的核心缺陷，
    旧实现 `canScapegoatSubstitute` 永远返回 null，必须锁住）
  - 场上无替罪羊 ⇒ null
- **巫毒师** `X04-T-13b`：`voudonAllowsVoter` / `voudonSkipsGhostVote` / `voudonThreshold`
  各给 1 正 1 反（参数含义见实现注释，不许猜；读不懂就用实现里的默认值）

## 5. 传奇 14 条（X04-F-01…14）

id 顺序：
```
spirit_of_ivory 圣洁之魂 / sentinel 哨兵 / revolutionary 革命家 / doomsayer 末日使者 /
fibbin 佛吉 / hells_librarian 地狱图书管理员 / buddhist 佛教徒 / angel 天使 /
deus_ex_fiasco 失败的上帝 / ferryman 摆渡人 / toymaker 玩具匠 / fiddler 小提琴手 /
duchess 公爵夫人 / djinn 灯神
```

每条 `it("X04-F-nn <name>：数据完整 + 不入夜序 + 不占旅行者槽")` 断言：

1. `FABLED_ROLES.find(r => r.id === id)` 存在，`type === "fabled"`
2. `name` 非空、`description` 或 `ability` 至少一个非空（字段名以 `Role` 类型为准）
3. **不入夜序**：`roleHasNightAction(id) === false`
   （from `src/utils/dynamicQueueGenerator`）
4. **不占旅行者槽**：`TRAVELER_ROLES.some(r => r.id === id) === false`

**摆渡人专项** `X04-F-10b`：
- `FABLED_ROLES` 里 `ferryman` 的 `description` 含「最后一天」或「投票」（按实际文案断言，
  不许放宽到空）
- 语义锚点：`src/contexts/GameContext.tsx` 的 `FERRYMAN_LAST_DAY` reducer 分支存在
  （用 `fs.readFileSync` + 正则断言这两处：`case "FERRYMAN_LAST_DAY"` 与
  `ferrymanLastDayResolved: true`）—— **这是静态护栏**，防止有人删掉分支，
  比"能跑"更能挡住回归。文件路径用 `path.resolve(__dirname, "../../contexts/GameContext.tsx")`
  （从 `src/utils/__tests__/` 出发是 `../../contexts/`）。

## 6. 禁止

- 不得修改任何既有测试文件、不得改 `src/` 产品代码。
- 不得用 `it.skip` / `it.fails` 掩盖失败 —— 发现真缺陷就让它红，并在文件末
  用注释写清「角色 + 现象 + 怀疑根因」。
- 不得 `npm run build`（dev server 在跑）。

## 7. 完成前自检（必须自己跑并贴结果）

1. `npx tsc --noEmit` → 0 错
2. `npx vitest run src/utils/__tests__/traveler_fabled_matrix.test.ts --reporter=dot`
3. 最后一行输出：`DONE x04-travelers=<n>/15 x04-fabled=<n>/14 extra=<n> failed=<n>`
