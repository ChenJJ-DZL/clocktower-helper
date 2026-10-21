/**
 * traveler_fabled_matrix.test.ts —— X04「旅行者 15 + 传奇 14」矩阵测试
 * ==================================================================
 * 定位：纯 vitest 规则/数据契约层（**不写 E2E**）。
 *   · UI 可达性由既有 `e2e/twilight_traveler.spec.ts`、
 *     `e2e/regression/fabled_traveler_flow.spec.ts` 覆盖，本文件不重复。
 *   · 本文件只锁两件事：
 *     ① 旅行者（traveler）15 人的**槽位 / 阵营 / 处决命名空间**契约；
 *     ② 传奇（fabled）14 人的**数据完整 + 不入夜序 + 不占旅行者槽**契约。
 *
 * 参考实现：
 *   · `src/utils/travelerHooks.ts` —— 全部被测算法的唯一收口
 *   · `app/data.ts`               —— `FABLED_ROLES` / `TRAVELER_ROLES` 数据源
 *   · `src/utils/dynamicQueueGenerator` —— `roleHasNightAction`（夜序判据）
 *
 * ⭐ 关键范式（travelerHooks.ts 文件头铁律）：
 *   旅行者**不占 seats**，只存在于 `state.travelers`（定长 4，null = 空位/已离场）。
 *   ⇒ 一切遍历走 `listAliveTravelerSlots`，禁止 `seats.filter(...)`。
 *   ⇒ 处决记录用**负数命名空间** `travelerExecutedId(i) = -(i+1)`（-1..-4），
 *     永不与座位 id（≥ 0）冲突。
 */
import * as path from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FABLED_ROLES, TRAVELER_ROLES } from "../../../app/data";
import type { Role } from "../../../app/data";
import { roleHasNightAction } from "../dynamicQueueGenerator";
import {
  hasTravelerRole,
  isTravelerEvil,
  listAliveTravelerSlots,
  travelerExecutedId,
  travelerGunslingerCanShoot,
  travelerGunslingerEligibleTargets,
  travelerIndexOfExecutedId,
  travelerIndexOfSlotId,
  travelerScapegoatCanSubstitute,
  travelerSlotId,
  voudonAllowsVoter,
  voudonSkipsGhostVote,
  voudonThreshold,
} from "../travelerHooks";

// ── 工厂：最小化测试座位（三表示齐全，规避任何阵营判据的实现分支差异） ──
/**
 * 构造一个测试座位。
 * ⚠️ `seat.role` / `seat.roleType` / `seat.effectiveRole` / `seat.alignment`
 *    四处同时给齐：无论阵营判据走「角色类型」还是「历史快照 alignment」，
 *    结论都一致（evil 座 → true，good 座 → false），避免假阴性。
 */
function makeSeat(
  roleId: string,
  roleName: string,
  roleType: string,
  alignment: "good" | "evil"
): any {
  const role = {
    id: roleId,
    name: roleName,
    type: roleType,
    ability: "",
    fullDescription: "",
  } as any;
  return {
    id: 0,
    roleId,
    role,
    roleType,
    effectiveRole: role,
    alignment,
  };
}

const EVIL_SEAT = () => makeSeat("imp", "小恶魔", "demon", "evil");
const GOOD_SEAT = () => makeSeat("chef", "厨师", "townsfolk", "good");

// ── 旅行者通用契约（5 条断言） ──
/**
 * 旅行者槽位/阵营/处决命名空间契约：
 *   1. 角色表存在且 `type === "traveler"`
 *   2. `travelerSlotId(i)` → `travelerIndexOfSlotId(...)` 往返一致（i = 0..3）
 *   3. `listAliveTravelerSlots([null, ROLE, null, null])` 恰好 1 项、index === 1、
 *      slotId === travelerSlotId(1)；`hasTravelerRole(...) === true`
 *   4. `isTravelerEvil` 三态：undefined → false / evil → true / good → false
 *   5. `travelerIndexOfExecutedId(travelerExecutedId(i)) === i`（i = 0..3）
 *      且处决 id 为负数 ⇒ 与座位 id（≥ 0）命名空间不冲突
 */
function expectTravelerContract(id: string) {
  const role = TRAVELER_ROLES.find((r) => r.id === id);
  expect(role, `TRAVELER_ROLES 缺少旅行者「${id}」`).toBeDefined();
  expect(role!.type, `${id} 的 type 必须是 traveler`).toBe("traveler");

  // 2 + 5：槽位 id / 处决 id 往返一致 + 负数命名空间
  for (let i = 0; i < 4; i++) {
    const slotId = travelerSlotId(i);
    expect(slotId, `${id} 槽位 id 必须为负数（不与座位 id 冲突）`).toBeLessThan(0);
    expect(travelerIndexOfSlotId(slotId), `${id} 槽位往返`).toBe(i);
    expect(travelerIndexOfExecutedId(travelerExecutedId(i)), `${id} 处决往返`).toBe(i);
  }

  // 3：在场旅行者列表
  const travelers = [null, role!, null, null] as (Role | null)[];
  const alive = listAliveTravelerSlots(travelers);
  expect(alive, `${id} 应恰好 1 人在场`).toHaveLength(1);
  expect(alive[0].index).toBe(1);
  expect(alive[0].slotId).toBe(travelerSlotId(1));
  expect(alive[0].role.id).toBe(id);
  expect(hasTravelerRole(travelers, id)).toBe(true);

  // 4：阵营三态
  expect(isTravelerEvil(undefined, 0)).toBe(false);
  expect(isTravelerEvil({ 0: "evil" }, 0)).toBe(true);
  expect(isTravelerEvil({ 0: "good" }, 0)).toBe(false);
}

// ── 传奇通用契约（4 条断言） ──
/**
 * 传奇数据契约：
 *   1. `FABLED_ROLES` 存在且 `type === "fabled"`
 *   2. `name` 非空；`ability` / `fullDescription` / `description` 至少一个非空
 *   3. **不入夜序**：`roleHasNightAction(id) === false`
 *   4. **不占旅行者槽**：`TRAVELER_ROLES.some(r => r.id === id) === false`
 */
function expectFabledContract(id: string) {
  const role = FABLED_ROLES.find((r) => r.id === id);
  expect(role, `FABLED_ROLES 缺少传奇「${id}」`).toBeDefined();
  expect(role!.type, `${id} 的 type 必须是 fabled`).toBe("fabled");
  expect(role!.name.trim().length, `${id} 缺少名称`).toBeGreaterThan(0);

  const texts = [
    (role as any).ability,
    (role as any).fullDescription,
    (role as any).description,
  ].filter((t) => typeof t === "string" && t.trim().length > 0);
  expect(texts.length, `${id} 缺少能力/描述文本`).toBeGreaterThan(0);

  expect(roleHasNightAction(id), `${id} 是传奇，不应入夜序`).toBe(false);
  expect(
    TRAVELER_ROLES.some((r) => r.id === id),
    `${id} 是传奇，不应占旅行者槽`
  ).toBe(false);
}

describe("X04 旅行者 15 人：槽位/阵营/处决命名空间契约", () => {
  it("X04-T-01 官员：槽位/阵营/处决命名空间契约", () => {
    expectTravelerContract("bureaucrat");
  });

  it("X04-T-02 乞丐：槽位/阵营/处决命名空间契约", () => {
    expectTravelerContract("beggar");
  });

  it("X04-T-03 枪手：槽位/阵营/处决命名空间契约", () => {
    expectTravelerContract("gunslinger");
  });

  it("X04-T-04 窃贼：槽位/阵营/处决命名空间契约", () => {
    expectTravelerContract("thief");
  });

  it("X04-T-05 替罪羊：槽位/阵营/处决命名空间契约", () => {
    expectTravelerContract("scapegoat_traveler");
  });

  it("X04-T-06 屠夫：槽位/阵营/处决命名空间契约", () => {
    expectTravelerContract("butcher");
  });

  it("X04-T-07 集骨者：槽位/阵营/处决命名空间契约", () => {
    expectTravelerContract("bone_collector");
  });

  it("X04-T-08 流莺：槽位/阵营/处决命名空间契约", () => {
    expectTravelerContract("harlot");
  });

  it("X04-T-09 咖啡师：槽位/阵营/处决命名空间契约", () => {
    expectTravelerContract("barista");
  });

  it("X04-T-10 怪咖：槽位/阵营/处决命名空间契约", () => {
    expectTravelerContract("deviant");
  });

  it("X04-T-11 学徒：槽位/阵营/处决命名空间契约", () => {
    expectTravelerContract("apprentice");
  });

  it("X04-T-12 女舍监：槽位/阵营/处决命名空间契约", () => {
    expectTravelerContract("matron");
  });

  it("X04-T-13 巫毒师：槽位/阵营/处决命名空间契约", () => {
    expectTravelerContract("voudon");
  });

  it("X04-T-14 法官：槽位/阵营/处决命名空间契约", () => {
    expectTravelerContract("judge");
  });

  it("X04-T-15 主教：槽位/阵营/处决命名空间契约", () => {
    expectTravelerContract("bishop");
  });
});

describe("X04 旅行者真实规则专项", () => {
  it("X04-T-03b 枪手：可射击目标 = 刚投过票的玩家", () => {
    const gunslinger = TRAVELER_ROLES.find((r) => r.id === "gunslinger")!;
    expect(gunslinger).toBeDefined();
    const none = [null, null, null, null] as (Role | null)[];
    const withGunslinger = [null, gunslinger, null, null] as (Role | null)[];
    const justVoted = [1, 3];

    // 无枪手 ⇒ 不可射击
    expect(travelerGunslingerCanShoot(none, justVoted, 1)).toBe(false);
    // 有枪手但目标不在 justVotedSeatIds ⇒ 不可射击
    expect(travelerGunslingerCanShoot(withGunslinger, justVoted, 2)).toBe(false);
    // 有枪手且目标在 justVotedSeatIds ⇒ 可射击
    expect(travelerGunslingerCanShoot(withGunslinger, justVoted, 3)).toBe(true);
    // 候选目标清单 = justVotedSeatIds 原样
    expect(travelerGunslingerEligibleTargets(withGunslinger, justVoted)).toEqual(
      justVoted
    );
  });

  it("X04-T-16 替罪羊：同阵营才可代刑（邪恶替罪羊同样成立）", () => {
    const scapegoat = TRAVELER_ROLES.find(
      (r) => r.id === "scapegoat_traveler"
    )!;
    expect(scapegoat).toBeDefined();
    const withScapegoat = [null, scapegoat, null, null] as (Role | null)[];
    const noScapegoat = [null, null, null, null] as (Role | null)[];

    // 善良替罪羊 + 善良被处决者 ⇒ 可代刑
    expect(
      travelerScapegoatCanSubstitute(withScapegoat, GOOD_SEAT(), { 1: "good" })
    ).not.toBeNull();
    // 善良替罪羊 + 邪恶被处决者 ⇒ 不同阵营 ⇒ 不可代刑
    expect(
      travelerScapegoatCanSubstitute(withScapegoat, EVIL_SEAT(), { 1: "good" })
    ).toBeNull();
    // ⭐ 邪恶替罪羊 + 邪恶被处决者 ⇒ 可代刑
    //   （2026-10-16 修复的核心缺陷：旧实现 `canScapegoatSubstitute` 走
    //     `isPlayerGood`，而 traveler 被 GOOD_ROLE_TYPES 硬编码为善良
    //     ⇒ 邪恶替罪羊永远返回 null，官方规则静默失效）
    expect(
      travelerScapegoatCanSubstitute(withScapegoat, EVIL_SEAT(), { 1: "evil" })
    ).not.toBeNull();
    // 场上无替罪羊 ⇒ 不可代刑
    expect(
      travelerScapegoatCanSubstitute(noScapegoat, GOOD_SEAT(), { 1: "good" })
    ).toBeNull();
  });

  it("X04-T-13b 巫毒师：投票资格 / 幽灵票 / 上台门槛", () => {
    // ① 谁可以投票：无巫毒师 ⇒ 人人可投票；有巫毒师 ⇒ 仅死亡玩家与巫毒师本人
    expect(voudonAllowsVoter(false, false, false)).toBe(true);
    expect(voudonAllowsVoter(true, true, false)).toBe(true);
    expect(voudonAllowsVoter(true, true, true)).toBe(true);
    expect(voudonAllowsVoter(true, false, false)).toBe(false);
    expect(voudonAllowsVoter(true, false, true)).toBe(true);

    // ② 死亡玩家投票不消耗幽灵票
    expect(voudonSkipsGhostVote(true)).toBe(true);
    expect(voudonSkipsGhostVote(false)).toBe(false);

    // ③ 上台门槛：巫毒师在场时忽略过半 ⇒ 阈值 1；否则沿用常规阈值
    expect(voudonThreshold(true, 5)).toBe(1);
    expect(voudonThreshold(false, 5)).toBe(5);
  });
});

describe("X04 传奇 14 人：数据完整 + 不入夜序 + 不占旅行者槽", () => {
  it("X04-F-01 圣洁之魂：数据完整 + 不入夜序 + 不占旅行者槽", () => {
    expectFabledContract("spirit_of_ivory");
  });

  it("X04-F-02 哨兵：数据完整 + 不入夜序 + 不占旅行者槽", () => {
    expectFabledContract("sentinel");
  });

  it("X04-F-03 革命家：数据完整 + 不入夜序 + 不占旅行者槽", () => {
    expectFabledContract("revolutionary");
  });

  it("X04-F-04 末日使者：数据完整 + 不入夜序 + 不占旅行者槽", () => {
    expectFabledContract("doomsayer");
  });

  it("X04-F-05 佛吉：数据完整 + 不入夜序 + 不占旅行者槽", () => {
    expectFabledContract("fibbin");
  });

  it("X04-F-06 地狱图书管理员：数据完整 + 不入夜序 + 不占旅行者槽", () => {
    expectFabledContract("hells_librarian");
  });

  it("X04-F-07 佛教徒：数据完整 + 不入夜序 + 不占旅行者槽", () => {
    expectFabledContract("buddhist");
  });

  it("X04-F-08 天使：数据完整 + 不入夜序 + 不占旅行者槽", () => {
    expectFabledContract("angel");
  });

  it("X04-F-09 失败的上帝：数据完整 + 不入夜序 + 不占旅行者槽", () => {
    expectFabledContract("deus_ex_fiasco");
  });

  it("X04-F-10 摆渡人：数据完整 + 不入夜序 + 不占旅行者槽", () => {
    expectFabledContract("ferryman");
  });

  it("X04-F-11 玩具匠：数据完整 + 不入夜序 + 不占旅行者槽", () => {
    expectFabledContract("toymaker");
  });

  it("X04-F-12 小提琴手：数据完整 + 不入夜序 + 不占旅行者槽", () => {
    expectFabledContract("fiddler");
  });

  it("X04-F-13 公爵夫人：数据完整 + 不入夜序 + 不占旅行者槽", () => {
    expectFabledContract("duchess");
  });

  it("X04-F-14 灯神：数据完整 + 不入夜序 + 不占旅行者槽", () => {
    expectFabledContract("djinn");
  });
});

describe("X04 摆渡人专项：最后一天语义 + reducer 静态护栏", () => {
  it("X04-F-10b 摆渡人：文案含「最后一天」/「投票」+ FERRYMAN_LAST_DAY 分支存在", () => {
    const ferryman = FABLED_ROLES.find((r) => r.id === "ferryman")!;
    expect(ferryman, "FABLED_ROLES 缺少 ferryman").toBeDefined();

    const text = [
      (ferryman as any).ability,
      (ferryman as any).fullDescription,
      (ferryman as any).description,
    ]
      .filter((t) => typeof t === "string")
      .join("\n");
    expect(text, "摆渡人文案必须提到「最后一天」").toContain("最后一天");
    expect(text, "摆渡人文案必须提到「投票」").toContain("投票");

    // ⭐ 静态护栏：防止有人删掉 GameContext 里的 FERRYMAN_LAST_DAY 分支。
    //   比「能跑」更能挡住回归 —— 分支一删，能力即静默失效。
    const ctxPath = path.resolve(
      __dirname,
      "../../contexts/GameContext.tsx"
    );
    const ctxSrc = readFileSync(ctxPath, "utf8");
    expect(ctxSrc, "GameContext.tsx 缺少 FERRYMAN_LAST_DAY reducer 分支").toMatch(
      /case\s+["']FERRYMAN_LAST_DAY["']/
    );
    expect(
      ctxSrc,
      "GameContext.tsx 缺少 ferrymanLastDayResolved 落库字段"
    ).toMatch(/ferrymanLastDayResolved\s*:\s*true/);
  });
});

// ── 真缺陷登记区（本轮无真缺陷；发现即在此写「角色 + 现象 + 怀疑根因」） ──
// （无）
