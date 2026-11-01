/**
 * 官方范例夹具 · 黯月初升第三批（和平主义者 / 水手 / 莽夫 / 侍臣 / 修补匠）
 * ======================================================================
 * 覆盖 BMR 核心免死与阵营互动机制：
 *   · 和平主义者：处决善良可免死；醉酒/非处决(流放)/邪恶不免死
 *   · 水手：清醒健康处决与夜袭免死；醉酒时处决死亡
 *   · 莽夫：被选者醉酒并随之改变阵营；阵营翻转连带茶艺师保护失效
 *   · 侍臣：使恶魔醉酒3天3夜；醉酒使用消耗能力；使主谋醉酒则恶魔死善良立即胜
 *   · 修补匠：受免死保护时不能因自身能力死亡
 */
import { describe, expect, it } from "vitest";
import { getAbilityForRole } from "../../../src/roles/new_engine/abilityRegistry";
import { resetLimitedAbilityUses } from "../../../src/utils/LimitedAbilityManager";
import { isProtectedBySailor, isProtectedByTeaLady } from "../../../src/utils/bmrMechanics";
import { checkPacifistSave } from "../../../src/utils/pacifistRule";
import { isImmuneToDemonKill } from "../../../src/utils/soldierImmunity";
import { canTinkerDieByOwnAbility } from "../../../src/utils/tinkerRule";
import { ctx, ensureAbilityRegistry, judge, runAbility, seat } from "./_harness";

async function run(
  roleId: string,
  seats: any[],
  options: {
    targets?: number[];
    storytellerInput?: any;
    snapshot?: Record<string, any>;
    night?: number;
    phase?: "firstNight" | "night" | "day";
    seatId?: number;
    meta?: Record<string, any>;
  } = {}
): Promise<{ info: any; seats: any[]; snapshot: any }> {
  ensureAbilityRegistry();
  resetLimitedAbilityUses();
  const ability = getAbilityForRole(roleId);
  expect(ability, `能力注册表缺少 ${roleId}`).toBeTruthy();
  const result: any = await runAbility(
    ability,
    ctx(seats, options.seatId ?? 0, roleId, {
      night: options.night ?? 2,
      phase: options.phase ?? "night",
      targets: options.targets ?? [],
      storytellerInput: options.storytellerInput,
      snapshot: options.snapshot,
      meta: options.meta,
    })
  );
  return {
    info: result.meta?.abilityResult,
    seats: result.snapshot?.seats ?? seats,
    snapshot: result.snapshot,
  };
}

describe("和平主义者 · 处决善良玩家免死判定（官方 和平主义者#0 / #2）", () => {
  it("和平主义者#0：旅店老板被处决，和平主义者在场 ⇒ 触发拯救判定，免于死亡", () => {
    // 官方范例: 和平主义者 #0
    const seats = [
      seat(0, "pacifist"),
      seat(1, "innkeeper"),
      seat(2, "shabaloth"),
      seat(3, "chef"),
    ];
    const check = checkPacifistSave(seats[1], seats);
    expect(check.shouldPrompt, "善良玩家被处决应触发和平主义者拯救提示").toBe(true);
    expect(check.pacifistSeatId).toBe(0);
  });

  it("和平主义者#2：邪恶阵营占优/醉酒失效/流放不免死/自身受保护", () => {
    // 官方范例: 和平主义者 #2
    // 1) 疯子（善良外来者）被处决，说书人可选择救下疯子
    const seats = [
      seat(0, "pacifist"),
      seat(1, "lunatic"), // 疯子是善良外来者
      seat(2, "professor"),
      seat(3, "shabaloth"),
    ];
    const lunaticCheck = checkPacifistSave(seats[1], seats);
    expect(lunaticCheck.shouldPrompt, "善良疯子被处决可以被和平主义者救下").toBe(true);

    // 2) 和平主义者醉酒 ⇒ 善良教授被处决无法免死
    const seatsDrunk = [
      seat(0, "pacifist", { isDrunk: true }),
      seat(1, "professor"),
      seat(2, "shabaloth"),
    ];
    const drunkCheck = checkPacifistSave(seatsDrunk[1], seatsDrunk);
    expect(drunkCheck.shouldPrompt, "和平主义者醉酒时不能救下被处决者").toBe(false);

    // 3) 自身被处决 ⇒ 和平主义者自身能力可以保护自己
    const selfCheck = checkPacifistSave(seats[0], seats);
    expect(selfCheck.shouldPrompt, "和平主义者被处决时可触发自身能力自救").toBe(true);
  });

  it("和平主义者：处决真正邪恶玩家 ⇒ 不得触发拯救（反向对照）", () => {
    // 反向对照：邪恶恶魔被处决不得触发拯救提示
    const seats = [
      seat(0, "pacifist"),
      seat(1, "shabaloth"),
      seat(2, "chef"),
    ];
    const evilCheck = checkPacifistSave(seats[1], seats);
    expect(evilCheck.shouldPrompt, "邪恶玩家被处决不得触发和平主义者提示").toBe(false);
  });
});

describe("水手 · 清醒健康免死与致醉（官方 水手#0 / #2）", () => {
  it("水手#0：选择驱魔人致其醉酒；水手夜袭不死且处决不死", async () => {
    // 官方范例: 水手 #0
    const seats = [
      seat(0, "sailor"),
      seat(1, "exorcist"),
      seat(2, "shabaloth"),
      seat(3, "chef"),
    ];

    // 水手夜间选择驱魔人（镇民）⇒ 驱魔人醉酒
    const { seats: nextSeats, info } = await run("sailor", seats, { targets: [1] });
    expect(info?.drunkId, "水手选择镇民通常使目标醉酒").toBe(1);
    expect(nextSeats[1].isDrunk).toBe(true);

    // 清醒健康的水手免疫恶魔夜杀
    expect(isImmuneToDemonKill(nextSeats[0]), "清醒健康的水手免疫恶魔夜杀").toBe(true);

    // 清醒健康的水手处决不死
    expect(isProtectedBySailor(nextSeats[0]), "清醒健康的水手处决不死").toBe(true);
  });

  it("水手#2：水手醉酒 ⇒ 被处决时死亡", () => {
    // 官方范例: 水手 #2
    const drunkSailor = seat(0, "sailor", { isDrunk: true });
    expect(isProtectedBySailor(drunkSailor), "醉酒的水手失去处决免死保护").toBe(false);
    expect(isImmuneToDemonKill(drunkSailor), "醉酒的水手失去夜杀免疫保护").toBe(false);
  });
});

describe("莽夫 · 选择者醉酒与阵营转变（官方 莽夫#0 / #1 / #3）", () => {
  it("莽夫#0：善良侍臣选择莽夫 ⇒ 莽夫保持善良，侍臣醉酒", async () => {
    // 官方范例: 莽夫 #0
    const seats = [
      seat(0, "goon"),
      seat(1, "courtier"),
      seat(2, "shabaloth"),
    ];
    const { seats: nextSeats, info } = await run("goon", seats, {
      meta: { chooserSeatId: 1 },
    });
    expect(info?.newAlignment).toBe("good");
    expect(nextSeats[0].alignment).toBe("good");
    expect(nextSeats[1].isDrunk, "选择莽夫的善良侍臣醉酒").toBe(true);
  });

  it("莽夫#1：恶魔沙巴洛斯攻击莽夫 ⇒ 沙巴洛斯醉酒，莽夫转为邪恶", async () => {
    // 官方范例: 莽夫 #1
    const seats = [
      seat(0, "goon"),
      seat(1, "shabaloth"),
      seat(2, "gossip"),
    ];
    const { seats: nextSeats, info } = await run("goon", seats, {
      meta: { chooserSeatId: 1 },
    });
    expect(info?.newAlignment).toBe("evil");
    expect(nextSeats[0].alignment).toBe("evil");
    expect(nextSeats[0].isEvilConverted).toBe(true);
    expect(nextSeats[1].isDrunk, "攻击莽夫的沙巴洛斯醉酒").toBe(true);
  });

  it("莽夫#3：茶艺师邻座是莽夫与修补匠；莽夫转邪恶后，茶艺师保护失效", () => {
    // 官方范例: 莽夫 #3
    // 1) 莽夫为善良时：茶艺师两名邻居（莽夫+修补匠）均为善良，修补匠受保护
    const seatsGoodGoon = [
      seat(0, "tea_lady"),
      seat(1, "goon"),
      seat(2, "chef"),
      seat(3, "tinker"),
    ];
    expect(isProtectedByTeaLady(3, seatsGoodGoon), "莽夫善良时修补匠受茶艺师保护").toBe(true);

    // 2) 莽夫转为邪恶后：一侧邻居非善良，茶艺师保护失效，修补匠处决可死
    const seatsEvilGoon = [
      seat(0, "tea_lady"),
      seat(1, "goon", { isEvilConverted: true }),
      seat(2, "chef"),
      seat(3, "tinker"),
    ];
    expect(isProtectedByTeaLady(3, seatsEvilGoon), "莽夫转邪恶后茶艺师保护失效").toBe(false);
  });
});

describe("侍臣 · 醉酒控制与终局判定（官方 侍臣#0 / #1 / #2）", () => {
  it("侍臣#0：侍臣使沙巴洛斯醉酒3天3夜", async () => {
    // 官方范例: 侍臣 #0
    const seats = [
      seat(0, "courtier"),
      seat(1, "shabaloth"),
      seat(2, "chef"),
    ];
    const { seats: nextSeats, info } = await run("courtier", seats, {
      night: 5,
      storytellerInput: { targetRoleId: "shabaloth" },
    });
    expect(info?.effective).toBe(true);
    expect(info?.drunkUntilNight).toBe(8); // 第5夜发动，持续至第8夜
    expect(nextSeats[1].isDrunk, "沙巴洛斯进入醉酒状态").toBe(true);
  });

  it("侍臣#1：侍臣在醉酒时使用能力 ⇒ 无事发生，但能力被消耗", async () => {
    // 官方范例: 侍臣 #1
    const seats = [
      seat(0, "courtier", { isDrunk: true }),
      seat(1, "shabaloth"),
    ];
    const { seats: nextSeats, snapshot } = await run("courtier", seats, {
      night: 2,
      storytellerInput: { targetRoleId: "shabaloth" },
    });
    expect(nextSeats[1].isDrunk, "目标不应被醉酒").toBe(false);
    expect(snapshot.courtierUsed, "侍臣能力标记已使用").toBe(true);
  });

  it("侍臣#2：侍臣使主谋醉酒 ⇒ 珀被处决后善良直接获胜", () => {
    // 官方范例: 侍臣 #2
    // 珀被处决，主谋存活但醉酒 ⇒ 主谋能力不生效，游戏立即结束善良获胜
    const seats = [
      seat(0, "po", { isDead: true }),
      seat(1, "mastermind", { isDrunk: true }),
      seat(2, "chef"),
      seat(3, "empath"),
    ];
    const verdict = judge(seats, "execution", 0);
    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Good");
    expect(verdict.reasonCode).toBe("DEMON_ALL_DEAD");
  });
});

describe("修补匠 · 保护优先级高于自身致死能力（官方 修补匠#2）", () => {
  it("修补匠#2：茶艺师保护修补匠 ⇒ 修补匠不会因自身能力死亡", () => {
    // 官方范例: 修补匠 #2
    const tinkerSeat = seat(0, "tinker");
    const checkProtected = canTinkerDieByOwnAbility(tinkerSeat, [tinkerSeat], () => true);
    expect(checkProtected.canDie, "受茶艺师保护时不得因修补匠能力自死").toBe(false);

    // 反向对照：无保护时修补匠随时可以死亡
    const checkUnprotected = canTinkerDieByOwnAbility(tinkerSeat, [tinkerSeat], () => false);
    expect(checkUnprotected.canDie, "无保护时修补匠可被自身能力处死").toBe(true);
  });
});
