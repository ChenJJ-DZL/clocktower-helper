# 任务：修「间谍首夜第二次唤醒无弹窗 ⇒ 整局卡死」

项目根：`/c/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`
dev server 已在 `127.0.0.1:3100` 运行 —— **不要重启、不要 build**。

---

## 0. 强制输出协议

1. 每条回复思考 ≤ 150 字。
2. 一条回复只做一个动作（改 1 个文件 或 跑 1 条命令）。
3. 禁止派子代理。
4. 不得 git add / git commit。
5. **第一条回复先跑复现命令**（见 §3），确认现象存在再动手。

---

## 1. 现象（已确认，不用再怀疑）

`npx playwright test e2e/full_sim/terminal_state.spec.ts --workers=1 --retries=0 -g "seed=94019"`
→ `status: "timeout"`，`uiPhaseLabel: "首夜"`，页面停在首夜，`stuck.dialog === null`。

**触发条件**：首夜唤醒队列里，间谍（`spy`）作为**最后一步**（或任意非首步）第二次出现。
例：94019 队列 = `[2号(爪牙互认), 4号(恶魔互认), 2号(间谍)]`，
走完前两步后 `currentWakeIndex = 2` 指着间谍，**没有弹窗**，也没有可点按钮。

`spy` 在队列里出现两次是**正确**的：
- 第一次来自 `minion_info`（爪牙互认，`dynamicQueueGenerator` §1.5 按每名真爪牙展开）
- 第二次是它自己的「每个夜晚查看魔典」

## 2. 已经排除的可能（别重复走）

- ❌ `roleHasNightAction("spy")` 为 false —— 它确实入队了，所以是 true
- ❌ `passiveNoAction` 跳过 —— 若走那条分支会 `continueToNextAction()` 推进，不会卡
- ❌ `maxTargets !== 0` —— `src/roles/new_engine/spy.ability.ts` 的 `targetConfig` 是 `{min:0,max:0}`
- ❌ `nightInfo` 生成失败 —— 浏览器日志有
  `[NightInfoAdapter] 角色 spy 已在新引擎注册，使用 nightInfoGenerator 生成 UI 信息`
- ❌ `handleNightAction` 里的 `roleId === "spy"` 分支没执行 —— 我在该分支加了
  `console.log("[spy-probe] ...")`，**日志一次都没打印**（已还原）
  ⇒ **`handleNightAction` 根本没被调用**

## 3. 复现与取证命令

```bash
CT_SIM_VERBOSE=1 npx playwright test e2e/full_sim/terminal_state.spec.ts --workers=1 --retries=0 -g "seed=94019" 2>&1 | grep -E "browser:|GameConsole|NightSnapshot"
```

`CT_SIM_VERBOSE=1` 会把浏览器 console 全量打到测试输出（已在
`e2e/helpers/fullSimRunner.ts` 里实现，别改）。

**已观测到的日志序列（间谍步）**：
```
[NightSnapshot] 行动前实时状态检测并生成信息 -> index=2, seatId=1, systemRoleId=none
[NightInfoAdapter] 角色 spy 已在新引擎注册，使用 nightInfoGenerator 生成 UI 信息
[GameController] 行动前实时状态检测与信息生成 -> index: 2 phase: firstNight
[NightSnapshot] 行动前实时状态检测并生成信息 -> index=2, seatId=1, systemRoleId=none
[NightInfoAdapter] 角色 spy ...
（然后什么都没有 —— 既没有 [GameConsole] Primary action clicked，也没有弹窗）
```

对比**正常步骤**（例如 94019 的第 1/2 步、或任何镇民步）：
```
[GameController] 行动前实时状态检测与信息生成 -> index: N
[NightSnapshot] ...
[NightInfoAdapter] ...
[GameConsole] Primary action clicked {label: 确认 & 下一步, ...}
[executeViaNewEngine] PREVIEW mode for <role>, targets: []
...
```

## 4. 结论方向（我的判断，供你验证，不要盲信）

正常步骤靠 **GameConsole 右侧面板的主按钮「确认 & 下一步」** 启动
（点它 → `executeNightAbility` → `handleNightAction`）。
间谍步该按钮**没有渲染** ⇒ 链路断在「GameConsole 的 primaryAction 计算」这一层。

去找 `primaryAction` 的**计算处**（不是渲染处；渲染在
`src/components/game/console/GameConsole.tsx:1124` 的 `{primaryAction && (...)}`）。
重点看该计算里有没有针对 `roleId === "spy"` / `无夜间行动` / `passiveNoAction` /
`wakeQueueIds` 重复项 / `hasUsedAbility` 的**提前 return null**。

⚠️ 特别注意：间谍是「同一座位在同一夜里第二次被唤醒」——
**任何按「座位/角色是否已处理过」去重的逻辑都会把第二次误判成「已处理」而返回 null**。
这是最可疑的一类根因。

## 5. 验收（必须全绿才算完成）

```bash
# ① 4 个受影响的种子必须终局
npx playwright test e2e/full_sim/terminal_state.spec.ts --workers=1 --retries=0 -g "seed=94001|seed=94002|seed=94018|seed=94019"

# ② 基线 9 条不能被打破
npx playwright test e2e/full_sim/terminal_state.spec.ts --workers=1 --retries=0 -g "终局四条"

# ③ 类型 + 单测
npx tsc --noEmit
npx vitest run --reporter=dot
```

## 6. 边界

- 只改产品代码（`src/`），**不要改 e2e 文件、不要改既有测试**。
- 如果根因是「某段按角色去重的逻辑」，改完请补一条**单测**（放
  `src/hooks/__tests__/` 或 `src/utils/__tests__/`，名字自取）锁住
  「同一座位同夜第二次唤醒仍必须产出行动入口」。
- 完成后输出：`DONE spy=<修好的种子数>/4 baseline=ok vitest=<passed>`
