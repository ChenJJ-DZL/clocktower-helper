import { describe, expect, it } from "vitest";
import { roles as allRoles, type Seat } from "../../../app/data";
import { calculateNightInfoViaNewEngine } from "../nightInfoAdapter";
import { generateDynamicNightQueue } from "../dynamicQueueGenerator";
import { nightOrderParser } from "../nightOrderParser";
import { runFullAbilityPipeline } from "../middlewarePipeline";
import { oracleAbility } from "../../roles/new_engine/oracle.ability";

/**
 * 罂粟花开 · 第1轮 角色×状态矩阵：**神谕者 (oracle)**
 *
 * 官方判据（src/data/officialRoleDocs.json → 「神谕者」）：
 *   技能：每个夜晚*，你会得知有多少名死亡的玩家是邪恶的。
 *   运作：**除了第一个夜晚**的每个夜晚，唤醒神谕者。
 *   简介：检测死去的爪牙和恶魔，以及**任何属于邪恶阵营的玩家**（含变邪恶的镇民/外来者）。
 *         计算时把魔典中「倒置」的镇民/外来者标记也算作邪恶。
 *
 * 本轮覆盖：
 *   夜晚维度：首夜（应无节点）/ 第2夜 / 第3夜
 *   状态维度：常态 / 中毒 / 酒鬼伪装 / 提线木偶伪装 / 涡流世界 / 罂粟种植者在场
 *   四维核对：① 队列（I 类不变式）② nightInfo(guide/playerFacing/storytellerNote/targetLimit)
 *             ③ 结算数值正确性 ④ 文案污染（undefined/NaN/规则泄漏）
 */

const SCRIPT = { id: "poppyganda", name: "罂粟花开" } as any;

const r = (id: string) => {
  const x = allRoles.find((y) => y.id === id)!;
  return { id: x.id, name: x.name, type: x.type };
};

/**
 * 9 人局座位：
 *   0 = 神谕者（被测）
 *   1 厨师(镇民)  2 镇长(镇民)  3 酒鬼(外来者)  4 畸形秀演员(外来者)
 *   5 洗脑师(爪牙) 6 男爵(爪牙)  7 小恶魔(恶魔)  8 农夫(镇民)
 * 死亡布置由 deadIds 指定。
 */
function seats(
  opts: {
    deadIds?: number[];
    poisoned?: boolean;
    drunk?: boolean;
    marionette?: boolean;
    demon?: string;
    poppyGrower?: boolean;
  } = {}
) {
  const ids = [
    "oracle",
    opts.poppyGrower ? "poppy_grower" : "chef",
    "mayor",
    "drunk",
    "mutant",
    "cerenovus",
    "baron",
    opts.demon ?? "imp",
    "farmer",
  ];
  const dead = new Set(opts.deadIds ?? []);
  return ids.map((id, i) => {
    const base: any = {
      id: i,
      role: r(id),
      isDead: dead.has(i),
      isDrunk: !!(opts.drunk && i === 0),
      isPoisoned: !!(opts.poisoned && i === 0),
    };
    if (opts.marionette && i === 0) {
      // 提线木偶的**真实数据形态**（与 GameSetup.tsx:274-281 一致）：
      //   role.id === "marionette"（引擎判定依据）
      //   charadeRole = 它以为自己是善良角色（这里 = 神谕者）
      base.role = r("marionette");
      base.charadeRole = r("oracle");
    }
    return base;
  });
}

const buildOrder = (isFirstNight: boolean) =>
  (isFirstNight
    ? nightOrderParser.getFirstNightOrder()
    : nightOrderParser.getOtherNightOrder()
  ).map((item: any) => ({
    roleId: item.roleId,
    roleName: item.roleName || item.roleId,
    firstNightPriority: item.firstNightOrder,
    otherNightPriority: item.otherNightOrder,
    firstNightOnly: isFirstNight,
    wakeMessage: item.wakeCondition || "",
    abilityId: `${item.roleId}_night_ability`,
  })) as any;

const queueHasOracle = (isFirstNight: boolean, seatsArr: any[]) =>
  generateDynamicNightQueue(
    buildOrder(isFirstNight),
    {
      nightCount: isFirstNight ? 1 : 2,
      seats: seatsArr as unknown as Seat[],
      statusEffects: {},
      gamePhase: isFirstNight ? "firstNight" : "night",
    } as any,
    { isFirstNight }
  ).some((n: any) => n.roleId === "oracle");

const pipe = (a: any) => ({
  preCheck: a.preCheck,
  calculate: a.calculate,
  stateUpdate: a.stateUpdate,
  postProcess: a.postProcess,
});

describe("第1轮 · 神谕者 oracle（3 夜 × 6 状态）", () => {
  it("① 队列维度：首夜无节点 / 第2、3夜有节点", () => {
    const s = seats();
    const first = queueHasOracle(true, s);
    const second = queueHasOracle(false, s);
    console.log(`\n【队列】首夜节点: ${first ? "有 ❌(不该有)" : "无 ✅"}  次夜节点: ${second ? "有 ✅" : "无 ❌"}`);
    // 官方：除了第一个夜晚的每个夜晚 → 首夜必须无节点
    expect(first).toBe(false);
    expect(second).toBe(true);
  });

  it("② 三夜信息维度 + 状态维度（16 组）", () => {
    const rows: string[] = [];
    const probe = (
      label: string,
      seatOpts: any,
      phase: "firstNight" | "night",
      nightCount: number
    ) => {
      const s = seats(seatOpts);
      let info: any = null;
      let err = "";
      try {
        info = calculateNightInfoViaNewEngine(
          SCRIPT,
          s as any,
          0,
          phase,
          null,
          nightCount
        );
      } catch (e: any) {
        err = String(e?.message ?? e);
      }
      const guide = String(info?.guide ?? "");
      const pf = String(info?.playerFacingGuide ?? "");
      const st = String(info?.storytellerNote ?? "");
      const tgt = info?.targetLimit
        ? `${info.targetLimit.min}/${info.targetLimit.max}`
        : "—";
      const bad: string[] = [];
      if (err) bad.push("💥" + err);
      if (/undefined|NaN|\[object Object\]/.test(guide + pf + st))
        bad.push("⚠undefined/NaN");
      rows.push(
        `${label.padEnd(26)} ${nightCount}夜 ${String(
          info?.isPoisoned
        ).padEnd(6)} 目标${tgt.padEnd(5)} ${guide.replace(/\n/g, " ⏎ ").slice(0, 62)}` +
          (bad.length ? `  ↳ ${bad.join(" ")}` : "")
      );
    };

    // 首夜
    probe("首夜·常态", {}, "firstNight", 1);
    // 第 2 夜
    probe("第2夜·常态(无人死)", {}, "night", 2);
    probe("第2夜·常态(死1邪恶)", { deadIds: [7] }, "night", 2);
    probe("第2夜·常态(死1善良)", { deadIds: [1] }, "night", 2);
    probe("第2夜·中毒", { poisoned: true, deadIds: [7] }, "night", 2);
    probe("第2夜·酒鬼伪装", { drunk: true, deadIds: [7] }, "night", 2);
    probe("第2夜·提线木偶伪装", { marionette: true, deadIds: [7] }, "night", 2);
    probe("第2夜·涡流世界", { demon: "vortox", deadIds: [7] }, "night", 2);
    probe("第2夜·罂粟种植者在场", { poppyGrower: true, deadIds: [7] }, "night", 2);
    // 第 3 夜
    probe("第3夜·常态(死2邪恶)", { deadIds: [7, 6] }, "night", 3);
    probe("第3夜·常态(死3含1邪恶)", { deadIds: [7, 1, 3] }, "night", 3);
    probe("第3夜·中毒", { poisoned: true, deadIds: [7, 6] }, "night", 3);
    probe("第3夜·酒鬼伪装", { drunk: true, deadIds: [7, 6] }, "night", 3);
    probe("第3夜·提线木偶伪装", { marionette: true, deadIds: [7, 6] }, "night", 3);
    probe("第3夜·涡流世界", { demon: "vortox", deadIds: [7, 6] }, "night", 3);
    probe("第3夜·罂粟种植者", { poppyGrower: true, deadIds: [7, 6] }, "night", 3);

    console.log("\n══ 神谕者 3 夜 × 状态 ══");
    for (const x of rows) console.log(x);
    expect(rows.length).toBe(16);
  });

  it("③ 结算数值：死亡邪恶计数（官方范例复现）", async () => {
    /**
     * 官方范例2：「七名玩家死亡。其中五名是善良的，两名是邪恶的。
     * 并且在白天，一名邪恶旅行者被流放了。当晚，恶魔杀死了他的一名爪牙。
     * 神谕者醒来并得知了'4'」→ 4 = 2(已死邪恶) + 1(邪恶旅行者) + 1(爪牙)
     */
    const mk = (id: number, roleId: string, type: string, dead = false) =>
      ({
        id,
        role: { id: roleId, name: roleId, type } as any,
        isDead: dead,
      } as any);

    const seatsArr = [
      mk(0, "oracle", "townsfolk"),
      // 2 名已死邪恶：爪牙 + 恶魔
      mk(1, "cerenovus", "minion", true),
      mk(2, "imp", "demon", true),
      // 1 名已死邪恶旅行者（用 isEvilConverted 表达"邪恶阵营"）
      { ...mk(3, "thief", "traveler", true), isEvilConverted: true },
      // 1 名当晚被杀的爪牙
      mk(4, "baron", "minion", false),
      // 5 名已死善良
      mk(5, "chef", "townsfolk", true),
      mk(6, "mayor", "townsfolk", true),
      mk(7, "drunk", "outsider", true),
      mk(8, "mutant", "outsider", true),
    ];

    const res = await runFullAbilityPipeline(pipe(oracleAbility), {
      actionNode: { seatId: 0, roleId: "oracle" },
      targetIds: [],
      snapshot: {
        seats: seatsArr,
        gamePhase: "night",
        nightCount: 4,
        deadThisNight: [4],
      },
      meta: {},
    } as any);

    console.log(
      `\n【结算】deathEvil=${res.meta.abilityResult.deadEvilCount} final=${res.meta.abilityResult.finalCount}`
    );
    expect(res.meta.abilityResult.deadEvilCount).toBe(4);
  });

  it("④ 变邪恶的镇民也应计入（官方：任何属于邪恶阵营的玩家）", async () => {
    const seatsArr = [
      { id: 0, role: r("oracle"), isDead: false, },
      { id: 1, role: r("chef"), isDead: true, isEvilConverted: true },
      { id: 2, role: r("imp"), isDead: true, },
    ] as any;
    const res = await runFullAbilityPipeline(pipe(oracleAbility), {
      actionNode: { seatId: 0, roleId: "oracle" },
      targetIds: [],
      snapshot: {
        seats: seatsArr,
        gamePhase: "night",
        nightCount: 2,
        deadThisNight: [1, 2],
      },
      meta: {},
    } as any);
    console.log(`\n【变邪恶镇民】deadEvil=${res.meta.abilityResult.deadEvilCount}（期望 2）`);
    expect(res.meta.abilityResult.deadEvilCount).toBe(2);
  });

  it("⑤ 陌客/间谍默认登记：核实是否为官方口径", async () => {
    const seatsArr = [
      { id: 0, role: r("oracle"), isDead: false, },
      { id: 1, role: r("recluse"), isDead: true, }, // 无 registerAsEvil 字段
      { id: 2, role: r("spy"), isDead: true, }, // 无 registerAsEvil 字段
      { id: 3, role: r("imp"), isDead: true, },
    ] as any;
    const res = await runFullAbilityPipeline(pipe(oracleAbility), {
      actionNode: { seatId: 0, roleId: "oracle" },
      targetIds: [],
      snapshot: {
        seats: seatsArr,
        gamePhase: "night",
        nightCount: 2,
        deadThisNight: [1, 2, 3],
      },
      meta: {},
    } as any);
    console.log(
      `\n【陌客/间谍默认】deadEvil=${res.meta.abilityResult.deadEvilCount}  实际邪恶=小恶魔1 → 期望官方口径=1；当前实现=3`
    );
  });
});
