# 任务：X02 弹窗文案 vs 官方原文 逐字对账（抽查 10 个，发现不一致就修）

项目根：`/c/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`
dev server 在 `127.0.0.1:3100` —— 不要重启、不要 build。

## 0. 强制输出协议

1. 每条回复思考 ≤ 150 字；一条回复只做一个动作。
2. 禁止派子代理；不得 git add / git commit。
3. 第一条回复直接 `read` 第一个目标组件（不要先写计划）。

## 1. 背景（为什么做这件事）

X02 的 43 条弹窗 golden 测试**已经全绿**，但那批测试的基线是「从源码抄的当前文案」
—— 它只能防「文案被误改」，**不能证明文案本身是对的**。
计划文档 §X02 的判据是「标题与关键文案与**批准基线**逐字一致」，批准基线应来自官方原文。

## 2. 唯一产出

- 修订：`outputs/X02-文案对账-<日期>.md`（对账表：弹窗 / 当前文案 / 官方原文 / 结论）
- 如需修文案：改组件 + 同步改 `src/components/modals/__tests__/x02_*.test.tsx` 的断言

## 3. 抽查范围（10 个，按这个顺序）

| # | ModalType | 组件 | 对应官方角色/规则 |
|---|---|---|---|
| 1 | `NIGHT_ACTION_CONFIRM` | `NightActionConfirmModal.tsx` | 通用（无官方原文，只查「座位号是否泄露角色」） |
| 2 | `NIGHT_DEATH_REPORT` | `NightDeathReportModal.tsx` | 通用（黎明宣告格式） |
| 3 | `SPY_RECORDS` | `SpyGrimoireModal.tsx` | 间谍「每个夜晚，你能查看魔典」 |
| 4 | `BARBER_SWAP` | `BarberSwapModal.tsx` | 理发师「恶魔可以选择两名玩家（不能选择其他恶魔）交换角色」 |
| 5 | `MOONCHILD_KILL` | `MoonchildKillModal.tsx` | 月之子「如果你在夜晚死亡，你会选择一名玩家；如果他是善良的，邪恶获胜」 |
| 6 | `HADESIA_KILL_CONFIRM` | `HadesiaKillConfirmModal.tsx` | 沙巴洛斯「可能复活上一夜吃掉的人」 |
| 7 | `PACIFIST_CONFIRM` | `PacifistConfirmModal.tsx` | 和平主义者「被处决时可能不死」 |
| 8 | `SAINT_EXECUTION_CONFIRM` | `SaintExecutionConfirmModal.tsx` | 圣徒「如果你被处决，你的阵营落败」 |
| 9 | `VIZIER_EXECUTION` | `VizierExecutionModal.tsx` | 维齐尔「如果你被处决，邪恶获胜」 |
| 10 | `KLUTZ_CHOICE` | `KlutzChoiceModal.tsx` | 呆瓜「如果你选了邪恶玩家，你的阵营落败」 |

## 4. 怎么做

1. 读官方原文：`src/data/officialRoleDocs.json`（每角色有【角色能力】【运作方式】【规则细节】）
   —— 用 `node -e` 或 `python` 读，**不要 grep 整个文件**（它是单行大 JSON）
2. 读组件源码里的**玩家可见文案**（`ModalWrapper title` / JSX 文本 / 按钮 label）
3. 对账三条：
   - ① **规则方向是否一致**（例：圣徒是「你的阵营落败」，不是「善良落败」；写反了就是缺陷）
   - ② **是否泄露不该给玩家的信息**（座位号 + 角色名同时出现在玩家可见区 = 泄露）
   - ③ **是否有官方原文里没有的额外规则**（自创规则 = 缺陷）
4. 每发现一处不一致：改组件文案（最小改动）→ 同步改对应 `x02_*_golden.test.tsx` 的断言

## 5. 硬性边界

- ❌ 不许为了「对得上」去改官方 `officialRoleDocs.json`
- ❌ 不许改与文案无关的逻辑
- ❌ 不许 snapshot
- ⚠️ 改文案时**只改玩家可见区**；`说书人专属补充说明`（`GameConsole` 渲染的那类）保留
- ⚠️ 如果某条判据拿不准（例如「这句话算不算泄露」），**写进报告并标注「待人工确认」**，
  不要擅自改

## 6. 自检

1. `npx tsc --noEmit` → 0 错
2. `npx vitest run src/components/modals/__tests__ --reporter=dot` → 全绿（含被改基线的）
3. 报告末尾输出：`DONE checked=10 fixed=<n> pending=<n>`
