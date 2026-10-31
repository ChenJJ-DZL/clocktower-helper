/**
 * 官方范例可执行夹具 · 暗流涌动 · 夜晚击杀 / 保护 / 继任
 * ======================================================================
 * 每条夹具对应 1 条官方【范例】；断言走真实能力管道
 * （`runFullAbilityPipeline`），必要时再串生产判胜入口 `checkGameEnd`。
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  impAbility,
  monkAbility,
  poisonerAbility,
  scarletWomanAbility,
  slayerAbility,
} from "../../../src/roles/new_engine/abilityRegistry";
import {
  ctx,
  ensureAbilityRegistry,
  judge,
  role,
  runAbility,
  seat,
  settleDeaths,
} from "./_harness";

beforeAll(() => {
  ensureAbilityRegistry();
});

function result(res: any): any {
  return res.meta?.abilityResult;
}

function impResult(res: any): any {
  return res.meta?.impResult;
}

function findSeat(seats: any[], seatId: number): any {
  return seats.find((candidate) => candidate.id === seatId);
}

function hasStatus(seatState: any, type: string): boolean {
  return (seatState?.statusEffects ?? []).some(
    (effect: any) => effect?.type === type
  );
}

describe("暗流涌动 · 夜晚击杀 / 保护 / 继任官方范例", () => {
  // 官方范例: 士兵 #0
  it("士兵#0：小恶魔攻击士兵 ⇒ 士兵不死亡，当晚无人死亡", async () => {
    const seats = [
      seat(0, "soldier"),
      seat(1, "imp"),
      seat(2, "chef"),
      seat(3, "mayor"),
      seat(4, "monk"),
    ];
    const res = await runAbility(impAbility, ctx(seats, 1, "imp", { targets: [0] }));
    expect(res.aborted).toBe(false);
    const soldierAfter = findSeat(res.snapshot.seats as any[], 0);
    expect(soldierAfter.isDead).not.toBe(true);
    expect(soldierAfter.markedForDeath).toBeUndefined();
    // 恶魔视角：未能造成伤亡（但恶魔不会被口头告知原因）
    expect(res.meta?.displayInfo?.killed).toBe(false);
  });

  // 官方范例: 士兵 #1
  it("士兵#1：士兵中毒后失去能力 ⇒ 小恶魔攻击会杀死他", async () => {
    const seats = [
      seat(0, "soldier", { isPoisoned: true, statusEffects: [{ type: "poisoned" }] }),
      seat(1, "imp"),
      seat(2, "chef"),
      seat(3, "mayor"),
      seat(4, "monk"),
    ];
    expect(hasStatus(seats[0], "poisoned")).toBe(true);
    const res = await runAbility(impAbility, ctx(seats, 1, "imp", { targets: [0] }));
    expect(res.aborted).toBe(false);
    const soldierAfter = findSeat(res.snapshot.seats as any[], 0);
    expect(soldierAfter.markedForDeath, "中毒士兵必须失去免死").toBe(true);
  });

  // 官方范例: 僧侣 #0
  it("僧侣#0：僧侣保护占卜师，小恶魔攻击占卜师 ⇒ 今晚没有人死亡", async () => {
    const seats = [
      seat(0, "monk"),
      seat(1, "fortune_teller"),
      seat(2, "imp"),
      seat(3, "chef"),
      seat(4, "mayor"),
    ];
    const protectedRes = await runAbility(
      monkAbility,
      ctx(seats, 0, "monk", { targets: [1] })
    );
    expect(protectedRes.aborted).toBe(false);
    const afterMonk = protectedRes.snapshot.seats as any[];
    expect(result(protectedRes).isProtected).toBe(true);
    expect(hasStatus(findSeat(afterMonk, 1), "protected")).toBe(true);

    const impRes = await runAbility(
      impAbility,
      ctx(afterMonk, 2, "imp", { targets: [1] })
    );
    expect(impRes.aborted).toBe(false);
    const fortuneTellerAfter = findSeat(impRes.snapshot.seats as any[], 1);
    expect(fortuneTellerAfter.isDead).not.toBe(true);
    expect(fortuneTellerAfter.markedForDeath).toBeUndefined();
    expect(impRes.meta?.displayInfo?.killed).toBe(false);
  });

  // 官方范例: 僧侣 #1
  it("僧侣#1：僧侣保护镇长，小恶魔攻击镇长 ⇒ 镇长能力不被触发，无人死亡", async () => {
    const seats = [
      seat(0, "monk"),
      seat(1, "mayor"),
      seat(2, "imp"),
      seat(3, "chef"),
      seat(4, "soldier"),
    ];
    const protectedRes = await runAbility(
      monkAbility,
      ctx(seats, 0, "monk", { targets: [1] })
    );
    const afterMonk = protectedRes.snapshot.seats as any[];
    expect(hasStatus(findSeat(afterMonk, 1), "protected")).toBe(true);

    const impRes = await runAbility(
      impAbility,
      ctx(afterMonk, 2, "imp", { targets: [1] })
    );
    const mayorAfter = findSeat(impRes.snapshot.seats as any[], 1);
    expect(mayorAfter.isDead).not.toBe(true);
    expect(mayorAfter.markedForDeath).toBeUndefined();
    // 僧侣保护优先：镇长替死能力不应被触发（无替死者）
    expect(impResult(impRes).mayorSubstituted ?? false).toBe(false);
    expect(impResult(impRes).substituteId).toBeUndefined();
  });

  // 官方范例: 酒鬼 #0
  it("酒鬼#0：以为自己是士兵的酒鬼被小恶魔攻击 ⇒ 酒鬼死亡", async () => {
    const seats = [
      seat(0, "drunk", {
        isDrunk: true,
        charadeRole: "soldier",
        statusEffects: [{ type: "drunk" }],
      }),
      seat(1, "imp"),
      seat(2, "chef"),
      seat(3, "mayor"),
      seat(4, "monk"),
    ];
    expect(seats[0].role.id).toBe("drunk");
    expect(seats[0].charadeRole?.id).toBe("soldier");
    const res = await runAbility(impAbility, ctx(seats, 1, "imp", { targets: [0] }));
    expect(res.aborted).toBe(false);
    // 免死来自**真实角色**，不是他自以为的士兵
    expect(findSeat(res.snapshot.seats as any[], 0).markedForDeath).toBe(true);
  });

  // 官方范例: 小恶魔 #1
  it("小恶魔#1：小恶魔自杀 ⇒ 投毒者变成新的小恶魔，游戏继续", async () => {
    const seats = [
      seat(0, "imp"),
      seat(1, "poisoner"),
      seat(2, "chef"),
      seat(3, "soldier"),
      seat(4, "mayor"),
    ];
    const res = await runAbility(
      impAbility,
      ctx(seats, 0, "imp", {
        targets: [0],
        storytellerInput: { successorSeatId: 1 },
      })
    );
    expect(res.aborted).toBe(false);
    const after = res.snapshot.seats as any[];
    expect(findSeat(after, 0).isDead, "原小恶魔必须死亡").toBe(true);
    expect(findSeat(after, 1).role.id, "投毒者继任小恶魔").toBe(role("imp").id);
    expect(findSeat(after, 1).isDemonSuccessor).toBe(true);
    // 恶魔血脉未断绝 ⇒ 游戏不结束
    const verdict = judge(settleDeaths(after), "night_death");
    expect(verdict.isGameOver).toBe(false);
  });

  // 官方范例: 投毒者 #0
  it("投毒者#0：猎手中毒后射杀小恶魔 ⇒ 无事发生，猎手失去能力", async () => {
    const seats = [
      seat(0, "poisoner"),
      seat(1, "slayer"),
      seat(2, "imp"),
      seat(3, "chef"),
      seat(4, "mayor"),
    ];
    const poisonRes = await runAbility(
      poisonerAbility,
      ctx(seats, 0, "poisoner", { targets: [1] })
    );
    expect(poisonRes.aborted).toBe(false);
    const afterPoison = poisonRes.snapshot.seats as any[];
    expect(hasStatus(findSeat(afterPoison, 1), "poisoned")).toBe(true);

    const shotRes = await runAbility(
      slayerAbility,
      ctx(afterPoison, 1, "slayer", { phase: "day", targets: [2] })
    );
    expect(shotRes.aborted).toBe(false);
    const afterShot = shotRes.snapshot.seats as any[];
    expect(findSeat(afterShot, 2).isDead, "中毒猎手不能杀死恶魔").not.toBe(true);
    expect(findSeat(afterShot, 2).markedForDeath).toBeUndefined();
    expect(findSeat(afterShot, 1).abilityUsed, "猎手仍消耗了本局限次能力").toBe(
      true
    );
  });

  // 官方范例: 红唇女郎 #1
  it("红唇女郎#1：5 人存活且小恶魔被处决 ⇒ 红唇女郎变成小恶魔，游戏继续", async () => {
    const seats = [
      seat(0, "scarlet_woman"),
      seat(1, "imp", { isDead: true, executedToday: true }),
      seat(2, "chef"),
      seat(3, "mayor"),
      seat(4, "soldier"),
    ];
    const res = await runAbility(
      scarletWomanAbility,
      ctx(seats, 0, "scarlet_woman")
    );
    expect(res.aborted).toBe(false);
    const after = res.snapshot.seats as any[];
    expect(findSeat(after, 1).isDead).toBe(true);
    expect(findSeat(after, 0).role.id, "红唇女郎继任恶魔").toBe(role("imp").id);
    expect(findSeat(after, 0).isDemonSuccessor).toBe(true);
    const verdict = judge(after, "execution", 1);
    expect(verdict.isGameOver, "恶魔血脉已由红唇女郎继承 ⇒ 游戏继续").toBe(false);
  });

  // 官方范例: 红唇女郎 #0
  it("红唇女郎#0：7 人存活含 3 名旅行者 ⇒ 旅行者不计入，红唇女郎不继任，善良获胜", async () => {
    // 官方：7 名存活（小恶魔、红唇女郎、2 镇民、3 旅行者），小恶魔被处决 ——
    // 旅行者不计算在红唇女郎的能力里 ⇒ 红唇女郎不变身，游戏结束且善良获胜。
    const seats = [
      seat(0, "scarlet_woman"),
      seat(1, "imp", { isDead: true, executedToday: true }),
      seat(2, "chef"),
      seat(3, "mayor"),
      seat(4, "gunslinger"),
      seat(5, "bureaucrat"),
      seat(6, "thief"),
    ];
    const res = await runAbility(
      scarletWomanAbility,
      ctx(seats, 0, "scarlet_woman")
    );
    // 存活非旅行者不足 5 ⇒ 能力不生效（能力本身走"不触发"分支）
    expect(res.aborted, "红唇女郎不应在旅行者凑数的存活人数下继任").toBe(true);
    const after = res.snapshot.seats as any[];
    expect(findSeat(after, 0).role.id).toBe(role("scarlet_woman").id);
    const verdict = judge(after, "execution", 1);
    expect(verdict.isGameOver).toBe(true);
    expect(verdict.winner).toBe("Good");
    expect(verdict.reasonCode).toBe("DEMON_ALL_DEAD");
  });

  // 官方范例: 僧侣 #2
  it("僧侣#2：僧侣保护小恶魔，小恶魔选择自杀 ⇒ 无事发生（小恶魔存活，无继任者）", async () => {
    const seats = [
      seat(0, "monk"),
      seat(1, "imp"),
      seat(2, "poisoner"),
      seat(3, "chef"),
      seat(4, "mayor"),
    ];
    const protectedRes = await runAbility(
      monkAbility,
      ctx(seats, 0, "monk", { targets: [1] })
    );
    expect(protectedRes.aborted).toBe(false);
    const afterMonk = protectedRes.snapshot.seats as any[];
    expect(hasStatus(findSeat(afterMonk, 1), "protected"), "小恶魔应被僧侣保护").toBe(
      true
    );

    const impRes = await runAbility(
      impAbility,
      ctx(afterMonk, 1, "imp", {
        targets: [1], // 自杀
        storytellerInput: { successorSeatId: 2 },
      })
    );
    expect(impRes.aborted).toBe(false);
    const after = impRes.snapshot.seats as any[];
    // 官方：受保护的小恶魔自杀「无事发生」——恶魔仍存活，且没有新恶魔被创造
    expect(findSeat(after, 1).isDead, "受保护的小恶魔不得因自杀死亡").not.toBe(true);
    expect(findSeat(after, 1).markedForDeath).toBeUndefined();
    expect(findSeat(after, 2).role.id, "不得创造新的小恶魔").not.toBe(role("imp").id);
    expect(findSeat(after, 2).isDemonSuccessor ?? false).toBe(false);
    expect(impResult(impRes).killed, "受保护 ⇒ 未造成死亡").toBe(false);
  });

  // 官方范例: 士兵 #2
  it.fails("士兵#2【已核实偏差，修好后请转正】：小恶魔攻击镇长、说书人指定士兵替死 ⇒ 士兵无法被恶魔杀死，当晚无人死亡", async () => {
    const seats = [
      seat(0, "mayor"),
      seat(1, "soldier"),
      seat(2, "imp"),
      seat(3, "chef"),
      seat(4, "empath"),
    ];
    const res = await runAbility(
      impAbility,
      ctx(seats, 2, "imp", {
        targets: [0],
        // 说书人按官方范例指定「士兵代替镇长死亡」
        storytellerInput: { mayorSubstituteId: 1 },
      })
    );
    expect(res.aborted).toBe(false);
    const after = res.snapshot.seats as any[];
    // 官方：因为士兵无法被恶魔杀死，当晚无人死亡（镇长也不死）
    expect(findSeat(after, 0).isDead, "镇长本人不应死亡").not.toBe(true);
    expect(findSeat(after, 0).markedForDeath).toBeUndefined();
    expect(
      findSeat(after, 1).markedForDeath,
      "士兵免死 ⇒ 不得被指定替死"
    ).toBeUndefined();
    expect(findSeat(after, 1).isDead, "士兵不应死亡").not.toBe(true);
    expect(impResult(res).killed, "当晚无人死亡").toBe(false);
    expect(impResult(res).mayorSubstituted ?? false).toBe(false);
  });

});
