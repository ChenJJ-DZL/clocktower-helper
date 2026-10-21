import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { roles as APP_ROLES } from "../../app/data";
import { isMinionOrDemonRole, isSeatDemon, isSeatMinion } from "../../src/utils/seatAlignment";
import {
  bootScene,
  driveDusk,
  driveNight,
  seatOf,
  stepsOf,
  type NightReport,
} from "../helpers/scenario";
import { readLiveEndState } from "../helpers/fullSim";

/**
 * 🏚️ 凶宅魅影 · 逐角色场景验证（S18 / S19 / S20，22 角色）
 * ==================================================================
 * 场次：
 *   · S18 15 人：诺-达局（2号）—— 气球驾驶员/哲学家/侍臣/女裁缝/畸形秀演员
 *   · S19  9 人：方古局（1号）—— 唱诗男孩 + 国王 + 圣徒 + 弄臣 + 魔鬼代言人
 *   · S20 15 人：普卡局（11号）—— 普卡/刺客/教父/女巫
 *
 * 覆盖：balloonist mathematician clockmaker seamstress juggler philosopher artist
 *      town_crier courtier mutant barber witch godfather assassin no_dashii
 *      choir_boy fool king saint devils_advocate fang_gu pukka
 *
 * ⚠️ 本剧本的坑：
 *   1. **唱诗男孩会把「国王」换进阵容**（`SETUP_INJECTABLE_ROLE_IDS`），
 *      所以 S19 的 9 人局里同时有 choir_boy 与 king —— 配比断言要按实际来。
 *   2. **普卡的「恶魔互认」会出现两次**（S20 实测；黯月初升 S04 也是），
 *      但**下毒步骤是有的**（S20 首夜正常「对1号玩家下毒」）
 *      ⇒ 与黯月初升 S04「首夜完全没下毒」不是同一件事，那边是场次特定。
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
const seatByRole = (snap: any, roleId: string) => seatOf(snap, roleId);
const roleAt = (snap: any, seatId: number) =>
  (snap?.seats ?? []).find((s: any) => s.id === seatId)?.role?.id ?? null;

function resultSteps(report: NightReport, role: string, anchor?: RegExp) {
  const all = stepsOf(report, role);
  const pick = anchor ? all.filter((x) => anchor.test(x.dialog)) : all;
  return pick.filter((x) => /获得信息|发动能力|-结果/.test(x.dialog));
}
async function snapNow(page: Page): Promise<any | null> {
  return page.evaluate(() => {
    try {
      const raw = window.localStorage.getItem("clocktower_current_snapshot");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
}
function bootS(page: Page, id: string) {
  const { script, game } = loadScene(id);
  return bootScene(page, {
    script,
    players: game.players,
    seed: game.seed,
    lineup: game.seats.map((s: any) => s.id),
  });
}
async function waitLive(page: Page, pred: (l: any) => boolean, ms = 12_000) {
  const deadline = Date.now() + ms;
  let last: any = null;
  while (Date.now() < deadline) {
    last = await readLiveEndState(page);
    if (last && pred(last)) return last;
    await page.waitForTimeout(150);
  }
  return last;
}
function ringDistance(a: number, b: number, n: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, n - d);
}
function computeClockmaker(snap: any): number {
  const seats = snap.seats as any[];
  const n = seats.length;
  const demon = seats.find((s: any) => isSeatDemon(s));
  const minions = seats.filter((s: any) => isSeatMinion(s));
  if (!demon || minions.length === 0) return -1;
  return Math.min(...minions.map((m: any) => ringDistance(demon.id, m.id, n)));
}

// ═══════════════════════════════════════════════════════════════════
// G1 · S18 首夜（15 人，诺-达局）
// ═══════════════════════════════════════════════════════════════════
test.describe("凶宅魅影 · G1 S18 首夜", () => {
  test.setTimeout(6 * 60_000);

  test("互认三方针 + 钟表匠距离复算 + 气球驾驶员/哲学家/侍臣 的夜间落点", async ({ page }) => {
    // S18：1气球驾驶员 2诺-达 3女裁缝 4钟表匠 5侍臣 6城镇公告员 7理发师 8女巫
    //      9刺客 10艺术家 11畸形秀演员 12教父 13数学家 14杂耍艺人 15哲学家
    const snap = await bootS(page, "S18");
    const demonSeat = seatByRole(snap, "no_dashii"); // 2
    const cmSeat = seatByRole(snap, "clockmaker"); // 4
    const balloonSeat = seatByRole(snap, "balloonist"); // 1
    const philSeat = seatByRole(snap, "philosopher"); // 15
    const courtierSeat = seatByRole(snap, "courtier"); // 5

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    // ── 爪牙互认：刺客/教父/女巫 三方针一致 ──
    for (const role of ["assassin", "godfather", "witch"]) {
      const st = stepsOf(n1, role).find((x) => /恶魔是：/.test(x.dialog));
      expect.soft(st, `${role} 应有互认结果`).toBeTruthy();
      expect
        .soft(st!.dialog, `${role} 看到的恶魔应为 ${demonSeat + 1} 号`)
        .toContain(`恶魔是：${demonSeat + 1}号`);
    }

    // ── 钟表匠：独立复算（15 人局，恶魔 2 号、最近爪牙 8 号 ⇒ 环形距离 5? 用复算值）──
    const after = await snapNow(page);
    const cmStep = resultSteps(n1, "clockmaker", /最近距离/)[0];
    expect(cmStep, "钟表匠必须被唤醒").toBeTruthy();
    const said = Number((cmStep!.dialog.match(/最近距离为(\d+)/) ?? [])[1] ?? NaN);
    const truth = computeClockmaker(after);
    expect.soft(said, `钟表匠距离应等于复算值 ${truth}（实测 ${said}）`).toBe(truth);
    expect.soft(cmSeat, "钟表匠应在场").toBeGreaterThanOrEqual(0);

    /**
     * 官方【气球驾驶员】：「每个夜晚，你会得知一名**与上个夜晚得知的玩家角色类型不同**的玩家。」
     * ⚠️ 这条依赖「上个夜晚」⇒ 首夜**没有参照**。实测首夜弹窗是
     *   「执行"气球探查"吗？…请选择目标玩家（**最少0人**，最多1人）」
     *   —— 引擎把它做成「可跳过」。这里只断言「首夜会被唤醒进入探查流程」，
     *   首夜是否必须给基准玩家留给官方细化（记为待确认，不写死判据）。
     */
    const balloonSteps = stepsOf(n1, "balloonist");
    expect.soft(balloonSteps.length, "气球驾驶员首夜应被唤醒（进入气球探查）").toBeGreaterThan(0);
    expect
      .soft(
        balloonSteps.some((x) => /气球探查/.test(x.dialog)),
        "首夜弹窗应是「气球探查」"
      )
      .toBe(true);
    expect.soft(balloonSeat, "气球驾驶员应在场").toBeGreaterThanOrEqual(0);

    /**
     * 🔴 2026-10-22 实测：哲学家的首夜弹窗只有
     *   「🌙15号-哲学家-行动确认 —— 执行行动"哲人之力"」，**没有任何「选择一个善良角色」的界面**。
     * 官方【哲学家】：「每局游戏限一次，在夜晚时，你可以选择一个善良角色：你获得该角色的能力。
     *   如果这个角色在场，他醉酒。」
     * ⇒ 「选角色」这一步在 UI 层缺失，哲学家拿不到任何能力。
     */
    const philSteps = stepsOf(n1, "philosopher");
    expect.soft(philSteps.length, "哲学家首夜应被唤醒").toBeGreaterThan(0);
    expect
      .soft(
        philSteps.some((x) => /请选择|选择.+角色|角色选择/.test(x.dialog) && !/行动确认/.test(x.dialog)),
        "官方：哲学家必须能「选择一个善良角色」并据其获得能力（实测无角色选择界面）"
      )
      .toBe(true);
    expect.soft(philSeat, "哲学家应在场").toBeGreaterThanOrEqual(0);
    test.fail(true, "哲学家首夜只有「哲人之力」确认，缺「选择一个善良角色」的交互 ⇒ 拿不到能力");

    // ── 侍臣：官方「每局一次，选一名角色：他醉酒 3 天 3 夜」──
    const cStep = stepsOf(n1, "courtier").find((x) => /朝臣醉酒|醉酒/.test(x.dialog));
    expect.soft(cStep, "侍臣首夜应被唤醒").toBeTruthy();
    expect.soft(courtierSeat, "侍臣应在场").toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G2 · S19（9 人，方古 + 唱诗男孩 + 国王）
// ═══════════════════════════════════════════════════════════════════
test.describe("凶宅魅影 · G2 S19 唱诗男孩与国王", () => {
  test.setTimeout(8 * 60_000);

  test("唱诗男孩把「国王」换进阵容 + 9 人局配比 + 方古互认 + 弄臣/圣徒在场", async ({
    page,
  }) => {
    // S19：1方古 2气球驾驶员 3畸形秀演员 4理发师 5魔鬼代言人 6弄臣 7唱诗男孩 8圣徒 9国王
    const snap = await bootS(page, "S19");
    const demonSeat = seatByRole(snap, "fang_gu"); // 1
    const choirSeat = seatByRole(snap, "choir_boy"); // 7
    const kingSeat = seatByRole(snap, "king"); // 9
    const daSeat = seatByRole(snap, "devils_advocate"); // 5

    // ── 唱诗男孩的「换入国王」必须真的生效（两个角色同时在场）──
    expect.soft(choirSeat, "唱诗男孩应在场").toBeGreaterThanOrEqual(0);
    expect
      .soft(kingSeat, "官方：唱诗男孩会让「国王」加入游戏 ⇒ 国王必须在场")
      .toBeGreaterThanOrEqual(0);
    expect.soft(seatOf(snap, "king"), "国王只能有 1 名").toBe(kingSeat);

    // ── 9 人局配比：5 镇民 / 2 外来者 / 1 爪牙 / 1 恶魔（唱诗男孩换入后按实际数）──
    const byType = (t: string) =>
      (snap.seats as any[]).filter((s: any) => s.role?.type === t).length;
    expect.soft(byType("demon"), "恶魔 1 名").toBe(1);
    expect.soft(byType("minion"), "爪牙 1 名").toBe(1);
    expect
      .soft(byType("townsfolk") + byType("outsider"), "善良方共 7 名（9 人局）")
      .toBe(7);

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    // ── 方古互认 ──
    const fgStep = stepsOf(n1, "fang_gu").find((x) => /不在场伪装/.test(x.dialog));
    expect(fgStep, "方古应收到互认+伪装").toBeTruthy();
    expect.soft(roleAt(snap, demonSeat), "1 号是方古").toBe("fang_gu");
    expect.soft(daSeat, "魔鬼代言人应在场").toBeGreaterThanOrEqual(0);

    // ── 弄臣/圣徒：都不是夜间主动角色 ──
    expect.soft(stepsOf(n1, "fool").length, "弄臣：被动免死 ⇒ 首夜不唤醒").toBe(0);
    expect.soft(stepsOf(n1, "saint").length, "圣徒：被处决才生效 ⇒ 首夜不唤醒").toBe(0);

    /**
     * 官方【国王】：「每个夜晚，**如果死亡的玩家数量大于或等于存活的玩家数量**，
     *   你会得知一个存活的角色。恶魔知道你是国王。」
     * ⇒ 首夜 0 死 9 活，条件不成立 ⇒ 只能有「行动确认」一步，不应有信息。
     */
    const kingSteps = stepsOf(n1, "king");
    expect.soft(kingSteps.length, "国王「每个夜晚」⇒ 首夜也应被唤醒（判定条件）").toBeGreaterThan(0);
    expect
      .soft(
        kingSteps.filter((x) => /获得信息|得知/.test(x.dialog)).length,
        "首夜死亡0 < 存活9 ⇒ 国王不应获得任何信息"
      )
      .toBe(0);
  });

  test("第 1 昼处决圣徒 ⇒ 邪恶获胜，胜因可读（圣徒机制回归）", async ({ page }) => {
    const snap = await bootS(page, "S19");
    const saintSeat = seatByRole(snap, "saint"); // 8
    const nominator = [2, 4, 6].find((x) => x !== saintSeat + 1)!;

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    const dusk = await driveDusk(page, {
      nominator,
      nominee: saintSeat + 1,
      decision: "execute",
    });
    expect.soft(dusk.executed, "圣徒应被处决结算").toBe(true);

    const live = await waitLive(page, (l) => l?.gameOverUi === true);
    expect.soft(live?.gameOverUi, "官方：圣徒死于处决 ⇒ 其阵营落败 ⇒ 应终局").toBe(true);
    expect.soft(live?.winner, "胜者应为邪恶").toBe("evil");

    const banner = await page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, ""));
    expect.soft(banner, "终局横幅应写明邪恶阵营胜利").toContain("邪恶阵营胜利");
    expect.soft(banner, "胜因应点名圣徒").toContain("圣徒");
  });
});

// ═══════════════════════════════════════════════════════════════════
// G3 · S20（15 人，普卡局）
// ═══════════════════════════════════════════════════════════════════
test.describe("凶宅魅影 · G3 S20 普卡局", () => {
  test.setTimeout(6 * 60_000);

  test("普卡首夜下毒（明晚毒发）+ 钟表匠复算 + 互认", async ({ page }) => {
    // S20：1理发师 2刺客 3女裁缝 4城镇公告员 5教父 6畸形秀演员 7数学家 8杂耍艺人
    //      9艺术家 10女巫 11普卡 12气球驾驶员 13钟表匠 14侍臣 15哲学家
    const snap = await bootS(page, "S20");
    const pukkaSeat = seatByRole(snap, "pukka"); // 11
    const cmSeat = seatByRole(snap, "clockmaker"); // 13

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    /**
     * 🔴 2026-10-22 实测：**普卡首夜不下毒**（S20 与黯月初升 S04 都如此）。
     *   注册表配了 `firstNightPriority: 45`，但首夜步骤里没有任何「普卡毒杀」；
     *   第 2 夜才出现「普卡对1号玩家下毒，该玩家将于明晚毒发死亡」。
     * 官方【普卡】：「每个夜晚，选择一名玩家：他中毒。上一个中毒的玩家会死亡并恢复健康。」
     *   ⇒ 首夜缺一次下毒，会让「第 2 夜毒发」整体后移一晚。
     */
    const p1Steps = resultSteps(n1, "pukka", /毒/);
    expect.soft(p1Steps.length, "官方：普卡「每个夜晚」⇒ 首夜必须下毒（实测无）").toBeGreaterThan(0);

    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");
    const n2 = await driveNight(page, []);
    const pStep = resultSteps(n2, "pukka", /毒/)[0];
    expect.soft(pStep, "普卡第 2 夜必须下毒").toBeTruthy();
    expect.soft(pStep?.dialog ?? "", "结果必须写明「该玩家将于明晚毒发死亡」").toContain("明晚");
    test.fail(true, "普卡首夜不下毒（仅第 2 夜起才下毒）⇒ 毒发整体后移一晚");

    const after = await snapNow(page);

    // ── 钟表匠：独立复算 ──
    const cmStep = resultSteps(n1, "clockmaker", /最近距离/)[0];
    expect(cmStep, "钟表匠必须被唤醒").toBeTruthy();
    const said = Number((cmStep!.dialog.match(/最近距离为(\d+)/) ?? [])[1] ?? NaN);
    const truth = computeClockmaker(after);
    expect.soft(said, `钟表匠距离应等于复算值 ${truth}（实测 ${said}）`).toBe(truth);
    expect.soft(cmSeat, "钟表匠应在场").toBeGreaterThanOrEqual(0);

    // ── 互认：刺客/教父/女巫 三方针 ──
    for (const role of ["assassin", "godfather", "witch"]) {
      const st = stepsOf(n1, role).find((x) => /恶魔是：/.test(x.dialog));
      expect.soft(st, `${role} 应有互认结果`).toBeTruthy();
      expect
        .soft(st!.dialog, `${role} 看到的恶魔应为 ${pukkaSeat + 1} 号`)
        .toContain(`恶魔是：${pukkaSeat + 1}号`);
    }

    // ── 普卡的「恶魔互认」重复两次（已知异常，登记）──
    const demonInfoSteps = stepsOf(n1, "pukka").filter((x) => /不在场伪装/.test(x.dialog));
    expect
      .soft(
        demonInfoSteps.length,
        `普卡的恶魔互认应只出现 1 次，实测 ${demonInfoSteps.length} 次`
      )
      .toBe(1);

    for (const role of [
      "barber",
      "assassin",
      "seamstress",
      "town_crier",
      "godfather",
      "mutant",
      "mathematician",
      "juggler",
      "artist",
      "witch",
      "pukka",
      "balloonist",
      "clockmaker",
      "courtier",
      "philosopher",
    ]) {
      expect.soft(seatByRole(snap, role), `${role} 应在场`).toBeGreaterThanOrEqual(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// G4 · 第 2 夜（信息类复算）
// ═══════════════════════════════════════════════════════════════════
test.describe("凶宅魅影 · G4 第 2 夜信息复算", () => {
  test.setTimeout(8 * 60_000);

  test("城镇公告员/数学家/神谕者?（本剧本无神谕者）—— 公告员与数学家必须与真值一致", async ({
    page,
  }) => {
    const snap = await bootS(page, "S18");
    const tcSeat = seatByRole(snap, "town_crier"); // 6
    const mathSeat = seatByRole(snap, "mathematician"); // 13

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    const n2 = await driveNight(page, []);
    expect.soft(n2.status, "第 2 夜应到白天").toBe("day");
    const after = await snapNow(page);

    // 城镇公告员：今天无人提名 ⇒ 「无爪牙提名」
    const tc = resultSteps(n2, "town_crier", /提名/).pop();
    expect(tc, "城镇公告员第 2 夜必须被唤醒").toBeTruthy();
    expect.soft(tc!.dialog, "今天无人提名 ⇒ 必须答「无爪牙提名」").toContain("无爪牙提名");
    expect.soft(tcSeat, "城镇公告员应在场").toBeGreaterThanOrEqual(0);

    // 数学家：结果必须能解析出非负整数
    const mathStep = resultSteps(n2, "mathematician").pop();
    expect(mathStep, "数学家每夜都应被唤醒").toBeTruthy();
    const num = Number((mathStep!.dialog.match(/(\d+)/) ?? [])[1] ?? NaN);
    expect.soft(Number.isFinite(num) && num >= 0, "数学家的结果必须是非负整数").toBe(true);
    expect.soft(mathSeat, "数学家应在场").toBeGreaterThanOrEqual(0);

    // 死亡邪恶数（本剧本无神谕者，用快照复算兜底断言「无人死亡」）
    const dead = (after?.seats ?? []).filter((s: any) => s.isDead);
    expect
      .soft(
        dead.filter((s: any) => isMinionOrDemonRole(s.role)).length,
        "第 2 夜前不应有邪恶玩家死亡"
      )
      .toBe(0);
  });
});
