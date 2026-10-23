# 任务：弹窗文案对账 · 批 3a（白天/处决 5 个）

仓库：`C:/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`
只做 5 个弹窗。**先落盘再优化**：读到第 2 条就必须开始写表，禁止先想清楚全部再动手。

## 0. 强制输出协议（违反 = 本轮作废）

1. 每条回复思考 ≤ 120 字。
2. 一条回复只做一个动作（写 1 个文件，或跑 1 条命令）。
3. **前 10 条回复内必须完成第一次 `write_file`（把空表格先写进报告）。**
4. 禁止派子代理；每个文件最多读 2 次；禁止全仓 grep。
5. 本条回复必须直接调用 `write_file` / `edit_file`。

## 1. 范围（5 个 ModalType）

| # | ModalType | 组件 |
|---|---|---|
| 19 | `VOTE_INPUT` | `VoteInputModal.tsx`（或 `VotingModal`，自己找） |
| 20 | `EXECUTION_RESULT` | `ExecutionResultModal.tsx` 或内联 |
| 21 | `EVIL_TWIN_EXECUTION_CONFIRM` | `EvilTwinExecutionConfirmModal.tsx` |
| 22 | `SHOOT_RESULT` | `ShootResultModal.tsx` 或内联 |
| 23 | `SLAYER_SELECT_TARGET` | `SlayerSelectTargetModal.tsx` |

## 2. 官方基线（只许引用，不许编）

`src/data/officialRoleDocs.json` = `{ "角色名": "整段文本" }`，键名是本地化名。相关角色：
`猎手`（Slayer）、`镜像双子`（Evil Twin）、`圣徒`、`士兵`、`镇长`、`贞洁者`。

判三件事：
① 规则方向（"如果…则…"是否与官方一致；有没有官方没有的"通常/必定/自动"）
② 信息泄露（玩家可见区是否出现不该知道的角色名/阵营/他人选择）
③ 自创规则（官方没有的概率/限制/额外效果）

## 3. 交付物

### 3.1 先把空表写进报告（第 1 次 write_file 就做这个）

在 `outputs/X02-文案对账-2026-10-22.md` 末尾追加：

```md
## 十、批 3a · 白天/处决 5 个
| # | ModalType | 组件 | 玩家可见文案 | 官方原文 | 结论 |
|---|---|---|---|---|---|
| 19 | VOTE_INPUT | … | 待填 | 待填 | 待填 |
…
DONE batch=3a checked=0 fixed=0 pending=0
```

之后**每查完一个就更新一次表格**（edit_file），别攒到最后。

### 3.2 只改确定的问题

- 改文案时加注释：`// 官方（officialRoleDocs.json · 猎手 · 角色能力）：「…」`
- 改了哪条就同步 `src/components/modals/__tests__/x02_day_execution_golden.test.tsx`
  里对应断言（**只许改这个测试文件**）。
- 拿不准只记录，写「⚠️ 待人工确认（原因）」。

### 3.3 收尾

最后一行必须是：

```
DONE batch=3a checked=5 fixed=<n> pending=<n>
```

## 4. 验收

```bash
npx tsc --noEmit
npx vitest run src/components/modals/__tests__/x02_day_execution_golden.test.tsx --reporter=dot
```

## 5. 禁止

- 不得改 `officialRoleDocs.json`、不得改其他测试、不得 `git commit`。
- 找不到组件记「找不到独立组件」并继续，不要卡住。
- **不要**顺手重构、不要动 `useExecutionHandlers` 的逻辑（那是上一批的范围）。
