# 任务：修「恶魔已死却不终局」（seed 94013）

项目根：`/c/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`
dev server 在 `127.0.0.1:3100` —— **不要重启、不要 build**。

## 0. 强制输出协议

1. 每条回复思考 ≤ 150 字；一条回复只做一个动作。
2. 禁止派子代理；不得 git add / git commit。
3. 第一条回复先跑 §2 的复现命令确认现象，再动手。

## 1. 现象（已确认，别怀疑）

```bash
npx playwright test e2e/full_sim/terminal_state.spec.ts --workers=1 --retries=0 -g "seed=94013"
```
→ `gameover: false`，`uiPhaseLabel: "第 13 夜"`，跑满 12 个昼夜仍未终局。

同一份报告里的关键字段：
```
finalSeats:
  id0 cerenovus  minion   isDead=true
  id1 sage       townsfolk isDead=true
  id2 juggler    townsfolk isDead=true
  id3 klutz      outsider  isDead=false
  id4 fang_gu    demon     isDead=true      ← 恶魔已死
deadSeatsLive: [0,1,2,4]     snapAlive: 3
trail: night#1..night#12 全部 day↔night 循环，从未 gameover
```

**按官方四条「恶魔已死 ⇒ 善良胜」，第 5~6 夜就该终局。**

## 2. 复现与取证

```bash
CT_SIM_VERBOSE=1 npx playwright test e2e/full_sim/terminal_state.spec.ts --workers=1 --retries=0 -g "seed=94013" 2>&1 | grep -E "browser:|GameController|checkGameOver|终局|胜利"
```

## 3. 已从日志读出的时间线（供你省掉一半工作）

- 第 1~5 夜：方古（座位 5，`seatId=4`）正常行动，目标选外来者
- **第 5 夜**：`queue: [洗脑师(0), 方古(3)]` —— 方古的**行动者座位变成了 3**
  （原本方古在座位 4）。说明第 5 夜之前发生过**角色交换**（方古与座位 3 的呆瓜换了角色）
- 第 6 夜起：`queue: [方古(3)]`，弹窗文案「场上没有可选目标 —— 直接确认即视为无人受影响」
  ⇒ 此时座位 3 的「方古」还活着、还能被唤醒，但**座位 4 的方古已经死了**（`finalSeats`）
- 之后 7 个夜晚空转，从不终局

## 4. 高度可疑的三个点（按优先级）

1. **角色交换后 `role.type` 与座位不同步**
   `finalSeats` 里 id3 = `klutz / outsider`，但引擎把它当方古（恶魔）在唤醒
   ⇒ 说明**座位上的 `role` 与某个镜像（`seatsRef` / `_abilityResults` / engine snapshot）分叉**。
   本仓库有过同型事故（`useLogicDispatcher` 的 `seatsRef` 与 `useDayActions` 的 `commitSeats`
   两份镜像分叉 ⇒ 刚处决的 isDead 被旧数组写回）。**先查这次是不是同一类。**

2. **`checkGameOver` 的调用面**
   `src/hooks/useLogicDispatcher.ts:171` 用 `seatsRef.current` 判；调用点散在
   `useConfirmHandlers` / `useDayActions` / `killPlayer`。
   若「恶魔因**角色交换**而"变成"非恶魔」这条路径没有任何调用点 ⇒ 永远不会判。

3. **`isSeatDemon` 的口径**
   `src/utils/seatAlignment.ts:139`。核对它读的是 `role.type` 还是 `effectiveRole` /
   `charadeRole`（酒鬼/提线木偶会走后者）。角色交换后谁是恶魔必须只有一份答案。

## 5. 验收（必须全绿）

```bash
# ① 94013 必须终局且判善良胜
npx playwright test e2e/full_sim/terminal_state.spec.ts --workers=1 --retries=0 -g "seed=94013"

# ② 基线 9 条不能被打破
npx playwright test e2e/full_sim/terminal_state.spec.ts --workers=1 --retries=0 -g "终局四条"

# ③ 类型 + 单测
npx tsc --noEmit
npx vitest run --reporter=dot
```

⚠️ `e2e/full_sim/terminal_state.spec.ts` 里 94013 现在带 `test.fail(true, …)`。
**修好后它会报 "unexpectedly passed"（红）** —— 那时把 `X05_KNOWN_DEFECTS` 里的 `94013`
那一条删掉即可（这是棘轮，别反过来把 test.fail 留着）。

## 6. 边界

- 只改产品代码；不要改 e2e 文件（除了删 `X05_KNOWN_DEFECTS[94013]` 那一行）。
- 修完请补一条**单测**锁住「角色交换导致恶魔身份转移 ⇒ 终局判据必须跟上」，
  放 `src/hooks/__tests__/` 或 `src/utils/__tests__/`。
- 输出：`DONE 94013=gameover terminal=<good|evil> baseline=ok vitest=<passed>`
