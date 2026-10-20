/**
 * L1 角色矩阵（第一版）：每个剧本角色 × 5 种场景
 * ==================================================================
 * 总目标（用户 2026-10-20 定调）：覆盖所有剧本内所有角色的
 *   「每一个弹窗内容 / 每一个环节顺序 / 每一个技能效果 / 整局合规」。
 *
 * 本文件负责其中的**技能效果**这一层，形态是「纯 Node 跑能力管道」，
 * 不开浏览器。每个角色跑 5 个场景：
 *   ① 首夜常态 ② 后续夜常态 ③ 后续夜·施法者中毒 ④ 后续夜·施法者醉酒 ⑤ 后续夜·涡流世界
 *
 * 第一版只锁三条**通用不变量**（不依赖具体角色语义，先求铺开覆盖面）：
 *   G1 管道**不得抛异常**（能力实现崩溃 = 玩家侧直接卡死）；
 *   G2 产出文案**不得含脏值**（`undefined` / `NaN` / `[object Object]`）
 *      —— 这类是「模板变量没替换」，玩家会看到字面量；
 *   G3 `meta.abilityResult` 与 `xxxResult` 里的字符串必须可读（同上）。
 *
 * 后续版本再逐角色加**语义断言**（效果真的落库、数值对得上官方）。
 * 先跑出「有多少角色连跑都跑不通 / 文案有脏值」，再逐个修。
 */
import { describe, expect, it } from "vitest";
import { roles, scripts } from "../../../app/data";
import { buildAbilityMap } from "../../utils/invariantTesting/engineConfig";
import { runRole, seat } from "./_tbHarness";

/**
 * roleId → IRoleAbility。
 * ⚠️ `buildAbilityMap()` 的 key 是 **abilityId**（如 `spy_night_ability`），
 *    不是 roleId。必须按 `ability.roleId` 反查，否则整张矩阵会「一个都取不到」
 *    （第一版就是这么错的，覆盖率自检当场报出 84 个角色全部未覆盖）。
 */
const ABILITY_BY_ROLE: Record<string, any> = (() => {
  const out: Record<string, any> = {};
  for (const ab of Object.values(buildAbilityMap() as Record<string, any>)) {
    const rid = (ab as any)?.roleId;
    if (rid && !out[rid]) out[rid] = ab;
  }
  return out;
})();

/** 9 剧本里出现过的全部角色（去重） */
const ALL_ROLE_IDS: string[] = Array.from(
  new Set(
    (scripts as any[]).flatMap((s) => s.roleIds as string[])
  )
);

/** 中性填充角色：无夜间主动能力，不会干扰目标角色 */
const FILLERS = ["soldier", "mayor", "saint", "butler"];

/**
 * 纯被动角色：官方没有任何夜间/白天主动能力，新引擎不为其注册 ability 属正常。
 * 判据依据：`src/data/nightOrder.json` 里没有它们的唤醒项，且能力全是被动结算。
 * ⚠️ 新增条目必须确认「确实没有主动能力」，否则等于给矩阵留洞。
 */
const PASSIVE_NO_ABILITY = new Set(["saint"]);

function makeBoard(roleId: string): any[] {
  const seats = [seat(0, roleId, {})];
  FILLERS.forEach((rid, i) => seats.push(seat(i + 1, rid, {})));
  return seats;
}

interface Scenario {
  key: string;
  label: string;
  kind: "night" | "day";
  isFirstNight: boolean;
  poison?: boolean;
  drunk?: boolean;
  vortox?: boolean;
  /** 构造「该角色本夜死亡」事件（ON_DEATH 类角色的触发前提） */
  deadSelf?: boolean;
}

const NIGHT_SCENARIOS: Scenario[] = [
  { key: "first", label: "首夜常态", kind: "night", isFirstNight: true },
  { key: "other", label: "后续夜常态", kind: "night", isFirstNight: false },
  { key: "poisoned", label: "后续夜·中毒", kind: "night", isFirstNight: false, poison: true },
  { key: "drunk", label: "后续夜·醉酒", kind: "night", isFirstNight: false, drunk: true },
  { key: "vortox", label: "后续夜·涡流世界", kind: "night", isFirstNight: false, vortox: true },
];

const DAY_SCENARIOS: Scenario[] = [
  { key: "day", label: "白天常态", kind: "day", isFirstNight: false },
];

/**
 * 死亡事件场景：给 ON_DEATH 类角色构造「本夜死亡」的触发前提。
 *
 * ⚠️ 没有这个场景时，27 个纯事件型角色在矩阵里**一次都跑不到**
 *   （实测清单：ravenkeeper/virgin/soldier/mayor/recluse/scarlet_woman/…）。
 *   它们的 preCheck 第一句就是「今晚未死亡 → abort」，不造事件就永远走不到
 *   真正的结算分支，等于零覆盖。
 */
const DEATH_SCENARIOS: Scenario[] = [
  { key: "death", label: "当夜死亡", kind: "night", isFirstNight: false, deadSelf: true },
];

/**
 * 按能力的 `triggerTiming` 选场景。
 * ⚠️ 2026-10-20 实测：`slayer`（杀手）是**白天**能力，硬按夜间跑必然空转
 *   （G3 报 5 条）。场景必须与触发时机匹配，否则矩阵自己制造假阳性。
 */
function scenariosFor(ability: any): Scenario[] {
  const timings: string[] = (ability?.triggerTiming ?? []) as string[];
  const canNight =
    timings.includes("first_night") || timings.includes("every_night");
  const canDay = timings.includes("day");
  const canDeath = timings.includes("on_death");
  return [
    ...(canNight ? NIGHT_SCENARIOS : []),
    ...(canDay ? DAY_SCENARIOS : []),
    // 纯事件型（只 on_death）：用死亡场景接入，否则永远是零覆盖
    ...(canDeath ? DEATH_SCENARIOS : []),
  ];
}

/** 递归收集对象里的所有字符串（深度受限，避免环形结构） */
function collectStrings(v: unknown, out: string[], depth = 0): void {
  if (depth > 6 || v === null || v === undefined) return;
  if (typeof v === "string") {
    out.push(v);
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) collectStrings(x, out, depth + 1);
    return;
  }
  if (typeof v === "object") {
    for (const x of Object.values(v as Record<string, unknown>)) {
      collectStrings(x, out, depth + 1);
    }
  }
}

/** 脏值：模板变量未替换的痕迹 */
const DIRTY = /(?:undefined|NaN|\[object Object\])/;

/** 英文 roleId 集合：出现在玩家可见的【】里就是泄漏内部标识 */
const ROLE_IDS = new Set(roles.map((r) => r.id));

/**
 * 从字符串里抽出所有【】片段，返回其中**是英文 roleId** 的那些。
 *
 * ⚠️ 判据来源（2026-10-20 实测）：gambler 曾把 `actualRole` 直接写成
 *   `role.id`，玩家看到的是「但实际是【soldier】」而不是「【士兵】」。
 *   只查 `undefined/NaN` 抓不到这种「值存在但语种错」的问题 ——
 *   第一版矩阵就是漏了它，变异自检 416 条全绿。
 */
function leakedRoleIds(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/【([^】]{1,40})】/g)) {
    if (ROLE_IDS.has(m[1])) out.push(m[1]);
  }
  return out;
}

describe("L1 角色矩阵：全剧本全角色的能力管道健壮性", () => {
  /** 记录「新引擎里没有该角色能力」的角色，避免静默漏测 */
  const noAbility: string[] = [];
  /** 只有 on_death / passive 的角色：本矩阵不造事件，单独统计以免静默漏测 */
  const deferredByTiming: string[] = [];

  for (const roleId of ALL_ROLE_IDS) {
    const ability = ABILITY_BY_ROLE[roleId];
    if (!ability) {
      if (!PASSIVE_NO_ABILITY.has(roleId)) noAbility.push(roleId);
      continue;
    }

    const scenarios = scenariosFor(ability);
    if (scenarios.length === 0) {
      deferredByTiming.push(roleId);
      continue;
    }

    for (const sc of scenarios) {
      it(`${roleId} · ${sc.label}`, async () => {
        const seats = makeBoard(roleId);
        if (sc.poison) seats[0].isPoisoned = true;
        if (sc.drunk) seats[0].isDrunk = true;
        if (sc.deadSelf) seats[0].isDead = true;

        let ctx: any;
        // G1：管道不得抛异常
        await expect(
          (async () => {
            ctx = await runRole(ability, seats, 0, {
              night: sc.isFirstNight ? 1 : 2,
              phase:
                sc.kind === "day"
                  ? "day"
                  : sc.isFirstNight
                    ? "firstNight"
                    : "night",
              targets: [1, 2],
              snapshot: {
                ...(sc.vortox ? { isVortoxWorld: true } : {}),
                ...(sc.deadSelf ? { deadThisNight: [0] } : {}),
              },
            });
          })(),
          `${roleId} · ${sc.label}：能力管道抛出异常（玩家侧会直接卡死）`
        ).resolves.toBeUndefined();

        // G2/G3：产出文案不得含脏值
        const strings: string[] = [];
        collectStrings(ctx?.meta, strings);
        const dirty = strings.filter((s) => DIRTY.test(s));
        expect(
          dirty,
          `${roleId} · ${sc.label}：产出文案含未替换的模板变量 —— ${dirty
            .slice(0, 3)
            .map((s) => JSON.stringify(s.slice(0, 80)))
            .join(" / ")}`
        ).toEqual([]);

        // G3：有主动能力的角色跑完必须**有产出**（空转 = 能力没接线）
        const met: any = ctx?.meta ?? {};
        const produced =
          met.abilityResult !== undefined ||
          met.displayInfo !== undefined ||
          met.stateUpdates !== undefined ||
          // ⚠️ preCheck 产出的「尝试痕迹」也算产出：猎手（slayer）白天能力
          //    `calculate: []`，效果全在 `stateUpdate: handleSlayerKill`，
          //    且只在目标是恶魔时才改状态。目标是士兵时「无效果」是**正确行为**，
          //    若这里不认 `meta.target`，就会把正确行为误判成空转（实测 5 条假阳性）。
          met.target !== undefined ||
          ctx?.aborted === true || // 合法中止（目标非法/条件不满足）
          (ctx?.snapshot?._abilityResults?.[roleId] !== undefined);
        expect(
          produced,
          `${roleId} · ${sc.label}：管道跑完**没有任何产出**（无 abilityResult / displayInfo / stateUpdates，也未 aborted）—— 能力空转`
        ).toBe(true);

        // G2b：玩家可见的【】里不得出现英文 roleId（应为中文角色名）
        const leaked = strings.flatMap((s) => leakedRoleIds(s));
        expect(
          leaked,
          `${roleId} · ${sc.label}：文案把英文 roleId 直接显示给玩家 —— 【${leaked
            .slice(0, 3)
            .join("】【")}】（应输出中文角色名）`
        ).toEqual([]);
      });
    }
  }

  it("覆盖率自检：纯事件型（on_death/passive）角色清单可见", () => {
    /**
     * 这些角色只在「死亡/被动事件」下才行动，本矩阵不构造事件，因此不跑。
     * 这里把清单打印出来并断言数量受控 —— 新增角色被误判成纯被动时，
     * 数量会变化，提示复核（不做成硬编码集合，避免变成第二份腐烂白名单）。
     */
    // 主动打印清单：让「还剩哪些角色没被任何场景覆盖」随时可见
    console.log(
      `[L1 未覆盖角色 ${deferredByTiming.length} 个] ${deferredByTiming.join(", ")}`
    );
    expect(
      deferredByTiming.length,
      `未被任何场景覆盖的角色：${deferredByTiming.join(", ")}`
    ).toBeLessThanOrEqual(30);
  });

  it("覆盖率自检：新引擎缺能力的角色必须为 0（否则矩阵有洞）", () => {
    expect(
      noAbility,
      `这些剧本角色在新引擎里没有注册能力，本矩阵**没有覆盖**到：${noAbility.join(", ")}`
    ).toEqual([]);
  });
});
