import { describe, it } from "vitest";
import { roles as allRoles, type Seat } from "../../../app/data";
import { generateDynamicNightQueue } from "../dynamicQueueGenerator";
import { nightOrderParser } from "../nightOrderParser";

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

const buildOrder = (isFirstNight: boolean) =>
  (isFirstNight
    ? nightOrderParser.getFirstNightOrder()
    : nightOrderParser.getOtherNightOrder()
  ).map((item) => ({
    roleId: item.roleId,
    roleName: item.roleName || item.roleId,
    firstNightPriority: item.firstNightOrder,
    otherNightPriority: item.otherNightOrder,
    firstNightOnly: isFirstNight,
    wakeMessage: item.wakeCondition || "",
    abilityId: `${item.roleId}_night_ability`,
  })) as any;

describe("修正版探针 · 先查队列，再查信息", () => {
  it("列出 13 镇民在首夜/次夜的队列节点有无", () => {
    const mk = (isFirstNight: boolean, roleId: string) => {
      const snapshot = {
        nightCount: isFirstNight ? 1 : 2,
        seats: seatsFor(roleId),
        statusEffects: {},
        gamePhase: isFirstNight ? ("firstNight" as const) : ("night" as const),
      } as any;
      return generateDynamicNightQueue(buildOrder(isFirstNight), snapshot, {
        isFirstNight,
      });
    };
    console.log("\n══ 队列节点有无（被测角色已入场）══");
    for (const role of TOWNSFOLK) {
      const inF = mk(true, role).some((n) => n.roleId === role);
      const inO = mk(false, role).some((n) => n.roleId === role);
      const officialFirst = nightOrderParser
        .getFirstNightOrder()
        .some((x) => x.roleId === role);
      console.log(
        `${role.padEnd(16)} 首夜:${inF ? "有节点 ✅" : "无节点"}  次夜:${
          inO ? "有节点 ✅" : "无节点"
        }   官方首夜表:${officialFirst ? "列入" : "未列入"}`
      );
    }
  });
});
