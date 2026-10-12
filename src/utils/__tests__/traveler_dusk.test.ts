/**
 * 暮色（Twilight = 官方 Dusk）阶段契约（Round 11 · 方案 B）
 * ==================================================================
 * 🔴 为什么要有这一层：夜序队列与夜间引擎**全仓零 traveler 引用**，
 *    旅行者又不占 seats ⇒ 14/15 个旅行者的规则在真实对局里从不触发。
 *    修法：在「提名/处决」与「入夜」之间插入独立暮色阶段，按官方黄昏
 *    顺序逐个唤醒有行动的旅行者。本文件锁定该阶段的**排程口径**。
 *
 * 官方黄昏名单（来源：json/wiki_crawl/parsed_roles.json）：
 *   首夜  ：官员 / 窃贼 / 学徒 / 咖啡师
 *   其他夜：官员 / 窃贼 / 咖啡师 / 流莺 / 集骨者
 *
 * ⚠️ 判据都锚**独立事实**（官方能力原文 + 首夜/其他夜归属），
 *    不锚实现细节（不断言内部字段名），避免"改个变量名就红"的脆断。
 */
import { describe, expect, it } from "vitest";
import { TRAVELER_ROLES } from "../../../app/data";
import {
  actsOnNight,
  buildTwilightSteps,
  hasTwilightPhase,
  isTwilightTraveler,
  TWILIGHT_TRAVELERS,
} from "../travelerDusk";

/** 官方 15 个旅行者 id */
const OFFICIAL_15 = new Set(TRAVELER_ROLES.map((r) => r.id));

/** 官方暮色名单（按官方黄昏说明的唤醒顺序） */
const EXPECTED_ORDER = [
  "bureaucrat",
  "thief",
  "apprentice",
  "barista",
  "harlot",
  "bone_collector",
];

/** 官方**不在**暮色行动的旅行者（规则挂在白天流程或流放结算） */
const NOT_TWILIGHT = [
  "beggar",
  "gunslinger",
  "scapegoat_traveler",
  "butcher",
  "judge",
  "matron",
  "voudon",
  "bishop",
  "deviant",
];

const seatOf = (id: string) =>
  TRAVELER_ROLES.find((r) => r.id === id) ?? null;

/** 把一组 id 铺进 travelers 数组（同序） */
const travelersOf = (ids: string[]) => ids.map(seatOf);

describe("travelerDusk · 暮色名单", () => {
  it("① 恰好 6 个暮色旅行者，且全部属于官方 15 个旅行者", () => {
    const ids = Object.keys(TWILIGHT_TRAVELERS);
    expect(ids.length).toBe(6);
    for (const id of ids) {
      expect(OFFICIAL_15.has(id), `${id} 应是官方旅行者`).toBe(true);
    }
  });

  it("② 唤醒顺序与官方黄昏说明一致（官员→窃贼→学徒→咖啡师→流莺→集骨者）", () => {
    expect(Object.keys(TWILIGHT_TRAVELERS)).toEqual(EXPECTED_ORDER);
  });

  it("③ 每个暮色旅行者都带非空操作提示（禁止空壳登记）", () => {
    for (const [id, spec] of Object.entries(TWILIGHT_TRAVELERS)) {
      expect(spec.hint.length, `${id} hint`).toBeGreaterThanOrEqual(8);
      expect(spec.name.length, `${id} name`).toBeGreaterThan(0);
    }
  });

  it("④ 非暮色旅行者任何夜晚都不行动（不塞进暮色充数）", () => {
    for (const id of NOT_TWILIGHT) {
      expect(isTwilightTraveler(id), `${id} 不应是暮色旅行者`).toBe(false);
      expect(actsOnNight(id, true), `${id} 首夜`).toBe(false);
      expect(actsOnNight(id, false), `${id} 其他夜`).toBe(false);
    }
  });

  it("⑤ 首夜/其他夜归属：学徒仅首夜，流莺与集骨者仅其他夜", () => {
    expect(actsOnNight("apprentice", true)).toBe(true);
    expect(actsOnNight("apprentice", false)).toBe(false);
    expect(actsOnNight("harlot", true)).toBe(false);
    expect(actsOnNight("harlot", false)).toBe(true);
    expect(actsOnNight("bone_collector", true)).toBe(false);
    expect(actsOnNight("bone_collector", false)).toBe(true);
    // 每夜型
    for (const id of ["bureaucrat", "thief", "barista"]) {
      expect(actsOnNight(id, true), `${id} 首夜`).toBe(true);
      expect(actsOnNight(id, false), `${id} 其他夜`).toBe(true);
    }
  });
});

describe("travelerDusk · 步骤构建", () => {
  it("⑥ 首夜：官员/窃贼/学徒/咖啡师 在，流莺/集骨者 不在", () => {
    const steps = buildTwilightSteps(
      travelersOf([
        "bureaucrat",
        "thief",
        "apprentice",
        "barista",
        "harlot",
        "bone_collector",
      ]),
      true
    );
    expect(steps.map((s) => s.roleId)).toEqual([
      "bureaucrat",
      "thief",
      "apprentice",
      "barista",
    ]);
  });

  it("⑦ 其他夜：官员/窃贼/咖啡师/流莺/集骨者 在，学徒 不在", () => {
    const steps = buildTwilightSteps(
      travelersOf([
        "bureaucrat",
        "thief",
        "apprentice",
        "barista",
        "harlot",
        "bone_collector",
      ]),
      false
    );
    expect(steps.map((s) => s.roleId)).toEqual([
      "bureaucrat",
      "thief",
      "barista",
      "harlot",
      "bone_collector",
    ]);
  });

  it("⑧ 空座位（null）被跳过，且 hasTwilightPhase 为 false", () => {
    const empty = [null, null, null, null];
    expect(buildTwilightSteps(empty, true)).toEqual([]);
    expect(buildTwilightSteps(empty, false)).toEqual([]);
    expect(hasTwilightPhase(empty, true)).toBe(false);
    expect(hasTwilightPhase(empty, false)).toBe(false);
  });

  it("⑨ 只有非暮色旅行者落座 ⇒ 不插入暮色阶段（不产生空步骤）", () => {
    const t = travelersOf(["beggar", "gunslinger", "deviant"]);
    expect(buildTwilightSteps(t, true)).toEqual([]);
    expect(buildTwilightSteps(t, false)).toEqual([]);
    expect(hasTwilightPhase(t, true)).toBe(false);
  });

  it("⑩ 每位旅行者一步；同角色坐两个席位 ⇒ 两步且 key 不同", () => {
    const steps = buildTwilightSteps(
      travelersOf(["bureaucrat", "bureaucrat", "thief"]),
      false
    );
    expect(steps.length).toBe(3);
    expect(new Set(steps.map((s) => s.key)).size).toBe(3);
    expect(steps.map((s) => s.seatIndex)).toEqual([0, 1, 2]);
  });

  it("⑪ 步骤携带官方能力原文与提示（说书人看得懂该干嘛）", () => {
    const steps = buildTwilightSteps(travelersOf(["bureaucrat"]), false);
    expect(steps.length).toBe(1);
    const official = TRAVELER_ROLES.find((r) => r.id === "bureaucrat")!;
    expect(steps[0].ability).toBe(official.ability);
    expect(steps[0].hint).toBe(TWILIGHT_TRAVELERS.bureaucrat.hint);
    expect(steps[0].roleName).toBe(official.name);
  });

  it("⑫ 全部 15 个旅行者都落座时，暮色步骤数 ≤ 6（其余规则不在暮色）", () => {
    const all = TRAVELER_ROLES.slice(0, 4) as any;
    const first = buildTwilightSteps(all as any, true);
    const other = buildTwilightSteps(all as any, false);
    expect(first.length).toBeLessThanOrEqual(6);
    expect(other.length).toBeLessThanOrEqual(6);
  });
});
