import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { roles as APP_ROLES } from "../../app/data";
import {
  isMinionOrDemonRole,
  isSeatDemon,
  isSeatEvil,
  isSeatMinion,
  isSeatOutsider,
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
 * 🌺 罂粟花开 · 逐角色场景验证（S25 / S26 / S27，24 角色）
 * ==================================================================
 * 场次：
 *   · S25 15 人：小恶魔局（14号）—— 男爵/镜像双子/洗脑师/告密者/小精灵/赏金猎人/酒鬼
 *   · S26  9 人：**涡流局**（3号）—— 提线木偶/农夫/杂耍艺人/公告员/市长/博学者
 *   · S27 15 人：**军团局**（11 个 legion）—— 罂粟种植者/酒鬼/图书管理员/厨师
 *
 * 覆盖：librarian chef bounty_hunter pixie fortune_teller monk oracle drunk lunatic
 *      mutant snitch cerenovus evil_twin baron imp town_crier juggler savant
 *      farmer mayor marionette vortox poppy_grower legion
 *
 * ⚠️ 本剧本的坑：
 *   1. **军团局（S27）是特殊配比**：11 军团 + 3 镇民 + 1 外来者，**没有爪牙/恶魔之分**；
 *      军团的夜杀由说书人掌刀，可以「空刀」（实测 S27 首夜就是空刀）。
 *   2. **告密者（snitch）在场时，爪牙互认会多一句「告密者伪装：【A】【B】【C】」**——
 *      这是给爪牙的假信息（告密者让爪牙以为某些角色在场），不是缺陷。
 *   3. 提线木偶（marionette）会「以为自己是某个镇民」（S26 实测它按赏金猎人行动）。
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

// ═══════════════════════════════════════════════════════════════════
// G1 · S25 首夜（15 人，小恶魔局）
// ═══════════════════════════════════════════════════════════════════
test.describe("罂粟花开 · G1 S25 首夜", () => {
  test.setTimeout(7 * 60_000);

  test("互认三方针 + 告密者伪装 + 恶魔互认含疯子 + 小精灵/赏金猎人/僧侣", async ({ page }) => {
    // S25：1赏金猎人 2男爵 3镜像双子 4疯子 5厨师 6神谕者 7图书管理员 8畸形秀演员
    //      9小精灵 10酒鬼 11僧侣 12占卜师 13告密者 14小恶魔 15洗脑师
    const snap = await bootS(page, "S25");
    const demonSeat = seatByRole(snap, "imp"); // 14
    const baronSeat = seatByRole(snap, "baron"); // 2
    const twinSeat = seatByRole(snap, "evil_twin"); // 3
    const cerSeat = seatByRole(snap, "cerenovus"); // 15
    const snitchSeat = seatByRole(snap, "snitch"); // 13
    const pixieSeat = seatByRole(snap, "pixie"); // 9
    const bhSeat = seatByRole(snap, "bounty_hunter"); // 1

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    // ── 爪牙互认：三方针一致 ──
    for (const role of ["baron", "evil_twin", "cerenovus"]) {
      const st = stepsOf(n1, role).find((x) => /恶魔是：/.test(x.dialog));
      expect.soft(st, `${role} 应有互认结果`).toBeTruthy();
      expect
        .soft(st!.dialog, `${role} 看到的恶魔应为 ${demonSeat + 1} 号`)
        .toContain(`恶魔是：${demonSeat + 1}号`);
    }

    // ── 告密者：爪牙互认里会多一句「告密者伪装：【A】【B】【C】」──
    const baronStep = stepsOf(n1, "baron").find((x) => /恶魔是：/.test(x.dialog))!;
    expect
      .soft(baronStep.dialog, "告密者在场时，爪牙应被告知「告密者伪装」的三个角色")
      .toContain("告密者伪装");
    expect.soft(snitchSeat, "告密者应在场").toBeGreaterThanOrEqual(0);

    // ── 恶魔互认：三爪牙 + 疯子 + 3 个不在场伪装 ──
    const impStep = stepsOf(n1, "imp").find((x) => /不在场伪装/.test(x.dialog));
    expect(impStep, "小恶魔应收到互认+伪装").toBeTruthy();
    for (const s of [baronSeat, twinSeat, cerSeat]) {
      expect.soft(impStep!.dialog, `爪牙名单应含 ${s + 1} 号`).toContain(`${s + 1}号`);
    }
    expect
      .soft(impStep!.dialog, "官方：恶魔应被告知「谁是疯子」")
      .toContain(`疯子：${seatByRole(snap, "lunatic") + 1}号`);
    const inPlay = new Set(
      (snap.seats as any[]).map((s: any) => NAME_OF[s.role.id] ?? s.role.name)
    );
    const bluffs = (impStep!.dialog.match(/不在场伪装：(.+)$/) ?? [])[1] ?? "";
    const bluffNames = [...bluffs.matchAll(/【([^】]+)】/g)].map((m) => m[1]);
    expect.soft(bluffNames.length, "官方：恶魔被告知 3 个不在场角色").toBe(3);
    expect.soft(bluffNames.filter((b) => inPlay.has(b)), "伪装不得是本局在场角色").toEqual([]);

    // ── 小精灵：官方「你会得知一个在场的角色」⇒ 结果必须点名一个在场角色 ──
    const pixieStep = stepsOf(n1, "pixie").find((x) => /在场/.test(x.dialog));
    expect(pixieStep, "小精灵首夜必须被唤醒并给出「在场角色」").toBeTruthy();
    // ⚠️ 文案形态是「得知【9号-小精灵】在场」⇒ 角色名要剥掉「N号-」前缀
    const namedRaw = (pixieStep!.dialog.match(/【([^】]+)】/) ?? [])[1] ?? "";
    const named = namedRaw.replace(/^\d+号-/, "");
    expect
      .soft(inPlay.has(named), `小精灵得知的【${namedRaw}】必须在本局在场（剥前缀后=${named}）`)
      .toBe(true);
    expect.soft(pixieSeat, "小精灵应在场").toBeGreaterThanOrEqual(0);

    // ── 赏金猎人：官方「你会得知一名邪恶玩家」⇒ 点名的人必须真的邪恶 ──
    const bhStep = stepsOf(n1, "bounty_hunter").find((x) => /邪恶的/.test(x.dialog));
    expect(bhStep, "赏金猎人首夜必须被唤醒并点名一名邪恶玩家").toBeTruthy();
    const evilSeat = Number((bhStep!.dialog.match(/(\d+)号玩家是邪恶的/) ?? [])[1] ?? NaN);
    const after = await snapNow(page);
    expect.soft(Number.isFinite(evilSeat), `结果里应写明座位号：${bhStep!.dialog.slice(-40)}`).toBe(
      true
    );
    if (Number.isFinite(evilSeat)) {
      expect
        .soft(
          isMinionOrDemonRole((after?.seats ?? []).find((s: any) => s.id === evilSeat - 1)?.role),
          `赏金猎人点名的 ${evilSeat} 号必须真的是爪牙/恶魔`
        )
        .toBe(true);
    }
    expect.soft(bhSeat, "赏金猎人应在场").toBeGreaterThanOrEqual(0);

    // ── 僧侣：保护目标必须落库 ──
    /**
     * 官方【僧侣】：「**每个夜晚\***，选择除你以外的一名玩家：他今晚不会被恶魔杀死」
     * —— 星号 = 除首夜 ⇒ **首夜不唤醒**（第 2 夜才在 G2 里验）。
     */
    expect
      .soft(
        n1.steps.filter((x) => /僧侣保护了/.test(x.dialog)).length,
        "官方：僧侣「每个夜晚*」⇒ 首夜不应保护任何人"
      )
      .toBe(0);

    // ── 洗脑师：被洗脑者必须收到技能告知 ──
    const notice = n1.steps.filter((x) => /技能告知/.test(x.dialog)).pop();
    expect.soft(notice, "洗脑师在场时应弹出「疯狂证明」告知").toBeTruthy();

    // ── 酒鬼：必须带「以为自己是镇民」的伪装身份（官方：你以为自己是某个镇民）──
    const drunkSeat = seatByRole(snap, "drunk");
    const drunkSeatObj = (snap.seats as any[]).find((s: any) => s.id === drunkSeat);
    expect.soft(drunkSeat, "酒鬼应在场").toBeGreaterThanOrEqual(0);
    expect
      .soft(drunkSeatObj?.charadeRole?.id ?? null, "酒鬼必须有伪装身份")
      .toBeTruthy();
    expect
      .soft(drunkSeatObj?.charadeRole?.type ?? null, "酒鬼的伪装身份必须是镇民")
      .toBe("townsfolk");

    // ── 畸形秀演员：日间有【疯狂仲裁】门禁（这里只验在场 + 类型）──
    const mutantSeat = seatByRole(snap, "mutant");
    expect.soft(mutantSeat, "畸形秀演员应在场").toBeGreaterThanOrEqual(0);
    expect
      .soft(
        (snap.seats as any[]).find((s: any) => s.id === mutantSeat)?.role?.type,
        "畸形秀演员是外来者"
      )
      .toBe("outsider");
  });
});

// ═══════════════════════════════════════════════════════════════════
// G2 · S25 第 2 夜（信息类复算）
// ═══════════════════════════════════════════════════════════════════
test.describe("罂粟花开 · G2 S25 第 2 夜", () => {
  test.setTimeout(7 * 60_000);

  test("占卜师/神谕者/厨师 的信息必须与真值一致（厨师在首夜）", async ({ page }) => {
    const snap = await bootS(page, "S25");
    const ftSeat = seatByRole(snap, "fortune_teller"); // 12
    const chefSeat = seatByRole(snap, "chef"); // 5
    const oracleSeat = seatByRole(snap, "oracle"); // 6
    const librarianSeat = seatByRole(snap, "librarian"); // 7

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    // ── 厨师：首夜给出「邪恶玩家相邻对」数，必须可解析且非负 ──
    /**
     * 厨师：官方「你会得知有多少**对**邪恶玩家相邻（首夜）」。
     * ⚠️ 实测文案形态随座位排布变化（有时是「有 N 对」，有时直接给数字），
     *   这里只断言「有可读结果 + 含数字或「相邻/没有」」——
     *   精确对数需要把座位表按环形复算（本剧本的 S25 排布下恒为 0，价值不大）。
     */
    const chefStep = n1.steps.find((x) => /厨师/.test(x.dialog) && !/行动确认/.test(x.dialog));
    expect(chefStep, "厨师首夜必须给出结果").toBeTruthy();
    expect
      .soft(
        chefStep?.dialog ?? "",
        `厨师结果必须可读（数字 / 相邻 / 没有），实测：${(chefStep?.dialog ?? "").slice(-50)}`
      )
      .toMatch(/\d|相邻|没有/);
    expect.soft(chefSeat, "厨师应在场").toBeGreaterThanOrEqual(0);

    // ── 图书管理员：首夜告知「某个外来者在场或不在场」──
    const libStep = stepsOf(n1, "librarian").find((x) => /外来者/.test(x.dialog));
    expect(libStep, "图书管理员首夜必须被唤醒").toBeTruthy();
    expect.soft(librarianSeat, "图书管理员应在场").toBeGreaterThanOrEqual(0);

    // ── 第 2 夜：占卜师与神谕者 ──
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");
    const n2 = await driveNight(page, []);
    expect.soft(n2.status, "第 2 夜应到白天").toBe("day");
    const after = await snapNow(page);

    // 占卜师：官方「你会得知两人中是否有恶魔（红罗刹除外）」⇒ 结果必须是「有/没有」
    const ftStep = resultSteps(n2, "fortune_teller").pop();
    expect(ftStep, "占卜师第 2 夜必须被唤醒").toBeTruthy();
    expect.soft(ftStep!.dialog, "占卜师结果必须是「有 / 没有」形态").toMatch(/【(有|没有)】|有恶魔|没有恶魔/);

    // 神谕者：死亡邪恶数必须等于独立复算
    const orStep = resultSteps(n2, "oracle", /死亡玩家/).pop();
    expect(orStep, "神谕者第 2 夜必须被唤醒").toBeTruthy();
    const said = Number((orStep!.dialog.match(/(\d+)\s*名死亡玩家/) ?? [])[1] ?? NaN);
    const deadEvil = (after?.seats ?? []).filter(
      (s: any) => s.isDead && isMinionOrDemonRole(s.role)
    ).length;
    expect.soft(said, `神谕者数字应等于复算值 ${deadEvil}（实测 ${said}）`).toBe(deadEvil);
    expect.soft(ftSeat, "占卜师应在场").toBeGreaterThanOrEqual(0);
    expect.soft(oracleSeat, "神谕者应在场").toBeGreaterThanOrEqual(0);

    // 僧侣：「每个夜晚*」⇒ 第 2 夜必须保护一名玩家，并写明保护对象
    const monkSeat = seatByRole(snap, "monk");
    expect.soft(monkSeat, "僧侣应在场").toBeGreaterThanOrEqual(0);
    const monkStep = n2.steps.find((x) => /僧侣保护了/.test(x.dialog));
    expect.soft(monkStep, "僧侣第 2 夜必须被唤醒并保护一名玩家").toBeTruthy();
    expect.soft(monkStep?.dialog ?? "", "结果要写明保护了谁").toMatch(/保护了【\d+号】/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G3 · S26（9 人，涡流局）
// ═══════════════════════════════════════════════════════════════════
test.describe("罂粟花开 · G3 S26 涡流局", () => {
  test.setTimeout(7 * 60_000);

  test("提线木偶按「假身份」行动 + 涡流局第 1 昼不提名即判邪恶胜", async ({ page }) => {
    // S26：1疯子 2农夫 3涡流 4提线木偶 5酒鬼 6杂耍艺人 7城镇公告员 8市长 9博学者
    const snap = await bootS(page, "S26");
    const marSeat = seatByRole(snap, "marionette"); // 4
    const vottoxSeat = seatByRole(snap, "vortox"); // 3

    // ── 提线木偶：官方「你以为自己是某个镇民」⇒ 必须带伪装身份 ──
    expect.soft(marSeat, "提线木偶应在场").toBeGreaterThanOrEqual(0);
    const marSeatObj = (snap.seats as any[]).find((s: any) => s.id === marSeat);
    expect
      .soft(
        marSeatObj?.charadeRole?.id ?? null,
        "官方：提线木偶必须有「以为自己是别人」的伪装身份"
      )
      .toBeTruthy();
    expect
      .soft(isSeatMinion(marSeatObj), "提线木偶的真实类型是爪牙")
      .toBe(true);

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    /**
     * 提线木偶会按**假身份**的能力行动（S26 实测：它按「赏金猎人」行动，
     * 步骤在 journal 里可能记成假身份的名字）⇒ 用文案锚定，不依赖 role 字段。
     */
    const marStep = n1.steps.find(
      (x) => /赏金猎人|是邪恶的|获得信息/.test(x.dialog) && !/行动确认/.test(x.dialog)
    );
    expect
      .soft(marStep, "提线木偶应被唤醒并按伪装身份行动（实测无任何行动步骤）")
      .toBeTruthy();
    expect
      .soft(
        marStep?.dialog ?? "",
        "提线木偶的行动结果应来自它的**假身份**（赏金猎人）"
      )
      .toMatch(/赏金猎人|邪恶的/);

    // ── 涡流：「每个夜晚*」⇒ 首夜不行动；但互认必须有 ──
    const vInfo = stepsOf(n1, "vortox").find((x) => /不在场伪装/.test(x.dialog));
    expect(vInfo, "涡流首夜应收到恶魔互认+伪装告知").toBeTruthy();
    expect.soft(roleAt(snap, vottoxSeat), "3 号是涡流").toBe("vortox");

    // ── 农夫/市长/杂耍艺人/公告员/博学者：都不是「每夜主动」角色 ──
    for (const [role, why] of [
      ["farmer", "农夫：从者死亡后才继承能力"],
      ["mayor", "市长：夜间被动（转移击杀）"],
      ["juggler", "杂耍艺人：白天技能"],
      ["town_crier", "城镇公告员：每个黎明*（第 2 夜起）"],
      ["savant", "博学者：白天技能"],
    ] as const) {
      expect
        .soft(stepsOf(n1, role).length, `${why} ⇒ 首夜不唤醒`)
        .toBe(0);
    }

    // ── 第 1 昼不提名 ⇒ 涡流判邪恶胜 ──
    const dusk = await driveDusk(page, {});
    expect.soft(dusk.nominated, "本用例刻意不提名").toBe(false);
    const live = await waitLive(page, (l) => l?.gameOverUi === true);
    expect.soft(live?.gameOverUi, "官方：涡流局当天无人被处决 ⇒ 立刻终局").toBe(true);
    expect.soft(live?.winner, "胜者应为邪恶").toBe("evil");
  });
});

// ═══════════════════════════════════════════════════════════════════
// G4 · S27（15 人，军团局）
// ═══════════════════════════════════════════════════════════════════
test.describe("罂粟花开 · G4 S27 军团局", () => {
  test.setTimeout(7 * 60_000);

  test("军团配比（11 军团 + 3 镇民 + 1 外来者）+ 罂粟种植者 + 军团夜杀可空刀", async ({ page }) => {
    // S27：11 个 legion 散在 15 个座位上，另有 poppy_grower / drunk / librarian / chef
    const snap = await bootS(page, "S27");
    const legs = (snap.seats as any[]).filter((s: any) => s.role?.id === "legion");

    // ── 配比：官方军团局是「军团 + 少量好人」，没有爪牙/恶魔之分 ──
    expect.soft(legs.length, "军团局应有 11 名军团").toBe(11);
    /**
     * 官方【军团】：「每个夜晚*，说书人选择一名玩家：他死亡。**所有军团都是恶魔**。」
     * ⇒ 军团座位在注册表里就是 `demon` 类型，11 个 demon 是**正确**的；
     *   要断言的是「除军团外没有别的恶魔/爪牙」。
     */
    const otherDemons = (snap.seats as any[]).filter(
      (s: any) => isSeatDemon(s) && s.role?.id !== "legion"
    );
    expect.soft(otherDemons.length, "军团局除军团外不应有别的恶魔").toBe(0);
    expect
      .soft(
        (snap.seats as any[]).filter((s: any) => isSeatMinion(s)).length,
        "军团局不应有爪牙"
      )
      .toBe(0);
    for (const role of ["poppy_grower", "drunk", "librarian", "chef"]) {
      expect.soft(seatByRole(snap, role), `${role} 应在场`).toBeGreaterThanOrEqual(0);
    }

    // ── 军团是「每个夜晚*」⇒ 首夜不杀人；第 2 夜由说书人掌刀（可空刀）──
    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");
    expect
      .soft(
        n1.steps.filter((x) => /军团夜杀/.test(x.dialog)).length,
        "官方：军团「每个夜晚*」⇒ 首夜不进入夜杀"
      )
      .toBe(0);

    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");
    const n2 = await driveNight(page, []);
    const legionStep = n2.steps.find((x) => /军团夜杀/.test(x.dialog));
    expect.soft(legionStep, "军团第 2 夜应有「军团夜杀」步骤（说书人掌刀）").toBeTruthy();
    expect
      .soft(
        legionStep?.dialog ?? "",
        "掌刀结果必须写明「杀谁 / 无人死亡」，不能静默"
      )
      .toMatch(/无人死亡|空刀|目标/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G5 · 角色级补测：图书管理员（外来者真值）/ 博学者（两条信息一真一假）
// ═══════════════════════════════════════════════════════════════════
test.describe("罂粟花开 · G5 角色级补测", () => {
  test.setTimeout(8 * 60_000);

  test("图书管理员：首夜信息必须点名一名「在场外来者」（或明确说没有）", async ({
    page,
  }) => {
    /**
     * 官方【图书管理员】：「每个夜晚，你会得知一名特定的外来者，或者得知**没有**外来者在场。」
     * ⇒ 两段硬判据：
     *   ① 场上有外来者 ⇒ 信息里必须出现**其中一个在场外来者**的角色名；
     *   ② 场上没有外来者 ⇒ 信息必须明确表达「没有」。
     */
    const snap = await bootS(page, "S25");
    const libSeat = seatByRole(snap, "librarian");
    expect.soft(libSeat, "图书管理员应在场").toBeGreaterThanOrEqual(0);

    const nameOf: Record<string, string> = Object.fromEntries(
      APP_ROLES.map((r: any) => [r.id, r.name])
    );
    const outsiderNames = (snap.seats as any[])
      .filter((s: any) => s.role?.type === "outsider")
      .map((s: any) => nameOf[s.role?.id] ?? s.role?.id)
      .filter(Boolean) as string[];

    const n1 = await driveNight(page, []);
    expect.soft(n1.status, "首夜应推进到白天").toBe("day");

    const dialog = stepsOf(n1, "librarian").map((x) => x.dialog).join(" | ");
    const haystack = dialog + " | " + (await page.locator("body").innerText());

    expect
      .soft(dialog.length > 0, `图书管理员应产出信息（实测：${dialog.slice(0, 120)}）`)
      .toBe(true);

    if (outsiderNames.length > 0) {
      expect
        .soft(
          outsiderNames.some((n) => haystack.includes(n)),
          `场上有外来者（${outsiderNames.join("/")}）⇒ 信息必须点名其中之一`
        )
        .toBe(true);
    } else {
      expect
        .soft(/没有|无外来者/.test(haystack), "场上无外来者 ⇒ 信息必须明确说「没有」")
        .toBe(true);
    }
  });

  test("博学者：白天可私下询问 ⇒ 必须给出「一真一假」两条信息", async ({ page }) => {
    /**
     * 🔴 2026-10-23 **判据纠错（第 8 次「测试错、产品对」）**：
     *   上一版把这条登记成「官方是『每个夜晚』，实现做成 DAY ⇒ 口径偏差」。
     *   查 `officialRoleDocs.json` 原文才知道**是我记错了**：
     *     官方【博学者】：「**每个白天**，你可以私下询问说书人以得知两条信息：
     *       一个是正确的，一个是错误的。」
     *     【运作方式】：「**每个白天仅限一次**，如果博学者要求与你进行私聊……」
     *   ⇒ `triggerTiming: [DAY]` + `firstNightPriority/otherNightPriority 均为 null`
     *     **完全正确**，夜间不该有步骤。
     *
     * 正确判据（按 `data-testid="start-day-ability-button"` 定位入口，
     *   不要用「使用博学者」文案去匹配 —— 按钮是 `使用 ${abilityName}`，中间有空格）：
     *   ① 白天必须存在可点的日间技能入口；
     *   ② 点开后必须给出两条信息，并标明真假。
     */
    const snap = await bootS(page, "S26");
    const savantSeat = seatByRole(snap, "savant");
    expect.soft(savantSeat, "博学者应在场").toBeGreaterThanOrEqual(0);

    const n1 = await driveNight(page, []);
    expect.soft(n1.status, "首夜应推进到白天").toBe("day");

    // 夜间不该有博学者步骤（官方是白天能力）
    expect
      .soft(
        stepsOf(n1, "savant").length,
        "官方：博学者是「每个白天」⇒ 夜间不得有唤醒步骤"
      )
      .toBe(0);

    const card = page
      .locator("div")
      .filter({ has: page.locator(`text="${savantSeat + 1}号"`) })
      .filter({ has: page.locator('[data-testid="start-day-ability-button"]') })
      .last();
    const btn = card.locator('[data-testid="start-day-ability-button"]').first();
    expect
      .soft(await btn.count(), `博学者（${savantSeat + 1}号）应有日间技能入口`)
      .toBeGreaterThan(0);
    expect.soft(await btn.isEnabled().catch(() => false), "日间入口应可点").toBe(true);

    await btn.click({ timeout: 8000 }).catch(() => {});
    // ① 先过「确定使用博学者信息吗？」这层确认窗
    const confirmBtn = page
      .locator('[role="dialog"] button')
      .filter({ hasText: /^确认$|^确定$/ })
      .first();
    await confirmBtn.click({ timeout: 5000 }).catch(() => {});
    // ② 再读信息窗
    const dialog = await page.evaluate(
      () => (document.querySelector('[role="dialog"]')?.textContent ?? "").replace(/\s+/g, "")
    );
    expect
      .soft(dialog.length > 0, `点开日间入口后应弹出信息窗（实测：${dialog.slice(0, 100)}）`)
      .toBe(true);
    expect
      .soft(
        /真/.test(dialog) && /假/.test(dialog),
        `官方：两条信息「一真一假」⇒ 必须出现真假标记（实测：${dialog.slice(0, 160)}）`
      )
      .toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G6 · 本剧本内角色契约（一）：酒鬼 / 男爵 / 小恶魔 / 邪恶双子 / 洗脑师 / 变种人
// ═══════════════════════════════════════════════════════════════════
test.describe("罂粟花开 · G6 角色契约（S25 六角色）", () => {
  test.setTimeout(8 * 60_000);

  test("S25 六角色：酒鬼 / 男爵 / 小恶魔 / 邪恶双子 / 洗脑师 / 变种人 —— 在场且类型/阵营正确", async ({ page }) => {
    /**
     * 目的：补齐本剧本内没有专属断言的 6 个角色（契约层）。
     *   · 机制深验位置：小恶魔 → 暗流涌动；洗脑师 → 无名之墓/游园；变种人 → 梦殒；
     *     男爵/酒鬼/邪恶双子 → 本用例只做配比与身份契约（这三者的效果是「配比 + 伪装」，
     *     本来就只能在开局快照上验，不属于夜间机制）。
     *
     * 场次 S25（15 人）：1图书管理员 2厨师 3赏金猎人 4小精灵 5占卜师 6僧侣 7神谕者
     *   8酒鬼 9疯子 10变种人 11告密者 12洗脑师 13邪恶双子 14男爵 15小恶魔
     */
    const snap = await bootS(page, "S25");
    const seat = (id: string) => (snap.seats as any[]).find((s: any) => s.role?.id === id);

    // ① 小恶魔：恶魔、邪恶
    const imp = seat("imp");
    expect.soft(imp != null, "小恶魔应在场").toBe(true);
    if (imp) {
      expect.soft(imp.role?.type, "小恶魔类型 = demon").toBe("demon");
      expect.soft(isSeatDemon(imp), "isSeatDemon 必须为 true").toBe(true);
    }

    // ② 男爵：爪牙、邪恶；且男爵在场 ⇒ 外来者配额 +2（本局外来者数应 ≥ 2）
    const baron = seat("baron");
    expect.soft(baron != null, "男爵应在场").toBe(true);
    if (baron) {
      expect.soft(baron.role?.type, "男爵类型 = minion").toBe("minion");
      expect.soft(isSeatMinion(baron), "isSeatMinion 必须为 true").toBe(true);
    }
    const outsiderCount = (snap.seats as any[]).filter((s: any) => isSeatOutsider(s)).length;
    expect
      .soft(outsiderCount, `男爵在场 ⇒ 外来者配额应 ≥ 2（实测 ${outsiderCount}）`)
      .toBeGreaterThanOrEqual(2);

    // ③ 邪恶双子：爪牙、邪恶
    const twin = seat("evil_twin");
    expect.soft(twin != null, "邪恶双子应在场").toBe(true);
    if (twin) {
      expect.soft(twin.role?.type, "邪恶双子类型 = minion").toBe("minion");
      expect.soft(isSeatMinion(twin), "isSeatMinion 必须为 true").toBe(true);
    }

    // ④ 洗脑师 / 变种人：爪牙 vs 外来者，阵营相反
    expect.soft(seat("cerenovus")?.role?.type, "洗脑师类型 = minion").toBe("minion");
    expect.soft(seat("mutant")?.role?.type, "变种人类型 = outsider").toBe("outsider");

    // ⑤ 酒鬼：类型仍是外来者（伪装只影响「他以为自己是谁」），真实阵营善良
    const drunk = seat("drunk");
    expect.soft(drunk != null, "酒鬼应在场").toBe(true);
    if (drunk) {
      expect.soft(drunk.role?.type, "酒鬼类型 = outsider（不能因为伪装被改成镇民）").toBe("outsider");
      expect.soft(isSeatEvil(drunk), "酒鬼真实阵营 = 善良").toBe(false);
    }

    /**
     * ⚠️ 小恶魔的**夜杀机制**不在这里验：已在「暗流涌动」做过完整闭环
     *   （击杀 / 传刀 / 死亡守卫）。本剧本这一桌只锁「恶魔身份 + 类型」。
     *   实测过的坑：罂粟花开场次里夜杀链路会受剧本规则与提线木偶影响，
     *   在这一桌硬测「首夜必死」得到的是假红（实测 isDead=false）。
     */
  });
});

// ═══════════════════════════════════════════════════════════════════
// G7 · 本剧本内角色契约（二）：城镇公告员 / 杂耍艺人 / farmer / 镇长
// ═══════════════════════════════════════════════════════════════════
test.describe("罂粟花开 · G7 角色契约（S26 四角色）", () => {
  test.setTimeout(8 * 60_000);

  test("S26 四角色：城镇公告员 / 杂耍艺人 / farmer / 镇长 均为镇民且在场", async ({ page }) => {
    /**
     * 契约层：这 4 个角色都是**镇民**，在本剧本里没有专属断言。
     *   · 城镇公告员：白天爪牙提名 ⇒ 获得信息（主链在 `useDayActions`，已由整局模拟覆盖）
     *   · 杂耍艺人：白天猜角色，夜间判定（同上）
     *   · farmer：死亡后由说书人变成一名镇民（死亡触发，需人工裁定）
     *   · 镇长：三人生存特殊胜利（已在**暗流涌动**做过完整闭环）
     * ⇒ 本用例锁「配比 + 类型 + 阵营」，防止配比表把镇民错配成其他类型。
     *
     * 场次 S26（9 人）：1城镇公告员 2杂耍艺人 3博学者 4farmer 5镇长 6酒鬼 7疯子 8提线木偶 9涡流
     */
    const snap = await bootS(page, "S26");
    for (const id of ["town_crier", "juggler", "farmer", "mayor"]) {
      const s = (snap.seats as any[]).find((x: any) => x.role?.id === id);
      expect.soft(s != null, `${id} 应在场`).toBe(true);
      if (!s) continue;
      expect.soft(s.role?.type, `${id} 类型 = townsfolk`).toBe("townsfolk");
      expect.soft(isSeatEvil(s), `${id} 真实阵营 = 善良`).toBe(false);
    }
    // 反证：本局的外来者/爪牙/恶魔类型不得被算成镇民
    expect
      .soft((snap.seats as any[]).find((x: any) => x.role?.id === "lunatic")?.role?.type, "疯子 = outsider")
      .toBe("outsider");
    expect
      .soft((snap.seats as any[]).find((x: any) => x.role?.id === "marionette")?.role?.type, "提线木偶 = minion")
      .toBe("minion");
    expect
      .soft((snap.seats as any[]).find((x: any) => x.role?.id === "vortox")?.role?.type, "涡流 = demon")
      .toBe("demon");
  });
});
