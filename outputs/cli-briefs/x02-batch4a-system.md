# 任务：X02 弹窗 golden · 第 5 批（旅行者/系统 前 5 个）

项目根：`/c/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`

## 0. 强制输出协议

1. 每条回复思考 ≤ 150 字；一条回复只做一个动作。
2. 禁止 grep / glob；允许 read，每个目标组件最多读 1 次。
3. 禁止派子代理；不得 git add / git commit。
4. 第一条回复直接 `write_file`。

## 1. 唯一产出

`src/components/modals/__tests__/x02_traveler_system_golden.test.tsx`

## 2. 目标（5 个）

| # | ModalType | 组件 |
|---|---|---|
| X02-34 | `ARTIST_RESULT` | `ArtistResultModal.tsx` |
| X02-35 | `SAVANT_RESULT` | `SavantResultModal.tsx` |
| X02-36 | `REVIEW` | `ReviewModal.tsx` |
| X02-37 | `RESTART_CONFIRM` | `RestartConfirmModal.tsx` |
| X02-38 | `IDENTITY_SHOWCASE` | `IdentityShowcaseModal.tsx` |

## 3. 断言（同前）

1. 能渲染（portal ⇒ `document.body`）
2. 标题 `h2.textContent` **完全相等**
3. 按钮 trim 后**完全相等**（主 + 取消/关闭）
4. 关键句 `toContain` 一条**完整句子**
5. 回调 `vi.fn()` 被调用

## 4. 特别注意

- `REVIEW` / `REVIEW` 弹窗可能是多 tab（对局记录/复盘），断言**初始可见**那个 tab 的标题 +
  至少一个 tab 按钮文案；不要点进子 tab（超范围）
- `IDENTITY_SHOWCASE`：断言「身份展示」标题 + 座位/角色文案；它需要 `seats` 与
  `initialSeatId`，给 2 个假座位即可
- `ARTIST_RESULT` / `SAVANT_RESULT`：文案里可能带角色名与问题文本，断言整句
- 依赖 context 的用 `vi.mock` 打桩

## 5. 禁止

- ❌ snapshot / skip / fails / 模糊断言 / 改组件源码

## 6. 自检

1. `npx tsc --noEmit` → 0 错
2. `npx vitest run src/components/modals/__tests__/x02_traveler_system_golden.test.tsx --reporter=verbose`
3. 变异验证 1 条
4. 最后一行：`DONE x02-batch4a=<passed>/5 downgraded=<n>`
