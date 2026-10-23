# 任务：X02 弹窗 golden · 第 6 批（旅行者裁定 3 + 提醒标记 + 终局）5 个

项目根：`/c/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`

## 0. 强制输出协议

1. 每条回复思考 ≤ 150 字；一条回复只做一个动作。
2. 禁止 grep / glob；允许 read，每个目标最多读 1 次。
3. 禁止派子代理；不得 git add / git commit。
4. 第一条回复直接 `write_file`。

## 1. 唯一产出

`src/components/modals/__tests__/x02_traveler_judge_golden.test.tsx`

## 2. 目标（5 个）

| # | ModalType | 在哪 |
|---|---|---|
| X02-39 | `TRAVELER_SCAPEGOAT_CHOICE` | `GameModals.tsx` 约 348 行，`<XxxModal isOpen={...} .../>` |
| X02-40 | `TRAVELER_GUNSLINGER_CHOICE` | 同文件约 368 行，同上 |
| X02-41 | `TRAVELER_JUDGE_CHOICE` | 同文件约 385 行，同上 |
| X02-42 | `REMINDER_TOKENS` | 同文件约 559 行，**内联 `ModalWrapper`** |
| X02-43 | `GAME_OVER` | `src/components/game/GameOverOverlay.tsx`（独立组件） |

## 3. 做法

- **X02-39/40/41**：先 read `GameModals.tsx` 第 340–400 行确认这三个 `isOpen=` 用的是哪个组件，
  然后直接 render 那个组件（`isOpen={true}` + 回调），**不要**去 render 整个 GameModals
- **X02-42 REMINDER_TOKENS**：内联 `ModalWrapper` ⇒ 用批 2 验证过的
  `render(<GameModals />)` + `vi.mock` 打桩 context + `currentModal = {type:"REMINDER_TOKENS", data:{seatId:0}}`
  （`x02_night_info_golden.test.tsx` 的 X02-14 可抄）
- **X02-43 GAME_OVER**：`GameOverOverlay` 需要 `winResult`（good/evil）与 `winReason`；
  **两种胜方各断言一次**（善良阵营胜利 / 邪恶阵营胜利 + 胜利依据文案）

## 4. 断言（同前）

1. 能渲染（portal ⇒ `document.body`）
2. 标题 `h2.textContent` **完全相等**
3. 按钮 trim 后**完全相等**
4. 关键句 `toContain` 一条**完整句子**
5. 回调 `vi.fn()` 被调用

## 5. 禁止

- ❌ snapshot / skip / fails / 模糊断言 / 改组件源码
- ❌ 为了跑通去重写一个 ModalWrapper（那是重新实现，不是测试）

## 6. 自检

1. `npx tsc --noEmit` → 0 错
2. `npx vitest run src/components/modals/__tests__/x02_traveler_judge_golden.test.tsx --reporter=verbose`
3. 变异验证 1 条
4. 最后一行：`DONE x02-batch4b=<passed>/5 downgraded=<n>`
