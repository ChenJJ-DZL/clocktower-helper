# V7 全流程 E2E 崩溃排查与修复报告

> 排查对象：`tests/full_game_v7.spec.ts`（血染钟楼说书人助手 · Playwright 全流程自主测试）
> 现象：清缓存重跑后测试在 **页面加载阶段即 500 超时**；即使绕过加载，游戏进行中仍 **500 崩溃并退回剧本选择首页**，无法跑完。

---

## 一、问题分层（共 4 个独立根因）

测试失败并非单一 bug，而是 **4 个相互叠加的问题**，按触发顺序为：

| # | 根因 | 类型 | 触发时机 | 表现 |
|---|------|------|----------|------|
| A | 残留的 `next dev` 进程缓存处于损坏态 | 环境/缓存 | 页面首次加载 | `GET / 500`，测试卡在等待「暗流涌动」按钮（超时） |
| B | `killPlayer` 中遗留调试 `console.log` 引用了作用域外变量 `targetSeat` | **应用代码 bug（致命）** | 夜晚有玩家死亡时 | 运行时 `ReferenceError` → 夜晚动作崩溃 → 应用报错/重载 |
| C | Next.js 15.5.12 `next dev` 的 `clientReferenceManifest` 不变量缺陷 | 框架 dev 模式缺陷 | 多次客户端 `GET /` 渲染时 | `GET / 500`（`Invariant: Expected clientReferenceManifest to be defined`），应用退回首页 |
| D | `hasExecutedThisDay` 标记从未在每天开始时重置 | **应用代码 bug** | 第一次处决之后 | 每天都被判定「今日已有处决」→ 跳过黄昏/处决 → 游戏永远无法结束 |

---

## 二、修复清单

### 修复 B（致命崩溃，最根本）
**`src/hooks/useGameController.ts`**
- 删除第 437 行遗留调试日志：
  ```ts
  console.log("[DBG killPlayer] targetId=", targetId, "source=", source, "found=", !!targetSeat);
  ```
  `targetSeat` 是在 `setSeats` 更新回调内部（第 384 行）声明的局部变量，在回调外（第 437 行）**不在作用域**，运行时必抛 `ReferenceError: targetSeat is not defined`，直接打断夜晚击杀逻辑。

**`src/hooks/useExecutionHandlers.ts`**
- 删除同类遗留调试日志 `console.log("[DBG executePlayer] ...")`（`t`/`id` 虽在作用域，但属无效调试输出，一并清理）。

### 修复 D（游戏无法结束）
**`src/hooks/useGameFlow.ts`（`enterDayPhase`，约第 118 行）**
- 每个新白天开始时重置「今日是否已处决」标记：
  ```ts
  const enterDayPhase = useCallback(() => {
    dispatch(gameActions.updateState({ hasExecutedThisDay: false }));
    dispatch(gameActions.setGamePhase("day"));
  }, [dispatch]);
  ```
  该标记此前仅在初始状态为 `false`，一旦某次处决置 `true` 后**永不复位**，导致之后每天直接进入夜晚、跳过黄昏，永远无法再次处决、无法达成胜负条件。

### 修复类型错误（解锁生产构建）
**`src/hooks/useLogicDispatcher.ts`**
- 将 `setSeats` 形参类型由 `(s: Seat[]) => void` 改为正确的 React 状态签名：
  ```ts
  setSeats: Dispatch<SetStateAction<Seat[]>>,
  ```
  原类型拒绝了函数式更新 `setSeats((prev) => ...)`（第 105 行），导致 `next build` 类型检查失败，无法产出稳定生产包。

### 修复 A / C（运行环境）
- 杀掉处于损坏态的残留 `next dev` 进程，彻底清空 `.next` 缓存。
- **改用生产服务器运行 E2E**（`next build` + `next start -p 3000`）。生产服务器一次性编译、稳定提供 `client-reference-manifest`，彻底规避 Next 15.5.12 `next dev` 的清单竞态 500（根因 C），且能正常通过类型检查（根因类型错误已修）。

---

## 三、验证结果（前后对比）

| 指标 | 修复前（v7_dbg3 / rerun） | 修复后（v7_prod2） |
|------|--------------------------|-------------------|
| 页面加载 | `GET / 500` 超时 | `GET / 200` 正常 |
| 游戏内 500 | 多次出现，应用退回首页 | **0 次** |
| 是否崩溃重置 | 是（回到「请选择剧本」） | 否，连续多夜稳定运行 |
| 进入黄昏/处决 | 被跳过 | `今日尚无处决，进入黄昏` ✅ 正常进入 |
| 处决次数（单局） | 0–1 次 | **3 次**（提名→投票→处决链路打通） |
| `❌ 游戏未正常结束` | 是 | 仍是（见下「遗留问题」） |

> 当前生产服务器（pid 见 `tests/prod.log`）持续 `HTTP 200`，可随时 `npx playwright test tests/full_game_v7.spec.ts` 复跑。

---

## 四、遗留问题（非崩溃，属测试驱动策略）

游戏现在**全程不崩溃、各阶段流转正常**，但仍未在 60 轮内自然结束，原因已定位为 **测试驱动脚本的玩法策略不足**，而非应用崩溃：

1. **夜晚均为平安夜（死亡=[]）**：测试在夜晚阶段只点击推进按钮，未替「恶魔/小恶魔」选择击杀目标，故无人夜死。
2. **处决目标随机（固定提名 1号→2号）**：几乎不可能命中真正的恶魔，善良阵营无法通过处决恶魔获胜；邪恶阵营也因无夜杀难以通过减员获胜。
3. 偶发「今天已经有过处决，不能再进行处决确认」弹窗：测试在一次黄昏内点了两次「执行处决」。

**建议的下一步（如需让测试真正跑到胜负判定）**：
- 夜晚阶段：在恶魔唤醒步骤主动选择一个存活座位作为击杀目标，使夜晚产生死亡。
- 黄昏阶段：从游戏状态中识别恶魔座位并针对性提名处决（或至少避免重复点击「执行处决」）。
- 可选：在 `playwright.config.ts` 中将 `webServer` 改为 `npm run build && npm run start`，让 `npx playwright test` 自动用生产服务器，避免再踩 dev 模式 500。

---

## 五、修改文件汇总

| 文件 | 改动 |
|------|------|
| `src/hooks/useGameController.ts` | 删除作用域外 `targetSeat` 调试日志（修复 B） |
| `src/hooks/useExecutionHandlers.ts` | 删除遗留 `[DBG executePlayer]` 调试日志 |
| `src/hooks/useLogicDispatcher.ts` | `setSeats` 类型改为 `Dispatch<SetStateAction<Seat[]>>` |
| `src/hooks/useGameFlow.ts` | `enterDayPhase` 中重置 `hasExecutedThisDay` |
| 运行方式 | 由 `next dev` 切换为 `next build` + `next start`（消除 dev 模式 500） |
