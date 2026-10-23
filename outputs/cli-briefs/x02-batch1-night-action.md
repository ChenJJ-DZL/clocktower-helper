# 任务：X02 弹窗 golden · 第 1 批（夜间行动 10 个）

项目根：`/c/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`
dev server 已在 `127.0.0.1:3100` 运行 —— **不要重启、不要 build**。

---

## 0. 强制输出协议

1. 每条回复思考 ≤ 150 字。
2. 一条回复只做一个动作（写 1 个文件 或 跑 1 条命令）。
3. **禁止 grep / glob**；允许 read，每个目标组件最多读 1 次。
4. 禁止派子代理。
5. **第一条回复直接 `write_file`** 写测试文件（允许后面再补读组件修 props）。
6. 不得 git add / git commit。

---

## 1. 唯一产出

新文件：`src/components/modals/__tests__/x02_night_action_golden.test.tsx`

## 2. 目标（10 个弹窗，一条一个 `test`）

| # | ModalType | 组件文件（`src/components/modals/`） |
|---|---|---|
| X02-01 | `NIGHT_ORDER_PREVIEW` | `NightOrderPreviewModal.tsx` |
| X02-02 | `NIGHT_ACTION_CONFIRM` | `NightActionConfirmModal.tsx` |
| X02-03 | `NIGHT_DEATH_REPORT` | `NightDeathReportModal.tsx` |
| X02-04 | `HADESIA_KILL_CONFIRM` | `HadesiaKillConfirmModal.tsx` |
| X02-05 | `MOONCHILD_KILL` | `MoonchildKillModal.tsx` |
| X02-06 | `SPY_DISGUISE` | `SpyDisguiseModal.tsx` |
| X02-07 | `SPY_RECORDS` | `SpyGrimoireModal.tsx` |
| X02-08 | `BARBER_SWAP` | `BarberSwapModal.tsx` |
| X02-09 | `STORYTELLER_SELECT` | `StorytellerSelectModal.tsx` |
| X02-10 | `STORYTELLER_CORRECTION` | `StorytellerCorrectionModal.tsx` |

## 3. 每条用例必须断言 4 件事

用 `@testing-library/react` 的 `render`（本项目已装 `@testing-library/react` + `jsdom`）：

1. **能渲染**：`render(...)` 不抛错，`container.textContent` 非空
2. **标题逐字一致**：从 `container.textContent` 里取标题（组件里的 `h2`/`h3`/首个粗体文案），
   用 `expect(...).toContain("逐字标题")` 断言 —— 标题字符串必须是**从组件源码里抄的原文**，不许自己概括
3. **主按钮文案逐字一致**：`screen.getAllByRole("button")` 的 `textContent` 里有那条主按钮
4. **关闭不抛错**：`fireEvent.click(关闭/取消按钮)` 后 `onClose` 被调用（`vi.fn()` 断言），
   或组件内部 `onClose` 一定被消费 —— 拿不到 `onClose` prop 的组件改为断言「关闭按钮存在且 disabled=false」

## 4. 硬性禁止

- ❌ **不许用 `toMatchSnapshot()` / `toMatchInlineSnapshot()`**
  （第一次跑就把当前文案冻成"基线"，等于把 bug 一起冻住；X02 的价值是**人工确认过的逐字基线**）
- ❌ 不许 `skip` / `fails`
- ❌ 不许改组件源码
- ❌ 不许断言「包含某个词」这种模糊判据 —— 必须是完整一句

## 5. props 怎么造

- 每个组件读 1 次源码，按 `interface .*Props` 造**最小合法 props**：
  `isOpen: true`、`onClose: vi.fn()`、`onConfirm: vi.fn()`、业务字段给 2~3 个假座位即可
- 座位用最小形状 `{ id: 0, playerName: "P1", role: { id: "chef", name: "厨师", type: "townsfolk" }, isDead: false }`
- 若组件依赖 Context（`useGame` 之类）⇒ 用 `vi.mock` 打桩，或在文件顶部注释写清
  「该组件依赖 X，本用例用 mock 提供最小实现」，**不要**为了跑通去改组件
- 若某组件**根本无法在没有整局上下文时渲染**（例如需要 controller）⇒ 该条降级为
  **静态护栏**：读源码断言「该 ModalType 的标题字面量 + 主按钮字面量存在」，并在用例名加
  `（静态护栏）`。降级理由写在文件末尾注释里，不许静默降级。

## 6. 完成前自检（必须自己跑并贴结果）

1. `npx tsc --noEmit` → 0 错
2. `npx vitest run src/components/modals/__tests__/x02_night_action_golden.test.tsx --reporter=verbose`
3. 最后一行：`DONE x02-batch1=<passed>/10 downgraded=<n>`

## 7. 已踩过的坑（别重复）

- `Container` 里可能有多个同名按钮 ⇒ 用 `getAllByRole` + `some(...)`，不要 `getByRole` 直接取
- 有些弹窗有 `ModalWrapper`（带 portal），`render` 后要查 `document.body` 而不是 `container`
- 中文全角括号与空格：断言字符串必须从源码复制，手打几乎必错
