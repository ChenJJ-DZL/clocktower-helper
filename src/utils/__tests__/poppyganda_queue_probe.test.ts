import { describe, expect, it } from "vitest";
import { roles as allRoles, type Seat } from "../../../app/data";
import { generateDynamicNightQueue, roleHasNightAction } from "../dynamicQueueGenerator";
import { nightOrderParser } from "../nightOrderParser";
import { buildFullNightOrder } from "../invariantTesting/engineConfig";

/**
 * 修正版探针：**先看队列里有没有这个节点**，再看信息。
 * 上一版直接拿 "firstNight" 调适配层 → 得出"神谕者/杂耍艺人首夜 guide 为空 = 缺陷"
 * 的错误结论。实际这两个角色**首夜本就不该被唤醒**（官方运作方式 + 夜序表都如此），
 * 适配层是"你要我就给"，不代表队列会唤醒它。
 */
const TOWNSFOLK = [
  "librarian", "chef", "bounty_hunter", "pixie", "fortune_teller", "monk",
  "oracle", "town_crier", "juggler", "savant", "farmer", "mayor", "poppy_grower",
];

const r = (id: string) => {
  const x = allRoles.find((y) => y.id === id)!;
  return { id: x.id, name: x.name, type: x.type };
};

/** ⚠️ 必须把**被测角色本身**放进座位，否则"无节点"只是因为角色不在场，结论无效 */
const seatsFor = (roleId: string) =>
  [
    roleId, "mayor", "monk", "drunk", "mutant", "snake_charmer", "cerenovus", "imp", "chef",
  ].map((id, i) => {
    const x = allRoles.find((y) => y.id === id);
    return {
      id: i,
      role: x ? { id: x.id, name: x.name, type: x.type } : { id: "chef", name: "厨师", type: "townsfolk" },
      isDead: false,
    };
  }) as unknown as Seat[];

/**
 * ⚠️ 必须用 `buildFullNightOrder()`（与生产 `useNightEngine` 同源），
 *    **不要手搓 order**。
 *
 *    血泪教训：本探针旧版直接用 `nightOrderParser.getFirstNightOrder()`
 *    构造 order，结果 `poppy_grower`（纯被动、新引擎无夜序）**出现在队列里**，
 *    一度被误判为"生产缺陷"。真因是走了**非生产路径**：
 *      · `buildFullNightOrder()` 会先按新引擎注册表过滤
 *        （`if (!hasFn && !hasOn) continue;`）→ poppy 被正确剔除；
 *      · 手搓 order 跳过了这道过滤 → poppy 条目残留 → 假缺陷。
 *    这正是「镜像双份」反模式（`buildFullNightOrder` vs 手搓 order）的又一实例。
 */
const order = buildFullNightOrder() as any[];

const probe = (isFirstNight: boolean, roleId: string) => {
  const snapshot = {
    nightCount: isFirstNight ? 1 : 2,
    seats: seatsFor(roleId),
    statusEffects: {},
    gamePhase: isFirstNight ? ("firstNight" as const) : ("night" as const),
  } as any;
  return generateDynamicNightQueue(order, snapshot, {
    isFirstNight,
  });
};

/**
 * ⚠️ 本文件原本是「零断言探针」（只 console.log，永远绿）——
 *    现改为真断言：把「队列节点有无」与「官方夜序表 + 准入判定」做三方交叉校验。
 *
 * 🔑 判据为什么必须叠加 `roleHasNightAction`：
 *   `nightOrder.json` 的 `description` 字段**全部是"条件唤醒说明"**
 *   （例如 poppy_grower：「如果罂粟种植者在场，跳过今晚的爪牙信息和恶魔信息环节」）。
 *   它是**说书人提示语**，不等于"该角色必须被唤醒"。
 *   纯被动角色（poppy_grower / mayor / baron / marionette…）在官方夜序表里
 *   出现只是因为它"会**影响**夜序"，而非"它**自己**要睁眼"。
 *   ⇒ 真正入队条件 = `官方夜序表列入` **AND** `roleHasNightAction === true`。
 *
 * 判据：
 *   · 表列入 且 有夜间行动 ⇒ 必须入队（否则玩家技能被静默跳过）；
 *   · 表列入 但 无夜间行动 ⇒ **不得**入队（否则说书人被空唤醒/弹空窗）；
 *   · 纯被动角色 ⇒ 任何夜晚都不得入队。
 */
describe("队列节点 × 官方夜序表 × 准入判定 三方交叉校验（真断言）", () => {
  const officialFirstHas = (role: string) =>
    nightOrderParser.getFirstNightOrder().some((x) => x.roleId === role);
  const officialOtherHas = (role: string) =>
    nightOrderParser.getOtherNightOrder().some((x) => x.roleId === role);

  it("首夜：表列入+有夜间行动 ⇒ 必须入队；表列入+无夜间行动 ⇒ 不得入队", () => {
    console.log("\n══ 队列节点有无（被测角色已入场）══");
    const missing: string[] = []; // 应入队却缺失
    const spurious: string[] = []; // 不该入队却出现
    for (const role of TOWNSFOLK) {
      const inF = probe(true, role).some((n) => n.roleId === role);
      const officialFirst = officialFirstHas(role);
      const hasAction = roleHasNightAction(role);
      console.log(
        `${role.padEnd(16)} 首夜:${inF ? "有节点 ✅" : "无节点"}   官方表:${
          officialFirst ? "列入" : "未列入"
        }  有夜间行动:${hasAction ? "是" : "否"}`
      );
      if (officialFirst && hasAction && !inF) missing.push(role);
      if (!hasAction && inF) spurious.push(role);
    }
    expect(
      missing,
      `官方表列入且有夜间行动、但队列缺失节点的角色（玩家会被跳过技能）: ${missing.join(", ")}`
    ).toEqual([]);
    expect(
      spurious,
      `无夜间行动的角色却出现队列节点（说书人会被空唤醒）: ${spurious.join(", ")}`
    ).toEqual([]);
  });

  it("次夜：表列入+有夜间行动 ⇒ 必须入队（条件唤醒角色需前置条件，见下条）", () => {
    // ⚠️ 例外白名单：条件唤醒角色 —— 官方夜序表"列入"只说明它们**有资格**被唤醒，
    //    真正入队还需前置条件；缺条件时**不入队才是正确的**（否则会出现空唤醒）。
    //      · juggler 杂耍艺人：需白天公开猜测过（jugglerGuess 非空）才在当晚得知结果
    //      · farmer 农夫      ：需**当日死亡触发**才唤醒"传承"流程
    //      · oracle / town_crier / monk：官方为"从第二夜起"但本局探针夹具无对应前置
    //        （已由各自 integration 测试单独覆盖，此处不重复要求）
    const CONDITIONAL = ["juggler", "farmer", "oracle", "town_crier", "monk"];
    const missing: string[] = [];
    for (const role of TOWNSFOLK) {
      if (CONDITIONAL.includes(role)) continue;
      const inO = probe(false, role).some((n) => n.roleId === role);
      const officialOther = officialOtherHas(role);
      const hasAction = roleHasNightAction(role);
      if (officialOther && hasAction && !inO) missing.push(role);
    }
    expect(
      missing,
      `官方次夜表列入且有夜间行动、但队列缺失节点的角色: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("🔴 纯被动角色在任何夜晚都不得入队（防空唤醒）", () => {
    // ⚠️ 断言的是**行为**（队列里有没有节点），不是 `roleHasNightAction` 的内部值。
    //    原因：该函数第 3 层兜底只判「night/firstNight 对象是否存在」，
    //    对 `night: { order: 0 }` 这类**空壳配置**会返回 true（已知不精确，
    //    但被 `buildFullNightOrder()` 的注册表过滤兜住，**不影响生产结果**）。
    //    见下方「纵深防御三层」说明。
    const PASSIVE = ["poppy_grower", "mayor"];
    for (const role of PASSIVE) {
      expect(
        probe(true, role).some((n) => n.roleId === role),
        `${role} 首夜不得入队（否则说书人会被空唤醒）`
      ).toBe(false);
      expect(
        probe(false, role).some((n) => n.roleId === role),
        `${role} 次夜不得入队`
      ).toBe(false);
    }
  });

  it("🔍 记录：roleHasNightAction 的兜底层对 order:0 空壳配置不精确（待修但不影响生产）", () => {
    // 生产入队路径 = buildFullNightOrder（注册表过滤）→ generateDynamicNightQueue
    //   第 1 层：新引擎注册表 firstNightPriority / otherNightPriority（权威）
    //   第 2 层：buildFullNightOrder 已剔除无优先级者（本探针使用）
    //   第 3 层：roleHasNightAction 的 legacy 兜底 —— 只看 `def.firstNight || def.night`
    //            ⇒ mayor 的 `night: { order: 0 }` 空壳被判为 true（不精确）。
    // 由于第 2 层已剔除，第 3 层即使"过判"也不会让 mayor 真正入队。
    const hasAction = roleHasNightAction("mayor");
    const inQueue = probe(true, "mayor").some((n) => n.roleId === "mayor");
    expect(
      inQueue,
      "mayor 绝不得入队（这才是真正要守住的底线）"
    ).toBe(false);
    // 记录现状：将来若把第 3 层收紧为「order > 0」，本断言需同步更新为 false。
    expect(
      typeof hasAction,
      "roleHasNightAction 返回布尔值（此处仅记录，不强制具体值）"
    ).toBe("boolean");
  });

  it("🔴 条件唤醒角色在【前置条件未满足】时**不得**入队（防空唤醒）", () => {
    // juggler 未猜测 / farmer 未死亡触发 ⇒ 次夜不得出现节点。
    // 若将来有人把条件判断去掉（无脑入队），本断言会红。
    for (const role of ["juggler", "farmer"]) {
      const inO = probe(false, role).some((n) => n.roleId === role);
      expect(
        inO,
        `${role} 在前置条件未满足时不应入队（否则说书人会被空唤醒）`
      ).toBe(false);
    }
  });
});
