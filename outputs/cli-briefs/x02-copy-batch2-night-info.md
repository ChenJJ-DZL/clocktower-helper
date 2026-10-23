# 任务：弹窗文案对账 · 批 2（夜间信息 8 个）

仓库：`C:/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`
这是 X02 文案对账的第二批。第一批 10 个已完成（见 `outputs/X02-文案对账-2026-10-22.md` 一~八节），
本批做剩下 33 个里的**夜间信息 8 个**。

## 0. 强制输出协议（违反 = 本轮作废）

1. 每条回复思考 ≤ 150 字。
2. 一条回复只做一个动作（写 1 个文件，或跑 1 条命令）。
3. 禁止派子代理。允许读：这 8 个组件文件、`src/data/officialRoleDocs.json`、
   `src/components/modals/__tests__/x02_night_info_golden.test.tsx`。
4. 本条回复必须直接调用 `write_file` / `edit_file`。

## 1. 本批范围（8 个 ModalType）

| # | ModalType | 组件（在 `src/components/modals/` 下） |
|---|---|---|
| 11 | `INFO_RESULT` | `InfoResultModal.tsx` |
| 12 | `FORTUNE_TELLER_RESULT` | 复用 `InfoResultModal`（看 `GameModals.tsx` 怎么拼 title/message） |
| 13 | `CERENOVUS_NOTICE` | `CerenovusNoticeModal.tsx`（若不存在，去 `GameModals.tsx` 找内联） |
| 14 | `GAMBLER_JUDGE` | 内联在 `GameModals.tsx` |
| 15 | `JUGGLER_JUDGE` | `JugglerJudgeModal.tsx` 或内联 |
| 16 | `LUNATIC_RPS` | `LunaticRpsModal.tsx` 或内联 |
| 17 | `DRUNK_CHARADE_SELECT` | `DrunkCharadeSelectModal.tsx` 或内联 |
| 18 | `ROLE_SELECT` | `RoleSelectModal.tsx` 或内联 |

## 2. 官方基线怎么取（**只许引用，不许编**）

`src/data/officialRoleDocs.json` 是 `{ "角色名": "整段文本" }` 的扁平结构，键名用**本地化名**：

- 占卜师 → 键 `占卜师`
- 洗脑师 → 键 `洗脑师`
- 赌徒 → 键 `赌徒`
- 杂耍艺人 → 键 `杂耍艺人`
- 疯子 → 键 `疯子`
- 酒鬼 → 键 `酒鬼`
- 麻脸巫婆 → 键 `麻脸巫婆`（**不要**找「坑道巫婆」，那个键不存在）

文本里分段：【背景故事】【角色能力】【角色简介】【范例】【运作方式】【提示标记】。

> ⚠️ 只允许摘录该 JSON 的原文。**查不到就写「无官方对应条目」，不许自己编一句官方腔**。
> 这条已经踩过：上一批把「教授能复活外来者」当真，结果把官方范例测试跑红。

## 3. 每个弹窗判三件事

① **规则方向**：弹窗里如果有规则声明（"如果…则…"、"你可以…"），必须与官方原文一致。
   方向反了、条件漏了、"通常/必定"这类官方没有的限定词，都算不一致。
② **信息泄露**：玩家可见区是否给出**不该知道**的东西 —— 角色名、阵营、别人的选择。
   （座位号是公开信息；`storytellerFacing` / 明确标注"说书人专用"的区块不算泄露。）
③ **自创规则**：官方原文没有的效果/概率/限制，写进玩家可见文案即算缺陷。

## 4. 交付物

### 4.1 追加对账表

在 `outputs/X02-文案对账-2026-10-22.md` 末尾追加一节 `## 九、批 2 · 夜间信息 8 个`，
表格列：`# | ModalType | 组件 | 玩家可见文案（改前） | 官方原文（逐字） | 结论`。
结论只用三种：`✅ 通过` / `🔴 不一致 → 已修` / `⚠️ 待人工确认（原因）`。

### 4.2 只改确定的问题

- 改文案时在代码里加一行注释写明出处，格式：`// 官方（officialRoleDocs.json · 占卜师 · 角色能力）：「…」`
- 改了哪条，就同步 `x02_night_info_golden.test.tsx` 里对应断言（**只许改这个文件**）。
- 拿不准的一律只记录、不改代码，写进「待人工确认」。

### 4.3 收尾行

文件最后必须有一行机器可读的收尾（我用来对账进度）：

```
DONE batch=2 checked=8 fixed=<修了几条> pending=<待确认几条>
```

## 5. 验收（必须自己跑，贴真实输出）

```bash
npx tsc --noEmit
npx vitest run src/components/modals/__tests__/x02_night_info_golden.test.tsx --reporter=dot
```

两条都 0 失败。

## 6. 禁止事项

- 不得修改 `src/data/officialRoleDocs.json`。
- 不得改其他测试文件、不得 `git commit`。
- 不得把断言降级成松判据（`toContain("确认")` 这种）；标题仍是 `h2.textContent` 全等。
- 找不到组件就记 `⚠️ 待人工确认（找不到独立组件）` 并继续下一个，别卡住。
