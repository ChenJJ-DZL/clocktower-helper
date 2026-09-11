---
name: clocktower-role-testing
description: 测试血染钟楼角色能力时使用(镇民/外来者/爪牙/恶魔/传奇)。覆盖四层测试体系:vitest 单测、runFullAbilityPipeline 管道集成测试、L3.5 不变式与随机对局仿真,以及 Playwright / bsk 的 UI 端到端验证。
---

# 血染钟楼 · 角色测试

## 0. 铁律

1. `json/` 受保护:`json/full/*.json` 是角色规则真源,未经用户明确授权**禁止修改**(见 `.clinerules`、`json/.clinerules`)。
2. **测试驱动**:角色能力改动必须配套 vitest 用例,没通过测试的改动不算交付。
3. **改完必检**:`npm run check:all`(biome fix + tsc + vitest + madge 循环依赖)。
4. **不可变**:`stateUpdate` 必须返回新快照,禁止原地修改 `snapshot`。
5. 一次性调试脚本用完即删(见 `AGENTS.md`)。

## 1. 系统地图

| 用途 | 位置 |
| --- | --- |
| 角色能力实现 | `src/roles/new_engine/<role>.ability.ts`(已注册 214 个能力) |
| 能力工厂与类型 | `src/roles/core/roleAbility.types.ts` |
| 能力注册表 | `src/roles/new_engine/abilityRegistry.ts` |
| 管道执行器 | `src/utils/middlewarePipeline.ts` |
| 上下文类型 | `src/utils/middlewareTypes.ts` |
| 不变式框架 | `src/utils/invariantTesting/` |
| 角色规则数据(只读) | `json/full/*.json` |
| UI 端到端 | `test_automation/e2e/*.spec.js` |

关键导出:
- `createRoleAbility(...)` 与 `AbilityTriggerTiming` 来自 `src/roles/core/roleAbility.types.ts`
- `runFullAbilityPipeline(middlewareSet, ctx)` / `runMiddlewarePipeline` / `runAbilityPipeline` 来自 `src/utils/middlewarePipeline.ts`

## 2. 能力文件结构

每个角色导出一个 `createRoleAbility({...})` 对象:

```ts
export const impAbility = createRoleAbility({
  abilityId: "imp_night_ability",
  triggerTiming: [AbilityTriggerTiming.EVERY_NIGHT],
  firstNightPriority: null,   // 首夜不唤醒
  otherNightPriority: 45,     // 非首夜唤醒优先级
  firstNightOnly: false,
  wakePromptId: "role.imp.wake",
  targetConfig: { min: 1, max: 1, allowSelf: true, allowDead: true },
  preCheck:    [preCheckAliveAndStatus, otherNightOnlyCheck],
  calculate:   [calculateResult],
  stateUpdate: [stateUpdateResult],
  postProcess: [postProcessResult],
});
```

管道顺序 `preCheck → calculate → stateUpdate → postProcess`,每步都是 `(ctx) => Promise<MiddlewareContext>` 中间件数组;把 `ctx.aborted` 置真可中断后续阶段。

`MiddlewareContext` 关键字段:
- `snapshot`:`{ nightCount, seats, statusEffects, gamePhase }`
- `actionNode`:当前唤醒节点(`seatId` / `roleId` / `priority` / `targetIds` / `meta`)
- `targetIds`:说书人选择的目标座位
- `meta`:阶段间传递的临时数据(结果、日志、UI 数据)
- `preview`:为真时只跑 preCheck + calculate,不落状态(用于确认弹窗预览)

## 3. 四层测试体系

| 层 | 位置 | 作用 |
| --- | --- | --- |
| L1 单测 | `src/roles/__tests__/*.test.ts` | 角色级快速断言 |
| L3 集成 | `src/roles/__tests__/integration/*.test.ts`(69 个) | 用 `runFullAbilityPipeline` 驱动真实管道 |
| L3.5 不变式 | `src/utils/invariantTesting/` + `src/roles/__tests__/invariant/` | 随机对局仿真 + I1–I11 通用规则断言 |
| L4 E2E | `test_automation/e2e/*.spec.js` | Playwright 真实 UI(桌面/平板/手机三端) |

另有 `tests/wiki-scenarios/`(按官方 Wiki 场景)与 `tests/ui-interaction/`(UI 交互)。

L3.5 一键跑:

```bash
npx vitest run src/roles/__tests__/invariant
```

可用不变式:`I1DeathMarkersConsistent` `I2QueueLegality` `I3DeadPlayerAbilityBlocked` `I4PoisonedInfoCorrupted` `I5TargetLegality` `I6PriorityMatchesOfficialOrder` `I7NightDeathHasSource` `I8AbilityConfigConsistent` `I9SettlementProduced` `I10GlobalRulesConsistent` `I11EffectSemanticsApplied`,以及 `runInvariantSuite` / `simulateNight` / `generateRandomGame` / `buildAbilityMap`。

## 4. 角色集成测试模板

```ts
import { describe, expect, test } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { mayorAbility } from "../../new_engine/mayor.ability";

function seat(id: number, rid: string, type: string) {
  return {
    id, playerName: "P" + (id + 1),
    isDead: false, isAlive: true, isDrunk: false, isPoisoned: false,
    role: { id: rid, name: rid, type },
    statusEffects: [], hasAbilityEvenDead: false,
  };
}

function ctx(overrides: Partial<MiddlewareContext> = {}): MiddlewareContext {
  return {
    snapshot: {
      nightCount: 3, gamePhase: "night",
      seats: [seat(0, "mayor", "townsfolk"), seat(1, "imp", "demon")],
      statusEffects: {},
    },
    actionNode: {
      seatId: 0, roleId: "mayor", roleName: "镇长", priority: 0,
      isFirstNightOnly: false, abilityId: "m", wakeMessage: "",
      firstNightPriority: null, otherNightPriority: null,
      targetIds: [], processed: false, success: false, meta: {},
    },
    targetIds: [], meta: {}, aborted: false,
    ...overrides,
  };
}

test("镇长替死触发", async () => {
  const r = await runFullAbilityPipeline(
    mayorAbility,
    ctx({ meta: { isMayorDying: true } })
  );
  expect(r.aborted).toBe(false);
});
```

断言前先看 `r.aborted` 与 `r.meta._preCheckAborted`,避免把"被前置校验拦下"误判为"能力生效"。

## 5. 常用命令

```bash
npm run dev                     # 本地开发 → http://localhost:3000
npm run test                    # 全量 vitest(基线:145 文件 / 1153 用例全绿)
npx vitest run src/roles/__tests__/integration/mayor.test.ts   # 单文件
npx vitest run -t "镇长"        # 按用例名过滤
npm run type                    # tsc --noEmit
npm run fix                     # biome check --write
npm run circular                # 循环依赖检查
npm run check:all               # 全流程
cd test_automation; npx playwright test --config=playwright.config.js   # E2E
```

## 6. UI 端到端验证

- 自动化:`test_automation` 的 Playwright,`baseURL` 为 `http://localhost:3000`,`reuseExistingServer: true`,含 desktop-chrome / tablet / mobile 三个 project。
- 交互式:用 `browser-skill`(`bsk` CLI)驱动真实 Chromium 打开 `http://localhost:3000`,读 `@eN` 语义快照、截图、console / network。

## 7. 已知测试债(改到相关角色时顺手补)

`src/roles/__tests__/` 顶层 27 个文件中有 **20 个是空断言**(`expect(1).toBe(1)` / `expect(true).toBe(true)`,共 50 处),涵盖 `baron / chef / imp / mayor / librarian / monk / poisoner / spy / recluse / soldier` 等。这些角色当前**没有真实覆盖** —— 改动它们时优先在 `integration/` 下写真测试。

## 8. 常见坑

- `runFullAbilityPipeline` 在 `aborted` 为真时立即返回;先区分"能力生效"与"被前置校验拦下"。
- 醉酒 / 中毒通常体现在 `snapshot.seats[].isDrunk / isPoisoned` 或 `statusEffects`,不要假设只在 `meta`。
- 首夜与非首夜优先级是独立字段(`firstNightPriority` / `otherNightPriority`),恶魔类角色首夜常为 `null`。
- 改动 `json/` 会直接破坏测试基线,不要动。
