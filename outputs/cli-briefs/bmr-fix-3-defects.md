# 任务：修 3 个产品缺陷（黯月初升 3 条 E2E 红）

仓库根：`C:/Users/chenj/WorkBuddy/血染说书人/clocktower-helper`

## 统一约束（务必先读）

1. **不得修改测试断言**（`e2e/**`）。这三条用例的期望值已按官方原文核对过，是产品没实现。
2. 若你判断某条其实「产品对、测试错」，**停手先说明理由**并附官方原文，不要擅自改期望值。
3. 改完必须自己跑验收命令（见每条末尾）。dev server 若未启动，先：
   `NODE_OPTIONS="" npx next dev -p 3100 > ../temp/dev3100.log 2>&1 &`
   等 `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3100/` 返回 200 再跑测试。
   跑完请**杀掉 3100 端口进程**（主控会话要用）。
4. 每条修复都要有**判据唯一入口**（新增/复用 `src/utils/*Rule.ts` 的纯函数优先），
   禁止在组件里内联 `role.type === "minion"` 之类的裸判断（会被 `singleSourceOfTruth` 棘轮判红）。
5. 报告格式：每条写「根因文件:行号 / 改了什么 / 验收命令输出」。

---

## 缺陷 1：水手被僵怖杀死（应为不死）

**用例**：`e2e/bad_moon_rising/role_scenarios.spec.ts` → `水手：夜里被恶魔攻击 ⇒ 不死`
**期望**：水手 `isDead === false`；**实际**：`isDead === true`

官方（`officialRoleDocs.json` · 水手）：
> 「每个夜晚，你要选择一名存活的玩家：你或他之一会醉酒直到下个黄昏。**你不会死亡。**」

**已查到的线索**：
- `src/utils/soldierImmunity.ts:81` 的 `isImmuneToDemonKill` **已经包含** `seat.role?.id === "sailor"`；
- 但 `src/roles/new_engine/zombuul.ability.ts` 的击杀分支**疑似没有调用** `isImmuneToDemonKill`
  （imp / fang_gu 等调了，僵怖可能漏了）。
- 修法方向：让僵怖的击杀路径与其它恶魔一致走 `isImmuneToDemonKill`；
  **注意**僵怖自己的假死逻辑（`zombuulLives` / legacy `src/roles/demon/zombuul.ts`）不要动。

**验收**：
```
NODE_OPTIONS="" npx playwright test e2e/bad_moon_rising/role_scenarios.spec.ts --grep "水手：夜里被恶魔攻击" --retries=0
```

---

## 缺陷 2：处决爪牙后吟游诗人没有让任何人醉酒（应为除自己外全员醉酒）

**用例**：`吟游诗人：爪牙死于处决 ⇒ 除自己外全员醉酒`（同文件 G6 组）
**期望**：除 `minstrel` 外全体 `isDrunk === true`；**实际**：`isDrunk === true` 的座位 **0 个**

官方（吟游诗人）：
> 「当一名爪牙死于处决时，除了你和旅行者以外的所有其他玩家醉酒直到明天黄昏。」

**已查到的线索**：
- 触发逻辑在 `src/hooks/useGameController.ts:931` 起（`killPlayer` 内、`source === "execution"` 分支），
  判据在 `src/utils/minstrelRule.ts::resolveMinstrelIntoxication`；
- 可能原因（按可能性排序）：
  ① 处决主链走的是 legacy `EXECUTE_PLAYER`，没进 `killPlayer`；
  ② `resolveMinstrelIntoxication` 的入参/判据要求不符（例如要求 `executedSeat.executedToday`，
     或把「爪牙」判成 `role.type === "minion"` 但实际读的是 `effectiveRole`）；
  ③ 写入 `isDrunk` 之后被 `syncStatusEffectsToSeat` 或下一帧覆盖。

**验收**：
```
NODE_OPTIONS="" npx playwright test e2e/bad_moon_rising/role_scenarios.spec.ts --grep "吟游诗人：爪牙死于处决" --retries=0
```

---

## 缺陷 3：主谋没有把「恶魔死于处决」延长为额外一夜（应续命）

**用例**：`主谋：恶魔死于处决 ⇒ 额外一夜，不立即终局`（同文件 G6 组）
**期望**：处决恶魔后 `status === "night"`（额外一夜）+ 不进终局 UI；**实际**：直接 `gameover`

官方（主谋）：
> 「如果恶魔因为死于处决而因此导致游戏结束时，再额外进行一个夜晚和一个白天。
>  在那个白天如果有玩家被处决，他的阵营落败。」

**已查到的线索**：
- `src/hooks/useExecutionHandlers.ts:1513` 有 `if (mastermindFinalDay?.active) {...}`，
  但文件内注释自己写着「② `mastermindFinalDay` 从未被激活 ⇒ 这段代码根本不执行」；
- 判据函数 `src/utils/mastermindRule.ts::resolveMastermindExtraDay` 已存在；
- 修法方向：在**终局判定的位置**（`checkGameOver` / `terminalRules` 调用前）先用
  `resolveMastermindExtraDay` 判断，成立则置 `mastermindFinalDay.active = true`、
  **不**置 gameOver、继续进夜；并保证在那个额外白天里有人被处决时，
  按官方「他的阵营落败」结算（被处决者阵营判负）。

**⚠️ 特别注意**：这条会碰终局链路，务必确认以下既有红线不被破坏：
- `continueToNextAction` 开头的 `if (victoryRef.current) return;`（终局态不可被后续流程覆盖）；
- 终局快照必须落盘且带 `winResult`；
- 「存活 ≤2 ⇒ 邪恶胜」的兜底判据（`thresholdFiredRef`）。

**验收（两条，都要绿）**：
```
NODE_OPTIONS="" npx playwright test e2e/bad_moon_rising/role_scenarios.spec.ts --grep "主谋：恶魔死于处决" --retries=0
NODE_OPTIONS="" npx tsc --noEmit
```

---

## 完成后请输出

1. 三条各自的根因（文件:行号）+ 改动摘要；
2. 三条验收命令的原始输出（pass/fail 行）；
3. `git diff --stat` 结果（确认只改了该改的文件，没动 `e2e/`）。
