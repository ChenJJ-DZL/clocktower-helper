# 派单 brief · 逐角色 E2E 场景（8 个剧本，按模板复刻）

> 仓库根：`C:\Users\chenj\WorkBuddy\血染说书人\clocktower-helper`
> 已就绪：dev server 跑在 `http://127.0.0.1:3100`（**不要自己再起 server，也不要 build**）

---

## 0. 强制输出协议（违反即视为未完成）

1. 每条回复的思考 ≤ 150 字；
2. **一条回复只做一个动作**（写 1 个文件，或跑 1 条命令）；
3. 不要重新读整个仓库：下面已经把 API 与数据源写全了；
4. **本条回复必须直接调用 `write_file`**，不要输出解释性长文。

---

## 1. 要复刻的模板（先读这两个文件，只读一次）

| 文件 | 作用 |
|---|---|
| `e2e/helpers/scenario.ts` | 定向驱动器（开局 / 逐夜选目标 / 黄昏提名处决） |
| `e2e/trouble_brewing/role_scenarios.spec.ts` | **暗流涌动 22 角色模板**，照这个形状写 |

驱动器 API（**只用这几个，不要自己写新的 in-page 驱动**）：

```ts
bootScene(page, { script, players, seed, lineup })  // 开局到首夜，返回快照
driveNight(page, picks, opts?)                      // 跑完一夜，返回 { status, steps, stuck }
driveDusk(page, { nominator?, nominee?, voters?, decision? }) // 黄昏→夜里
seatOf(snap, roleId)   // 角色 id → 座位（0 基）
stepsOf(report, role)  // 某角色在这一夜的所有步骤（含弹窗全文）
readSnapshotSafe / waitForSnapshot / readLiveEndState（终局只能读 DOM）
```

`NightPick` 字段：`role`（角色 id）、`nth`、`targets`（座位号 **1 基**）、
`substitute`（说书人修正弹窗选谁）、`roleChoice`（角色选择器）、`note`。

---

## 2. 数据源（唯一）

`outputs/scenes.json`：每个剧本两到四场，字段 `scripts[i].{script, games[j].{id, seed, players, seats[].id}}`。
**阵容必须用 `games[j].seats.map(s => s.id)` 原样注入**（长度必须 = players），否则配比校验会拦。

---

## 3. 每个剧本要覆盖的角色（一个都不能漏）

| 剧本 | 场次 | 角色 id |
|---|---|---|
| 无上愉悦 | S16/S17 | washerwoman, investigator, chef, librarian, empath, fortune_teller, monk, butler, drunk, poisoner, scarlet_woman, imp, ravenkeeper, recluse, baron, zombuul |
| 无名之墓 | S14/S15 | undertaker, gambler, savant, gossip, artist, juggler, clockmaker, oracle, scapegoat, drunk, mutant, baron, poisoner, assassin, shabaloth, sailor, farmer, fool, zombuul |
| 窃窃私语 | S11/S12/S13 | chambermaid, gossip, oracle, mathematician, artist, flowergirl, innkeeper, saint, recluse, spy, witch, vortox, fool, politician, plague_doctor, assassin, po, devils_advocate, zombuul |
| 游园惊梦 | S21–S24 | clockmaker, dreamer, mathematician, flowergirl, oracle, savant, seamstress, artist, mutant, sweetheart, barber, witch, cerenovus, pit_hag, fang_gu, sage, klutz, vigormortis, no_dashii, vortox |
| 凶宅魅影 | S18–S20 | balloonist, mathematician, clockmaker, seamstress, juggler, philosopher, artist, town_crier, courtier, mutant, barber, witch, godfather, assassin, no_dashii, choir_boy, fool, king, saint, devils_advocate, fang_gu, pukka |
| 罂粟花开 | S25–S27 | librarian, chef, bounty_hunter, pixie, fortune_teller, monk, oracle, drunk, lunatic, mutant, snitch, cerenovus, evil_twin, baron, imp, town_crier, juggler, savant, farmer, mayor, marionette, vortox, poppy_grower, legion |
| 黯月初升 | S03–S06 | grandmother, sailor, chambermaid, exorcist, innkeeper, gambler, gossip, courtier, professor, tinker, moonchild, godfather, devils_advocate, assassin, zombuul, minstrel, tea_lady, pacifist, fool, goon, lunatic, mastermind, pukka, shabaloth, po |
| 梦殒春宵 | S07–S10 | clockmaker, dreamer, snake_charmer, mathematician, flowergirl, town_crier, oracle, savant, mutant, sweetheart, barber, evil_twin, witch, cerenovus, fang_gu, seamstress, philosopher, artist, juggler, sage, klutz, pit_hag, vigormortis, no_dashii, vortox |

---

## 4. 每条断言的写法（三类判据，缺一不可）

1. **弹窗内容**：这一步真的出现了，且文案与真值一致
   （信息类：解析 `A号和B号之中有一名是【X】` 后**回查座位真值**；普通类：`expect(dialog).toContain(角色名)`）。
2. **状态落库**：`isDead / diedAtNight / isPoisoned / isProtected / masterId / isDemonSuccessor /
   hasUsedXxxAbility / charadeRole / role.id` 等字段真的被改（用 `readSnapshotSafe`）。
3. **反证**：不该发生的没发生（例：僧侣保护的人**没死**；贞洁者本人**没死**；
   士兵被攻击**没死**；恶魔继承后**不判善良胜**）。

写断言前先跑一次探针把真实文案打出来（`console.log` + `stepsOf`），不要凭想象写正则。
已知文案样例：占卜师 `【有】/【没有】`；共情者 `你的邻座中有N名邪恶玩家`；
厨师 `场上有N对相邻的邪恶玩家`；送葬者结果页含被处决者角色名。

---

## 5. 硬规则

- ❌ 禁止 `page.waitForTimeout` 直接跟在 `.click()` 后面（棘轮 `e2e_wait_pattern_guard` 会判红）。
- ❌ 禁止 `.skip` / `.fixme` 掩盖；**只允许 `test.fail()` 且必须写理由**（默认不允许）。
- ✅ 多条断言用 `expect.soft`，一条失败不遮挡其余角色。
- ✅ 终局（`查看获胜结果` 出现）**不落快照** ⇒ 终局类断言读 `readLiveEndState` + 点开 `查看获胜结果` 读胜因。
- ✅ 「白天 → 黄昏 → 入夜」必须显式 `driveDusk(page, {})`，否则 `driveNight` 看到「第 N 天」会直接返回 0 步。
- ⚠️ 投毒者/僧侣/恶魔这类**每夜都会行动**的角色，必须显式给 `targets`，
  否则驱动器按「第一个可选座位」选人，可能毒到/保护到你要测的那个人（实测已踩 3 次）。
- ⚠️ 若某个角色的能力是「说书人可选」（如气球驾驶员配比、教父 ±1），
  断言写成**不变量**（两种分支都成立的那条），不要写死分支。

---

## 6. 改产品代码的边界

- **默认不改 `src/`**。若某角色在应用里真的跑不通（点不动、状态不落库、文案与规则矛盾），
  先**保留证据**（弹窗全文 + 快照字段 + 你点了几次），再判断是不是真 bug。
- 确认是真 bug 才改，并且：改动处写中文注释说明「现象 / 根因 / 修法」，日期写 `2026-10-21`。
- 不许为了「让用例变绿」放宽断言或删断言。

---

## 7. 验收（必须自己跑绿）

```
npx playwright test e2e/<目录>/role_scenarios.spec.ts --retries=0 --timeout=300000
```

- 必须 **N passed / 0 failed**；
- 输出里要能看到每个角色名（test 名或 assert message 里带角色名）；
- 跑完后回报：通过数、耗时、覆盖到的角色清单、**发现的真 bug（若有）**。

---

## 8. 交付格式（最后一次回复）

```
DONE <剧本名>
文件: e2e/<目录>/role_scenarios.spec.ts
用例: N 个 test / 覆盖 M 个角色
结果: N passed (Xm Ys)
改动 src/: 无 | 具体文件（原因）
发现的 bug: 无 | 列表（现象 + 证据）
未覆盖/降级断言: 无 | 角色名（原因）
```
