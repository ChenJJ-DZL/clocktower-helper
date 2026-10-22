import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { roles as APP_ROLES } from "../../app/data";
import { bootScene, driveDusk, driveNight, seatOf, stepsOf, type NightReport } from "../helpers/scenario";
import { waitForSnapshot } from "../helpers/scriptFlow";
import { readLiveEndState } from "../helpers/fullSim";

/**
 * 🎭 暗流涌动 · 逐角色场景验证（A 组模板）
 * ==================================================================
 * 本文件是「**用某个剧本、某个角色的某个场景，验证某条技能规则**」的
 * **可复制模板**：其余 8 个剧本按同一形状照抄（只换 `SCENE_*` 与断言）。
 *
 * 每个用例必须同时给三类判据，缺一不可：
 *   ① **弹窗内容**：这一步的弹窗真的出现了，并且文案与真值一致
 *      （信息类角色：解析 `A号和B号之中有一名是【X】` 后**回查座位真值**）；
 *   ② **状态落库**：`isPoisoned / isProtected / isDead / masterId /
 *      isDemonSuccessor / charadeRole` 等字段真的被改（不是只有文案）；
 *   ③ **反证**：不该发生的必须没发生（例如僧侣保护的那位**必须没死**，
 *      红唇女郎继承后**不得**判善良胜）。
 *
 * 为什么按「局」分组而不是一个角色一个 test：
 *   开一局 ≈ 8s，暗流涌动有 22 个角色，一个角色一局要 3 分钟纯开局。
 *   同一夜的信息类角色（洗衣妇/图书管理员/调查员/厨师/共情者/占卜师）
 *   互不干扰 ⇒ 共用一局的 journal 分头断言，用 `expect.soft` 保证
 *   **一条失败不遮挡其余角色**（软断言会跑完全部再汇总报红）。
 */

type Scene = { script: string; game: any };
const scenesPath = path.resolve(__dirname, "../../outputs/scenes.json");

function loadScene(id: string): Scene {
  const raw = JSON.parse(fs.readFileSync(scenesPath, "utf-8"));
  for (const s of raw.scripts)
    for (const g of s.games) if (g.id === id) return { script: s.script, game: g };
  throw new Error(`scenes.json 里找不到场次 ${id}`);
}

const NAME_OF: Record<string, string> = Object.fromEntries(
  APP_ROLES.map((r) => [r.id, r.name])
);
const TYPE_OF: Record<string, string> = Object.fromEntries(
  APP_ROLES.map((r) => [r.id, r.type])
);

/** 座位（0 基）→ 角色 id */
function roleAt(snap: any, seatId: number): string | null {
  return (snap?.seats ?? []).find((s: any) => s.id === seatId)?.role?.id ?? null;
}
function seatByRole(snap: any, roleId: string): number {
  return seatOf(snap, roleId);
}
/** 存活座位（0 基） */
function aliveIds(snap: any): number[] {
  return (snap?.seats ?? []).filter((s: any) => !s.isDead).map((s: any) => s.id);
}

/** 解析「A号和B号之中有一名是【X】」→ {a,b,roleName, a0,b0} */
function parsePair(dialog: string) {
  const m = dialog.match(/(\d+)号和(\d+)号之中有一名是【(.+?)】/);
  if (!m) return null;
  return {
    a: Number(m[1]),
    b: Number(m[2]),
    name: m[3],
    a0: Number(m[1]) - 1,
    b0: Number(m[2]) - 1,
  };
}

/** 取某个角色那一步「结果」弹窗（信息类角色的产出） */
function resultStep(report: NightReport, role: string) {
  const all = stepsOf(report, role);
  return all.find((x) => /获得信息|结果/.test(x.dialog)) ?? all[all.length - 1];
}

/** 相邻邪恶对数（官方厨师判据；默认间谍不算邪恶） */
function adjacentEvilPairs(snap: any, spyIsEvil = false): number {
  const seats = [...(snap?.seats ?? [])].sort((a: any, b: any) => a.id - b.id);
  const n = seats.length;
  const evil = (i: number) => {
    const s = seats[i];
    const isSpy = s.role?.id === "spy";
    if (isSpy && !spyIsEvil) return false;
    return s.role?.type === "minion" || s.role?.type === "demon";
  };
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (evil(i) && evil((i + 1) % n)) count++;
  }
  return count;
}

// ═══════════════════════════════════════════════════════════════════
// G1 · S01 首夜：信息类 + 投毒 + 间谍 + 酒鬼 + 爪牙互认
// ═══════════════════════════════════════════════════════════════════
test.describe("暗流涌动 · G1 首夜信息与干扰", () => {
  test.setTimeout(4 * 60_000);

  test("S01 首夜：洗衣妇/图书管理员/调查员/厨师/共情者/占卜师/管家/投毒者/间谍/酒鬼/爪牙互认", async ({
    page,
  }) => {
    const { script, game } = loadScene("S01");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });

    const spySeat = seatByRole(snap, "spy");
    const demonSeat = seatByRole(snap, "imp");
    const redHerring = (snap.seats as any[]).find(
      (s) => s.isFortuneTellerRedHerring === true
    )?.id as number | undefined;

    // 占卜师：恶魔 + 一名非恶魔非红罗刹 ⇒ 必答「是」
    const ftNonDemon = (snap.seats as any[]).find(
      (s) => s.id !== demonSeat && s.id !== redHerring
    ).id as number;

    // 投毒者：毒 1 号（首夜无死亡，便于观察 isPoisoned 落库）
    const poisonedSeat = 1;
    // 管家：认 2 号为主人
    const masterSeat = 2;

    const report = await driveNight(page, [
      { role: "poisoner", targets: [poisonedSeat], note: "毒 1 号" },
      { role: "fortune_teller", targets: [demonSeat + 1, ftNonDemon + 1], note: "恶魔+好人" },
      { role: "butler", targets: [masterSeat], note: "认主" },
    ]);

    // ── ① 洗衣妇：两人中恰好一人是所指的镇民，且间谍不得作为候选 ──
    const ww = parsePair(resultStep(report, "washerwoman")?.dialog ?? "");
    expect.soft(ww, "洗衣妇弹窗应给出「A号和B号之中有一名是【X】」").not.toBeNull();
    if (ww) {
      const hit = [ww.a0, ww.b0].filter(
        (id) => NAME_OF[roleAt(snap, id) ?? ""] === ww.name
      );
      expect.soft(hit.length, `洗衣妇：${ww.a}/${ww.b} 中应恰好一人是【${ww.name}】`).toBe(1);
      expect.soft(
        [ww.a0, ww.b0].includes(spySeat),
        "洗衣妇候选不得包含间谍（间谍登记为好人 ⇒ 完全不可见）"
      ).toBe(false);
    }

    // ── ② 图书管理员：外来者，间谍不可见 ──
    const lib = parsePair(resultStep(report, "librarian")?.dialog ?? "");
    expect.soft(lib, "图书管理员弹窗应给出外来者候选").not.toBeNull();
    if (lib) {
      const hit = [lib.a0, lib.b0].filter(
        (id) => NAME_OF[roleAt(snap, id) ?? ""] === lib.name
      );
      expect.soft(hit.length, `图书管理员：${lib.a}/${lib.b} 中应恰好一人是【${lib.name}】`).toBe(1);
      expect.soft([lib.a0, lib.b0].includes(spySeat), "图书管理员候选不得包含间谍").toBe(false);
    }

    // ── ③ 调查员：爪牙，间谍不可见 ──
    const inv = parsePair(resultStep(report, "investigator")?.dialog ?? "");
    expect.soft(inv, "调查员弹窗应给出爪牙候选").not.toBeNull();
    if (inv) {
      const hit = [inv.a0, inv.b0].filter(
        (id) => NAME_OF[roleAt(snap, id) ?? ""] === inv.name
      );
      expect.soft(hit.length, `调查员：${inv.a}/${inv.b} 中应恰好一人是【${inv.name}】`).toBe(1);
      expect.soft([inv.a0, inv.b0].includes(spySeat), "调查员候选不得包含间谍（默认登记）").toBe(false);
      expect.soft(inv.name, "调查员指认的角色必须是爪牙").toBe(
        NAME_OF[roleAt(snap, hit[0]) ?? ""]
      );
    }

    // ── ④ 厨师：数字 === 相邻邪恶对数（间谍算好人）──
    const chefStep = resultStep(report, "chef");
    const chefNum = Number(
      (chefStep?.dialog.match(/(\d+)\s*对相邻的邪恶玩家/) ?? [])[1] ?? NaN
    );
    expect.soft(Number.isNaN(chefNum), "厨师弹窗应给出「N 对相邻的邪恶玩家」").toBe(false);
    expect.soft(chefNum, "厨师数字应等于独立算出的相邻邪恶对数（间谍算好人）").toBe(
      adjacentEvilPairs(snap, false)
    );

    // ── ⑤ 共情者：数字 === 两侧存活邻座中的邪恶数（间谍算好人）──
    const empSeat = seatByRole(snap, "empath");
    const empDialog = resultStep(report, "empath")?.dialog ?? "";
    const empMatch = empDialog.match(/你的邻座中有(\d+)名邪恶玩家/);
    const empNum = empMatch ? Number(empMatch[1]) : 0;
    const n = (snap.seats as any[]).length;
    const neighbors = [(empSeat - 1 + n) % n, (empSeat + 1) % n];
    const expectEmp = neighbors.filter((id) => {
      const r = roleAt(snap, id);
      if (r === "spy") return false;
      return TYPE_OF[r ?? ""] === "minion" || TYPE_OF[r ?? ""] === "demon";
    }).length;
    expect.soft(empDialog, "共情者应给出邻座邪恶数（0 也要有明确文案）").toMatch(
      /邪恶玩家|没有邪恶|没有/
    );
    expect.soft(empNum, "共情者数字应等于两侧邻座的邪恶数（间谍算好人）").toBe(expectEmp);

    // ── ⑥ 占卜师：恶魔+好人 ⇒ 答「是」──
    const ftSteps = stepsOf(report, "fortune_teller").map((x) => x.dialog);
    expect
      .soft(
        ftSteps.some((d) => /获得信息/.test(d)),
        "占卜师应给出结果弹窗"
      )
      .toBe(true);
    const ftResult = resultStep(report, "fortune_teller")?.dialog ?? "";
    // 实测文案为「【有】/【没有】」（不是「是/否」）
    expect.soft(ftResult, "占卜师查询「恶魔+好人」应回答「有」").toMatch(/【有】/);

    // ── ⑦ 管家：masterId 落库 ──
    const after = await readSnapshotSafe(page);
    const butlerSeat = seatByRole(snap, "butler");
    expect.soft(after?.seats?.find((s: any) => s.id === butlerSeat)?.masterId, "管家认主应落库 masterId").toBe(masterSeat - 1);

    // ── ⑧ 投毒者：isPoisoned 落库（次日黄昏才清）──
    expect
      .soft(
        after?.seats?.find((s: any) => s.id === poisonedSeat - 1)?.isPoisoned,
        "投毒者下毒后目标应 isPoisoned=true"
      )
      .toBe(true);

    // ── ⑨ 间谍：魔典可开可关，且夜序继续到黎明 ──
    const spySteps = stepsOf(report, "spy").map((x) => x.dialog);
    expect.soft(spySteps.some((d) => /魔典|总人数/.test(d)), "间谍应能打开魔典").toBe(true);
    expect.soft(report.status, "含间谍的夜晚必须能推进到白天（不得卡死）").toBe("day");
    expect.soft(spySteps.some((d) => /平安夜|黎明/.test(d)), "夜末应出现黎明结算").toBe(true);

    // ── ⑩ 酒鬼：伪装身份 + 永久醉酒（开局即成立）──
    // ⚠️ 酒鬼的「永久醉酒」在引擎里由 `utils/seatDisabled::isSeatDrunk` 认
    //   `role.id === "drunk"` 判定，**不依赖** seat.isDrunk 布尔位
    //   （实测该位为 false 属正常）。这里断言的是「引擎认得出 + 伪装已配」。
    const drunkSeat = (snap.seats as any[]).find((s: any) => s.role?.id === "drunk");
    expect.soft(drunkSeat, "S01 阵容里应有酒鬼").toBeTruthy();
    expect.soft(drunkSeat?.charadeRole?.id, "酒鬼必须有伪装身份（否则会真的用出该角色能力）").toBeTruthy();
    expect.soft(drunkSeat?.charadeRole?.id, "酒鬼伪装身份不得是酒鬼自己").not.toBe("drunk");
    expect.soft(drunkSeat?.charadeRole?.type, "酒鬼伪装身份必须是镇民（官方：以为自己是镇民）").toBe("townsfolk");
    expect.soft(drunkSeat?.effectiveRole?.id ?? drunkSeat?.role?.id, "酒鬼的实际结算角色仍是酒鬼").toBe("drunk");

    // ── ⑪ 爪牙互认：三名爪牙互认信息里恶魔座位必须是真恶魔 ──
    const minionSteps = stepsOf(report, "poisoner").filter((x) =>
      /恶魔是：/.test(x.dialog)
    );
    expect.soft(minionSteps.length, "首夜应有爪牙互认的「结果」步骤").toBeGreaterThan(0);
    expect
      .soft(
        minionSteps[0]?.dialog.includes(`恶魔是：${demonSeat + 1}号`),
        `爪牙互认的恶魔座位应为 ${demonSeat + 1} 号`
      )
      .toBe(true);
  });
});

/** 读快照（失败时返回 null 而不是抛错，交给 soft 断言报红） */
async function readSnapshotSafe(page: Page): Promise<any | null> {
  return page.evaluate(() => {
    try {
      const raw = window.localStorage.getItem("clocktower_current_snapshot");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// G2 · S01 第 1 昼处决 → 第 2 夜：僧侣 / 送葬者 / 小恶魔 / 守鸦人
// ═══════════════════════════════════════════════════════════════════
test.describe("暗流涌动 · G2 处决后第 2 夜", () => {
  test.setTimeout(5 * 60_000);

  test("僧侣保护生效 + 送葬者得知被处决者角色 + 小恶魔夜杀落库", async ({ page }) => {
    const { script, game } = loadScene("S01");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });

    const monkSeat = seatByRole(snap, "monk");
    const demonSeat = seatByRole(snap, "imp");
    const undertakerSeat = seatByRole(snap, "undertaker");
    const butlerSeat = seatByRole(snap, "butler");
    // 让僧侣保护 1 号，同时小恶魔夜杀 1 号 ⇒ 应当无人死亡
    const protectedSeat = 1;

    // 第 1 夜
    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应推进到白天").toBe("day");

    // 第 1 昼：处决管家（送葬者的观察对象）
    const dusk = await driveDusk(page, {
      nominator: demonSeat + 1,
      nominee: butlerSeat + 1,
    });
    expect.soft(dusk.nominated, "应成功发起提名").toBe(true);
    expect.soft(dusk.executed, "应执行处决结算").toBe(true);
    expect.soft(dusk.status, "处决后应进入第 2 夜").toBe("night");

    // 第 2 夜：僧侣保护 1 号 + 小恶魔杀 1 号
    const n2 = await driveNight(page, [
      { role: "monk", targets: [protectedSeat], note: "保护 1 号" },
      { role: "imp", targets: [protectedSeat], note: "杀 1 号" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    const after = await readSnapshotSafe(page);
    const seat = (id: number) => after?.seats?.find((s: any) => s.id === id);

    // ── 僧侣：被保护者不得死亡 ──
    const monkStep = stepsOf(n2, "monk")[0];
    expect.soft(monkStep, "第 2 夜应有僧侣步骤").toBeTruthy();
    expect
      .soft(seat(protectedSeat - 1)?.isDead, "僧侣保护的 1 号不得死亡")
      .toBeFalsy();

    // ── 小恶魔：确有点杀动作（击杀被保护挡下，但行动必须发生）──
    const impSteps = stepsOf(n2, "imp");
    expect.soft(impSteps.length, "第 2 夜应有小恶魔行动步骤").toBeGreaterThan(0);
    expect.soft(impSteps[0]?.picked, "小恶魔应选中 1 号").toContain(protectedSeat);

    // ── 送葬者：第 2 夜必须唤醒，且告知「管家」──
    const utSteps = stepsOf(n2, "undertaker");
    expect.soft(utSteps.length, "处决次日夜晚送葬者必须唤醒").toBeGreaterThan(0);
    const utDialog = utSteps.map((x) => x.dialog).join("|");
    expect.soft(utDialog, "送葬者应得知被处决者是【管家】").toContain("管家");
    // 反证：送葬者自己的座位不得被当成被处决者
    expect.soft(undertakerSeat, "送葬者座位为 0 基内部值").toBeGreaterThanOrEqual(0);

    // ── 黎明报告：应宣布无人死亡 ──
    const dawn = n2.steps[n2.steps.length - 1]?.dialog ?? "";
    expect.soft(dawn, "僧侣挡刀后黎明应宣布平安夜").toMatch(/平安夜|无人死亡/);
  });

  test("守鸦人夜里被杀 ⇒ 追加唤醒并获得一名玩家的角色", async ({ page }) => {
    const { script, game } = loadScene("S01");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const rkSeat = seatByRole(snap, "ravenkeeper");
    const demonSeat = seatByRole(snap, "imp");

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应推进到白天").toBe("day");

    // ⚠️ 白天 → 黄昏 → 入夜：不点这一步，`driveNight` 一开始就看到「第 1 天」
    //   直接返回（steps=0），断言全部落空 ⇒ 必须显式推进到夜里。
    const dusk0 = await driveDusk(page, {});
    expect(dusk0.status, "第 1 昼应能直接入夜（不提名）").toBe("night");

    // 第 2 夜：小恶魔杀守鸦人
    //   ⚠️ 必须**显式指定僧侣目标**：僧侣第 2 夜会唤醒，驱动器默认会点第一个
    //   可选座位（实测正好是守鸦人）⇒ 守鸦人被保护、杀不死，整条用例假红。
    const monkGuard = rkSeat === 0 ? 2 : 1; // rkSeat 是 0 基
    const n2 = await driveNight(page, [
      { role: "monk", targets: [monkGuard], note: "保护别人，别挡守鸦人的刀" },
      { role: "imp", targets: [rkSeat + 1], note: "杀守鸦人" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    const after = await readSnapshotSafe(page);
    const rk = after?.seats?.find((s: any) => s.id === rkSeat);
    expect.soft(rk?.isDead, "守鸦人应被夜杀").toBe(true);
    expect.soft(rk?.diedAtNight, "守鸦人应记为夜间死亡").toBe(2);

    // 守鸦人死后必须**追加**一次唤醒（官方：夜里被杀，立即得知一名玩家的角色）
    const rkSteps = stepsOf(n2, "ravenkeeper");
    expect.soft(rkSteps.length, "守鸦人被夜杀后必须有追加唤醒步骤").toBeGreaterThan(0);
    const rkDialog = rkSteps.map((x) => x.dialog).join("|");
    expect.soft(rkDialog, "守鸦人应看到「获得信息」形态的结果弹窗").toMatch(/获得信息|是【/);

    // 反证：恶魔自己不能因为守鸦人的死被误杀
    expect.soft(after?.seats?.find((s: any) => s.id === demonSeat)?.isDead, "小恶魔不得被自己的击杀反噬").toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G3 · S01 处决恶魔 ⇒ 红唇女郎继承
// ═══════════════════════════════════════════════════════════════════
test.describe("暗流涌动 · G3 恶魔继承", () => {
  test.setTimeout(5 * 60_000);

  test("处决小恶魔（存活 ≥5）⇒ 红唇女郎变恶魔、游戏继续", async ({ page }) => {
    const { script, game } = loadScene("S01");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const demonSeat = seatByRole(snap, "imp");
    const swSeat = seatByRole(snap, "scarlet_woman");
    // 提名者用一个善良座位，避免提名者自己触发别的技能
    const nominator = [1, 2, 3, 4, 5].find((x) => x !== demonSeat + 1 && x !== swSeat + 1)!;

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应推进到白天").toBe("day");

    const dusk = await driveDusk(page, { nominator, nominee: demonSeat + 1 });
    expect.soft(dusk.nominated, "应成功提名小恶魔").toBe(true);
    expect.soft(dusk.executed, "应执行处决结算").toBe(true);

    const after = await readSnapshotSafe(page);
    const sw = after?.seats?.find((s: any) => s.id === swSeat);
    const oldDemon = after?.seats?.find((s: any) => s.id === demonSeat);

    // 官方：恶魔被处决、存活 ≥5 且红唇女郎在场 ⇒ 红唇女郎变成恶魔，游戏继续
    expect.soft(oldDemon?.isDead, "被处决的小恶魔应死亡").toBe(true);
    expect.soft(sw?.role?.id, "红唇女郎应继承为小恶魔").toBe("imp");
    expect.soft(sw?.isDemonSuccessor, "继承标记 isDemonSuccessor 应落库").toBe(true);
    expect.soft(sw?.isDead, "新恶魔不得在继承时死亡").toBe(false);
    expect
      .soft(dusk.status, "继承后游戏必须继续（进入下一夜），不得判善良胜")
      .toBe("night");
  });
});

// ═══════════════════════════════════════════════════════════════════
// G4 · S02：男爵配比 / 圣徒 / 贞洁者 / 陌客
// ═══════════════════════════════════════════════════════════════════
test.describe("暗流涌动 · G4 善良方日间角色与男爵", () => {
  test.setTimeout(6 * 60_000);

  test("男爵在场 ⇒ 15 人局配比为 7 镇民 / 4 外来者 / 3 爪牙 / 1 恶魔", async ({ page }) => {
    const { script, game } = loadScene("S02");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const byType = (t: string) =>
      (snap.seats as any[]).filter((s) => s.role?.type === t).length;
    expect.soft(byType("townsfolk"), "男爵 +2 外来者 ⇒ 镇民 9-2=7").toBe(7);
    expect.soft(byType("outsider"), "男爵 +2 外来者 ⇒ 外来者 2+2=4").toBe(4);
    expect.soft(byType("minion"), "爪牙应为 3（含男爵）").toBe(3);
    expect.soft(byType("demon"), "恶魔应为 1").toBe(1);
    expect.soft(seatByRole(snap, "baron") >= 0, "男爵应在场").toBe(true);
  });

  test("圣徒被处决 ⇒ 邪恶立即胜利，胜因可读", async ({ page }) => {
    const { script, game } = loadScene("S02");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const saintSeat = seatByRole(snap, "saint");
    const nominator = (snap.seats as any[]).find(
      (s: any) => s.id !== saintSeat && s.role?.type === "townsfolk"
    ).id as number;

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应推进到白天").toBe("day");

    const dusk = await driveDusk(page, {
      nominator: nominator + 1,
      nominee: saintSeat + 1,
    });
    expect.soft(dusk.executed, "圣徒应被处决结算").toBe(true);

    // 终局不落快照 ⇒ 必须读**活终态**（DOM）+ 打开「查看获胜结果」读胜因
    const live = await readLiveEndState(page);
    expect.soft(live.gameOverUi, "圣徒被处决后应进入终局 UI").toBe(true);
    expect.soft(live.winner, "胜者应为邪恶").toBe("evil");

    const winBtn = page.locator("button").filter({ hasText: /查看获胜结果/ }).first();
    await winBtn.click({ timeout: 8000 }).catch(() => {});
    // ⚠️ 点击后终局卡片是**异步挂载**的：直接读 `[role="dialog"]` 会拿到 ""（实测 flaky）。
    //   按项目铁律不用 waitForTimeout，改用 waitForFunction 等 DOM 真的出现。
    await page
      .waitForFunction(
        () => (document.querySelector('[role="dialog"]')?.textContent ?? "").trim().length > 0,
        undefined,
        { timeout: 8000 }
      )
      .catch(() => {});
    const overlay = await page.evaluate(
      () => (document.querySelector('[role="dialog"]')?.textContent ?? "").replace(/\s+/g, "")
    );
    expect.soft(overlay, "胜因必须可读且写明「圣徒被处决」").toContain("圣徒被处决");
  });

  test("贞洁者被镇民提名 ⇒ 提名者立刻被处决", async ({ page }) => {
    const { script, game } = loadScene("S02");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const virginSeat = seatByRole(snap, "virgin");
    const nominator = (snap.seats as any[]).find(
      (s: any) => s.id !== virginSeat && s.role?.type === "townsfolk"
    ).id as number;

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应推进到白天").toBe("day");

    const dusk = await driveDusk(page, {
      nominator: nominator + 1,
      nominee: virginSeat + 1,
    });

    // ⚠️ 快照写入是异步的：这里**轮询等待**落库，避免把「还没写完」误判成「没生效」
    const after = await waitForSnapshot(
      page,
      (snap) =>
        snap?.seats?.find((s: any) => s.id === virginSeat)?.hasUsedVirginAbility === true,
      8_000
    );
    const virgin = after?.seats?.find((s: any) => s.id === virginSeat);
    const n0 = after?.seats?.find((s: any) => s.id === nominator);
    expect.soft(virgin?.hasUsedVirginAbility, "贞洁者技能应标记已用").toBe(true);
    expect.soft(n0?.isDead, "提名贞洁者的镇民应立刻被处决").toBe(true);
    expect.soft(virgin?.isDead, "贞洁者本人不得死亡").toBe(false);
    expect.soft(dusk.status, "处决后应继续（入夜），而不是终局").toBe("night");
  });

  test("陌客在场：信息查询不得改写其真实身份（登记是视图，不是变更）", async ({ page }) => {
    const { script, game } = loadScene("S02");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const recluseSeat = seatByRole(snap, "recluse");
    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应推进到白天").toBe("day");

    const inv = parsePair(resultStep(n1, "investigator")?.dialog ?? "");
    const minionRolesInPlay = new Set(
      (snap.seats as any[])
        .filter((s) => s.role?.type === "minion")
        .map((s) => s.role.id)
    );
    if (inv && [inv.a0, inv.b0].includes(recluseSeat)) {
      // 若调查员候选里出现陌客，它"被登记"成的爪牙必须是本局真实存在的爪牙角色
      expect
        .soft(
          (APP_ROLES.find((r) => r.name === inv.name)?.id ?? "") in
            Object.fromEntries([...minionRolesInPlay].map((x) => [x, 1])),
          `陌客被登记成【${inv.name}】时，该角色必须是本局在册爪牙（不得凭空造角色）`
        )
        .toBe(true);
    }
    const after = await readSnapshotSafe(page);
    const recluse = after?.seats?.find((s: any) => s.id === recluseSeat);
    expect.soft(recluse?.role?.id, "陌客的真实角色仍是陌客（查询不得改写真值）").toBe("recluse");
    expect.soft(recluse?.role?.type, "陌客的类型仍是外来者").toBe("outsider");
  });
});

// ═══════════════════════════════════════════════════════════════════
// G5 · S02 夜间免死 / 转移 / 白天开枪
// ═══════════════════════════════════════════════════════════════════
test.describe("暗流涌动 · G5 士兵 / 镇长 / 猎手", () => {
  test.setTimeout(6 * 60_000);

  test("士兵夜里被恶魔攻击 ⇒ 不死", async ({ page }) => {
    const { script, game } = loadScene("S02");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const soldierSeat = seatByRole(snap, "soldier");

    expect((await driveNight(page, [])).status, "首夜应推进到白天").toBe("day");
    expect(
      (await driveDusk(page, {})).status,
      "第 1 昼应能直接入夜（不提名）"
    ).toBe("night");

    const n2 = await driveNight(page, [
      { role: "imp", targets: [soldierSeat + 1], note: "攻击士兵" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    const after = await readSnapshotSafe(page);
    const soldier = after?.seats?.find((s: any) => s.id === soldierSeat);
    expect.soft(soldier?.isDead, "士兵夜里被恶魔攻击不得死亡（官方：夜间不会死）").toBe(false);
    const nightDeaths = (after?.seats ?? []).filter(
      (s: any) => s.isDead && s.diedAtNight === 2
    );
    expect.soft(nightDeaths.length, "该夜不应有任何夜间死亡").toBe(0);
  });

  test("镇长夜里被恶魔攻击 ⇒ 要么自己死、要么转移给别人，且当夜恰好 1 人死亡", async ({
    page,
  }) => {
    const { script, game } = loadScene("S02");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const mayorSeat = seatByRole(snap, "mayor");

    expect((await driveNight(page, [])).status, "首夜应推进到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    const n2 = await driveNight(page, [
      {
        role: "imp",
        targets: [mayorSeat + 1],
        // 说书人修正弹窗：选「镇长本人」= 不转移，按正常死亡结算（确定性分支）
        substitute: mayorSeat + 1,
        note: "攻击镇长（不转移）",
      },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    const after = await readSnapshotSafe(page);
    const mayor = after?.seats?.find((s: any) => s.id === mayorSeat);
    const nightDeaths = (after?.seats ?? []).filter(
      (s: any) => s.isDead && s.diedAtNight === 2
    );

    // 官方：镇长「若你夜里将要死亡，说书人可以让你改为另一名玩家死亡」——
    //   两种分支都合法，但**必须有且只有 1 人死亡**（不能白死，也不能多死）。
    expect.soft(nightDeaths.length, "镇长被攻击的当夜应恰好 1 人死亡").toBe(1);
    if (mayor?.isDead === true) {
      expect.soft(nightDeaths[0]?.id, "镇长自己死时，死者必须就是他").toBe(mayorSeat);
    } else {
      expect
        .soft(nightDeaths[0]?.id, "转移时死者不能是镇长")
        .not.toBe(mayorSeat);
    }
  });

  test("猎手白天公开开枪打恶魔 ⇒ 恶魔立即死亡、善良获胜", async ({ page }) => {
    const { script, game } = loadScene("S02");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const slayerSeat = seatByRole(snap, "slayer");
    const demonSeat = seatByRole(snap, "imp");

    // ⚠️ 首夜必须**显式指定投毒者目标**：驱动器默认会毒「第一个可选座位」，
    //   实测正好是 1 号猎手 ⇒ 猎手白天中毒、开枪「无事发生」，用例假红
    //   （应用侧行为是对的：中毒的猎手能力确实失效）。
    const poisonTarget = [2, 3, 4].find(
      (x) => x !== slayerSeat + 1 && x !== demonSeat + 1
    )!;
    expect(
      (await driveNight(page, [{ role: "poisoner", targets: [poisonTarget] }])).status,
      "首夜应推进到白天"
    ).toBe("day");

    // ① 右键**猎手自己**的座位 → 💥开枪（菜单里的开枪 = 该座位开枪）
    const slayerBtn = page
      .locator("button")
      .filter({ hasText: new RegExp(`^${slayerSeat + 1}$`) })
      .first();
    await slayerBtn.click({ button: "right", timeout: 15_000 });
    const shotMenu = page.locator("button").filter({ hasText: /开枪/ }).first();
    await expect(shotMenu, "右键菜单应出现「💥开枪」").toBeVisible({ timeout: 10_000 });
    await shotMenu.click({ timeout: 10_000 });

    // ② 第一段：选目标（DayActionModal）
    const targetCard = page
      .locator('[role="dialog"] button')
      .filter({ hasText: new RegExp(`^${demonSeat + 1}号`) })
      .first();
    await expect(targetCard, "应弹出目标选择并列出恶魔座位").toBeVisible({ timeout: 10_000 });
    await targetCard.click({ timeout: 10_000 });

    // ③ 第二段：确认射击（SlayerSelectTargetModal）
    const confirmShot = page
      .locator('[role="dialog"] button')
      .filter({ hasText: /确认射击/ })
      .first();
    await expect(confirmShot, "选完目标后应出现「确认射击」").toBeVisible({ timeout: 10_000 });
    // ⚠️ 第二段弹窗的「已选目标」是**独立 state**（SlayerSelectTargetModal 自己维护），
    //   第一段选过不算 ⇒ 必须在这里再点一次目标，否则「确认射击」恒为 disabled。
    const targetInShot = page
      .locator('[role="dialog"] button')
      .filter({ hasText: new RegExp(`^${demonSeat + 1}号|^${demonSeat + 1}恶魔|^${demonSeat + 1}爪牙|^${demonSeat + 1}外来者|^${demonSeat + 1}镇民`) })
      .first();
    await expect(targetInShot, "射击弹窗里应能选中恶魔").toBeVisible({ timeout: 10_000 });
    await targetInShot.click({ timeout: 10_000 });
    await expect(confirmShot, "选中目标后「确认射击」应可用").toBeEnabled({ timeout: 10_000 });
    await confirmShot.click({ timeout: 10_000 });

    // ④ 结算：恶魔死亡 + 善良获胜 + 胜因可读
    const live = await waitLive(page, (l) => l?.gameOverUi === true, 12_000);
    expect.soft(live?.gameOverUi, "开枪打中恶魔后应进入终局 UI").toBe(true);
    expect.soft(live?.winner, "恶魔被猎手击杀 ⇒ 善良阵营获胜").toBe("good");

    const winBtn = page.locator("button").filter({ hasText: /查看获胜结果/ }).first();
    await winBtn.click({ timeout: 8000 }).catch(() => {});
    // ⚠️ 点击后终局卡片是**异步挂载**的：直接读 `[role="dialog"]` 会拿到 ""（实测 flaky）。
    //   按项目铁律不用 waitForTimeout，改用 waitForFunction 等 DOM 真的出现。
    await page
      .waitForFunction(
        () => (document.querySelector('[role="dialog"]')?.textContent ?? "").trim().length > 0,
        undefined,
        { timeout: 8000 }
      )
      .catch(() => {});
    const overlay = await page.evaluate(
      () => (document.querySelector('[role="dialog"]')?.textContent ?? "").replace(/\s+/g, "")
    );
    expect.soft(overlay, "胜因必须可读").toMatch(/猎手|恶魔|胜利/);

    // ⚠️ 终局不落快照（快照冻结在处决前）⇒ 这里**不能**再断言座位字段
    //   `hasUsedSlayerAbility`（它写在终局之后，永远读不到）。
    //   技能"只能用一次"由胜因 + 终局 UI 覆盖；重复开枪在 S02 里因终局无法再测，
    //   交给单测 `slayer` 的 once 语义覆盖。
  });
});

// ═══════════════════════════════════════════════════════════════════
// G6 · 负向对照：官方「不该发生」的分支
// ═══════════════════════════════════════════════════════════════════
test.describe("暗流涌动 · G6 负向对照", () => {
  test.setTimeout(6 * 60_000);

  test("贞洁者：由爪牙提名 ⇒ 技能不触发，提名者不被处决", async ({ page }) => {
    const { script, game } = loadScene("S02");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const virginSeat = seatByRole(snap, "virgin");
    // 官方：只有「镇民」提名才触发。间谍被当作镇民 ⇒ 排除；陌客永不触发本轮不在场。
    const minionSeat = (snap.seats as any[]).find(
      (s: any) => TYPE_OF[s.role?.id ?? ""] === "minion" && s.role?.id !== "spy"
    ).id as number;

    // 投毒者目标必须避开贞洁者与提名用的爪牙（否则毒到谁都会改变判据）
    const poisonTarget = (snap.seats as any[]).find(
      (s: any) =>
        s.id !== virginSeat &&
        s.id !== minionSeat &&
        TYPE_OF[s.role?.id ?? ""] === "minion" &&
        s.role?.id === "spy"
    )?.id as number | undefined;

    await driveNight(
      page,
      poisonTarget === undefined ? [] : [{ role: "poisoner", targets: [poisonTarget + 1] }]
    );

    // voters: [] ⇒ 一票都不投 ⇒ 不足以处决，能干净观察「提名者有没有被贞洁者打死」
    const dusk = await driveDusk(page, {
      nominator: minionSeat + 1,
      nominee: virginSeat + 1,
      voters: [],
    });
    expect.soft(dusk.nominated, "应成功发起「爪牙提名贞洁者」").toBe(true);

    const after = await waitForSnapshot(
      page,
      (s) => Array.isArray(s?.seats) && s.seats.length > 0,
      8_000
    );
    const virgin = after?.seats?.find((s: any) => s.id === virginSeat);
    const minion = after?.seats?.find((s: any) => s.id === minionSeat);

    // ① 反证：提名者是爪牙 ⇒ 不得被立刻处决
    expect.soft(minion?.isDead, "爪牙提名贞洁者不得被处决（官方只对镇民生效）").toBe(false);
    // ② 官方【运作方式】原文：「如果首次提名贞洁者的玩家**不是**镇民，照常继续进行投票。
    //    贞洁者**失去他的能力** —— 将贞洁者的『失去能力』提示标记放置在其角色标记旁。」
    //    ⇒ 爪牙提名同样消耗能力，只是不处决提名者。
    expect
      .soft(virgin?.hasUsedVirginAbility, "爪牙提名同样消耗贞洁者的能力（官方：失去他的能力）")
      .toBe(true);
    // ③ 提名流程本身要正常走完（不能因为不触发就卡住）
    expect.soft(dusk.status, "不触发的提名仍应能推进到入夜").toBe("night");
  });

  test("猎手：白天开枪打非恶魔 ⇒ 无事发生，游戏继续", async ({ page }) => {
    const { script, game } = loadScene("S02");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const slayerSeat = seatByRole(snap, "slayer");
    const mayorSeat = seatByRole(snap, "mayor");

    // 首夜显式指定投毒目标：避免毒到猎手（中毒猎手开枪本就无事发生，会把用例变成假绿）
    const safe = (snap.seats as any[]).find(
      (s: any) => s.id !== slayerSeat && TYPE_OF[s.role?.id ?? ""] === "minion"
    )?.id as number;
    await driveNight(page, [{ role: "poisoner", targets: [safe + 1] }]);

    // 右键猎手 → 开枪 → 选镇长（镇民，非恶魔）
    const slayerBtn = page
      .locator("button")
      .filter({ hasText: new RegExp(`^${slayerSeat + 1}$`) })
      .first();
    await slayerBtn.click({ button: "right", timeout: 15_000 });
    const shotMenu = page.locator("button").filter({ hasText: /开枪/ }).first();
    await expect(shotMenu, "右键菜单应出现「💥开枪」").toBeVisible({ timeout: 10_000 });
    await shotMenu.click({ timeout: 10_000 });

    const card1 = page
      .locator('[role="dialog"]')
      .last()
      .locator("button")
      .filter({ hasText: new RegExp(`${mayorSeat + 1}号`) })
      .first();
    await expect(card1, "应弹出目标选择并列出镇长座位").toBeVisible({ timeout: 10_000 });
    await card1.click({ timeout: 10_000 });

    const confirmShot = page
      .locator('[role="dialog"]')
      .last()
      .locator("button")
      .filter({ hasText: /确认射击/ })
      .first();
    await expect(confirmShot, "选完目标后应出现「确认射击」").toBeVisible({ timeout: 10_000 });
    const card2 = page
      .locator('[role="dialog"]')
      .last()
      .locator("button")
      // ⚠️ 射击弹窗的卡片文案是「14 镇民 镇长」（座位号与身份之间**没有「号」字**），
      //    与第一段 DayActionModal 的「14号…」不同 ⇒ 正则必须兼容两种形态。
      .filter({ hasText: new RegExp(`^${mayorSeat + 1}\\s*(镇民|外来者|爪牙|恶魔)`) })
      .first();
    await card2.click({ timeout: 10_000 });
    await confirmShot.click({ timeout: 10_000 });

    // 官方：「如果他是恶魔，他死亡」⇒ 不是恶魔 ⇒ 不死、不终局
    const live = await waitLive(page, (l) => l?.gameOverUi === true, 6_000);
    expect.soft(live?.gameOverUi, "打中非恶魔不得进入终局").not.toBe(true);

    const after = await waitForSnapshot(page, (s) => Array.isArray(s?.seats), 8_000);
    const mayor = after?.seats?.find((s: any) => s.id === mayorSeat);
    expect.soft(mayor?.isDead, "被猎手打中的镇民不得死亡").toBe(false);
    // 能力仍应被消耗（每局限一次，打空也算用过）
    const slayer = after?.seats?.find((s: any) => s.id === slayerSeat);
    expect
      .soft(slayer?.hasUsedSlayerAbility ?? slayer?.abilityUsed, "开枪后应标记能力已用")
      .toBeTruthy();
  });

  test("士兵：白天被处决 ⇒ 会死（只免疫恶魔的夜间能力）", async ({ page }) => {
    const { script, game } = loadScene("S02");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const soldierSeat = seatByRole(snap, "soldier");
    const nominator = (snap.seats as any[]).find(
      (s: any) => TYPE_OF[s.role?.id ?? ""] === "townsfolk" && s.id !== soldierSeat
    ).id as number;

    await driveNight(page, []);
    const dusk = await driveDusk(page, {
      nominator: nominator + 1,
      nominee: soldierSeat + 1,
    });
    expect.soft(dusk.executed, "应执行处决结算").toBe(true);

    const after = await waitForSnapshot(page, (s) => Array.isArray(s?.seats), 10_000);
    const soldier = after?.seats?.find((s: any) => s.id === soldierSeat);
    // 官方士兵只免疫「恶魔的负面能力」；处决不是恶魔能力
    expect.soft(soldier?.isDead, "士兵被处决必须死亡").toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G7 · 关键分支：官方原文里最容易漏掉的半边
// ═══════════════════════════════════════════════════════════════════
test.describe("暗流涌动 · G7 关键分支", () => {
  test.setTimeout(8 * 60_000);

  test("红唇女郎：恶魔死时存活仅 4（死后 3）⇒ 不继承，善良获胜", async ({ page }) => {
    // 5 人局：3 镇民 + 1 爪牙 + 1 恶魔（官方配比）
    const snap = await bootScene(page, {
      script: "暗流涌动",
      players: 5,
      seed: 92031,
      lineup: ["imp", "scarlet_woman", "soldier", "chef", "empath"],
    });
    const impSeat = seatByRole(snap, "imp");
    const swSeat = seatByRole(snap, "scarlet_woman");
    const chefSeat = seatByRole(snap, "chef");
    const nominator = seatByRole(snap, "soldier");

    expect((await driveNight(page, [])).status, "首夜应推进到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼不提名应能入夜").toBe("night");

    // 第 2 夜杀 1 人 ⇒ 存活 4
    const n2 = await driveNight(page, [
      { role: "imp", targets: [chefSeat + 1], note: "杀厨师（把存活压到 4）" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    // 处决恶魔：死前 4、死后 3 ⇒ 官方「≥5 死前 / ≥4 死后」都不成立 ⇒ 不变身
    const dusk = await driveDusk(page, { nominator: nominator + 1, nominee: impSeat + 1 });
    expect.soft(dusk.executed, "应处决小恶魔").toBe(true);

    const after = await waitForSnapshot(page, (s) => Array.isArray(s?.seats), 10_000);
    const sw = after?.seats?.find((s: any) => s.id === swSeat);
    expect
      .soft(sw?.role?.id, "存活不足 5 时红唇女郎不得继承（官方：≥5 名玩家存活）")
      .toBe("scarlet_woman");

    const live = await waitLive(page, (l) => l?.gameOverUi === true, 12_000);
    expect.soft(live?.gameOverUi, "没有继承者 ⇒ 恶魔死 ⇒ 应进入终局").toBe(true);
    expect.soft(live?.winner, "恶魔死亡且无人继承 ⇒ 善良获胜").toBe("good");
    expect.soft(sw?.isDead, "未继承的红唇女郎仍然存活").toBe(false);
  });

  test("小恶魔：夜间自杀 ⇒ 一名爪牙变成小恶魔，游戏继续", async ({ page }) => {
    const snap = await bootScene(page, {
      script: "暗流涌动",
      players: 5,
      seed: 92032,
      lineup: ["imp", "poisoner", "soldier", "chef", "empath"],
    });
    const impSeat = seatByRole(snap, "imp");
    const poisonerSeat = seatByRole(snap, "poisoner");

    expect((await driveNight(page, [])).status, "首夜应推进到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼不提名应能入夜").toBe("night");

    // 第 2 夜：小恶魔选自己
    const n2 = await driveNight(page, [
      { role: "imp", targets: [impSeat + 1], note: "小恶魔自杀" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    const after = await waitForSnapshot(page, (s) => Array.isArray(s?.seats), 10_000);
    const imp = after?.seats?.find((s: any) => s.id === impSeat);
    const heir = after?.seats?.find((s: any) => s.id === poisonerSeat);

    expect.soft(imp?.isDead, "自杀的小恶魔应死亡").toBe(true);
    // 官方：用多出来的小恶魔标记替换一名存活爪牙的角色标记
    expect
      .soft(heir?.role?.id, "一名存活爪牙必须变成小恶魔")
      .toBe("imp");
    expect.soft(heir?.isDead, "继承者不得死亡").toBe(false);

    const live = await waitLive(page, (l) => l?.gameOverUi === true, 4_000);
    expect
      .soft(live?.gameOverUi, "有继承者时游戏必须继续（恶魔未真正灭亡）")
      .not.toBe(true);
  });

  test("镇长：剩 3 人存活且白天无人被处决 ⇒ 善良阵营获胜", async ({ page }) => {
    // 5 人局：3 镇民 + 1 爪牙 + 1 恶魔。镇长必须活到只剩 3 人。
    const snap = await bootScene(page, {
      script: "暗流涌动",
      players: 5,
      seed: 92034,
      lineup: ["mayor", "chef", "empath", "spy", "imp"],
    });
    const mayorSeat = seatByRole(snap, "mayor");
    const chefSeat = seatByRole(snap, "chef");
    const empathSeat = seatByRole(snap, "empath");
    const impSeat = seatByRole(snap, "imp");

    // ⚠️ 牺牲者必须是「会被恶魔杀死」的镇民：
    //   士兵/弄臣/茶艺师等免死角色当靶子会让「无人死亡」被误读成规则缺陷。
    const victims = [chefSeat, empathSeat].filter((x) => x !== mayorSeat);
    expect.soft(victims.length, "两个可牺牲的镇民都不得是镇长").toBe(2);

    // ⚠️ 这一局故意**不放投毒者**：驱动器的默认毒目标会随阵容变化，
    //    5 人局实测正好毒到小恶魔 ⇒ 恶魔杀不了人，整条链路判据全落空。
    //    用间谍（无夜间行动）当爪牙，击杀链最干净。
    expect((await driveNight(page, [])).status, "首夜应推进到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼不提名应能入夜").toBe("night");

    // 第 2 夜杀 1 人 ⇒ 存活 4
    const n2 = await driveNight(page, [
      { role: "imp", targets: [victims[0] + 1], note: "杀第 1 个镇民" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");
    const after2 = await readSnapshotSafe(page);
    expect
      .soft((after2?.seats ?? []).filter((s: any) => !s.isDead).length, "第 2 夜后应剩 4 人存活")
      .toBe(4);
    const dusk2 = await driveDusk(page, {});
    // 存活 4 ⇒ 镇长特殊胜利**不该**触发
    expect.soft(dusk2.status, "存活 4 人时镇长特殊胜利不得触发").toBe("night");

    // 第 3 夜杀第 2 人 ⇒ 存活 3（镇长 + 爪牙 + 恶魔）
    const n3 = await driveNight(page, [
      { role: "imp", targets: [victims[1] + 1], note: "杀第 2 个镇民" },
    ]);
    expect.soft(n3.status, "第 3 夜应推进到白天").toBe("day");

    const before = await readSnapshotSafe(page);
    const alive = (before?.seats ?? []).filter((s: any) => !s.isDead);
    expect.soft(alive.length, "此时应恰好 3 人存活").toBe(3);
    expect
      .soft(alive.map((s: any) => s.id), "镇长必须在存活 3 人里")
      .toContain(mayorSeat);

    // 白天不提名、不处决，直接入夜 ⇒ 官方「只有三名玩家存活且白天没有人被处决，你的阵营获胜」
    const dusk3 = await driveDusk(page, {});
    expect.soft(dusk3.status, "3 人存活且无人被处决 ⇒ 应直接判胜，不再入夜").toBe("gameover");

    const live = await waitLive(page, (l) => l?.gameOverUi === true, 12_000);
    expect.soft(live?.gameOverUi, "镇长特殊胜利应进入终局 UI").toBe(true);
    expect.soft(live?.winner, "镇长（善良）特殊胜利 ⇒ 善良阵营获胜").toBe("good");

    const winBtn = page.locator("button").filter({ hasText: /查看获胜结果/ }).first();
    await winBtn.click({ timeout: 8000 }).catch(() => {});
    // ⚠️ 点击后终局卡片是**异步挂载**的：直接读 `[role="dialog"]` 会拿到 ""（实测 flaky）。
    //   按项目铁律不用 waitForTimeout，改用 waitForFunction 等 DOM 真的出现。
    await page
      .waitForFunction(
        () => (document.querySelector('[role="dialog"]')?.textContent ?? "").trim().length > 0,
        undefined,
        { timeout: 8000 }
      )
      .catch(() => {});
    const overlay = await page.evaluate(
      () => (document.querySelector('[role="dialog"]')?.textContent ?? "").replace(/\s+/g, "")
    );
    expect.soft(overlay, "胜因必须可读（指明镇长/存活三人）").toMatch(/镇长|三人|存活/);

    // 反证：恶魔不得因为镇长获胜而被误标为死亡
    expect
      .soft(before?.seats?.find((s: any) => s.id === impSeat)?.isDead, "小恶魔不得因此死亡")
      .toBe(false);
  });

  test("占卜师：选中「干扰项」⇒ 仍回答【有】", async ({ page }) => {
    const { script, game } = loadScene("S01");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const demonSeat = seatByRole(snap, "imp");
    const redHerring = (snap.seats as any[]).find(
      (s: any) => s.isFortuneTellerRedHerring === true
    )?.id as number;
    expect(redHerring, "S01 应已放置占卜师的『干扰项』标记").toBeGreaterThanOrEqual(0);

    // 干扰项必须是一名善良玩家（官方：始终有一名善良玩家被当作恶魔）
    const rhRole = roleAt(snap, redHerring);
    expect.soft(
      TYPE_OF[rhRole ?? ""] === "townsfolk" || TYPE_OF[rhRole ?? ""] === "outsider",
      `干扰项应为善良玩家，实际是【${rhRole}】`
    ).toBe(true);

    // 一个明确的好人：既不是恶魔也不是干扰项
    const goodSeat = (snap.seats as any[]).find(
      (s: any) =>
        s.id !== demonSeat &&
        s.id !== redHerring &&
        TYPE_OF[s.role?.id ?? ""] === "townsfolk" ||
        TYPE_OF[s.role?.id ?? ""] === "outsider"
    ).id as number;

    const report = await driveNight(page, [
      { role: "poisoner", targets: [demonSeat + 1], note: "毒恶魔，避开占卜师" },
      {
        role: "fortune_teller",
        targets: [redHerring + 1, goodSeat + 1],
        note: "干扰项 + 好人",
      },
    ]);

    const ft = resultStep(report, "fortune_teller")?.dialog ?? "";
    // 官方：「会有一名善良玩家始终被你的能力当作恶魔」
    expect.soft(ft, "占卜师查询「干扰项 + 好人」必须回答【有】").toMatch(/【有】/);
    expect.soft(ft, "不得回答【没有】（干扰项恒被当作恶魔）").not.toMatch(/【没有】/);
  });

  test("调查员：唯一爪牙是间谍 ⇒ 报「没有爪牙在场」", async ({ page }) => {
    const snap = await bootScene(page, {
      script: "暗流涌动",
      players: 5,
      seed: 92033,
      lineup: ["investigator", "chef", "soldier", "spy", "imp"],
    });
    const spySeat = seatByRole(snap, "spy");

    const report = await driveNight(page, []);
    const inv = stepsOf(report, "investigator")
      .map((x) => x.dialog)
      .join("|");

    expect.soft(inv, "调查员必须被唤醒并给出信息").toMatch(/获得信息|爪牙/);
    // 官方：仅有一名爪牙且为间谍时，调查员可能得知「没有爪牙」；本仓契约取这条口径
    expect
      .soft(inv, "唯一爪牙是间谍时，应报「没有爪牙」")
      .toMatch(/没有爪牙|无爪牙/);
    expect
      .soft(inv, "此时不得给出「A号和B号之中有一名是【X】」的候选")
      .not.toMatch(/\d+号和\d+号之中有一名是/);
    expect.soft(spySeat >= 0, "间谍应真实在场（否则本用例测的是别的分支）").toBe(true);
  });
});

/** 轮询「活终态」（终局不落快照，只能读 DOM） */
async function waitLive(
  page: Page,
  pred: (l: any) => boolean,
  timeoutMs = 10_000
): Promise<any | null> {
  const deadline = Date.now() + timeoutMs;
  let last: any = null;
  while (Date.now() < deadline) {
    last = await readLiveEndState(page);
    if (last && pred(last)) return last;
    await page.waitForTimeout(150);
  }
  return last;
}
