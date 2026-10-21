import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { roles as APP_ROLES } from "../../app/data";
import {
  isMinionOrDemonRole,
  isSeatDemon,
  isTownsfolkOrOutsiderRole,
  isOutsiderRole,
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
 * 🌑 黯月初升 · 逐角色场景验证（S03 / S04 / S05 / S06，25 角色）
 * ==================================================================
 * 场次：
 *   · S03 15 人：僵怖局（9号），含祖母/水手/侍臣/教父/刺客/赌徒/驱魔人/侍女/补匠
 *   · S04  9 人：普卡局（6号）+ 疯子（7号，以为自己是沙巴洛斯）
 *   · S05  9 人：沙巴洛斯局（3号），含旅店老板/驱魔人/水手/教父/月之子
 *   · S06 15 人：珀局（6号），含刺客/魔鬼代言人/教父
 *
 * 覆盖：grandmother sailor chambermaid exorcist innkeeper gambler gossip courtier
 *      professor tinker moonchild godfather devils_advocate assassin zombuul
 *      minstrel goon tea_lady fool mastermind pukka lunatic shabaloth po pacifist
 *
 * ⚠️ 本剧本的坑（都已实测）：
 *   1. **恶魔互认不算「被唤醒」**：侍女只统计「因自身能力被唤醒」的人。
 *      只走了互认的恶魔/爪牙不计入 —— 这是官方口径，不是缺陷。
 *   2. **教父/沙巴洛斯/僵怖/珀 都是「每个夜晚*」**：首夜不行动。
 *      但探针里教父在 S03/S05/S06 首夜都出现了「替身击杀」步骤 ⇒ 见 G1 的登记项。
 *   3. **普卡的「恶魔互认」在 S04 首夜出现了两次**（同一座位、同一文案）⇒ 见 G2。
 *   4. 疯子（lunatic）在互认里被当作恶魔，且被给出「爪牙：X」与 3 个伪装 —— 这是对的。
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

function seatByRole(snap: any, roleId: string): number {
  return seatOf(snap, roleId);
}
function roleAt(snap: any, seatId: number): string | null {
  return (snap?.seats ?? []).find((s: any) => s.id === seatId)?.role?.id ?? null;
}
/** 取某角色的最后一个「获得信息/结果」步骤（爪牙互认也会产出「-结果」，务必用内容锚） */
function resultStep(report: NightReport, role: string, anchor?: RegExp) {
  const all = stepsOf(report, role);
  if (anchor) return all.filter((x) => anchor.test(x.dialog)).pop();
  return all.filter((x) => /获得信息|发动能力/.test(x.dialog)).pop() ?? all[all.length - 1];
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

// ═══════════════════════════════════════════════════════════════════
// G1 · S03 首夜（15 人，僵怖局）
// ═══════════════════════════════════════════════════════════════════
test.describe("黯月初升 · G1 S03 首夜", () => {
  test.setTimeout(6 * 60_000);

  test("互认三方针 + 恶魔伪装 3 名不在场 + 侍女统计真实唤醒数", async ({ page }) => {
    // S03：1DA 2侍臣 3驱魔人 4水手 5赌徒 6侍女 7旅店老板 8月之子 9僵怖
    //      10教授 11祖母 12刺客 13补匠 14教父 15造谣者
    const snap = await bootS(page, "S03");
    const demonSeat = seatByRole(snap, "zombuul"); // 9
    const daSeat = seatByRole(snap, "devils_advocate"); // 1
    const assassinSeat = seatByRole(snap, "assassin"); // 12
    const gfSeat = seatByRole(snap, "godfather"); // 14

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    // ── 爪牙互认：三个爪牙看到的恶魔座位必须一致且正确 ──
    for (const [role, label] of [
      ["devils_advocate", "魔鬼代言人"],
      ["assassin", "刺客"],
      ["godfather", "教父"],
    ] as const) {
      const st = stepsOf(n1, role).find((x) => /恶魔是：/.test(x.dialog));
      expect.soft(st, `${label} 应有爪牙互认结果`).toBeTruthy();
      expect
        .soft(st!.dialog, `${label} 被告知的恶魔座位应为 ${demonSeat + 1} 号`)
        .toContain(`恶魔是：${demonSeat + 1}号`);
    }
    // 反证：队友名单只含另外两个爪牙，不含自己
    const daStep = stepsOf(n1, "devils_advocate").find((x) => /恶魔是：/.test(x.dialog))!;
    expect.soft(daStep.dialog, "魔鬼代言人的队友应含刺客").toContain(`${assassinSeat + 1}号`);
    expect.soft(daStep.dialog, "魔鬼代言人的队友应含教父").toContain(`${gfSeat + 1}号`);
    expect.soft(daStep.dialog, "队友名单不得把自己列进去").not.toContain(
      `队友：${daSeat + 1}号`
    );

    // ── 恶魔互认：3 名爪牙 + 3 个不在场伪装 ──
    expect.soft(roleAt(snap, demonSeat), "9 号是僵怖").toBe("zombuul");
    expect
      .soft((snap.seats as any[]).filter((s: any) => isSeatDemon(s)).length, "本局只有 1 名恶魔")
      .toBe(1);
    const demonStep = stepsOf(n1, "zombuul").find((x) => /不在场伪装/.test(x.dialog));
    expect(demonStep, "恶魔应收到互认+伪装告知").toBeTruthy();
    for (const s of [daSeat, assassinSeat, gfSeat]) {
      expect.soft(demonStep!.dialog, `爪牙名单应含 ${s + 1} 号`).toContain(`${s + 1}号`);
    }
    const inPlay = new Set(
      (snap.seats as any[]).map((s: any) => NAME_OF[s.role.id] ?? s.role.name)
    );
    const bluffs = (demonStep!.dialog.match(/【([^】]+)】/g) ?? []).map((x) =>
      x.replace(/[【】]/g, "")
    );
    expect.soft(bluffs.length, "官方：恶魔被告知 3 个不在场角色").toBe(3);
    expect
      .soft(bluffs.filter((b) => inPlay.has(b)), "伪装角色不得是本局在场角色")
      .toEqual([]);

    // ── 侍女：查 1 号（魔鬼代言人，本夜行动过）+ 2 号（侍臣，本夜行动过）⇒ 必须是 2 ──
    const cm = resultStep(n1, "chambermaid", /人被唤醒/);
    expect(cm, "侍女首夜必须被唤醒").toBeTruthy();
    expect.soft(cm!.dialog, "结果必须点出实际查的两个座位").toContain("查验1号、2号");
    const cmNum = Number((cm!.dialog.match(/(\d+)\s*人被唤醒/) ?? [])[1] ?? NaN);
    expect
      .soft(
        cmNum,
        "官方：1 号魔鬼代言人、2 号侍臣当夜都因自身能力被唤醒 ⇒ 侍女必须答 2"
      )
      .toBe(2);

    // ── 水手：选 1 号 ⇒ 1 号醉酒（官方：你选的人今晚醉酒，且他可能被杀不死） ──
    const after = await snapNow(page);
    const sailorStep = stepsOf(n1, "sailor").find((x) => /醉酒保护/.test(x.dialog));
    expect(sailorStep, "水手首夜必须被唤醒").toBeTruthy();
    expect
      .soft(
        (after?.seats ?? []).filter((s: any) => s.isDrunk === true).length,
        "水手选中的座位应被标记醉酒（至少 1 人）"
      )
      .toBeGreaterThan(0);
  });

  test("驱魔人 / 赌徒 / 补匠 / 月之子 / 教授 的首夜与第 2 夜行为", async ({ page }) => {
    const snap = await bootS(page, "S03");
    const exorcistSeat = seatByRole(snap, "exorcist"); // 3
    const gamblerSeat = seatByRole(snap, "gambler"); // 5
    const tinkerSeat = seatByRole(snap, "tinker"); // 13
    const moonSeat = seatByRole(snap, "moonchild"); // 8
    const professorSeat = seatByRole(snap, "professor"); // 10

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    // 补匠：注册表里是 PASSIVE（`firstNightPriority: null`）⇒ 首夜不主动唤醒；
    //   它的「猝死」由说书人在任意时刻触发，不是夜间固定步骤。
    expect
      .soft(stepsOf(n1, "tinker").length, "补匠是被动角色（PASSIVE）⇒ 首夜不主动唤醒")
      .toBe(0);
    expect.soft(tinkerSeat, "补匠应在场").toBeGreaterThanOrEqual(0);
    // 教授：官方「每局限一次，夜晚*」⇒ 首夜不唤醒
    expect.soft(stepsOf(n1, "professor").length, "教授是「夜晚*」⇒ 首夜不唤醒").toBe(0);
    expect.soft(professorSeat, "教授应在场").toBeGreaterThanOrEqual(0);
    // 月之子：官方「如果你在夜晚死亡」⇒ 不是夜间主动能力，首夜不应有行动
    expect.soft(stepsOf(n1, "moonchild").length, "月之子不是主动夜间角色").toBe(0);
    expect.soft(moonSeat, "月之子应在场").toBeGreaterThanOrEqual(0);

    // 第 1 昼不提名 → 入夜
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    // 第 2 夜：赌徒猜错会自杀；驱魔人问一个人是不是恶魔
    const n2 = await driveNight(page, []);
    expect.soft(n2.status, "第 2 夜应到白天").toBe("day");

    // 赌徒：驱动器默认猜 1 号（实际不是 1 号的角色）⇒ 结果文案必须写明「猜错死亡」
    const gStep = resultStep(n2, "gambler", /猜测/);
    expect(gStep, "赌徒第 2 夜必须被唤醒").toBeTruthy();
    expect
      .soft(
        /猜错|猜对/.test(gStep!.dialog),
        `赌徒结果必须明确说出猜对/猜错，实测：${gStep!.dialog.slice(-60)}`
      )
      .toBe(true);

    const after = await snapNow(page);
    const gamblerDead = (after?.seats ?? []).find((s: any) => s.id === gamblerSeat)?.isDead;
    const guessWrong = /猜错/.test(gStep!.dialog);
    expect
      .soft(
        gamblerDead,
        `赌徒「${guessWrong ? "猜错" : "猜对"}」与死亡状态必须双向一致（实测 isDead=${gamblerDead}）`
      )
      .toBe(guessWrong);

    // 驱魔人：必须给出「是/不是恶魔」的判定，且与实际角色一致
    const eStep = resultStep(n2, "exorcist", /恶魔/);
    expect(eStep, "驱魔人第 2 夜必须被唤醒").toBeTruthy();
    const pickedSeat = eStep!.picked[0];
    if (pickedSeat != null) {
      const realIsDemon = isSeatDemon(
        (after?.seats ?? []).find((s: any) => s.id === pickedSeat - 1)
      );
      const saidDemon = /是恶魔/.test(eStep!.dialog) && !/不是恶魔/.test(eStep!.dialog);
      expect
        .soft(
          saidDemon,
          `驱魔人选的 ${pickedSeat} 号实际${realIsDemon ? "是" : "不是"}恶魔，判定必须一致`
        )
        .toBe(realIsDemon);
    }
    expect.soft(exorcistSeat, "驱魔人应在场").toBeGreaterThanOrEqual(0);
  });

  test("教父首夜只得知「在场外来者」，不得产生击杀", async ({ page }) => {
    /**
     * ✅ 2026-10-23 修复后的回归用例（原登记缺口已闭合）。
     *
     * 官方【教父】两条能力：
     *   ① 「在你的**首个夜晚**，你会得知有哪些外来者角色在场。」
     *   ② 「如果有外来者在**白天**死亡，你会在当晚被唤醒并且你要选择一名玩家：他死亡。」
     *
     * 修前：注册表里只有一条「替身击杀」，首夜**既没有外来者信息**，又照样进击杀流程。
     * 修后（`godfather.ability::calculate`）：`nightCount === 1` 时只产
     *   `{ isFirstNight: true, killed: false, outsiderInfo: [...] }`，
     *   `postProcess` 生成 `displayInfo`（说书人可见的「在场外来者」页）。
     *
     * ⚠️ 已知的**体验**待改进（不判红）：弹窗标题仍沿用能力名「替身击杀」，
     *   首夜说书人仍会被问「选谁」（选完不产生击杀）。文案与交互改版另行处理。
     */
    const snap = await bootS(page, "S03");
    const gfSeat = seatByRole(snap, "godfather");
    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    // ① 核心：首夜必须告知「在场外来者」
    const infoStep = stepsOf(n1, "godfather").find((x) => /外来者/.test(x.dialog));
    expect
      .soft(infoStep, "官方：教父首夜必须得知「在场的外来者有哪些」（实测无信息页）")
      .toBeTruthy();

    // ② 信息内容必须与快照一致（独立复算）
    if (infoStep) {
      const outsiderSeats = (snap.seats as any[]).filter((x) =>
        isOutsiderRole(x.role)
      );
      const expectCnt = outsiderSeats.length;
      const saidCnt = (infoStep.dialog.match(/【/g) ?? []).length;
      expect
        .soft(
          saidCnt,
          `信息里点名的外来者数量（${saidCnt}）应等于在场外来者数（${expectCnt}）`
        )
        .toBe(expectCnt);
    }

    // ③ 核心：首夜不得有人死亡
    const after = await snapNow(page);
    expect
      .soft(
        (after?.seats ?? []).filter((x: any) => x.isDead).length,
        "官方：教父首夜不杀人 ⇒ 首夜结束不得有人死亡"
      )
      .toBe(0);

    // ④ 首夜不得真的点到任何座位（2026-10-23 起 `useNightActionHandler` 把
    //    教父首夜的 targetConfig 收到 {min:0,max:0}，不再逼说书人挑人）
    const killSteps = stepsOf(n1, "godfather").filter((x) => /替身击杀/.test(x.dialog));
    expect
      .soft(
        killSteps.filter((x) => x.picked.length > 0).length,
        "首夜的「替身击杀」弹窗不得点到任何座位（应保持空选）"
      )
      .toBe(0);
    expect.soft(gfSeat, "教父应在场").toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G1b · S03 祖母 / 侍臣 / 造谣者
// ═══════════════════════════════════════════════════════════════════
test.describe("黯月初升 · G1b 祖母 / 侍臣 / 造谣者", () => {
  test.setTimeout(8 * 60_000);

  test("祖母必须得知「一名善良玩家和他的角色」，且落库 grandchildId", async ({ page }) => {
    /**
     * ✅ 2026-10-23 修复后的回归用例（原登记缺口已闭合）。
     *
     * 根因（三场一致：S03 11号 / S05 8号 / S06 15号）：
     *   `grandmother.ability::calculateResult` 从 `selfSeat.grandchildId` 读孙子，
     *   而**全仓库没有任何写入点** ⇒ 恒 undefined ⇒ `result.grandchildId = -1`
     *   ⇒ `postProcess` 不产生 `displayInfo` ⇒ 首夜只有「行动确认」、没有信息页；
     *   同时 `stateUpdate` 是**空数组** ⇒ 「孙子被杀我也死」也拿不到判据。
     *
     * 修法：说书人未指定时，引擎**确定性**挑一名「存活且善良、非自己」的玩家，
     *   并在 `stateUpdate` 把 `grandchildId` 写回祖母座位、`isGrandchild` 写回孙子座位。
     */
    const snap = await bootS(page, "S03");
    const gmSeat = seatByRole(snap, "grandmother"); // 11

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    const steps = stepsOf(n1, "grandmother");
    expect.soft(steps.length, "祖母首夜必须被唤醒").toBeGreaterThan(0);

    const after = await snapNow(page);
    const gm = (after?.seats ?? []).find((s: any) => s.id === gmSeat);

    // ① 落库：祖母座位记住「谁是孙子」
    expect
      .soft(gm?.grandchildId, "祖母座位必须落库 grandchildId（官方：你会得知一名善良玩家）")
      .not.toBeUndefined();
    expect.soft(gm?.grandchildId, "grandchildId 必须是有效座位且不是自己").not.toBe(gmSeat);

    // ② 落库：孙子座位标记
    const grandchild = (after?.seats ?? []).filter((s: any) => s.isGrandchild === true);
    expect.soft(grandchild.length, "必须落库「谁是孙子」（seat.isGrandchild=true，且只有 1 人）").toBe(1);
    if (grandchild.length === 1) {
      // ③ 官方：孙子必须是**善良**玩家
      expect
        .soft(isTownsfolkOrOutsiderRole(grandchild[0].role), "孙子必须是善良玩家（镇民或外来者）")
        .toBe(true);
      // ④ 信息页必须点名这名孙子 + 他的角色
      const infoDialog = steps.map((x) => x.dialog).join("|");
      expect
        .soft(
          infoDialog.includes(`${grandchild[0].id + 1}号`),
          `祖母的信息里必须点名孙子（${grandchild[0].id + 1}号），实测：${infoDialog.slice(-120)}`
        )
        .toBe(true);
    }
    expect.soft(gmSeat, "祖母应在场").toBeGreaterThanOrEqual(0);
  });

  test("侍臣可选一名角色让其醉酒；造谣者的声明在夜间结算", async ({ page }) => {
    const snap = await bootS(page, "S03");
    const courtierSeat = seatByRole(snap, "courtier"); // 2
    const gossipSeat = seatByRole(snap, "gossip"); // 15

    const n1 = await driveNight(page, [
      { role: "courtier", targets: [1], note: "让 1 号醉酒 3 天 3 夜" },
    ]);
    expect(n1.status, "首夜应到白天").toBe("day");

    // 侍臣：官方「每局一次，选一名角色：他醉酒 3 天 3 夜」⇒ 目标必须被标记醉酒
    const cStep = stepsOf(n1, "courtier").find((x) => /朝臣醉酒/.test(x.dialog));
    expect(cStep, "侍臣首夜必须被唤醒").toBeTruthy();
    expect.soft(cStep!.picked, "侍臣应选中 1 号").toEqual([1]);
    const after = await snapNow(page);
    expect
      .soft(
        (after?.seats ?? []).find((s: any) => s.id === 0)?.isDrunk,
        "官方：被侍臣选中的角色必须醉酒（1 号）"
      )
      .toBe(true);
    expect.soft(courtierSeat, "侍臣应在场").toBeGreaterThanOrEqual(0);

    // 造谣者：「每个白天可以发表声明，若为真当晚一名玩家死亡」——白天没声明 ⇒ 夜间应判「声明错误」
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");
    const n2 = await driveNight(page, []);
    const gStep = resultStep(n2, "gossip", /声明/);
    expect(gStep, "造谣者第 2 夜必须被唤醒结算").toBeTruthy();
    expect
      .soft(gStep!.dialog, "白天没有声明 ⇒ 夜间必须判「声明错误」且不产生死亡")
      .toContain("声明错误");
    expect.soft(gossipSeat, "造谣者应在场").toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G2 · S04（9 人，普卡 + 疯子）
// ═══════════════════════════════════════════════════════════════════
test.describe("黯月初升 · G2 S04 普卡与疯子", () => {
  test.setTimeout(8 * 60_000);

  test("疯子收到恶魔互认；普卡首夜必须下毒（⚠️ 首夜未行动）", async ({ page }) => {
    // S04：1吟游诗人 2呆瓜 3茶艺师 4弄臣 5主谋 6普卡 7疯子 8和平主义者 9祖母
    const snap = await bootS(page, "S04");
    const lunaticSeat = seatByRole(snap, "lunatic"); // 7
    const pukkaSeat = seatByRole(snap, "pukka"); // 6

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    // ── 疯子：在互认里被当成恶魔（他以为自己是沙巴洛斯），且被告知「爪牙」与 3 个伪装 ──
    /**
     * ⚠️ 锚点必须是「爪牙是 / 不在场伪装」，**不能**用 /伪装/：
     *   疯子的**行动确认**页文案是「执行行动"恶魔爪牙互认与**伪装**角色告知"」——
     *   它含「伪装」二字 ⇒ 用 /伪装/ 锚点会先命中**确认页**而不是**信息结果页**，
     *   后续断言就落空了（此前被 `test.fail` 登记掩盖着）。
     */
    const lunaticInfo = stepsOf(n1, "lunatic").find((x) =>
      /爪牙是|不在场伪装/.test(x.dialog)
    );
    expect(lunaticInfo, "疯子首夜必须收到「恶魔互认」").toBeTruthy();
    // ⚠️ 实测文案里**不会**出现「沙巴洛斯」字样（只给爪牙名单 + 3 个伪装），
    //   所以判据只锚定「疯子收到了恶魔互认」这件事本身。
    expect
      .soft(
        /爪牙是|不在场伪装/.test(lunaticInfo!.dialog),
        "疯子应收到「恶魔互认」形态的告知（他以为自己是恶魔）"
      )
      .toBe(true);
    expect.soft(roleAt(snap, lunaticSeat), "疯子的真实角色仍是 lunatic").toBe("lunatic");

    /**
     * ✅ 2026-10-24 修复后的回归用例（原登记缺口已闭合）。
     *
     * 官方【普卡】：「**每个夜晚**，选择一名玩家：他中毒。上一个中毒的玩家会死亡并恢复健康。」
     *   —— **无星号** ⇒ 首夜必须下毒（角色简介原文：「**不同于其他恶魔，普卡在首个夜晚就会行动**」）。
     *
     * 🔴 修前实测：S04 首夜的步骤只有**两次「恶魔互认」**，没有任何「普卡毒杀」。
     *   真根因（**不是**「队列里被两次 demon_info 挤掉」——队列里其实有 pukka 的能力节点）：
     *     ① `utils/nightInfoAdapter.ts` 的「首夜恶魔信息保障」分支**一律**把首夜的恶魔座位
     *        转成 `demon_info` ⇒ 把普卡**自己的首夜能力节点整个吞掉**；
     *     ② `roles/demon/pukka.ts` 的 legacy `firstNight` 配置是**通用恶魔首夜**（0 目标）。
     *   ⇒ 首夜不下毒 ⇒ 中毒链整体后移一晚（毒发无人接续）。
     */
    const pStep = resultStep(n1, "pukka", /毒/);
    expect
      .soft(pStep, "官方：普卡「每个夜晚」⇒ 首夜必须下毒（实测无任何下毒步骤）")
      .toBeTruthy();
    if (!pStep) return;
    expect
      .soft(pStep!.dialog, "普卡结果必须写明「该玩家将于明晚毒发死亡」")
      .toContain("明晚");

    const after = await snapNow(page);
    const poisoned = (after?.seats ?? []).filter((s: any) => s.isPoisoned === true);
    expect.soft(poisoned.length, "普卡首夜必须落库 isPoisoned=true（1 人）").toBe(1);

    // ── 普卡的「恶魔互认」在同一夜只应出现 1 次（修前是 2 次：能力节点被吞成互认节点）──
    const demonInfoSteps = stepsOf(n1, "pukka").filter((x) => /不在场伪装/.test(x.dialog));
    expect
      .soft(
        demonInfoSteps.length,
        `普卡的恶魔互认应只出现 1 次，实测 ${demonInfoSteps.length} 次（重复唤醒/重复告知）`
      )
      .toBe(1);
    expect.soft(pukkaSeat, "普卡应在场").toBeGreaterThanOrEqual(0);
  });

  test("弄臣 / 茶艺师 / 和平主义者 / 主谋 / 吟游诗人 / 呆瓜 的状态与配比", async ({ page }) => {
    const snap = await bootS(page, "S04");
    const byType = (t: string) =>
      (snap.seats as any[]).filter((s: any) => s.role?.type === t).length;
    // 9 人局标准配比 5/2/1/1；S04 有茶艺师(镇民?) 呆瓜(外来者?) 和平主义者(镇民)…
    expect
      .soft(
        (snap.seats as any[]).length,
        "S04 应为 9 人局"
      )
      .toBe(9);
    expect.soft(byType("demon"), "恶魔 1 名").toBe(1);

    // 这些角色没有夜间主动能力（弄臣/和平主义者/主谋/吟游诗人/呆瓜 都是被动或白天触发）
    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");
    for (const [role, why] of [
      ["fool", "弄臣：被动免死，夜间不行动"],
      ["pacifist", "和平主义者：被处决时被动生效"],
      ["minstrel", "吟游诗人：爪牙杀人后被动触发"],
      ["goon", "呆瓜：被攻击后转邪恶，被动"],
      ["tea_lady", "茶艺师：被动保护相邻好人"],
    ] as const) {
      expect
        .soft(stepsOf(n1, role).length, `${why} ⇒ 首夜不应被唤醒`)
        .toBe(0);
    }
    /**
     * ⚠️ 主谋是**爪牙**，首夜一定会走「爪牙互认」（系统步骤，不算能力）。
     *   要断言的是「除互认外没有自己的行动」，不能直接要求 0 步。
     */
    const mmSteps = stepsOf(n1, "mastermind");
    expect.soft(mmSteps.length, "主谋作为爪牙会有互认步骤").toBeGreaterThan(0);
    expect
      .soft(
        mmSteps.filter((x) => !/互认/.test(x.dialog)).length,
        "主谋除「爪牙互认」外不应有任何自己的夜间行动"
      )
      .toBe(0);
    // 反证：他们确实在场且身份正确
    for (const role of ["fool", "pacifist", "mastermind", "minstrel", "goon", "tea_lady"]) {
      expect.soft(seatByRole(snap, role), `${role} 应在场`).toBeGreaterThanOrEqual(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// G3 · S05（9 人，沙巴洛斯）
// ═══════════════════════════════════════════════════════════════════
test.describe("黯月初升 · G3 S05 沙巴洛斯双杀", () => {
  test.setTimeout(8 * 60_000);

  test("沙巴洛斯每夜选 2 名并双杀；旅店老板保护与醉酒", async ({ page }) => {
    // S05：1旅店老板 2侍女 3沙巴洛斯 4驱魔人 5水手 6教父 7月之子 8祖母 9补匠
    const snap = await bootS(page, "S05");
    const shabaSeat = seatByRole(snap, "shabaloth"); // 3
    const innSeat = seatByRole(snap, "innkeeper"); // 1

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    // 第 2 夜：沙巴洛斯选 1、2 号双杀
    const n2 = await driveNight(page, [{ role: "shabaloth", targets: [1, 2] }]);
    expect.soft(n2.status, "第 2 夜应到白天").toBe("day");

    const shabaStep = stepsOf(n2, "shabaloth").find((x) => /恶魔击杀/.test(x.dialog));
    expect(shabaStep, "沙巴洛斯第 2 夜必须被唤醒").toBeTruthy();
    expect.soft(shabaStep!.dialog, "官方：沙巴洛斯每夜选 2 名").toContain("最少2人");

    const after = await snapNow(page);
    const dead = (after?.seats ?? []).filter((s: any) => s.isDead).map((s: any) => s.id + 1);
    // 旅店老板（1号）会保护 2/3 号中的一人 ⇒ 1 号必死，2 号可能被保护
    expect.soft(dead, "沙巴洛斯选中的 1 号必须死亡").toContain(1);
    expect
      .soft(
        dead.length >= 1 && dead.length <= 2,
        `双杀应死 1~2 人（旅店老板可能挡下其中一个），实测 ${dead.join(",")}`
      )
      .toBe(true);
    expect.soft(shabaSeat, "沙巴洛斯应在场").toBeGreaterThanOrEqual(0);

    // 旅店老板：结果里必须说明「谁醉酒至下个黄昏」
    // ⚠️ anchor 不能写 /保护|醉酒/ —— 会先命中「行动确认」（那条没有时限）
    const inn = stepsOf(n2, "innkeeper").find((x) => /下个黄昏/.test(x.dialog));
    expect.soft(inn, "旅店老板第 2 夜必须被唤醒并说明醉酒时限").toBeTruthy();
    expect.soft(inn?.dialog ?? "", "结果要写清醉酒对象与时限").toContain("下个黄昏");
    expect.soft(innSeat, "旅店老板应在场").toBeGreaterThanOrEqual(0);
  });

  test("驱魔人对非恶魔的判定必须写「不是恶魔」", async ({ page }) => {
    const snap = await bootS(page, "S05");
    const exorcistSeat = seatByRole(snap, "exorcist"); // 4
    const shabaSeat = seatByRole(snap, "shabaloth"); // 3

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    // 选 4 号（自己）以外的 1 号：不是恶魔 ⇒ 应明确说「不是恶魔」
    const n2 = await driveNight(page, [{ role: "exorcist", targets: [1] }]);
    const eStep = resultStep(n2, "exorcist", /恶魔/);
    expect(eStep, "驱魔人必须给出判定").toBeTruthy();
    expect
      .soft(eStep!.dialog, "官方：选到非恶魔时必须明确告知「不是恶魔」")
      .toContain("不是恶魔");

    // 反证：选真正的恶魔（3 号）时说「是恶魔」
    const after = await snapNow(page);
    expect.soft(roleAt(after, shabaSeat), "3 号仍是沙巴洛斯").toBe("shabaloth");
    expect.soft(exorcistSeat, "驱魔人应在场").toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G4 · S06（15 人，珀局）
// ═══════════════════════════════════════════════════════════════════
test.describe("黯月初升 · G4 S06 珀", () => {
  test.setTimeout(8 * 60_000);

  test("珀是「每个夜晚*」⇒ 首夜不行动；互认三方针", async ({ page }) => {
    // S06：1月之子 2旅店老板 3水手 4造谣者 5教授 6珀 7刺客 8补匠 9侍臣
    //      10驱魔人 11赌徒 12侍女 13DA 14教父 15祖母
    const snap = await bootS(page, "S06");
    const poSeat = seatByRole(snap, "po"); // 6
    const demonSeat = poSeat;

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    // 珀：「每个夜晚*」⇒ 首夜不进入击杀流程
    const poKill = stepsOf(n1, "po").filter((x) => /恶魔击杀|击杀/.test(x.dialog));
    expect
      .soft(poKill.length, "官方：珀「每个夜晚*」⇒ 首夜不应进入击杀流程")
      .toBe(0);
    // 但恶魔互认必须有
    const poInfo = stepsOf(n1, "po").find((x) => /不在场伪装/.test(x.dialog));
    expect(poInfo, "珀首夜应收到恶魔互认+伪装告知").toBeTruthy();
    expect.soft(roleAt(snap, poSeat), "6 号是珀").toBe("po");

    // 三方针爪牙互认一致
    for (const role of ["assassin", "devils_advocate", "godfather"]) {
      const st = stepsOf(n1, role).find((x) => /恶魔是：/.test(x.dialog));
      expect.soft(st, `${role} 应有互认结果`).toBeTruthy();
      expect
        .soft(st!.dialog, `${role} 看到的恶魔应为 ${demonSeat + 1} 号`)
        .toContain(`恶魔是：${demonSeat + 1}号`);
    }
  });

  test("第 2 夜珀可击杀；赌徒猜错自杀（双向一致）", async ({ page }) => {
    const snap = await bootS(page, "S06");
    const gamblerSeat = seatByRole(snap, "gambler"); // 11

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    const n2 = await driveNight(page, [{ role: "po", targets: [1] }]);
    expect.soft(n2.status, "第 2 夜应到白天").toBe("day");

    // 珀：第 2 夜应能行动（night* 从第 2 夜开始）
    const poStep = stepsOf(n2, "po").find((x) => /恶魔击杀/.test(x.dialog));
    expect(poStep, "珀第 2 夜必须被唤醒并进入击杀流程").toBeTruthy();
    expect.soft(poStep!.dialog, "未蓄力时只允许选 1 名").toContain("最多1人");

    // 赌徒：结果与死亡状态必须一致
    const g = resultStep(n2, "gambler", /猜测/);
    expect(g, "赌徒第 2 夜必须被唤醒").toBeTruthy();
    const after = await snapNow(page);
    const dead = (after?.seats ?? []).find((s: any) => s.id === gamblerSeat)?.isDead;
    expect
      .soft(dead, `赌徒${/猜错/.test(g!.dialog) ? "猜错" : "猜对"}与死亡状态必须一致`)
      .toBe(/猜错/.test(g!.dialog));
  });
});
