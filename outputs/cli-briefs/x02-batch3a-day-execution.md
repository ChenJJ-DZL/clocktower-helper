# 任务：X02 弹窗 golden · 第 3 批（白天/处决 前 8 个）

项目根：`/c/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`

## 0. 强制输出协议

1. 每条回复思考 ≤ 150 字；一条回复只做一个动作。
2. 禁止 grep / glob；允许 read，每个目标组件最多读 1 次。
3. 禁止派子代理；不得 git add / git commit。
4. 第一条回复直接 `write_file`。

## 1. 唯一产出

`src/components/modals/__tests__/x02_day_execution_golden.test.tsx`

## 2. 目标（8 个）

| # | ModalType | 组件（`src/components/modals/`） |
|---|---|---|
| X02-19 | `VOTE_INPUT` | `VoteInputModal.tsx` |
| X02-20 | `EXECUTION_RESULT` | `ExecutionResultModal.tsx` |
| X02-21 | `PACIFIST_CONFIRM` | `PacifistConfirmModal.tsx` |
| X02-22 | `SAINT_EXECUTION_CONFIRM` | `SaintExecutionConfirmModal.tsx` |
| X02-23 | `VIZIER_EXECUTION` | `VizierExecutionModal.tsx` |
| X02-24 | `EVIL_TWIN_EXECUTION_CONFIRM` | `EvilTwinExecutionConfirmModal.tsx` |
| X02-25 | `SHOOT_RESULT` | `ShootResultModal.tsx` |
| X02-26 | `SLAYER_SELECT_TARGET` | `SlayerSelectTargetModal.tsx` |

## 3. 断言（同批 1 的严格度）

1. 能渲染（`ModalWrapper` 走 portal ⇒ 断言取 `document.body`）
2. 标题：`document.querySelector("h2").textContent` **完全相等**
3. 按钮：`getAllByRole("button")` + trim 后**完全相等**（主按钮 + 取消/关闭按钮各一条）
4. 关键句：`document.body.textContent` `toContain` 一条**完整句子**（如「今日处决最终判定结果【3号被处决】」这种整句，不是词）
5. 关闭：`fireEvent.click` 后 `onClose`/`onConfirm` 被调用

## 3.5 若某弹窗没有独立组件（内联在 GameModals）

**直接用批 2 已经验证过的做法**（`x02_night_info_golden.test.tsx` 的 X02-14 一条可抄）：
`render(<GameModals />)` + `vi.mock` 打桩 context，把 `currentModal` 设成目标 type。
**不要**纠结「要不要重写一个 ModalWrapper」—— 那属于重新实现，不算测试。
每条最多试 2 次，仍不成就降级为静态护栏并在文件末写清理由。

## 4. 禁止

- ❌ snapshot / skip / fails / 模糊断言 / 改组件源码
- ❌ 只测「能渲染」不测文案（那样 X02 就退化成可达性台账）

## 5. 各组件特别注意

- `VOTE_INPUT`：需要若干座位 + `onSubmit`；断言「投票」标题与提交按钮
- `EXECUTION_RESULT`：`message` 里塞一句完整中文，断言原样显示
- `SLAYER_SELECT_TARGET`：断言可选座位卡片文案（`N号+角色名`）与「开枪」按钮
- `SHOOT_RESULT`：命中/未命中两种 `data` 各断言一次（文案不同）
- 依赖 Context 的用 `vi.mock` 打桩，别改源码

## 6. 自检

1. `npx tsc --noEmit` → 0 错
2. `npx vitest run src/components/modals/__tests__/x02_day_execution_golden.test.tsx --reporter=verbose`
3. **变异验证**：随手挑 1 条把断言改成 `MUTANT` 跑一次确认会红，再还原（批 1 做过，效果好）
4. 最后一行：`DONE x02-batch3a=<passed>/8 downgraded=<n>`
