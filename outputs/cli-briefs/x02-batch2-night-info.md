# 任务：X02 弹窗 golden · 第 2 批（夜间信息 8 个）

项目根：`/c/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`
dev server 已在 `127.0.0.1:3100` 运行 —— **不要重启、不要 build**。

## 0. 强制输出协议

1. 每条回复思考 ≤ 150 字；一条回复只做一个动作。
2. 禁止 grep / glob；允许 read，每个目标组件最多读 1 次。
3. 禁止派子代理。
4. 第一条回复直接 `write_file` 写测试文件。
5. 不得 git add / git commit。

## 1. 唯一产出

`src/components/modals/__tests__/x02_night_info_golden.test.tsx`

## 2. 目标（8 个，一条一个 `test`）

| # | ModalType | 组件 | 说明 |
|---|---|---|---|
| X02-11 | `INFO_RESULT` | `InfoResultModal.tsx` | 通用信息结果页 |
| X02-12 | `FORTUNE_TELLER_RESULT` | **复用 `InfoResultModal`** | `resultText: "有" / "没有"` |
| X02-13 | `CERENOVUS_NOTICE` | `CerenovusMadnessModal.tsx` | 洗脑告知：`你需要疯狂证明自己是【X】` |
| X02-14 | `GAMBLER_JUDGE` | 先 read `GameModals.tsx` 里 `gamblerJudgeModal &&` 那一段确认组件名 | 赌徒裁定 |
| X02-15 | `JUGGLER_JUDGE` | `JugglerJudgeModal.tsx` | 杂耍艺人裁定 |
| X02-16 | `LUNATIC_RPS` | `LunaticRpsModal.tsx` | 疯子猜拳 |
| X02-17 | `DRUNK_CHARADE_SELECT` | `DrunkCharadeSelectModal.tsx` | 酒鬼伪装角色选择 |
| X02-18 | `ROLE_SELECT` | `RoleSelectModal.tsx` | 角色选择 |

## 3. 每条断言（与批 1 完全一致）

1. 能渲染，`container.textContent`（或 `document.body.textContent`，portal 情况）非空
2. **标题逐字**：`toContain("从源码复制的完整标题")`
3. **主按钮逐字**：`getAllByRole("button")` 里有它
4. **关闭可用**：`fireEvent.click` 后 `onClose`/`onConfirm` 被调用（`vi.fn()`）

## 4. 禁止

- ❌ `toMatchSnapshot` / `toMatchInlineSnapshot`
- ❌ `skip` / `fails`
- ❌ 模糊断言（「包含某个词」）；必须完整一句
- ❌ 改组件源码

## 5. 复用组件的两条特别注意

- **FORTUNE_TELLER_RESULT** 走的是 `InfoResultModal`，但**判据必须按占卜师场景**：
  `roleName="5号-占卜师"`（`actorSeatNo` 拼出）、`resultText="有"` 与 `"没有"` 各一条断言
  （占卜师是唯一「有/没有」二值的复用方，别只测一种）
- **CERENOVUS_NOTICE** 的 `CerenovusMadnessModal` 有「长按 1.5 秒解锁说书人视图」的交互，
  只断言**初始渲染**的玩家侧文案（`你需要疯狂证明自己是【X】`），不要去模拟长按

## 6. 自检

1. `npx tsc --noEmit` → 0 错
2. `npx vitest run src/components/modals/__tests__/x02_night_info_golden.test.tsx --reporter=verbose`
3. 最后一行：`DONE x02-batch2=<passed>/8 downgraded=<n>`
