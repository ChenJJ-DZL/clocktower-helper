# 任务：弹窗文案对账 · 批 3b（白天行动 6 个）

仓库：`C:/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`
**先落盘再优化**：读到第 2 条就开始写表；每查完一条立刻更新表格。

## 0. 强制输出协议（违反 = 本轮作废）

1. 每条回复思考 ≤ 120 字。
2. 一条回复只做一个动作（写 1 个文件，或跑 1 条命令）。
3. **前 10 条回复内必须完成第一次 `write_file`（先把空表格写进报告）。**
4. 禁止派子代理；每个文件最多读 2 次；禁止全仓 grep。
5. 本条回复必须直接调用 `write_file` / `edit_file`。

## 1. 范围（6 个 ModalType）

| # | ModalType | 组件（`src/components/modals/`） |
|---|---|---|
| 24 | `DAMSEL_GUESS` | `DamselGuessModal.tsx` |
| 25 | `DAY_ACTION` | `DayActionModal.tsx` |
| 26 | `DAY_ABILITY` | `DayAbilityModal.tsx`（或内联，找 `GameModals.tsx`） |
| 27 | `MADNESS_CHECK` | `CerenovusMadnessModal.tsx` / `MadnessCheckModal` |
| 28 | `MUTANT_MADNESS` | `MutantMadnessModal.tsx` |
| 29 | `SHAMAN_CONVERT` | `ShamanConvertModal.tsx` |

## 2. 官方基线（只许引用，不许编）

`src/data/officialRoleDocs.json` = `{ "角色名": "整段文本" }`，键名是本地化名。相关角色：
`少女`（Damsel）、`畸形秀演员`（Mutant）、`洗脑师`、`灵言师`（Shaman）、`猎手`、`贞洁者`、`呆瓜`。

判三件事：
① 规则方向（"如果…则…"与官方一致；官方没有的"通常/必定/自动"不得出现）
② 信息泄露（玩家可见区是否出现不该知道的角色名/阵营/他人选择）
③ 自创规则（官方没有的概率/限制/额外效果）

## 3. 交付物

### 3.1 先写空表（第 1 次 write_file 就做）

在 `outputs/X02-文案对账-2026-10-22.md` 末尾追加：

```md
## 十一、批 3b · 白天行动 6 个
| # | ModalType | 组件 | 玩家可见文案 | 官方原文 | 结论 |
|---|---|---|---|---|---|
| 24 | DAMSEL_GUESS | … | 待填 | 待填 | 待填 |
…
DONE batch=3b checked=0 fixed=0 pending=0
```

### 3.2 只改确定的问题

- 改文案加注释：`// 官方（officialRoleDocs.json · 少女 · 角色能力）：「…」`
- 改了哪条就同步 `src/components/modals/__tests__/x02_day_actions_golden.test.tsx`
  （**只许改这个测试文件**）。
- 拿不准只记录：`⚠️ 待人工确认（原因）`。

### 3.3 收尾

```
DONE batch=3b checked=6 fixed=<n> pending=<n>
```

## 4. 验收

```bash
npx tsc --noEmit
npx vitest run src/components/modals/__tests__/x02_day_actions_golden.test.tsx --reporter=dot
```

## 5. 禁止

- 不得改 `officialRoleDocs.json`、不得改其他测试、不得 `git commit`。
- 不要动引擎逻辑（只改玩家可见文案）。
- 找不到组件记「找不到独立组件」并继续。
