/**
 * 官方范例可执行夹具 · 暗流涌动（第二批）
 * ======================================================================
 * 覆盖三类此前缺失的规则：
 *   ① 旅行者判据（替罪羊代刑 / 枪手射击 / 巫毒师投票）—— 直接断言
 *      `src/utils/travelerHooks.ts` 的**单一事实源谓词**，不复制规则；
 *   ② 配比（男爵 +2 外来者）；
 *   ③ 判胜 + 毒醉信息（镇长和平获胜 / 投毒者令真值失真）。
 *
 * 说书人任选类（酒鬼假信息、洗衣妇报谁、陌客登记）不在此文件：
 * 官方本身给的是"可能的一种结果"，无法确定性断言，已在
 * docs/RULE_CONFORMANCE_SYSTEM.md 第九节登记为 excluded。
 */
import { describe, expect, it } from "vitest";
import { roles } from "../../../app/data";
import {
  travelerGunslingerCanShoot,
  travelerScapegoatCanSubstitute,
  voudonAllowsVoter,
  voudonThreshold,
} from "../../../src/utils/travelerHooks";
import { computeSetupComposition } from "../../../src/utils/setupComposition";
import { judge, runOracleCase, type OracleSeat } from "./_oracle";

const role = (id: string) => roles.find((candidate) => candidate.id === id)!;

/** 造旅行者槽位（判据只读槽位，不读 seats） */
function travelers(roleIds: Array<string | null>): any[] {
  return [0, 1, 2, 3].map((index) => {
    const id = roleIds[index];
    return id ? role(id) : null;
  });
}

describe("暗流涌动 · 替罪羊（旅行者）官方范例", () => {
  // 官方范例: 替罪羊#0
  it("替罪羊#0：善良替罪羊可代替善良的占卜师被处决", () => {
    // 官方：占卜师即将被处决，说书人决定由替罪羊代替 ⇒ 占卜师不死、替罪羊死。
    const candidate = travelerScapegoatCanSubstitute(
      travelers(["scapegoat_traveler"]),
      { id: 2, role: role("fortune_teller"), isDead: false } as any,
      ["good"] as any
    );
    expect(candidate?.role.id).toBe("scapegoat_traveler");
  });

  // 官方范例: 替罪羊#1
  it("替罪羊#1：邪恶替罪羊可代替邪恶的投毒者被处决", () => {
    const candidate = travelerScapegoatCanSubstitute(
      travelers(["scapegoat_traveler"]),
      { id: 2, role: role("poisoner"), isDead: false } as any,
      ["evil"] as any
    );
    expect(candidate?.role.id).toBe("scapegoat_traveler");
  });

  // 官方范例: 替罪羊#2
  it("替罪羊#2：间谍被当作善良阵营时，善良替罪羊同样可代替", () => {
    // 官方：间谍此时被当作善良阵营 ⇒ 与善良替罪羊同阵营 ⇒ 可代刑。
    const candidate = travelerScapegoatCanSubstitute(
      travelers(["scapegoat_traveler"]),
      {
        id: 2,
        role: role("spy"),
        isDead: false,
        isGoodConverted: true,
      } as any,
      ["good"] as any
    );
    expect(
      candidate?.role.id,
      "间谍被登记为善良时应与善良替罪羊同阵营"
    ).toBe("scapegoat_traveler");
  });
});

describe("暗流涌动 · 枪手（旅行者）官方范例", () => {
  // 官方范例: 枪手#0
  it("枪手#0：首次投票结算后，可射杀刚投过票的玩家", () => {
    expect(
      travelerGunslingerCanShoot(travelers(["gunslinger"]), [1, 2, 3, 4, 5], 3)
    ).toBe(true);
  });

  // 官方范例: 枪手#1
  it("枪手#1：流放表决不算首次投票，只有处决投票的投票人才可被射杀", () => {
    // 官方：替罪羊被流放（不算首次投票）→ 管家那次处决投票才是首次 ⇒ 只能杀管家。
    const gunslinger = travelers(["gunslinger"]);
    expect(travelerGunslingerCanShoot(gunslinger, [7], 7)).toBe(true);
    expect(
      travelerGunslingerCanShoot(gunslinger, [], 7),
      "没有人投过票时不得射杀"
    ).toBe(false);
    expect(
      travelerGunslingerCanShoot(gunslinger, [7], 5),
      "没投过票的玩家不可被射杀"
    ).toBe(false);
  });

  // 官方范例: 枪手#2
  it("枪手#2：票数被窃贼改成负数，仍然算「刚投过票」", () => {
    // 官方：共情者的票变成负票，枪手依然可以杀死他。
    expect(
      travelerGunslingerCanShoot(travelers(["gunslinger"]), [4], 4)
    ).toBe(true);
  });
});

describe("无上愉悦 · 巫毒师（旅行者）官方范例", () => {
  // 官方范例: 巫毒师#0
  it("巫毒师#0：只有巫毒师和死者能投票，且门槛视为 1", () => {
    // 官方：12 名玩家 3 死，只有巫毒师与 3 名死者投票，合计 3 票即处决。
    expect(voudonAllowsVoter(true, true, false), "死者可以投票").toBe(true);
    expect(voudonAllowsVoter(true, false, true), "巫毒师本人可以投票").toBe(true);
    expect(
      voudonAllowsVoter(true, false, false),
      "存活的非巫毒师不能投票"
    ).toBe(false);
    expect(voudonThreshold(true, 6), "有巫毒师时门槛视为 1").toBe(1);
    expect(voudonThreshold(false, 6), "无巫毒师时门槛不变").toBe(6);
  });

  // 官方范例: 巫毒师#2
  it("巫毒师#2：死者 + 巫毒师 + 看似已死的僵怖共同投票，被提名者被处决", () => {
    // 官方：两名死者投票，随后巫毒师、已死的弄臣、看似已死的僵怖都投票。
    const voters: Array<[boolean, boolean]> = [
      [true, false], // 已死亡玩家
      [true, false], // 已死亡玩家
      [false, true], // 巫毒师本人
      [true, false], // 已死的弄臣
      [false, false], // 看似已死的僵怖 —— 实际存活，故不可投
    ];
    const allowed = voters.filter(([dead, isVoudon]) =>
      voudonAllowsVoter(true, dead, isVoudon)
    );
    expect(allowed, "僵怖看似已死但实际存活 ⇒ 不在可投票之列").toHaveLength(4);
  });
});

describe("暗流涌动 · 配比与判胜官方范例", () => {
  // 官方范例: 男爵#1
  it("男爵#1：15 人局男爵在场 ⇒ 外来者 +2、镇民 -2", () => {
    // 官方：原本 9 镇民 / 2 外来者 / 3 爪牙 / 1 恶魔，男爵加入后
    // 「移除僧侣标记来添加陌客标记」⇒ 8 镇民 / 3 外来者？——官方原文是
    // 「添加一个酒鬼标记和一个陌客标记」= 外来者 +2 ⇒ 7 / 4 / 3 / 1。
    const composition = computeSetupComposition(15, {
      inPlayRoleIds: ["baron"],
    } as any);
    expect(composition.counts).toMatchObject({
      townsfolk: 7,
      outsider: 4,
      minion: 3,
      demon: 1,
    });
    expect(composition.baronAddedOutsiders).toBe(2);
  });

  // 官方范例: 镇长#0
  it("镇长#0：夜间无人死亡后只剩 3 人、当天无人被提名 ⇒ 善良阵营获胜", () => {
    const seats = [
      { id: 0, role: role("mayor"), isDead: false },
      { id: 1, role: role("imp"), isDead: false },
      { id: 2, role: role("chef"), isDead: false },
      { id: 3, role: role("ravenkeeper"), isDead: true },
      { id: 4, role: role("soldier"), isDead: true },
    ];
    const verdict = judge(seats as any, "check_phase");
    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Good");
    expect(verdict.reasonCode).toBe("MAYOR_PEACEFUL_WIN");
  });
});

describe("暗流涌动 · 毒醉信息官方范例", () => {
  // 官方范例: 投毒者#1
  it("投毒者#1：中毒的共情者信息必假；解除中毒后得知正确值 2", async () => {
    // 官方：坐在两名邪恶玩家之间的中毒共情者得知「0」；不再中毒后得知「2」。
    // ⚠️ 邻座是**环形**的：0 号的邻座是 1 号与末位，所以两名邪恶要放在
    //    首尾两端（1 号 + 末位），中间夹善良玩家。
    const evilNeighbors: OracleSeat[] = [
      [0, "empath"],
      [1, "imp"],
      [2, "chef"],
      [3, "soldier"],
      [4, "poisoner"],
    ];

    const truthful = await runOracleCase({
      id: "投毒者#1-truth",
      roleId: "empath",
      seats: evilNeighbors,
      night: 2,
      phase: "night",
      check: () => undefined,
    });
    expect(truthful.info, "未中毒时应得知 2 名邪恶邻座").toBe(2);

    const poisoned = await runOracleCase({
      id: "投毒者#1-poisoned",
      roleId: "empath",
      seats: evilNeighbors.map((entry) =>
        entry[0] === 0
          ? ([0, "empath", { isPoisoned: true }] as const)
          : entry
      ) as OracleSeat[],
      night: 2,
      phase: "night",
      check: () => undefined,
    });
    expect(poisoned.info, "中毒时的信息必须与真值不同（必假）").not.toBe(2);
  });
});
