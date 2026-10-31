/**
 * 官方范例可执行夹具 · 暗流涌动 · 信息类角色
 * ======================================================================
 * 每条夹具对应 1 条官方【范例】（Oracle 来源：
 * `outputs/rule_conformance/official_spec.json` → `roles[].examples`）。
 * 断言全部经过**真实实现路径**：`runFullAbilityPipeline`（能力管道），
 * 不写空断言。
 *
 * 说明：官方【范例】里由说书人任选的「错误提示标记」对象（例如洗衣妇的错误标记
 * 落在谁身上）不是规则本身，夹具只断言官方规则必然成立的部分（角色名 / 候选者
 * 中恰好一人持有该角色）。主观裁定（如"说书人决定把陌客当作恶魔"）通过座位上的
 * 登记字段（`registerAsEvil` / `registerAsDemon`）显式表达，等价于说书人的裁定。
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  baronAbility,
  chefAbility,
  empathAbility,
  fortuneTellerAbility,
  investigatorAbility,
  librarianAbility,
  ravenkeeperAbility,
  undertakerAbility,
  washerwomanAbility,
} from "../../../src/roles/new_engine/abilityRegistry";
import { ctx, ensureAbilityRegistry, role, runAbility, seat } from "./_harness";

beforeAll(() => {
  ensureAbilityRegistry();
});

/** 取能力结果（信息类能力的真实返回值在 `meta.abilityResult`） */
function result(res: any): any {
  return res.meta?.abilityResult;
}

/** 断言「候选名单里恰好有一人持有名为 roleName 的角色」 */
function expectExactlyOneCandidateHasRole(
  res: any,
  seats: any[],
  roleName: string
): void {
  const info = result(res);
  const candidateIds = [info?.seat1, info?.seat2].filter(
    (id: any) => typeof id === "number" && id >= 0
  );
  expect(candidateIds).toHaveLength(2);
  const holders = candidateIds.filter(
    (id: number) => seats.find((s) => s.id === id)?.role?.name === roleName
  );
  expect(holders, `候选名单中应恰好一人是【${roleName}】`).toHaveLength(1);
}

describe("暗流涌动 · 信息类角色官方范例", () => {
  // 官方范例: 洗衣妇 #0
  it("洗衣妇#0：两名玩家人选之一持有报出的镇民角色", async () => {
    // 小文是厨师，小米是守鸦人；洗衣妇得知「要么小文是厨师，要么小米是厨师」。
    const seats = [
      seat(0, "washerwoman"),
      seat(1, "chef"),
      seat(2, "ravenkeeper"),
      seat(3, "imp"),
      seat(4, "baron"),
    ];
    const res = await runAbility(
      washerwomanAbility,
      ctx(seats, 0, "washerwoman", { night: 1, phase: "firstNight" })
    );
    expect(res.aborted).toBe(false);
    const info = result(res);
    expect(info.roleName, "洗衣妇报出的必须是镇民角色").toBe(role("chef").name);
    expectExactlyOneCandidateHasRole(res, seats, role("chef").name);
    // 说书人提示词里也必须是同一个镇民角色
    expect(String(res.meta?.prompt ?? "")).toContain(role("chef").name);
  });

  // 官方范例: 图书管理员 #0
  it("图书管理员#0：两名玩家人选之一持有报出的外来者角色", async () => {
    // 小八是圣徒，小莱是男爵；图书管理员得知「要么小八是圣徒，要么小莱是圣徒」。
    const seats = [
      seat(0, "librarian"),
      seat(1, "saint"),
      seat(2, "baron"),
      seat(3, "imp"),
      seat(4, "chef"),
    ];
    const res = await runAbility(
      librarianAbility,
      ctx(seats, 0, "librarian", { night: 1, phase: "firstNight" })
    );
    expect(res.aborted).toBe(false);
    expect(result(res).roleName).toBe(role("saint").name);
    expectExactlyOneCandidateHasRole(res, seats, role("saint").name);
  });

  // 官方范例: 图书管理员 #2
  it("图书管理员#2：得知酒鬼的**实际**角色，而不是他自以为的角色", async () => {
    // 小黑是酒鬼，且以为自己是僧侣。图书管理员得知「要么小黑是酒鬼，要么道哥是酒鬼」。
    const seats = [
      seat(0, "librarian"),
      seat(1, "drunk", { charadeRole: "monk" }),
      seat(2, "undertaker"),
      seat(3, "imp"),
      seat(4, "chef"),
    ];
    // 先确认「以为自己是僧侣」这件事在座位模型里成立（防夹具自欺）
    expect(seats[1].charadeRole?.id).toBe("monk");
    const res = await runAbility(
      librarianAbility,
      ctx(seats, 0, "librarian", { night: 1, phase: "firstNight" })
    );
    expect(res.aborted).toBe(false);
    // 报出的是酒鬼（实际角色），绝不能被伪装身份带偏成僧侣
    expect(result(res).roleName).toBe(role("drunk").name);
    expect(result(res).roleName).not.toBe(role("monk").name);
    expectExactlyOneCandidateHasRole(res, seats, role("drunk").name);
  });

  // 官方范例: 调查员 #0
  it("调查员#0：两名玩家人选之一持有报出的爪牙角色", async () => {
    // 小米是男爵，小佳是镇长；调查员得知「要么小米是男爵，要么小佳是男爵」。
    const seats = [
      seat(0, "investigator"),
      seat(1, "baron"),
      seat(2, "mayor"),
      seat(3, "imp"),
      seat(4, "soldier"),
    ];
    const res = await runAbility(
      investigatorAbility,
      ctx(seats, 0, "investigator", { night: 1, phase: "firstNight" })
    );
    expect(res.aborted).toBe(false);
    expect(result(res).roleName).toBe(role("baron").name);
    expectExactlyOneCandidateHasRole(res, seats, role("baron").name);
  });

  // 官方范例: 厨师 #0
  it("厨师#0：没有邪恶玩家相邻而坐 ⇒ 得知 0", async () => {
    const seats = [
      seat(0, "chef"),
      seat(1, "soldier"),
      seat(2, "imp"),
      seat(3, "monk"),
      seat(4, "poisoner"),
      seat(5, "mayor"),
    ];
    const res = await runAbility(
      chefAbility,
      ctx(seats, 0, "chef", { night: 1, phase: "firstNight" })
    );
    expect(res.aborted).toBe(false);
    expect(result(res)).toBe(0);
    expect(res.meta?.displayInfo?.evilPairCount).toBe(0);
  });

  // 官方范例: 厨师 #1
  it("厨师#1：两对相邻邪恶（小恶魔+男爵、投毒者+红唇女郎）⇒ 得知 2", async () => {
    const seats = [
      seat(0, "imp"),
      seat(1, "baron"),
      seat(2, "chef"),
      seat(3, "mayor"),
      seat(4, "poisoner"),
      seat(5, "scarlet_woman"),
      seat(6, "soldier"),
    ];
    const res = await runAbility(
      chefAbility,
      ctx(seats, 2, "chef", { night: 1, phase: "firstNight" })
    );
    expect(res.aborted).toBe(false);
    expect(result(res)).toBe(2);
  });

  // 官方范例: 厨师 #2
  it("厨师#2：邪恶的替罪羊夹在小恶魔与红唇女郎之间 ⇒ 共 3 对", async () => {
    // 官方：替罪羊被说书人当作邪恶（夹具用 registerAsEvil 表达该裁定）。
    const seats = [
      seat(0, "imp"),
      seat(1, "scapegoat", { registerAsEvil: true }),
      seat(2, "scarlet_woman"),
      seat(3, "chef"),
      seat(4, "poisoner"),
      seat(5, "baron"),
      seat(6, "mayor"),
    ];
    const res = await runAbility(
      chefAbility,
      ctx(seats, 3, "chef", { night: 1, phase: "firstNight" })
    );
    expect(res.aborted).toBe(false);
    expect(result(res)).toBe(3);
  });

  // 官方范例: 共情者 #0
  it("共情者#0：与两名善良玩家（士兵、僧侣）相邻 ⇒ 得知 0", async () => {
    const seats = [
      seat(0, "soldier"),
      seat(1, "empath"),
      seat(2, "monk"),
      seat(3, "imp"),
      seat(4, "poisoner"),
    ];
    const res = await runAbility(empathAbility, ctx(seats, 1, "empath"));
    expect(res.aborted).toBe(false);
    expect(result(res)).toBe(0);
  });

  // 官方范例: 共情者 #1
  it("共情者#1：跳过死亡邻座，探查到存活邻座中的邪恶枪手 ⇒ 得知 1", async () => {
    // 士兵被处决、僧侣被小恶魔杀死后，共情者两侧最近的存活玩家是图书管理员与邪恶枪手。
    const seats = [
      seat(0, "soldier", { isDead: true }),
      seat(1, "empath"),
      seat(2, "monk", { isDead: true }),
      seat(3, "librarian"),
      seat(4, "gunslinger", { isEvilConverted: true }), // 官方：邪恶的旅行者枪手
    ];
    const res = await runAbility(empathAbility, ctx(seats, 1, "empath"));
    expect(res.aborted).toBe(false);
    expect(result(res), "死亡邻座必须被跳过").toBe(1);
  });

  // 官方范例: 共情者 #2
  it("共情者#2：最后一夜仅 3 人存活（共情者/小恶魔/男爵）⇒ 必得知 2", async () => {
    const seats = [
      seat(0, "empath"),
      seat(1, "soldier", { isDead: true }),
      seat(2, "imp"),
      seat(3, "baron"),
      seat(4, "chef", { isDead: true }),
    ];
    const res = await runAbility(empathAbility, ctx(seats, 0, "empath", { night: 4 }));
    expect(res.aborted).toBe(false);
    expect(result(res)).toBe(2);
  });

  // 官方范例: 占卜师 #0
  it("占卜师#0：选择镇长与送葬者（无恶魔）⇒ 得知「否」", async () => {
    const seats = [
      seat(0, "fortune_teller"),
      seat(1, "mayor"),
      seat(2, "undertaker"),
      seat(3, "chef"),
      seat(4, "imp"),
    ];
    const res = await runAbility(
      fortuneTellerAbility,
      ctx(seats, 0, "fortune_teller", { targets: [1, 2] })
    );
    expect(res.aborted).toBe(false);
    expect(result(res)).toBe(false);
    expect(String(res.meta?.prompt ?? "")).toContain("没有恶魔");
  });

  // 官方范例: 占卜师 #1
  it("占卜师#1：选择小恶魔与共情者（有恶魔）⇒ 得知「是」", async () => {
    const seats = [
      seat(0, "fortune_teller"),
      seat(1, "mayor"),
      seat(2, "undertaker"),
      seat(3, "empath"),
      seat(4, "imp"),
    ];
    const res = await runAbility(
      fortuneTellerAbility,
      ctx(seats, 0, "fortune_teller", { targets: [4, 3] })
    );
    expect(res.aborted).toBe(false);
    expect(result(res)).toBe(true);
  });

  // 官方范例: 占卜师 #2
  it("占卜师#2：选择一名存活小恶魔与一名死亡小恶魔 ⇒ 仍得知「是」", async () => {
    const seats = [
      seat(0, "fortune_teller"),
      seat(1, "imp"),
      seat(2, "imp", { isDead: true }),
      seat(3, "chef"),
    ];
    expect(seats[2].isDead).toBe(true);
    const res = await runAbility(
      fortuneTellerAbility,
      ctx(seats, 0, "fortune_teller", { night: 3, targets: [1, 2] })
    );
    expect(res.aborted).toBe(false);
    expect(result(res), "已死亡的恶魔也必须被当作恶魔").toBe(true);
  });

  // 官方范例: 占卜师 #3
  it("占卜师#3：选择自己与作为「干扰项」的圣徒 ⇒ 得知「是」", async () => {
    const seats = [
      seat(0, "fortune_teller"),
      seat(1, "saint", {
        isRedHerring: true,
        isFortuneTellerRedHerring: true,
      }),
      seat(2, "chef"),
      seat(3, "imp"),
    ];
    const res = await runAbility(
      fortuneTellerAbility,
      ctx(seats, 0, "fortune_teller", {
        targets: [0, 1],
        snapshot: { gameId: "conformance-ft-example-3" },
      })
    );
    expect(res.aborted).toBe(false);
    expect(result(res), "干扰项会被占卜师当作恶魔").toBe(true);
  });

  // 官方范例: 送葬者 #0
  it("送葬者#0：镇长今天被处决 ⇒ 送葬者得知镇长", async () => {
    const seats = [
      seat(0, "undertaker"),
      seat(1, "mayor", { isDead: true, executedToday: true }),
      seat(2, "imp"),
      seat(3, "chef"),
    ];
    const res = await runAbility(
      undertakerAbility,
      ctx(seats, 0, "undertaker", {
        snapshot: { todayExecutedId: 1 },
      })
    );
    expect(res.aborted).toBe(false);
    expect(result(res).roleName).toBe(role("mayor").name);
    expect(result(res).executedSeatId).toBe(1);
  });

  // 官方范例: 送葬者 #1
  it("送葬者#1：以为自己是贞洁者的酒鬼被处决 ⇒ 得知酒鬼（实际角色）", async () => {
    const seats = [
      seat(0, "undertaker"),
      seat(1, "drunk", {
        isDead: true,
        executedToday: true,
        charadeRole: "virgin",
      }),
      seat(2, "imp"),
      seat(3, "chef"),
    ];
    expect(seats[1].charadeRole?.id).toBe("virgin");
    const res = await runAbility(
      undertakerAbility,
      ctx(seats, 0, "undertaker", {
        snapshot: { todayExecutedId: 1 },
      })
    );
    expect(res.aborted).toBe(false);
    expect(result(res).roleName).toBe(role("drunk").name);
    expect(result(res).roleName).not.toBe(role("virgin").name);
  });

  // 官方范例: 送葬者 #3
  it("送葬者#3：今天白天没有人被处决 ⇒ 当晚送葬者不被唤醒", async () => {
    const seats = [
      seat(0, "undertaker"),
      seat(1, "chef", { isDead: true }),
      seat(2, "imp"),
      seat(3, "mayor"),
    ];
    const res = await runAbility(
      undertakerAbility,
      ctx(seats, 0, "undertaker", {
        snapshot: { todayExecutedId: null },
      })
    );
    expect(res.aborted, "无人被处决 ⇒ 能力必须被前置校验拦下").toBe(true);
    expect(res.meta?._preCheckAborted).toBe(true);
  });

  // 官方范例: 守鸦人 #0
  it("守鸦人#0：夜晚死亡后被唤醒并查验一名玩家 ⇒ 得知其真实角色", async () => {
    // 守鸦人被小恶魔杀死后选择小八；小八是共情者。
    const seats = [
      seat(0, "ravenkeeper", { isDead: true, diedAtNight: 2 }),
      seat(1, "empath"),
      seat(2, "imp"),
      seat(3, "chef"),
    ];
    const res = await runAbility(
      ravenkeeperAbility,
      ctx(seats, 0, "ravenkeeper", { targets: [1] })
    );
    expect(res.aborted).toBe(false);
    expect(result(res).targetId).toBe(1);
    expect(result(res).roleName).toBe(role("empath").name);
  });

  // 官方范例: 陌客 #3
  it("陌客#3：陌客被处决且被当作小恶魔 ⇒ 送葬者得知小恶魔", async () => {
    // 官方：陌客被处决；送葬者得知「小恶魔被处决」。
    // 说书人裁定「陌客此时被当作小恶魔」用登记字段显式表达。
    const seats = [
      seat(0, "undertaker"),
      seat(1, "recluse", {
        isDead: true,
        executedToday: true,
        registerAsEvil: true,
        registerAsDemon: true,
      }),
      seat(2, "imp"),
      seat(3, "chef"),
    ];
    const res = await runAbility(
      undertakerAbility,
      ctx(seats, 0, "undertaker", {
        snapshot: { todayExecutedId: 1 },
      })
    );
    expect(res.aborted).toBe(false);
    expect(result(res).roleName).toBe(role("imp").name);
  });

  // 官方范例: 间谍 #1
  it("间谍#1：厨师把间谍当邪恶 ⇒ 1；共情者把间谍当善良 ⇒ 0", async () => {
    // 官方：间谍坐在小恶魔与共情者之间。厨师得知 1（此时间谍被当作邪恶），
    // 当夜稍晚共情者得知 0（此时间谍被当作善良）。
    // 「同一能力里登记一致、不同能力可就不同」通过两组座位登记表达。
    const chefSeats = [
      seat(0, "chef"),
      seat(1, "imp"),
      seat(2, "spy", { registerAsEvil: true }),
      seat(3, "empath"),
      seat(4, "soldier"),
    ];
    const chefRes = await runAbility(
      chefAbility,
      ctx(chefSeats, 0, "chef", { night: 1, phase: "firstNight" })
    );
    expect(chefRes.aborted).toBe(false);
    expect(result(chefRes), "厨师视角：间谍被当作邪恶 ⇒ 1 对").toBe(1);

    const empathSeats = [
      seat(0, "chef"),
      seat(1, "imp"),
      seat(2, "spy"), // 间谍默认登记为善良
      seat(3, "empath"),
      seat(4, "soldier"),
    ];
    const empathRes = await runAbility(empathAbility, ctx(empathSeats, 3, "empath"));
    expect(empathRes.aborted).toBe(false);
    expect(result(empathRes), "共情者视角：间谍默认善良 ⇒ 0").toBe(0);
  });

  // 官方范例: 男爵 #0 —— 设置调整（放在信息类文件末尾，避免另开小文件）
  it("男爵#0：7 人局设置 5 镇民 ⇒ 改为 3 镇民 + 2 外来者", async () => {
    const seats = [seat(0, "baron"), seat(1, "imp")];
    const res = await runAbility(
      baronAbility,
      ctx(seats, 0, "baron", {
        phase: "dusk",
        snapshot: {
          setupConfig: {
            townsfolkCount: 5,
            outsiderCount: 0,
            minionCount: 1,
            demonCount: 1,
          },
        },
      })
    );
    expect(res.aborted).toBe(false);
    expect(res.snapshot.setupConfig.outsiderCount).toBe(2);
    expect(res.snapshot.setupConfig.townsfolkCount).toBe(3);
  });
});
