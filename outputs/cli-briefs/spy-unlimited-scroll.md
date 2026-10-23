# 任务：间谍魔典去掉倒计时（不限时）+ 行动记录恢复显示并改成「上下滑动查看」

仓库：`C:/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`
只改这三个文件：
1. `src/components/modals/SpyGrimoireModal.tsx`
2. `src/components/modals/__tests__/x02_night_action_golden.test.tsx`（**只改 X02-07 一条**）
3. `src/components/modals/__tests__/trouble_brewing_22_roles_ui_sweep.test.tsx`（**只改间谍那一条**）

## 0. 强制输出协议（违反 = 本轮作废）

1. 每条回复思考 ≤ 150 字。
2. 一条回复只做一个动作（写 1 个文件，或跑 1 条命令）。
3. 禁止派子代理、禁止全仓 grep（只读我点名的文件）。
4. 本条回复必须直接调用 `write_file` / `edit_file`。

## 1. 背景：上一轮做反了，按用户决定改回来

官方【角色能力】：「每个夜晚，你能查看**魔典**。」
官方【运作方式】：「唤醒间谍并让他**按自己意愿的时长**来查看魔典。」

用户的明确决定（2026-10-22）：
- **不要 60 秒硬倒计时，改成不限时**（连「建议用时」也不要，倒计时整块删掉）。
- **行动记录要显示**（上一轮改成默认隐藏是错的），
  「超出魔典范围」的那部分用**上下滑动**查看即可。

## 2. 改动 A：删掉整套倒计时

删除以下全部内容（一个不留）：
- `const INITIAL_TIMER_SECONDS = 60;`
- `const [timeLeft, setTimeLeft] = useState(INITIAL_TIMER_SECONDS);`
- `const [isTimerRunning, setIsTimerRunning] = useState(true);`
- 监听 `timeLeft` 的那个 `useEffect`（`setInterval` 倒计时）
- `handleAddExtraTime` / `handleResetTimer`
- `timerPercent` / `timerColor`（含它们在别处的引用）

把顶部条左侧那一整块（倒计时文字 + 进度条 + 暂停/+15s/重置 三个按钮）替换为**一行静态说明**：

```tsx
          {/* 官方【运作方式】：让间谍按自己意愿的时长查看魔典 ⇒ 不设倒计时 */}
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
            <span>⏳ 不限时 —— 按自己意愿的时长查看魔典</span>
          </div>
```

右侧指标徽章（总人数 / 善良 / 邪恶 / 死亡 …）**原样保留**。
`useState` / `useEffect` 等 import 若因此变成未使用，必须一并清理（`tsc` 会抓）。

## 3. 改动 B：行动记录恢复显示 + 上下滚动

1. 删除 `const [showActionLog, setShowActionLog] = useState(false);`
2. 删除 `const visibleLogs = showActionLog ? filteredLogs : [];`
   与 `const visibleFullscreenLogs = showActionLog ? fullscreenLogs : [];`
3. 把消费点改回原名：
   - `visibleLogs.length === 0` → `filteredLogs.length === 0`
   - `visibleLogs.map(` → `filteredLogs.map(`
   - `visibleFullscreenLogs.length === 0` → `fullscreenLogs.length === 0`
   - `visibleFullscreenLogs.map(` → `fullscreenLogs.map(`
4. **删掉两处「🔒 行动记录默认隐藏」占位块**（连同里面的按钮），
   让 `showActionLog ? (...) : (...)` 这个三元退回原来的单一空态：
   - 普通视图空态文案：`暂无对应行动或情报记录`
   - 全屏视图空态文案：`暂无当晚行动记录`
   （空态里原有的副标题/图标能保留就保留。）
5. **上下滑动**（这是本次的验收点）：
   - 普通视图列表容器保持/改成：`className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1.5 space-y-2.5"`
   - 全屏视图列表容器保持/改成：`className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2 space-y-3"`
   - 两处的**父容器**必须带 `min-h-0`（否则 flex 子项不会收缩，滚动条不出现）。
   - 在普通视图 Tab 栏右侧加一行小提示（仅当有记录时显示）：
     ```tsx
     {filteredLogs.length > 0 && (
       <span className="text-[10px] text-slate-500 font-bold whitespace-nowrap">
         ⇅ 上下滑动查看全部
       </span>
     )}
     ```

## 4. 改动 C：X02-07（只改这一条）

现在那条断言的是「建议用时 / 行动记录默认隐藏 / 点开闸门」。改成：

```tsx
    // ②b 不设倒计时（官方：按自己意愿的时长查看魔典）
    expect(t).toContain("不限时");
    expect(t).not.toContain("倒计时");
    expect(t).not.toContain("建议用时");

    // ②c 行动记录默认就显示（超出魔典范围的部分靠上下滑动查看，不做隐藏）
    expect(t).not.toContain("行动记录默认隐藏");
    expect(t).toContain("查验"); // gameLogs 里那条「1号(占卜师) 查验 2号玩家」

    // ②d 列表容器必须可纵向滚动
    const scrollers = Array.from(
      document.querySelectorAll<HTMLElement>(".overflow-y-auto")
    );
    expect(
      scrollers.length,
      "行动记录必须放在 overflow-y-auto 容器里（否则超出部分看不到）"
    ).toBeGreaterThan(0);
```

`gameLogs` 那条测试数据保留（上一轮已经加过），不要删。

## 5. 改动 D：`trouble_brewing_22_roles_ui_sweep` 的间谍那条

把上一轮改的两个断言改回/改成：

```tsx
    expect(t, "缺少不限时说明").toContain("不限时");
    expect(t, "无日志时应渲染空态").toContain("暂无对应行动或情报记录");
```

（如该用例里还有「行动记录默认隐藏」的断言，一并删掉。）

## 6. 验收（必须自己跑，贴真实输出）

```bash
npx tsc --noEmit
npx vitest run src/components/modals/__tests__ --reporter=dot
```

两条都 0 失败才算完成。

## 7. 禁止事项

- 不得删除 Tab（全部行动与情报 / 首夜 / 第 N 夜 / 白天事件）。
- 不得改 `parsedLogs` 解析逻辑、不得改 `fullscreenLogs` 的计算。
- 不得动其他测试文件、不得 `git commit`。
- 拿不到判据时加 `data-testid`，不许把断言降级成松判据。
