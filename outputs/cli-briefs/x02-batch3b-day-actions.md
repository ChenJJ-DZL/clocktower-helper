# 任务：X02 弹窗 golden · 第 4 批（白天/处决 后 7 个）

项目根：`/c/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`

## 0. 强制输出协议

1. 每条回复思考 ≤ 150 字；一条回复只做一个动作。
2. 禁止 grep / glob；允许 read，每个目标组件最多读 1 次。
3. 禁止派子代理；不得 git add / git commit。
4. 第一条回复直接 `write_file`。

## 1. 唯一产出

`src/components/modals/__tests__/x02_day_actions_golden.test.tsx`

## 2. 目标（7 个）

| # | ModalType | 组件（`src/components/modals/`） |
|---|---|---|
| X02-27 | `DAMSEL_GUESS` | `DamselGuessModal.tsx` |
| X02-28 | `DAY_ACTION` | `DayActionModal.tsx` |
| X02-29 | `DAY_ABILITY` | `DayAbilityModal.tsx` |
| X02-30 | `MADNESS_CHECK` | `MadnessCheckModal.tsx` |
| X02-31 | `MUTANT_MADNESS` | `MutantMadnessModal.tsx` |
| X02-32 | `KLUTZ_CHOICE` | `KlutzChoiceModal.tsx` |
| X02-33 | `SHAMAN_CONVERT` | `ShamanConvertModal.tsx` |

## 3. 断言（同前）

1. 能渲染（portal ⇒ 取 `document.body`）
2. 标题 `h2.textContent` **完全相等**
3. 按钮 trim 后**完全相等**（主 + 取消）
4. 关键句 `toContain` 一条**完整句子**
5. 关闭/确认回调 `vi.fn()` 被调用

## 4. 禁止

- ❌ snapshot / skip / fails / 模糊断言 / 改组件源码

## 5. 特别注意（这几个都有分支）

- `DAMSEL_GUESS`：断言「猜角色」输入/选择区存在 + 提交按钮
- `DAY_ACTION` / `DAY_ABILITY`：两个是**不同**组件（前者是右键菜单发起的白天行动，
  后者是说书人面板发起的能力）。别搞混，各读各的源码
- `MADNESS_CHECK`：说书人裁定「是否疯狂」⇒ 断言两个裁定按钮（是/否）文案
- `MUTANT_MADNESS`：畸形秀演员门禁，断言「公开承认外来者身份」类整句
- `KLUTZ_CHOICE`：呆瓜死亡后选人 ⇒ 断言可选座位卡片 `N号+角色名` 与确认按钮
- `SHAMAN_CONVERT`：断言「转为邪恶」类整句 + 确认按钮

## 6. 自检

1. `npx tsc --noEmit` → 0 错
2. `npx vitest run src/components/modals/__tests__/x02_day_actions_golden.test.tsx --reporter=verbose`
3. 变异验证 1 条
4. 最后一行：`DONE x02-batch3b=<passed>/7 downgraded=<n>`
