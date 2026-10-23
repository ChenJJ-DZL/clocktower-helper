# 任务：哈迪寂亚弹窗改「逐个结算」+ 三处盲选页去角色名收尾 + 月之子日志口径

仓库：`C:/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`（Next.js 15 + TS）
只改我点名的文件/行为。**不得修改既有测试的断言强度**（唯一允许改的是本文件第 4 节的 X02-04）。

## 0. 强制输出协议（违反 = 本轮作废）

1. 每条回复思考 ≤ 150 字。
2. 一条回复只做一个动作（写 1 个文件，或跑 1 条命令）。
3. 禁止 grep/read 超过必要：读文件只在改动前读一次。
4. 禁止派子代理。
5. 本条回复必须直接调用 `write_file` / `edit_file`，不许输出长篇解释。

## 1. 背景（官方原文，勿自行推断）

哈迪寂亚（`al_hadikhia`）【角色能力】：
「每个夜晚*，你可以选择三名玩家（所有玩家都会得知你选了谁）：他们分别**秘密**决定自己的生死，然后如果他们都存活则都死亡。」

【运作方式】原文要点：
- 三名玩家**依次**唤醒；前一名秘密做出选择后，才公布**下一位**。
- 所有玩家必须保持沉默。

当前实现（`src/components/modals/HadesiaKillConfirmModal.tsx`）把三个人**同屏**摆出来，
每人一个「生 / 死」按钮，且每张卡显示 `[N号] 角色名`。这有两个问题：
① 后一位玩家能看见前一位的选择（屏幕同屏）；② 角色名把身份白送出去。

## 2. 改动 A：`src/components/modals/HadesiaKillConfirmModal.tsx` 改为逐个结算

保持 props 不变（`targetIds` / `choices` / `onSetChoice` / `onConfirm` / `onCancel`），
只在组件内部加 UI 状态：

- 新增 `const [step, setStep] = useState(0);`，范围 `0..targetIds.length-1`。
- **只渲染 `targetIds[step]` 这一张卡**（不是循环渲染三张）。
- 卡片头部：`[N号]` + `seat?.playerName ?? ""` + 存活/已死徽章。
  **不得渲染 `seat.role?.name`**（角色名一律不出现）。
- 进度提示：`第 {step+1} / {targetIds.length} 位`（放在卡片上方或标题下方）。
- 卡片内保留「生 / 死」两个按钮（调用 `onSetChoice(id, ...)`）。
- footer：
  - 左侧「取消」→ `onCancel`（不变）。
  - 右侧主按钮：`step < targetIds.length-1` 时文案 **「下一位」**（`onClick` 仅 `setStep(step+1)`，
    不调用 `onConfirm`）；`step === 最后一位` 时文案 **「确定」**（`onClick` → `onConfirm`）。
- **不得提供「上一位」**：官方要求前一位的选择对后一位保密，回退会泄露。
- 顶部说明文案改为：
  `请让【当前这位】玩家单独操作。三名玩家将依次秘密选择"生"或"死"；若三人都选"生"，则三人全部死亡。`
- 底部黄色规则条保留现有官方口径（三人全"生" ⇒ 全死；否则仅选"死"者死亡），原文不动。
- `isOpen` 为 false 或 `targetIds.length !== 3` 时仍返回 `null`（不变）。
- 每次 `isOpen` 从 false → true 时 `step` 归零：用 `useEffect(() => { if (isOpen) setStep(0); }, [isOpen])`。

## 3. 改动 B：`src/components/modals/__tests__/x02_night_action_golden.test.tsx` 的 X02-04

只改 X02-04 这一条（其余用例一个字都不许动）：

- 标题断言保持 `⚔️ 哈迪寂亚：决定命运`。
- 新增断言：`t` 含 `第 1 / 3 位`；`buttonTexts()` 含 `下一位`（step 0 时不含 `确定`）。
- 新增：先点 `生`（第一张卡的），再点 `下一位`，然后断言：
  - 出现 `第 2 / 3 位`；
  - **上一个玩家的座位号已从页面消失**（用 `expect(t2).not.toContain("[1号]")` 这类判据，
    注意页面里可能还有别的 `1号` 文案 —— 先读一次实现再选一个**只在该卡出现**的字符串；
    拿不准就用 `data-testid="hadesia-current-target"` 这种显式钩子，允许你在组件里加一个 testid）。
- 新增反向断言：页面文本**不得**匹配 `/号(厨师|小恶魔|士兵|共情者|呆瓜)/`（防角色名回来）。
- 最后点 `确定`，`expect(onConfirm).toHaveBeenCalled()`。
- `onSetChoice` 断言：点「生」时被调用且第一个参数是当前座位 id。

## 4. 改动 C：`src/hooks/useConfirmHandlers.ts` 月之子日志口径

找到 `confirmMoonchild`（或含「陪葬」字样的结算函数），把日志从
`N号(月之子) 选择 M号与其陪葬，善良今晚死亡`
改为官方口径，且**不得向玩家公开目标阵营**：

```
N号(月之子) 公开选择 M号；若其为善良，该玩家在当晚死亡
```

（若该函数里还有 `setWinResult` 之类，一律不动。）

## 5. 验收（必须自己跑，贴真实输出）

```bash
npx tsc --noEmit
npx vitest run src/components/modals/__tests__/x02_night_action_golden.test.tsx --reporter=dot
npx vitest run src/hooks/__tests__ --reporter=dot
```

三条都必须 0 失败。`tsc` 若有错，先修到 0 再报告。

## 6. 禁止事项

- 不得改动 `src/hooks/useConfirmHandlers.ts` 里除月之子日志外的任何逻辑。
- 不得新增 npm 依赖。
- 不得修改其他测试文件。
- 不得 `git commit`（我自己提交）。
- 若某条判据拿不到（例如找不到「只在当前卡出现」的字符串），**加 testid** 是允许的；
  不许把断言降级成 `toContain` 松判据。
