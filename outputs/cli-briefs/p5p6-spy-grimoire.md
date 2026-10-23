# 任务：间谍魔典去掉「硬倒计时」的压力 + 行动记录默认隐藏（说书人显式展开）

仓库：`C:/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`
只改 `src/components/modals/SpyGrimoireModal.tsx` 与 `src/components/modals/__tests__/x02_night_action_golden.test.tsx` 的 **X02-07 一条**。

## 0. 强制输出协议（违反 = 本轮作废）

1. 每条回复思考 ≤ 150 字。
2. 一条回复只做一个动作（写 1 个文件，或跑 1 条命令）。
3. 禁止派子代理、禁止全仓 grep（只读我点名的两个文件）。
4. 本条回复必须直接调用 `write_file` / `edit_file`。

## 1. 背景（官方原文，勿推断）

间谍【角色能力】：「每个夜晚，你能查看**魔典**。」
【角色简介】：「间谍知道所有人的具体角色。」
【运作方式】：「每个夜晚，唤醒间谍并让他**按自己意愿的时长**来查看魔典。」

现状两个问题：
- **P5**：顶部「⏳ 查阅倒计时: 60s」+ 5 秒以下红色脉冲 ⇒ 与「按自己意愿的时长」有张力
  （实测归零**不会**关闭弹窗，所以是文案/情绪问题，不是功能问题）。
- **P6**：右侧「全部行动与情报」展示的是**他人夜间做了什么、得知了什么** ——
  这**超出**「魔典（角色标记 / 提示标记 / 阵营）」的范围。间谍只被授权看魔典。

## 2. 改动 A：倒计时改「建议用时」

在 `src/components/modals/SpyGrimoireModal.tsx` 中找到：

```tsx
              <span
                className={`text-xs font-black tracking-wide ${timeLeft <= 5 ? "text-red-400 animate-pulse" : timeLeft <= 10 ? "text-amber-300" : "text-emerald-300"}`}
              >
                ⏳ 查阅倒计时:{" "}
                <span className="font-mono text-sm font-bold">{timeLeft}s</span>
              </span>
```

改成：

```tsx
              {/* 官方【运作方式】：「让他**按自己意愿的时长**查看魔典」
                  ⇒ 这里只是**建议用时**，不计时关闭、不做红色催促（2026-10-22） */}
              <span
                className={`text-xs font-black tracking-wide ${timeLeft <= 10 ? "text-amber-300" : "text-emerald-300"}`}
                title="官方：间谍可按自己意愿的时长查看魔典。本计时仅为说书人参考，不会自动关闭。"
              >
                ⏳ 建议用时（不会自动关闭）:{" "}
                <span className="font-mono text-sm font-bold">{timeLeft}s</span>
              </span>
```

保留「⏸ 暂停 / ➕15s / ↺ 重置」三个按钮不动。

## 3. 改动 B：行动记录默认隐藏

### B1. 新增状态

在 `const [activeTab, setActiveTab] = useState<string>("all");` 下一行加：

```tsx
  // 🔒 行动记录默认隐藏：官方只授权间谍看「魔典」（角色标记/提示标记/阵营），
  //    他人夜间做了什么、得知了什么**不在**魔典范围内 ⇒ 需说书人显式展开。
  const [showActionLog, setShowActionLog] = useState(false);
```

### B2. 两处日志列表都过闸门

找到 `const filteredLogs = useMemo(...)` 结束的位置（`}, [parsedLogs, selectedSeatId, activeTab]);` 之后），
紧跟其后加：

```tsx
  /** 过闸门后的两套日志（normal 视图 / fullscreen 视图） */
  const visibleLogs = showActionLog ? filteredLogs : [];
  const visibleFullscreenLogs = showActionLog ? fullscreenLogs : [];
```

⚠️ `fullscreenLogs` 定义在文件后面（约 1100 行附近）—— **把上面这行 `visibleFullscreenLogs` 挪到
`fullscreenLogs` 定义之后**，否则 TDZ 报错。`visibleLogs` 保留在 `filteredLogs` 之后即可。

然后把两处消费点替换：
- `filteredLogs.length === 0 ?` → `visibleLogs.length === 0 ?`
- `filteredLogs.map((log) => {` → `visibleLogs.map((log) => {`
- `fullscreenLogs.length === 0 ?` → `visibleFullscreenLogs.length === 0 ?`
- `fullscreenLogs.map((log) => {` → `visibleFullscreenLogs.map((log) => {`

### B3. 空态文案分支（这是"用户能看见"的关键）

普通视图的空态（原 `filteredLogs.length === 0` 那个分支）改成两层：

```tsx
              {visibleLogs.length === 0 ? (
                showActionLog ? (
                  /* 原有「暂无记录」空态，原样保留 */
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                    <span className="text-4xl mb-3 opacity-60">📜</span>
                    <p className="text-sm font-bold text-slate-200">暂无当晚行动记录</p>
                    <p className="text-xs text-slate-400 mt-2">
                      选择的阶段或聚焦的座位暂无对应的夜间行动日志。
                    </p>
                  </div>
                ) : (
                  /* 🔒 默认隐藏：这是**规则要求**，不是加载失败 */
                  <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <span className="text-4xl opacity-70">🔒</span>
                    <p className="text-sm font-black text-amber-200">
                      行动记录默认隐藏
                    </p>
                    <p className="text-xs leading-relaxed text-slate-400 max-w-xs">
                      官方：间谍只能查看【魔典】（角色标记 / 提示标记 / 阵营）。
                      <br />
                      他人的夜间行动与所得情报不在魔典范围内。
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowActionLog(true)}
                      className="mt-1 px-3 py-1.5 rounded-lg bg-amber-800/70 hover:bg-amber-700 text-amber-100 text-[11px] font-bold border border-amber-600 transition"
                    >
                      🎙️ 说书人视角 · 展开行动记录（请勿展示给玩家）
                    </button>
                  </div>
                )
              ) : (
```

全屏视图的空态（`fullscreenLogs.length === 0` 那个分支）同样处理，文案一致，
按钮也是 `onClick={() => setShowActionLog(true)}`，只是类名可用大一号（`text-sm px-4 py-2`）。

## 4. 改动 C：X02-07（`__tests__/x02_night_action_golden.test.tsx`）

**只动 X02-07 这一条**，其余用例一个字都不许改。

1. `render` 时给一条真实日志，例如：
   ```tsx
   gameLogs={[
     { day: 1, phase: "night", message: "1号(占卜师) 查验 2号玩家" } as any,
   ]}
   ```
2. 新增断言（放在原有标题断言之后）：
   - `expect(t).toContain("建议用时（不会自动关闭）");`
   - `expect(t).toContain("行动记录默认隐藏");`
   - `expect(t, "默认不得展示他人行动日志").not.toContain("查验 2号玩家");`
     （若日志格式化后会改写字样，就改成断言 `not.toContain("查验")`；以实际渲染为准，但**必须是反向断言**）
3. 点开闸门：`fireEvent.click(findButton(/展开行动记录/))`（用现有的 `findButton`；
   若它只接受字符串，就用 `screen.getByText(/展开行动记录/)` → `fireEvent.click(...)`）。
   点完后：
   - `expect(bodyText()).not.toContain("行动记录默认隐藏");`
4. 原有「✓ 我已查看完毕 (下一步)」与 `onClose` 断言保持不动。

## 5. 验收（必须自己跑，贴真实输出）

```bash
npx tsc --noEmit
npx vitest run src/components/modals/__tests__/x02_night_action_golden.test.tsx --reporter=dot
```

两条都 0 失败才算完成。

## 6. 禁止事项

- 不得删除「全部行动与情报 / 首夜 / 第 N 夜 / 白天事件」这些 Tab（它们只是过滤，不是泄露源）。
- 不得改 `parsedLogs` 的解析逻辑。
- 不得动其他测试文件、不得 `git commit`。
- 拿不到判据时**加 data-testid**，不许把断言降级成松判据。
