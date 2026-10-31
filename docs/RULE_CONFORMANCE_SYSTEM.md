# 规则一致性系统（Rule Conformance）

> **目标**：不再依赖「人工逐一测试 + 用户反馈」来判断实现是否符合官方规则，而是把
> **官方规则 → 项目实现 → 测试证据**做成可自动执行、可量化、可棘轮的门禁系统。
>
> **状态（2026-11-01 第二轮更新）**：L0–L7 **全部落地** ——
> 官方规范抽取 + 全量静态审计（类型/夜序/实现/证据）+ 台账棘轮 CI；
> **L3 语义原子层**（官方能力文本 ⇄ 实现元数据）、**官方范例 Oracle**（已编码 97/438 条可执行夹具，
> 并新增表驱动 runner）、**L4 整局随机仿真**（12 局 × 4 夜 · 246 动作 · 0 违例，进台账 + 棘轮）、
> **L5 变异测试**（23 条基线 · **23/23 = 100%**，并把分数纳入棘轮下限）、
> **L6 E2E 断言型覆盖**（reach → assert：94/172 角色在带 `expect` 的 test 块里被断言）、
> **L7 判胜审计**（`winAudit` 运行时留痕 + `window.__ctWinAudit` 现场取证）。
> 手工测试交接见[第九节](#九人工测试交接)。
>
> 配套：判胜层的「失败关闭 + reasonCode/evidence + 属性测试 + 用户报障夹具」见
> [POSTMORTEM_AND_ENGINEERING_GUIDELINES.md](./POSTMORTEM_AND_ENGINEERING_GUIDELINES.md) 第六章。

---

## 一、为什么"人工测试 + 用户反馈"永远追不上

本项目的规则面规模是：

| 维度 | 规模（实测） |
| :--- | ---: |
| 官方唯一角色（`json/full/*.json` 去重后） | **232** |
| 官方能力原文 / 官方范例 | 232 条 / **438 条** |
| 项目角色表（`app/data.ts::roles`） | **174** |
| 新引擎能力注册（`abilityRegistry`） | **219** |
| 内置剧本 | 9 |
| 官方能力类型标签（结构化，如「死亡触发能力」「获得能力」） | 33 种 |

组合空间（角色 × 中毒/醉酒 × 目标存活/死亡 × 阵营转换 × 触发时点 × 胜负条件）
不是人工逐条点能覆盖的。用户反馈的致命缺陷（例如「处决 15号-小精灵被误判为处决善良双子」）
的共同点是：**不会让页面白屏、普通单测也测不到**，只有把"官方规则"本身作为 oracle
才能系统性发现。

所以核心思路不是"多写测试"，而是：

> **把官方规则变成机器可读规范（spec），把实现变成可枚举清单（impl），
> 把测试变成证据（evidence），三方对账 + 棘轮，任何偏差都自动变红。**

---

## 二、总体架构（7 层）

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ L0 官方规范层    json/full/*.json（只读真源）→ 去重/归一化 → official_spec  │
│   ✔ 已落地：scripts/conformance/extract-spec.ts                            │
├────────────────────────────────────────────────────────────────────────────┤
│ L1 静态一致性层  角色集 / 类型 / 官方夜序 / 能力注册 / 测试入口 全量对账    │
│   ✔ 已落地：scripts/conformance/audit.ts（本次发现 1 P0 + 5 P1）           │
├────────────────────────────────────────────────────────────────────────────┤
│ L2 台账与棘轮层  逐角色 ledger + baseline（新偏差/覆盖下降即 CI 红）       │
│   ✔ 已落地：outputs/rule_conformance/baseline.json + vitest 门禁           │
├────────────────────────────────────────────────────────────────────────────┤
│ L3 语义一致性层  官方能力文本 → 规则原子；官方范例 → 可执行 Oracle 夹具   │
│   ✔ 已落地：lib/ruleAtoms.ts（36 条 review）+ tests/conformance（46/438）  │
├────────────────────────────────────────────────────────────────────────────┤
│ L4 属性/模糊层   整局随机仿真（不变式 I1–I11）→ 台账 + 棘轮（违例只许下降）    │
│   ✔ 已落地：scripts/conformance/fuzz.ts + lib/fuzzRunner.ts（12 局 0 违例）    │
├────────────────────────────────────────────────────────────────────────────┤
│ L5 变异测试层   对能力/判胜代码注入变异，测"测试是否真的验证了语义"            │
│   ✔ 已落地：scripts/conformance/mutation.ts（23 条 · 23/23 = 100%）           │
├────────────────────────────────────────────────────────────────────────────┤
│ L6 UI/E2E 层    reach → assert：每个角色是否有**带断言的** test 块覆盖          │
│   ◐ 已落地度量：e2e-assertions.ts（237 test 块 / 796 expect / 94 角色被断言）  │
├────────────────────────────────────────────────────────────────────────────┤
│ L7 生产反馈层   reasonCode/evidence 运行时审计留痕 + 用户报障→回归夹具          │
│   ✔ 已落地：winConditions/winAudit.ts（window.__ctWinAudit + 告警）           │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 三、已落地部分（L0–L5）

### 3.1 L0：官方规范抽取

`scripts/conformance/extract-spec.ts` → `outputs/rule_conformance/official_spec.json`

把 wikic dump（`json/full/*.json`，**受保护，只读**）归一化为：

```ts
interface OfficialRoleSpec {
  nameCn; nameEn;                 // 官方中/英文名
  type; typeRaw;                  // 归一化类型 + 官方原文类型
  firstNightOrder; otherNightOrder; // 数字 / "cannot_act" / null 三态
  capabilityTags: string[];        // 官方结构化能力类型（33 种标签）
  abilityText: string;             // 官方角色能力原文
  examples: string[];              // 官方范例（可执行 oracle 的来源）
  storytellerOps / reminderTokens / rulesDetail;
  sourceFiles; sourceRecordCount;  // 可追溯（合并了哪些重复记录）
}
```

实测统计：**580 条原始记录 → 464 条有效 → 232 个唯一角色**（合并 171 个重复角色、
丢弃 116 条被污染记录）；232 个角色全部有官方能力原文，**438 条官方范例**已抽取。

### 3.2 L1：全量静态审计

`scripts/conformance/audit.ts`（也可 `npm run conformance:audit`）：

| 检查项 | 判定方式 | 严重度 |
| :--- | :--- | :--- |
| 角色集覆盖 | 内置剧本角色 ↔ 官方规范（多级映射：英文 id → 去变体后缀 → 中文名） | P1/INFO |
| 类型/阵营 | 官方 `类型` vs `app/data.ts::roles[].type` | **P0** |
| 官方夜序 | 官方首夜/其他夜数字 vs 能力 `firstNightPriority/otherNightPriority` | P1 |
| 能力注册 | 角色是否有新引擎能力（无则标记 legacy 待登记） | P2 |
| 官方角色未实现 | 官方属于内置剧本但项目角色表没有 | INFO（路线图） |
| 测试入口 | 角色 id/中文名在 `src/**/__tests__`、`tests`、`e2e` 中的引用数 | P2 |

**避免"假阳性污染信任"的判定规则**（已实现在 `lib/audit.ts`）：

1. **变体角色**（`professor_female` ↔ `professor`）通过去后缀匹配 ⇒ 类型/夜序差异只登记 INFO；
2. **被动能力**（`passive/on_death/on_day`，不参与夜间唤醒）不与官方夜序数字硬比；
3. **官方数据自相矛盾**（夜序写「无法行动」但能力原文写「每个夜晚」，典型如旅行者官员/窃贼）
   ⇒ INFO「需人审/说书人裁定」，不判对错；
4. 官方未收录/无法比对 ⇒ `null`（**不假装通过**，也不误报），与判胜层的 fail-closed 同源。

### 3.3 L2：台账 + 棘轮（CI 门禁）

- `outputs/rule_conformance/ledger.json`：逐角色台账（映射方式、类型、夜序、能力、
  官方范例数、测试引用数、E2E 场次、findings 列表）。
- `outputs/rule_conformance/report.md`：人读报告（结论、覆盖指标、剧本维度、
  能力标签维度、findings 聚合、棘轮状态、复现命令）。
- `outputs/rule_conformance/baseline.json`（**提交到仓库**）：finding 签名集合 + 覆盖指标快照。
- `src/utils/__tests__/rule_conformance.test.ts`：CI 门禁 ——
  **新 finding = 红；覆盖指标下降 = 红；已知债务（基线内）显式列出但不阻塞**，
  `--strict` 可用于发版门禁（有任何 P0 即失败）。

当前基线（L0–L5 集成后实测，`npm run conformance:audit`）：

| 指标 | 数值 |
| :--- | ---: |
| 官方角色 / 项目角色 / 已映射 | 232 / 174 / **169** |
| 类型可比 / 不一致（P0） | 169 / **0** |
| 首夜 + 其他夜**审计覆盖**（硬比对 / 显式裁定） | 114（68 / 46）· 114（64 / 50） |
| 夜序不一致（P1） | **0** |
| 内置剧本角色缺官方规范（P1） | **0** |
| 官方角色未实现（INFO 路线图） | 33（扩展/自定义剧本角色） |
| 无新引擎能力的角色（P2 → waiver 台账登记理由） | 14（旅行者/自定义） |
| 有测试入口的角色（reach 口径） | 174 / 174 |
| **E2E 断言型覆盖（L6）** | **94 / 172**（237 test 块 · 796 条 expect） |
| L3 语义原子层 review findings | **36**（P2/INFO 元数据口径；1 条真实缺口已 waiver） |
| L3 官方范例已编码 / 总数 | **81 / 438（22.1%）** |
| **L4 整局随机仿真** | **12 局 × 4 夜 · 246 动作 · 违例 0** |
| **L5 变异测试被杀 / 总数** | **23 / 23（100%）** |
| 人审 waiver（显式裁定，非静默放过） | 16 项（`scripts/conformance/waivers.json`） |

> ⚠️ "有测试入口" ≠ "语义被验证"。这是台账的**入口指标**；语义证明由
> L3 语义原子层 + 官方范例夹具 + L4 整局仿真 + L5 变异分数共同承担，
> L6 则把"入口"进一步收紧成"带断言的 test 块"。

### 3.3.1 棘轮基线格式 v2（2026-11-01 迁移）

签名从 `check|roleId` 升级为 `severity|check|roleId`：

- **为什么**：只有带上 severity，才能发现「waiver 被移除 ⇒ 严重度从 INFO 回升到 P0」这类回归；
- **失败关闭**：读到旧格式基线时 `compareWithBaseline()` 返回 `needsMigration: true` 且
  **不产出任何 diff**（不允许"看起来新增 0 条"的假绿），CI 门禁直接红；
- **迁移工具**：`npx tsx scripts/conformance/audit.ts --migrate-baseline [--accept-new]`
  只做「同 `check|role` 换前缀」的机械变换；无法唯一对齐的旧签名进 `ambiguous` 并**拒绝落盘**，
  当前新增项单独列出、必须显式 `--accept-new` 才写入（本次迁移：机械 56 / 真实修复 7 / 新增 39，全部人工过目）。

### 3.3.2 夜序指标改用「审计覆盖」

`firstNightComparable` 单看会误伤：把一条**误报**改成显式裁定（INFO）后，可比数会下降。
因此棘轮口径改为 `firstNightAudited / otherNightAudited = 硬比对 + 显式裁定`，
硬比对与裁定数仍分列展示（68 / 46 与 64 / 50），既不掩盖"断言变弱"，也不惩罚"消除误报"。

### 3.4 L3：语义原子层（官方能力文本 ⇄ 实现元数据）

`scripts/conformance/lib/ruleAtoms.ts` 把官方 **232 条能力原文**解析为保守的规则原子
（宁可 null 不猜）：`triggersNight(firstNight/everyNight/oncePerGame)`、`onDeath/onExecution/onNomination/`
`targetCount/targetKind/allowSelf/allowDead`、`persistsAfterDeath`、`droisonImmune`、
`winLoss`、`setupAdjustment`、`grantAbility`、`registration`、`limitOncePerGame`、`infoRole`……

`runSemanticAudit(spec, impl)` 对 161 个可映射角色做对账，输出 36 条 review findings：
- **触发类**（触发时点未在 `triggerTiming` 声明）默认按「元数据缺口」计 **P2**（实现可能经
  legacy/gameLogic 路径生效；真狼人/被动描述会误报，交人审/waiver）；
- **判胜类**（官方有胜负能力但 `winReasonCodes` 无对应 code）为 **P1**（判胜必须可溯源）；
- 目标数量/self/dead 口径差异计 P2；设置调整类无 setup 元数据计 INFO。

### 3.5 L3：官方范例 Oracle（`tests/conformance/`）

官方 wiki 的 438 条【范例】是最权威的行为 Oracle：
- `scripts/conformance/lib/examples.ts`：`loadOfficialExamples` / `scanEncodedExamples` / `exampleCoverage`
  （稳定 id `<角色名>#<idx>`，注释 `// 官方范例: 角色 #idx` 自动对账）；
- `tests/conformance/examples/**`：**97 条真实可执行夹具**（逐条经 `runFullAbilityPipeline` /
  `runAbilityPipeline` / `checkGameEnd` 断言状态/信息/胜负），覆盖 TB 22 角色 + 镜像双子/呆瓜/吟游诗人/罂粟花开等；
- **表驱动 runner（本轮新增）**：`_oracle.ts` 把「造座位 → 取能力 → 跑管道 → 断言」收敛成
  `{ id, roleId, seats, targets, check }` 数据行，一条范例 ≈ 10 行；`tb_oracle_batch.test.ts` 是本轮批次。
  未来补 L3 覆盖率直接往表里加行，不要再复制样板；
- **已核实偏差登记**：`known_deviations.test.ts` 用 `it.fails` 钉住"当前确实不符合官方"的规则
  （修好后用例自动转红，强制转正），本轮登记 1 条（图书管理员#1：陌客被登记为爪牙时应收「0」，
  `librarian.ability.ts::getOutsiderCandidates` 未消费 `registerAs*`）；
- `scripts/conformance/examples-ledger.ts`：覆盖率台账（97/438 = 22.1%，暗流涌动 87 条中 54 条）；
- 官方范例的**行为偏差会被夹具直接暴露**（本轮借此发现并登记上述 1 条产品缺口）。

#### 覆盖率口径与剩余工作量（诚实版）

- 当前 **97/438 = 22.1%**；按剧本：暗流涌动 **54/87（62.1%）**、梦殒春宵 17/80、黯月初升 24/79、无上愉悦 2/12，其余 0。
- **分母是官方条目数，不是唯一文本数**：438 条里 54 条是「角色 / 角色（实验角色）」完全重复登记
  （去重后唯一文本 383 条），因此一条夹具可同时登记两个 id（同一条规则的两个官方条目）。
- **可编码上限 410 条**（28 条属于项目未实现的官方角色，无法产出可执行夹具）。
- **不硬编码的两类**（宁可算"未覆盖"，也不做假绿）：
  1. **说书人任选**：酒鬼/中毒信息内容、洗衣妇报哪名玩家、陌客被登记成什么 —— 官方原文本身给的是
     「可能的一种结果」，写成固定期望等于把说书人的自由选择判成规则；
  2. **多步叙事**：处决→阵营转换→再击杀这类跨阶段场景，当前能力管道装不下，
     需要场景级 harness（与 L6 的 Playwright 场景共用投资）。
- 距 S4 的 60%（263 条）还差 **166 条**；本轮产能 **+22 → +8 条/批**（判据类密集时可到 20+，叙事类只能逐条啃），
  按同产能还需约 9～20 批。推进顺序：内置 9 剧本（玩家实际会玩到的）→ 实验角色重复条目 → 多步叙事（待 harness）。

### 3.6 L5：变异测试（`scripts/conformance/mutation.ts`）

- **23 条**高质量变异覆盖判胜分支（`app/gameLogic.ts`）、双子严格解析（evilTwinHelper）、
  判胜注册表（`winReasonCodes`）、**判胜审计（`winAudit`）**、能力文件（saint/imp/monk/spy/drunk/poppy 等）；
- 安全执行器：现读现备 + sha256 校验 + find 唯一性 + 失败/超时也恢复 + 冲突即停；
- 指标：**mutation score = 被杀变异 / 总数**（当前 **23/23 = 100%**，0 冲突、全部文件 hash 已恢复）；
- **纳入棘轮下限**：`metrics.mutationKilled` 进 `COVERAGE_METRICS`（只许上升）；
  该指标属于 `EVIDENCE_GATED_METRICS`——未跑变异时值为 0 视为"本次未测量"并跳过判定，
  避免 fresh clone / CI（不跑 60s 变异）被误判成覆盖率下降；
- 存活变异 = 该规则语义没被测试钉住 ⇒ 自动生成"待补测试清单"。
  本轮据此补掉最后一条存活变异：`wr2-required-evidence-cleared` 的 tests 里补上
  `win_reason_registry_contract.test.ts`（原先只跑 `winReasonMatrix`，漏了"注册表声明本身"的断言）。

### 3.7 人审 waiver 台账（`scripts/conformance/waivers.json`）

对"不是 bug 但确实与官方不同"的差异（例：官方旅行者替罪羊被项目作为剧本角色位承载；
旅行者能力走 legacy/travelerHooks；自定义角色；官方数据自相矛盾）：
必须登记 `check + roleId/roleNameCn + reason + owner + date`；审计将命中项降级 `INFO + waived=true`
并列入报告；棘轮签名包含 severity，**waiver 被移除会导致严重度回升 → CI 直接红**，不允许静默放过。

### 3.8 常用命令

```bash
npm run conformance:spec        # 1) 官方规范抽取 → outputs/rule_conformance/official_spec.json
npm run conformance:audit       # 2) 全量对账（L0-L6）+ 棘轮比对（人读报告 report.md）
npm run conformance:semantic    # 3) 语义原子层独立审计（semantic_findings.json）
npm run conformance:examples    # 4) 官方范例编码覆盖率台账
npm run conformance:mutation    # 5) 变异测试（安全执行器，约 80s；--dry-run / --only=）
npm run conformance:fuzz        # 6) L4 整局随机仿真（默认 2 池 × 6 局 × 4 夜，约 2s）
npm run conformance:e2e         # 7) L6 E2E 断言型覆盖台账
npm run conformance:baseline    # 8) 人审后更新棘轮基线（修复/新增官方数据时）
npx tsx scripts/conformance/audit.ts --migrate-baseline --accept-new   # 旧格式基线一次性迁移
npx vitest run src/utils/__tests__/rule_conformance.test.ts   # CI 门禁（含 L4 fuzz + L6 指标）
```

### 3.9 L4：整局随机仿真进台账（`fuzz.ts` + `lib/fuzzRunner.ts`）

- 复用既有 `src/utils/invariantTesting/stressTest.ts::runStressGame`（随机盘面 → 连续 N 夜全量夜序 →
  I1–I11 不变式），**不新造引擎**；`fuzzRunner.ts` 是唯一执行逻辑，CLI 与 CI 门禁共用同一份配置
  （避免"CLI 跑 12 局、门禁跑 2 局"两个口径）；
- 台账指标：`fuzzGames / fuzzActions / fuzzViolations`；前两者进"只许上升"，`fuzzViolations`
  进 `INVERSE_COVERAGE_METRICS`（**上升即回归**）；
- 当前：**12 局 × 4 夜 · 246 个动作 · 违例 0**；
- 🔴 每一局都必须 `resetLimitedAbilityUses()`：限次能力是模块级单例，跨局累积会让第 2 局起
  `preCheck` 直接拒绝 ⇒ 动作数骤降、"违例 0"变成假绿。门禁因此同时断言
  `fuzzGames ≥ 6 且 fuzzActions > 80`（防空转断言）。

### 3.10 L6：E2E 从"有入口"到"有断言"（`e2e-assertions.ts`）

- `outputs/coverage_ledger.json` 的 `seen` 是 **reach** 口径（角色在某场整局模拟里被发到过）；
- 新口径：把 `e2e/**/*.ts` 按 `test(...)` 切块，统计「块内既有 `expect(`、又提到该角色（roleId 或中文名）」
  的块数 ⇒ `assertedBlocks > 0` 才算被断言；
- 当前：`48 个 spec · 237 个 test 块 · 796 条 expect`，**94 / 172 个角色被断言**；
- 指标 `e2eAssertionRoles` 进棘轮（只许上升），并用 `e2eAssertions > 500` +
  `e2eAssertionRoles ≤ rolesWithTestReference` 双向夹住，防止扫描口径漂移（既防空转，也防夸大）；
- 这是**保守下界**：块内提到角色名即算，不解析 AST；宁可低估，不做假绿。

### 3.11 L7：判胜审计留痕（`utils/winConditions/winAudit.ts`）

- 接入点：`app/gameLogic.ts::checkGameEnd`（实现改名 `checkGameEndCore`，对外唯一入口做审计包装）
  + `useConfirmHandlers` 的两条**绕过判胜入口**的确认弹窗路径（圣徒 / 善良双子）；
- 每条终局结果校验三件事并写入 50 条环形缓冲：`reasonCode` 是否登记、`winner` 是否与注册表 `side`
  一致（大小写不敏感，兼容 `"Good"` 与 `"good"` 两种落库形态）、`requiredEvidence` 是否齐全；
- 脏判胜：`console.warn("[win-audit] …")` + 台账留痕；**只观测不改写**（阻断已在 `makeWinResult` fail-closed）；
- 现场取证：`window.__ctWinAudit.trail() / .summary()` —— e2e 与线上复盘不需要翻控制台；
- 门禁：`winAudit.test.ts` 断言"真实判胜入口产生的每条记录都必须 `ok`"，并把审计逻辑纳入 3 条变异
  （缺原因码放过 / 不校验证据 / 大小写敏感，均被杀死）。

---

## 四、演进路线（已完成 / 下一步）

静态层、语义元数据层与变异层已交付；**技能结算的完整行为验证**仍需继续扩充官方范例夹具。
以下按投入产出排序（✅ = 已交付，🔜 = 下一步）：

### ✅ L3：官方范例 → 可执行场景（Oracle 化，已交付 97/438）

- 已把官方 438 条【范例】做成可索引台账（`lib/examples.ts`），并编码 **97 条真实夹具**
  （`tests/conformance/examples/**`），暗流涌动 22 角色全覆盖（54/87）；
- 表驱动 runner（`_oracle.ts`）已就位：后续补覆盖率直接加数据行；
- 覆盖度量已进报告（`encodedExamples` / `officialExamples`），并纳入棘轮（只许上升）；
- 下一步：按 `examples_ledger.json.missingByRole` 继续编码（暗流涌动剩 44 条 → 黯月初升/梦殒春宵），
  目标 ≥ 60%；已核实的 1 条偏差（图书管理员#1）先修产品再转正夹具。

### ✅ L4：整局随机仿真（已接入台账 + 棘轮）

- `fuzz.ts` + `lib/fuzzRunner.ts`：2 剧本池 × 6 局 × 4 夜（12 局 / 246 动作 / 0 违例），约 2s；
- 失败自动保留 `samples`（pool/seed/night/invariant/message），可直接复现；
- 下一步：扩剧本池（罂粟花开/凶宅魅影）、加"随机行动序列 + 判胜断言"的组合 fuzz。

### ✅ L5：变异测试（23 条已交付，100% 被杀，分数进棘轮）

- `scripts/conformance/mutation.ts`：23 条变异（判胜分支、双子严格解析、判胜注册表、**判胜审计**、能力文件），安全执行器自动恢复；
- 指标：`mutation score = killed/total`（23/23），并作为 `mutationKilled` 进棘轮下限；
- 下一步：扩展到更多能力文件（TB 22 → 全剧本）。

### ◐ L6：UI/E2E（断言型口径已落地，场景生成待做）

- 已有 reach 台账（`coverage_ledger`）+ **断言型台账**（`e2e_assertions.json`，94/172 角色被断言）；
- 下一步：从 `outputs/scenes.json` + 官方范例生成 Playwright 场景，
  把"被断言"进一步收紧为"（剧本 × 角色）至少 1 条断言型 E2E"。

### ✅ L7：生产反馈闭环（判胜审计已落地）

- 判胜 `reasonCode + evidence` 透传到 `GameStateSnapshot`（复盘/日志可审计）；
- **运行时审计**：`winAudit` 环形缓冲 + `console.warn` + `window.__ctWinAudit`；
- 用户报障 → `tests/reported-bugs/` 永久夹具（已建立）；
- 下一步：把 `winAudit.summary().invalid > 0` 接进外发日志告警（当前仅本地留痕）。

---

## 五、判定标准（怎样才算"全量严格按照官方规则运行"）

不要追求一个不可实现的"全绿"口号，而是用**可执行的分级标准**：

| 级别 | 标准 | 当前 |
| :--- | :--- | :--- |
| S1 规范可追溯 | 每个项目角色都能映射到官方规范（或显式登记为自定义角色） | ✅ 169/174（5 个自定义已登记 INFO） |
| S2 静态一致 | 类型 100% 一致；官方夜序差异人审归档；内置剧本角色 0 缺失 | ✅ 类型 0 不一致、夜序 0 不一致、内置缺失 0 |
| S3 证据可计量 | 每个角色有测试入口 + 官方范例编码数 + 正/反例数入台账 | ◐ reach 174/174 · **assert 94/172** · 范例 97/438 |
| S4 语义可信 | 关键能力 type-tag 全覆盖；官方范例覆盖 ≥60%；mutation score ≥80% | ◐ 语义 36 review + 97 范例（22.1%）；**mutation 23/23 = 100%** |
| S5 回归可控 | 棘轮：0 新增偏差；基线只降不升 | ✅ 已生效（schemaVersion=2，签名带 severity，waiver 回退会变红） |
| S6 反馈闭环 | 每个用户报障 72h 内成为夹具；判胜/终局可溯源 | ✅ 判胜溯源 + `winAudit` 运行时留痕 + `tests/reported-bugs/` |
| S7 组合空间可信 | 整局随机仿真不变式 0 违例，且样本量可验证（防空转） | ✅ 12 局 / 246 动作 / 违例 0 |

**判据**：S1/S2/S5/S6/S7 已达标；S3/S4 的剩余增量都已有**可执行台账与命令**
（`conformance:examples` / `conformance:mutation` / `conformance:e2e`），按台账逐条推进即可，
不需要再人工穷举。

**"严格符合官方规则"的当前语义**：静态可判定维度 **P0=0 / P1=0**（含 16 条显式 waiver），
语义层偏差全部进 review 台账（P2/INFO），官方数据歧义项全部有裁定记录，
**已核实的实现偏差**用 `known_deviations.test.ts` 的 `it.fails` 显式钉住（修好即转红强制转正）
——不再有"静默未验证"的规则。

---

## 六、分阶段执行计划（建议）

| 阶段 | 内容 | 产出 | 状态 |
| :--- | :--- | :--- | :--- |
| **P1** | L0–L2：规范抽取 + 静态审计 + 棘轮 + CI | `scripts/conformance/**`、`rule_conformance.test.ts`、本文件 | ✅ 已完成 |
| **P2** | 修静态 P0/P1（scapegoat 类型、传教士/巡山人夜序、acrobat 类型、saint 注册错位），waiver 台账化 | `app/data.ts` / 能力元数据修复 + `waivers.json` + baseline | ✅ 已完成（静态 P0/P1 归零） |
| **P3** | L3 语义原子层 + 官方范例 Oracle | `lib/ruleAtoms.ts`、`lib/examples.ts`、`_oracle.ts`、`tests/conformance/examples/**`（97 条） | ✅ 已交付（继续扩充至 ≥60%） |
| **P4** | L5 变异测试产品化 + 补测 | `scripts/conformance/mutation.ts`（23 条 · 23/23）+ 注册表契约测试 | ✅ 已交付（分数进棘轮；扩展至全剧本为下一步） |
| **P5** | L4 整局 fuzz 接入台账 + L6 E2E 断言化 + L7 日志告警 | `fuzz.ts` / `fuzzRunner.ts`、`e2e-assertions.ts`、`winAudit.ts` | ✅ 已完成（P5 收口） |

**关键习惯**（比工具更重要）：
1. 官方数据（`json/full`）变化时 → 先跑 `conformance:audit` 看 diff，再动代码；
2. 新增角色/能力的 PR 必须让 `conformance` 台账的覆盖指标（mapped/encoded/mutation）**不下降**；
3. 每条用户报障 → `tests/reported-bugs/` 夹具 + 在台账里标记该角色语义证据 +1；
4. 已知债务只允许"修掉→下调基线"，不允许"加 waiver 掩盖"；waiver 必须写明理由/裁定人/日期；
5. 官方数据歧义 → 显式 `waiver` 记录，不是静默跳过。

---

## 七、文件清单

```text
scripts/conformance/
├── extract-spec.ts          # L0 CLI：官方规范抽取
├── audit.ts                 # L0-L6 总审计 CLI（规范+实现+证据+语义+fuzz+变异 + 棘轮 + 报告）
├── semantic-audit.ts        # L3 语义原子层独立审计 CLI
├── examples-ledger.ts       # L3 官方范例编码覆盖率台账 CLI
├── mutation.ts              # L5 变异测试执行器（安全恢复；--dry-run / --only）
├── fuzz.ts                  # L4 整局随机仿真 CLI（--games / --pools / --verbose）
├── e2e-assertions.ts        # L6 E2E 断言型覆盖台账 CLI
├── waivers.json             # 人审豁免/裁定台账（必须提交）
└── lib/
    ├── types.ts             # 共享类型（spec/impl/finding/report/baseline/waiver）
    ├── spec.ts              # json/full 归一化（去重、三态夜序、范例解析）
    ├── impl.ts              # app/data + abilityRegistry 实现清单
    ├── evidence.ts          # 测试/E2E 证据扫描
    ├── audit.ts             # 审计核心（纯函数；棘轮 v2 / 旧基线迁移 / 正反向指标）
    ├── waivers.ts           # waiver 加载/应用/未命中检测
    ├── ruleAtoms.ts         # L3 官方能力文本 → 规则原子 + 实现对账
    ├── examples.ts          # L3 官方范例台账/编码扫描/覆盖率
    ├── fuzzRunner.ts        # L4 执行逻辑（CLI 与 CI 共用同一份配置）
    └── e2eAssertions.ts     # L6 test 块切分 + expect/角色提及统计
src/utils/winConditions/winAudit.ts                 # L7 判胜运行时审计（环形缓冲 + 告警）
src/utils/__tests__/rule_conformance.test.ts        # L2 CI 棘轮门禁（含 L4 fuzz + L6 指标）
src/utils/__tests__/winAudit.test.ts                # L7 判胜审计契约
src/utils/__tests__/rule_atoms.test.ts              # L3 语义抽取/对账单测
src/utils/__tests__/examples_ledger.test.ts         # L3 范例台账门禁
src/utils/__tests__/mutation_config.test.ts         # L5 变异配置静态守卫
tests/conformance/examples/_oracle.ts               # L3 表驱动 runner（不含 .test.，不被收集）
tests/conformance/examples/known_deviations.test.ts # L3 已核实偏差（it.fails，修好即转红）
src/utils/__tests__/win_reason_registry_contract.test.ts # 判胜注册表契约（防变异空转）
tests/conformance/examples/                         # L3 官方范例可执行夹具（97 条）
outputs/rule_conformance/
├── baseline.json            # 提交仓库（棘轮基线 v2：schemaVersion=2 · severity|check|role）
├── official_spec.json       # 生成物（gitignore）
├── ledger.json              # 生成物（gitignore）
├── report.md                # 生成物（gitignore）
├── semantic_findings.json   # 生成物（gitignore）
├── examples_ledger.json     # 生成物（gitignore）
├── mutation_report.json     # 生成物（gitignore）
├── fuzz_report.json         # L4 生成物（gitignore；samples 可复现违例）
└── e2e_assertions.json      # L6 生成物（gitignore；逐角色 assertedBlocks）
```

---

## 八、FAQ

**Q：`json/full` 是受保护真源，会不会被脚本改？**
不会。抽取脚本只读；产物写到 `outputs/rule_conformance/`。

**Q：官方数据本身错了/自相矛盾怎么办？**
例如旅行者「官员/窃贼」夜序写「无法行动」但能力原文写「每个夜晚」。系统判为
`spec.official_data_conflict`（INFO，需人审裁定），不假装通过也不误报 P0。
裁定结果应记录在基线/waiver 台账里，并可回写项目内规则说明。

**Q：自定义角色怎么办？**
映射不到官方的自定义角色登记 `impl.role.unmatched_spec_custom`（INFO）；
正式剧本角色必须 0 缺失（P1）。

**Q：为什么不用 LLM 直接"读代码判断规则对不对"？**
不可复现、不可棘轮、无法作为 CI 门禁。LLM 可以用于**辅助标注官方范例**
（一次性、可人审），但规范与断言必须落到可执行代码。

**Q：这套系统能保证 100% 符合官方规则吗？**
没有任何系统能对自然语言规则做到数学证明。它把"靠人记得测"变成
"规范可追溯 + 静态可判定 + 语义可计量 + 回归可棘轮"，把不可控的漏测
压缩到"已知债务列表"里，并让每一轮新增/修复都可量化。

---

## 九、人工测试交接

> 本轮已把「官方规范 ⇄ 实现 ⇄ 证据」全链路落地并验证。以下是交给说书人手动验证的清单。

### 9.1 启动与健康检查

```bash
npm run dev            # 或使用当前已在运行的本机 dev server
npx tsc --noEmit       # 0 错
npx vitest run         # 全量单测（含 tests/conformance 官方范例夹具 + L4 fuzz + L7 审计契约）
npm run conformance:audit   # 输出报告：静态 P0/P1 应为 0；L4/L5/L6 指标齐全；看棘轮状态
npm run conformance:fuzz    # 单独跑整局仿真（约 2s，0 违例）
npm run conformance:e2e     # 断言型覆盖台账（--verbose 列出"只提到未断言"的角色）
```

> 若手动测试期间需要重新生成报告：`outputs/rule_conformance/report.md` 是唯一入口，
> 内含覆盖指标/剧本维度/findings 聚合/waiver 台账/L4·L5·L6 指标/棘轮状态。

### 9.2 建议手动重点回归（本轮实际改动）

| 区域 | 改动 | 验证点 |
| :--- | :--- | :--- |
| **判胜审计（L7）** | `checkGameEnd` 拆成 core + 审计包装；圣徒/双子两条确认路径补审计 | 任一局结束**不得**出现 `[win-audit]` 告警；控制台 `__ctWinAudit.summary().invalid` 恒为 0 |
| 镜像双子判胜 | 严格配对解析（上一轮）+ 本轮未改逻辑 | 处决非双子镇民（如 15号小精灵）**必须继续对局**；真善良双子被处决才判邪恶胜 |
| 圣徒 | 新引擎 roleId 对齐 `saint`（判胜/处决流程） | 圣徒被处决 ⇒ 其阵营落败；受保护/毒醉时不触发 |
| 传教士 / 巡山人 | 夜序改为官方 25/10、51/88（实验角色，未用于内置剧本） | 若自建剧本使用这两个角色，夜间唤醒顺序符合官方；未使用则无感 |
| 杂技演员 | 类型 outsiders → townsfolk（未用于内置剧本） | 自定义剧本若使用，阵营/胜负判定按镇民 |
| 夜序/角色数据 | `rolesData.json` ranger 51/88 | 夜序表/提示信息不报错 |
| 引擎能力注册 | saint 精确命中 `getAbilityForRole("saint")` | 处决圣徒/判胜弹窗正常 |
| **图书管理员（已知偏差）** | 未修，`known_deviations.test.ts` 钉住 | 陌客被说书人登记为爪牙时，官方要求报「0」，当前会报「陌客」——**这是差距，不是测试错** |

### 9.3 已知残留（不是"没测"，是已登记债务，见 report.md / waivers.json）

- **语义层 36 条 review**：`triggerTiming/targetConfig` 等「元数据声明」与官方文本的口径差
  （实现多经 legacy/gameLogic 路径生效）；其中少量可能是真缺陷（如罂粟种植者的死亡唤醒证据），
  已在 `report.md` 的 `ability.atom.*` 中逐条列出，按严重度排优先级。
- **官方范例编码 97/438（22.1%）**——最大的一块增量，缺口语义证据；按
  `examples_ledger.json.missingByRole` 逐条补，优先暗流涌动剩余 44 条。
- **E2E 断言型覆盖 94/172**——其余角色只有 reach 证据（被发牌到过但没断言）。
- **官方角色未实现 33 个**（扩展/自定义剧本）——路线图，不影响当前 9 个内置剧本。
- **14 个角色无新引擎能力**（12 旅行者 + 2 自定义变体）——旅行者走 travelerHooks 的既有口径，已 waiver。
- **官方数据自相矛盾 2 条**（官员/窃贼夜序「无法行动」vs 能力「每个夜晚」）——需说书人裁定口径，已 INFO。
- **1 条已核实实现偏差未修**（图书管理员#1 的陌客登记）——`known_deviations.test.ts` 用 `it.fails` 钉住，
  修好后会自动转红，必须转正成正式夹具。
- **本轮新修 1 条 + 新登记 1 条**：
  - ✅ 已修：**管家死亡后仍受主人限制**（官方范例 管家#2：「死亡的玩家没有任何能力」
    ⇒ 死亡应第一优先级放行）。判据 `butler.ability.ts::isButlerVoteLegal`。
  - ⏳ 已登记未修：**士兵被指定替死时仍会被标记死亡**（官方范例 士兵#2：士兵无法被恶魔杀死 ⇒ 当晚无人死亡）。
    判据 `src/utils/soldierImmunity.ts::resolveMayorDemonKill` 第 4 步「说书人手动指定替死」直接取候选，
    **未排除免死角色**；修复需给返回值加「无人死亡」语义并同步 `imp`/`fang_gu` 两个调用点，
    属跨界改动，先以 `it.fails` 钉住（`tb_night_examples.test.ts`），修好后会自动转红强制转正。

### 9.4 出问题时的"一键定位"

```bash
# 1) 规则偏差还是实现偏差？
npm run conformance:audit     # 静态/语义偏差清单（report.md）
# 2) 官方原文与期望行为
node -e "const s=require('./outputs/rule_conformance/official_spec.json');const r=s.roles.find(x=>x.nameCn==='<角色名>');console.log(r.abilityText);console.log(r.examples)"
# 3) 该行为是否已有官方范例夹具
npx vitest run tests/conformance -t "<角色名>"
# 4) 变异测试是否覆盖该模块（测试是否真的钉住语义）
npm run conformance:mutation -- --only=<id>
# 5) 整局跑起来会不会出现非法状态（组合空间）
npm run conformance:fuzz -- --games 20 --verbose
# 6) 这个角色到底有没有被断言过（reach vs assert）
npm run conformance:e2e -- --verbose
# 7) 现场判胜是不是脏的（浏览器控制台）
__ctWinAudit.summary()   // { total, invalid, invalidRate, byReasonCode }
```
