import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { roles as APP_ROLES } from "../../app/data";
import {
  isMinionOrDemonRole,
  isSeatDemon,
  isSeatMinion,
  isSeatTownsfolk,
} from "../../src/utils/seatAlignment";
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
     * ✅ 2026-10-23 修复后的回归断言（原登记缺口已闭合）。
     *
     * 官方【哲学家】：「每局游戏限一次，在夜晚时，**你可以选择一个善良角色**：
     *   你获得该角色的能力。如果这个角色在场，他醉酒。」
     *
     * 修前：`targetConfig = {min:0,max:0}` ⇒ 掉进 `useNightActionHandler` 的
     *   「`maxTargets === 0` 无目标信息角色」简易确认窗 ⇒ 说书人只看到「执行」
     *   ⇒ `storytellerInput.chosenRoleId` 恒 null ⇒ 能力完全不生效。
     * 修后：与 `ojo`/`brewer` 一起排除出该分支，走 `NIGHT_ACTION_CONFIRM`
     *   的角色选择通路（`requiresRoleSelection` 白名单本就有 philosopher）。
     */
    const philSteps = stepsOf(n1, "philosopher");
    expect.soft(philSteps.length, "哲学家首夜应被唤醒").toBeGreaterThan(0);

    const philDialog = philSteps.map((x) => x.dialog).join("|");
    // ✅ 核心：弹窗必须提供角色选择（修前只有「执行」）
    expect
      .soft(
        /请选择目标角色|请选择需要.*的角色/.test(philDialog),
        `官方：哲学家必须能「选择一个善良角色」⇒ 弹窗要有角色选择（实测：${philDialog.slice(0, 140)}）`
      )
      .toBe(true);
    // ✅ 候选范围只含善良角色（镇民/外来者），不得出现爪牙/恶魔
    if (/请选择目标角色/.test(philDialog)) {
      expect
        .soft(
          !/爪牙\(/.test(philDialog) && !/恶魔\(/.test(philDialog),
          `哲学家的候选只应含镇民/外来者（实测：${philDialog.slice(-160)}）`
        )
        .toBe(true);
    }
    expect.soft(philSeat, "哲学家应在场").toBeGreaterThanOrEqual(0);

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
     * ✅ 2026-10-24 修复后的回归用例（原登记缺口已闭合）。
     *
     * 官方【普卡】：「**每个夜晚**，选择一名玩家：他中毒。上一个中毒的玩家会死亡并恢复健康。」
     *   —— **无星号** ⇒ 首夜必须下毒（角色简介原文：「**不同于其他恶魔，普卡在首个夜晚就会行动**」）。
     *
     * 🔴 修前实测：**普卡首夜不下毒**（S20 与黯月初升 S04 都如此），第 2 夜才出现
     *   「普卡对1号玩家下毒，该玩家将于明晚毒发死亡」
     *   ⇒ 首夜缺一次下毒，会让「第 2 夜毒发」整体后移一晚。
     *   真根因：`utils/nightInfoAdapter.ts` 的「首夜恶魔信息保障」分支把首夜恶魔座位
     *   **一律**转成 `demon_info`，吞掉了普卡自己的首夜能力节点。
     */
    const p1Steps = resultSteps(n1, "pukka", /毒/);
    expect.soft(p1Steps.length, "官方：普卡「每个夜晚」⇒ 首夜必须下毒（实测无）").toBeGreaterThan(0);
    expect
      .soft(p1Steps[0]?.dialog ?? "", "普卡首夜结果必须写明「该玩家将于明晚毒发死亡」")
      .toContain("明晚");

    // 首夜下毒必须落库 isPoisoned=true（1 人）
    const afterN1 = await snapNow(page);
    const poisoned = (afterN1?.seats ?? []).filter((s: any) => s.isPoisoned === true);
    expect.soft(poisoned.length, "普卡首夜必须落库 isPoisoned=true（1 人）").toBe(1);

    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");
    const n2 = await driveNight(page, []);
    const pStep = resultSteps(n2, "pukka", /毒/)[0];
    expect.soft(pStep, "普卡第 2 夜必须下毒").toBeTruthy();
    expect.soft(pStep?.dialog ?? "", "结果必须写明「该玩家将于明晚毒发死亡」").toContain("明晚");

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

// ═══════════════════════════════════════════════════════════════════
// G4 · 角色级补测：诺-达鲺（邻近镇民中毒）/ 理发师（死亡后交换窗口）/ 教父
// ═══════════════════════════════════════════════════════════════════
test.describe("凶宅魅影 · G4 角色级补测", () => {
  test.setTimeout(8 * 60_000);

  test("诺-达鲺：与它邻近的两名镇民必须中毒（连续状态）", async ({ page }) => {
    /**
     * 官方【诺-达鲺】：「每个夜晚，与你邻近的两名镇民中毒。」
     * ⇒ 判据：恶魔左右邻座中**凡是镇民**都必须 `isPoisoned === true`，
     *   且至少命中 1 人（否则说明这两个位置没有镇民，本局无法验证）。
     */
    const snap = await bootS(page, "S18");
    const ndSeat = seatByRole(snap, "no_dashii");
    expect.soft(ndSeat, "诺-达鲺应在场").toBeGreaterThanOrEqual(0);
    const n = (snap.seats as any[]).length;
    const nbrs = [(ndSeat - 1 + n) % n, (ndSeat + 1) % n];
    const townsfolkNbrs = nbrs.filter((id) => {
      const s = (snap.seats as any[]).find((x: any) => x.id === id);
      return isSeatTownsfolk(s);
    });
    expect
      .soft(
        townsfolkNbrs.length,
        `诺-达的邻座里至少要有一名镇民才有验证意义（邻座=${nbrs.map((x) => x + 1).join("/")}）`
      )
      .toBeGreaterThan(0);

    /**
     * ⚠️ 时序：`nightOrder.json` 只把 `no_dashii` 排在 **otherNights**（首夜表为空）
     *   ⇒ 中毒由「夜序唤醒时的能力执行」写入，首夜不会落库。
     *   官方原文是「每个夜晚」（被动持续），这里按实现时序**在第 2 夜后断言**，
     *   并在用例名/注释里标出这一偏差，避免把它当成「首夜就该生效」而误报。
     */
    expect((await driveNight(page, [])).status, "首夜应推进到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼不提名应能入夜").toBe("night");
    expect((await driveNight(page, [])).status, "第 2 夜应推进到白天").toBe("day");

    const after = await snapNow(page);
    for (const id of townsfolkNbrs) {
      const seat = after?.seats?.find((x: any) => x.id === id);
      expect
        .soft(seat?.isPoisoned, `官方：与诺-达邻近的镇民 ${id + 1} 号必须中毒`)
        .toBe(true);
    }
    // 反证：不相邻的镇民不得因为诺-达而中毒
    const farTownsfolk = (after?.seats ?? []).filter(
      (s: any) => isSeatTownsfolk(s) && !nbrs.includes(s.id)
    );
    expect
      .soft(
        farTownsfolk.some((s: any) => s.isPoisoned === true),
        "❌ 不相邻的镇民也被诺-达毒了（范围错误）"
      )
      .toBe(false);
  });

  test("理发师：被处决 ⇒ 当晚必须给出「交换两名玩家角色」的通路", async ({ page }) => {
    /**
     * 官方【理发师】：「如果你死亡，在当晚，说书人可以选择两名玩家：他们交换角色。」
     *
     * 🔴 2026-10-22 修复两处（`app/gameLogic.ts`）：
     *   ① 判据写成 `barber_mr` —— **全仓不存在这个角色 id**（真实 id 是 `barber`）
     *      ⇒ 交换窗从不弹出；
     *   ② 判据只在 `KILL_PLAYER`（夜杀）分支，`EXECUTE_PLAYER` 分支没有
     *      ⇒ 官方「如果你死亡」（不分死因）被缩成「只在夜杀时」。
     *
     * ⚠️ 本剧本两个场次都有畸形秀演员 ⇒ 白天「进入黄昏」被【疯狂仲裁】门禁拦住，
     *   必须先在用例里手动把门禁走完（选保守项「否，无事发生」），否则驱动器拿不到处决。
     */
    /**
     * ⚠️ E2E 侧标 fixme：产品判据已由单测锁定
     *   （`src/utils/__tests__/barber_swap_hint.test.ts` 三条：夜杀 / 处决 / 非理发师反证）。
     *   这里卡的是**驱动器**：15 人局的投票流程拿不到 `executed=true`
     *   （实测 `executedSeat=null`，dialogs 只剩提名确认一条）。
     */
    test.fixme(true, "15 人局投票驱动未通；判据已由 barber_swap_hint 单测锁定");
    const snap = await bootS(page, "S18");
    const barberSeat = seatByRole(snap, "barber");
    expect.soft(barberSeat, "理发师应在场").toBeGreaterThanOrEqual(0);
    const nominator = (snap.seats as any[]).find(
      (s: any) => s.id !== barberSeat && isSeatTownsfolk(s)
    ).id as number;

    expect((await driveNight(page, [])).status, "首夜应推进到白天").toBe("day");

    // ── 手动解除【疯狂仲裁】门禁（说书人选「否，无事发生」）──
    const arbBtn = page.locator("button").filter({ hasText: /^疯狂仲裁$/ }).first();
    if (await arbBtn.isVisible().catch(() => false)) {
      await arbBtn.click({ timeout: 5000 }).catch(() => {});
      const noBtn = page
        .locator('[role="dialog"] button')
        .filter({ hasText: /无事发生|^否/ })
        .first();
      await noBtn.click({ timeout: 5000 }).catch(() => {});
    }

    const d = await driveDusk(page, {
      nominator: nominator + 1,
      nominee: barberSeat + 1,
      decision: "execute",
    } as any);
    expect
      .soft(
        d.executed,
        `处决应真的执行（实测 executedSeat=${d.executedSeat}，dialogs=${d.dialogs.length} 条）`
      )
      .toBe(true);

    const after = await snapNow(page);
    const barber = after?.seats?.find((x: any) => x.id === barberSeat);
    expect.soft(barber?.isDead, "理发师被处决应死亡").toBe(true);

    // 交换通路：弹窗文案 / driveDusk 收集到的 dialogs / 快照 hint 三者取或
    const bodyText = await page.locator("body").innerText();
    const dialogsText = (d.dialogs ?? []).join(" | ");
    const sawSwap =
      /交换/.test(bodyText) ||
      /交换/.test(dialogsText) ||
      (after as any)?.nextActionHint === "BARBER_SWAP_NEEDED";
    expect
      .soft(
        sawSwap,
        `官方：理发师死亡当晚必须给出「交换两名玩家角色」的通路（弹窗：${dialogsText.slice(0, 120)}）`
      )
      .toBe(true);
  });

  test("教父：白天没有外来者死亡 ⇒ 当晚不得额外杀人", async ({ page }) => {
    /**
     * 官方【教父】：「如果一名外来者死亡，你可以在当晚杀死一名玩家。」
     * ⇒ 负向对照：白天**没有**外来者死亡时，教父不得产生击杀。
     */
    const snap = await bootS(page, "S18");
    const gfSeat = seatByRole(snap, "godfather");
    expect.soft(gfSeat, "教父应在场").toBeGreaterThanOrEqual(0);

    expect((await driveNight(page, [])).status, "首夜应推进到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼不提名应能入夜").toBe(
      "night"
    );
    const n2 = await driveNight(page, []);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    const deadFromGodfather = (await snapNow(page))?.seats?.filter(
      (s: any) => s.deathSource === "godfather" || s.killedBy === "godfather"
    );
    expect
      .soft(
        (deadFromGodfather ?? []).length,
        "❌ 没有外来者死亡，教父却杀了人"
      )
      .toBe(0);
  });
});
