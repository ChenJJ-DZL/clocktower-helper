import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { roles as APP_ROLES } from "../../app/data";
import { isMinionOrDemonRole, isSeatDemon } from "../../src/utils/seatAlignment";
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
 * 🎭 窃窃私语 · 逐角色场景验证（S11 / S12 / S13，19 角色）
 * ==================================================================
 * 场次（`outputs/scenes.json`）：
 *   · S11 12 人：涡流局（vortox），含女巫 / 艺术家 / 间谍
 *   · S12  9 人：珀（po）局，含弄臣 / 政客 / 瘟疫医生 / 刺客
 *   · S13 12 人：僵怖（zombuul）局，含魔鬼代言人 / 间谍 / 圣徒 / 陌客
 *
 * 覆盖的 19 个角色：
 *   侍女、造谣者、神谕者、数学家、艺术家、卖花女孩、旅店老板、圣徒、陌客、
 *   间谍、女巫、涡流、弄臣、政客、瘟疫医生、刺客、珀、魔鬼代言人、僵怖
 *
 * 本剧本的**特殊之处**（写用例时踩到的）：
 *   · **涡流世界**：全部镇民信息必须为假（哪怕醉/毒）。验证方式不靠「比对上一次结果」，
 *     而是**挑两个当夜必定没有任何夜间能力的座位**（圣徒/陌客），
 *     真值必然是 0 ⇒ 报出非 0 就说明强制取假成立；
 *   · **僵硬/僵怖**：今天白天没人死亡才杀人（白天处决过的夜晚不杀）；
 *   · **珀**：官方「平时选 1 名；上次未选任何人时可选 3 名」；
 *   · **魔鬼代言人**：目标「与上个夜晚不同」，且次日被处决不死；
 *   · **艺术家 / 造谣者**是**日间技能**：入口是「使用 艺术家 / 使用 造谣者」
 *     （注意中间有空格，正则要写 `使用\s*艺术家`），点完先弹「确定使用…吗」，再弹真正的表单。
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

/** 取某角色最后一个「结果」步骤 */
function resultStep(report: NightReport, role: string) {
  const all = stepsOf(report, role);
  return all.find((x) => /结果|获得信息/.test(x.dialog)) ?? all[all.length - 1];
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

/** 读当前活终态（终局不落快照） */
async function waitLive(page: Page, pred: (l: any) => boolean, ms = 12_000): Promise<any | null> {
  const deadline = Date.now() + ms;
  let last: any = null;
  while (Date.now() < deadline) {
    last = await readLiveEndState(page);
    if (last && pred(last)) return last;
    await page.waitForTimeout(150);
  }
  return last;
}

/** 点日间技能入口 → 过「确定使用…吗」这一层 → 返回真正的表单弹窗是否出现 */
async function openDayAbility(page: Page, entry: RegExp): Promise<boolean> {
  const btn = page.locator("button").filter({ hasText: entry }).first();
  if ((await btn.count()) === 0) return false;
  await btn.click({ timeout: 10_000 });
  const confirm = page.locator('[role="dialog"] button').filter({ hasText: /^确认$/ }).first();
  if ((await confirm.count()) === 0) return false;
  await confirm.click({ timeout: 8_000 });
  // ⚠️ 不许「点击后盲等」（`e2e_wait_pattern_guard` 棘轮）：改成等**表单本身**出现
  await page
    .locator('[role="dialog"] textarea')
    .first()
    .waitFor({ state: "visible", timeout: 5_000 })
    .catch(() => {});
  return (await page.locator('[role="dialog"] textarea').count()) > 0;
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

// ═══════════════════════════════════════════════════════════════════
// G1 · S13 首夜：侍女 / 间谍 / 魔鬼代言人 / 爪牙互认 / 圣徒·陌客注册
// ═══════════════════════════════════════════════════════════════════
test.describe("窃窃私语 · G1 S13 首夜", () => {
  test.setTimeout(6 * 60_000);

  test("S13 首夜：侍女真值 + 间谍魔典真值 + 魔鬼代言人 + 爪牙互认 + 注册面板", async ({
    page,
  }) => {
    // S13：1僵怖 2艺术家 3神谕者 4数学家 5旅店老板 6圣徒 7造谣者 8陌客 9侍女 10间谍 11魔鬼代言人 12卖花女孩
    const snap = await bootS(page, "S13");
    const cmSeat = seatByRole(snap, "chambermaid"); // 9 号
    const saintSeat = seatByRole(snap, "saint"); // 6 号
    const recluseSeat = seatByRole(snap, "recluse"); // 8 号
    const spySeat = seatByRole(snap, "spy"); // 10 号
    const daSeat = seatByRole(snap, "devils_advocate"); // 11 号
    const demonSeat = seatByRole(snap, "zombuul"); // 1 号

    // ── 侍女：查「圣徒 + 陌客」（这两个座位当夜**没有任何夜间能力**）⇒ 真值必为 0 ──
    const n1 = await driveNight(page, [
      {
        role: "chambermaid",
        targets: [saintSeat + 1, recluseSeat + 1],
        note: "查两个无夜能力的座位",
      },
      { role: "devils_advocate", targets: [2], note: "保护 2 号" },
    ]);
    expect(n1.status, "首夜应推进到白天").toBe("day");

    const cm = resultStep(n1, "chambermaid");
    expect(cm, "侍女首夜必须被唤醒").toBeTruthy();
    expect(
      cm!.dialog,
      `侍女结果里必须点出实际选中的两个座位（${saintSeat + 1}号、${recluseSeat + 1}号）`
    ).toContain(`查验${saintSeat + 1}号、${recluseSeat + 1}号`);
    const cmNum = Number((cm!.dialog.match(/(\d+)\s*人被唤醒/) ?? [])[1] ?? NaN);
    expect
      .soft(
        cmNum,
        "圣徒/陌客当夜都没有夜间能力被唤醒 ⇒ 侍女必须答 0（非涡流局）"
      )
      .toBe(0);
    expect.soft(cmSeat, "侍女座位应在场").toBeGreaterThanOrEqual(0);

    // ── 间谍：魔典必须按真值列出全部 12 个座位 ──
    const spySteps = stepsOf(n1, "spy");
    const grimoire = spySteps.map((x) => x.dialog).join("|");
    expect(spySteps.length, "间谍首夜必须能看魔典").toBeGreaterThan(0);
    const wrong: string[] = [];
    for (const s of snap.seats as any[]) {
      const name = NAME_OF[s.role.id] ?? s.role.name ?? s.role.id;
      // 魔典每格形如「3神谕者镇民」「10间谍爪牙」
      if (!grimoire.includes(`${s.id + 1}${name}`)) wrong.push(`${s.id + 1}号=${name}`);
    }
    expect.soft(wrong, `魔典里的座位角色必须与真值一致；缺失/错误：${wrong.join(",")}`).toEqual(
      []
    );

    // ── 魔鬼代言人：保护 2 号，结果文案必须点名 ──
    // ⚠️ 不能用 resultStep：爪牙也会走一步「-结果」（互认），那句没有保护对象
    const da = stepsOf(n1, "devils_advocate").find((x) => /保护了/.test(x.dialog));
    expect(da, "魔鬼代言人首夜必须被唤醒并给出保护结果").toBeTruthy();
    expect.soft(da!.dialog, "结果必须写明保护的是 2 号").toContain("保护了2号");
    expect.soft(daSeat, "魔鬼代言人座位应在场").toBeGreaterThanOrEqual(0);

    // ── 爪牙互认：两名爪牙各自看到的恶魔座位必须一致且正确 ──
    const spyMinion = stepsOf(n1, "spy").find((x) => /恶魔是：/.test(x.dialog));
    const daMinion = stepsOf(n1, "devils_advocate").find((x) => /恶魔是：/.test(x.dialog));
    expect(spyMinion, "间谍应有爪牙互认结果").toBeTruthy();
    expect(daMinion, "魔鬼代言人应有爪牙互认结果").toBeTruthy();
    expect.soft(spyMinion!.dialog, "间谍被告知的恶魔座位").toContain(`恶魔是：${demonSeat + 1}号`);
    expect.soft(daMinion!.dialog, "魔鬼代言人被告知的恶魔座位").toContain(
      `恶魔是：${demonSeat + 1}号`
    );
    expect.soft(spyMinion!.dialog, "间谍的爪牙队友应是魔鬼代言人").toContain(
      `${daSeat + 1}号`
    );
    expect.soft(daMinion!.dialog, "魔鬼代言人的爪牙队友应是间谍").toContain(
      `${spySeat + 1}号`
    );

    // ── 恶魔互认：3 个「不在场伪装」都不得是本局真实在场的角色 ──
    // ⚠️ 「伪装」二字在**行动确认**里也有（「恶魔爪牙互认与伪装角色告知」）⇒ 必须锚定「不在场伪装」
    const demonStep = stepsOf(n1, "zombuul").find((x) => /不在场伪装/.test(x.dialog));
    expect(demonStep, "恶魔应有互认+伪装告知").toBeTruthy();
    const bluffs = (demonStep!.dialog.match(/【([^】]+)】/g) ?? []).map((x) =>
      x.replace(/[【】]/g, "")
    );
    expect.soft(bluffs.length, "官方：恶魔应被告知 3 个不在场角色作为伪装").toBe(3);
    const inPlayNames = new Set(
      (snap.seats as any[]).map((s: any) => NAME_OF[s.role.id] ?? s.role.name)
    );
    const badBluff = bluffs.filter((b) => inPlayNames.has(b));
    expect.soft(badBluff, `伪装角色不得是本局在场角色；冲突：${badBluff.join(",")}`).toEqual([]);
    expect.soft(demonStep!.dialog, "恶魔互认应列出两名爪牙").toContain(`${daSeat + 1}号`);

    // ── 圣徒 / 陌客：官方「可能被当作邪恶」是**登记视图**，不得改写座位真值 ──
    const after = await snapNow(page);
    expect.soft(roleAt(after, saintSeat), "圣徒真值不变").toBe("saint");
    expect.soft(roleAt(after, recluseSeat), "陌客真值不变").toBe("recluse");
    expect
      .soft(
        (after?.seats ?? []).find((s: any) => s.id === recluseSeat)?.role?.type,
        "陌客类型仍是外来者"
      )
      .toBe("outsider");
    const panel = await page.evaluate(() =>
      (document.body.innerText || "").replace(/\s+/g, "")
    );
    expect
      .soft(panel, "说书人面板应能对陌客做阵营注册（视图）")
      .toContain(`${recluseSeat + 1}号-陌客当前注册为`);
    expect
      .soft(panel, "说书人面板应能对间谍做阵营注册（视图）")
      .toContain(`${spySeat + 1}号-间谍当前注册为`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G2 · S13 第 2 夜：旅店老板 / 僵怖 / 卖花女孩 / 神谕者 / 数学家
// ═══════════════════════════════════════════════════════════════════
test.describe("窃窃私语 · G2 S13 第 2 夜", () => {
  test.setTimeout(6 * 60_000);

  test("旅店老板两人当夜都不死 + 恰好一人醉酒 + 僵怖击杀被挡 + 卖花女孩/神谕者真值", async ({
    page,
  }) => {
    const snap = await bootS(page, "S13");
    const innSeat = seatByRole(snap, "innkeeper"); // 5
    const zombSeat = seatByRole(snap, "zombuul"); // 1
    // 用两个「不是被测对象」的座位做保护目标
    const guardA = 2; // 2 号艺术家
    // ⚠️ 不能选 12 号卖花女孩当保护对象：旅店老板会让两人之一**醉酒**
    //   ⇒ 若醉的是卖花女孩，她的信息会变成「内容由说书人裁定」，
    //   下面那条「必须答没有投过票」会假红（实测踩过）。
    const guardB = 6; // 6 号圣徒（无夜间能力，当保护对象最干净）

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    // 第 1 昼：不提名 → 直接入夜（今天无人被处决、无人死亡 ⇒ 僵怖当晚可以杀人）
    const dusk1 = await driveDusk(page, {});
    expect(dusk1.status, "第 1 昼应能直接入夜").toBe("night");
    expect(dusk1.nominated, "本用例不需要提名").toBe(false);

    // 第 2 夜：旅店老板保护 2/12，僵怖攻击 2 号
    const n2 = await driveNight(page, [
      { role: "innkeeper", targets: [guardA, guardB], note: "保护 2/12" },
      { role: "zombuul", targets: [guardA], note: "攻击被保护者" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    const after = await snapNow(page);
    const seat = (id: number) => (after?.seats ?? []).find((s: any) => s.id === id);

    // ── 旅店老板：官方「他们当晚都不会死亡，但其中一人会醉酒」──
    const inn = resultStep(n2, "innkeeper");
    expect(inn, "旅店老板第 2 夜必须被唤醒").toBeTruthy();
    expect.soft(roleAt(after, guardA - 1), "被保护者（2 号）角色不变").toBe("artist");
    expect.soft(seat(guardA - 1)?.isDead, "被保护者不得死亡").toBeFalsy();
    const drunkSeats = [guardA, guardB].filter((id) => seat(id - 1)?.isDrunk === true);
    expect.soft(drunkSeats.length, "旅店老板的两人中必须恰好 1 人醉酒").toBe(1);

    // ── 僵怖：攻击确实落在 2 号，但 2 号没死（= 被旅店老板挡下）──
    //   ⚠️ 观察（UI 缺口，未断言）：被挡下时结果弹窗只写「僵怖发动能力目标2号」，
    //   **没有**「受到保护 / 未死亡」之类的留痕 ⇒ 说书人看不出「为什么没死人」。
    //   这里只断言可验证的事实：攻击目标正确 + 目标活着。
    const zomb = stepsOf(n2, "zombuul").find((x) => /目标\d+号/.test(x.dialog));
    expect(zomb, "僵怖第 2 夜必须被唤醒（今天白天没人死亡）").toBeTruthy();
    expect.soft(zomb!.dialog, `僵怖的攻击目标应为 ${guardA} 号`).toContain(
      `目标${guardA}号`
    );
    expect
      .soft(seat(guardA - 1)?.isDead, "僵怖的攻击被旅店老板挡下 ⇒ 2 号不得死亡")
      .toBeFalsy();
    expect.soft(zombSeat, "僵怖座位应在场").toBeGreaterThanOrEqual(0);

    // ── 卖花女孩：今天没有任何提名 ⇒ 没有投票 ⇒ 必须答「没有」 ──
    const fg = resultStep(n2, "flowergirl");
    expect(fg, "卖花女孩第 2 夜必须被唤醒").toBeTruthy();
    expect
      .soft(
        fg!.dialog.includes("没有投过票"),
        `今天无人提名（无投票）⇒ 必须答「恶魔今天没有投过票」，实测：${fg!.dialog.slice(-40)}`
      )
      .toBe(true);

    // ── 神谕者：0 名死亡 ⇒ 必须答 0，且与独立复算一致 ──
    const orc = resultStep(n2, "oracle");
    expect(orc, "神谕者第 2 夜必须被唤醒").toBeTruthy();
    const orcNum = Number((orc!.dialog.match(/(\d+)\s*名死亡玩家/) ?? [])[1] ?? NaN);
    const deadEvil = (after?.seats ?? []).filter(
      (s: any) => s.isDead && isMinionOrDemonRole(s.role)
    ).length;
    expect.soft(orcNum, "神谕者数字必须等于「死亡且邪恶」的独立复算值").toBe(deadEvil);
    expect.soft(deadEvil, "本局第 2 夜前应无死亡").toBe(0);

    // ── 数学家：必须被唤醒且给出可解析的数字 ──
    const math = resultStep(n2, "mathematician");
    expect(math, "数学家每夜都应被唤醒").toBeTruthy();
    const mathNum = Number((math!.dialog.match(/(\d+)/) ?? [])[1] ?? NaN);
    expect.soft(Number.isFinite(mathNum) && mathNum >= 0, "数学家的结果必须是非负整数").toBe(
      true
    );
    expect
      .soft(math!.dialog, "非涡流局不得出现「信息必定错误」的涡流提示")
      .not.toContain("涡流在场");
  });
});

// ═══════════════════════════════════════════════════════════════════
// G3 · 涡流契约（S11）：镇民信息必假 —— 用「真值可独立推出」的三种情况验证
// ═══════════════════════════════════════════════════════════════════
test.describe("窃窃私语 · G3 涡流强制假信息", () => {
  test.setTimeout(6 * 60_000);

  test("S11 涡流局：侍女信息被强制取假 + 数学家必须明示「信息必定错误」+ night* 角色首夜不唤醒", async ({
    page,
  }) => {
    /**
     * 涡流契约的验证方式：**不比对上一次结果**，而是挑「当夜必无夜间能力」的座位，
     * 让真值可以独立推出（= 0）⇒ 报出非 0 就证明强制取假成立。
     *
     * ⚠️ 为什么本用例只覆盖首夜：
     *   涡流还有一条「白天无人被处决 ⇒ 邪恶获胜」，本轮已修到「黄昏→入夜」的收口点
     *   （见 G5），因此**第 1 昼必须真的处决掉一个人**才能进第 2 夜；
     *   而本剧本（12 人）的投票弹窗在本驱动器里点不动（票数恒 0，见 §17.3 备注），
     *   拿不到处决 ⇒ 进不了第 2 夜。
     *   ⇒ 卖花女孩/神谕者的「涡流反转」改由两处证据覆盖：
     *     ① 契约单测 `vortox_info_contract`；
     *     ② 本轮探针实测（S11 第 2 夜：今天无人投票却报「恶魔投过票」、0 死亡却报「2 名」，
     *        同处境在非涡流的 S13 报的是真值）—— 证据留在 §17.6。
     */
    const snap = await bootS(page, "S11");
    const saintSeat = seatByRole(snap, "saint"); // 2
    const recluseSeat = seatByRole(snap, "recluse"); // 4

    const n1 = await driveNight(page, [
      {
        role: "chambermaid",
        targets: [saintSeat + 1, recluseSeat + 1],
        note: "查两个无夜能力的座位",
      },
    ]);
    expect(n1.status, "首夜应到白天").toBe("day");

    // ── 侍女：真值必为 0 ⇒ 涡流世界必须报非 0 ──
    const cm = resultStep(n1, "chambermaid");
    expect(cm, "侍女必须被唤醒").toBeTruthy();
    const cmNum = Number((cm!.dialog.match(/(\d+)\s*人被唤醒/) ?? [])[1] ?? NaN);
    expect
      .soft(
        cmNum !== 0,
        `涡流世界：圣徒/陌客当夜都没被唤醒（真值 0）⇒ 报出的必须是假值（≠0），实测 ${cmNum}`
      )
      .toBe(true);

    // ── 数学家：确认窗必须明示「信息必定错误」 ──
    const mathStep = stepsOf(n1, "mathematician").find((x) => /行动确认/.test(x.dialog));
    expect(mathStep, "数学家应有行动确认步骤").toBeTruthy();
    expect
      .soft(mathStep!.dialog, "涡流世界必须在确认窗上明示「信息必定错误」")
      .toContain("涡流在场");

    // ── night* 语义：卖花女孩/神谕者「每个夜晚*」⇒ 首夜不得被唤醒 ──
    expect
      .soft(stepsOf(n1, "flowergirl").length, "官方：卖花女孩是「每个夜晚*」⇒ 首夜不唤醒")
      .toBe(0);
    expect
      .soft(stepsOf(n1, "oracle").length, "官方：神谕者是「每个夜晚*」⇒ 首夜不唤醒")
      .toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G4 · S11 女巫：被诅咒者次日发起提名即死
// ═══════════════════════════════════════════════════════════════════
test.describe("窃窃私语 · G4 女巫魔咒", () => {
  test.setTimeout(6 * 60_000);

  test("女巫夜里点名诅咒目标（弹窗落点正确）", async ({ page }) => {
    const snap = await bootS(page, "S11");
    const witchSeat = seatByRole(snap, "witch"); // 10
    const cursed = 3; // 3 号旅店老板

    const n1 = await driveNight(page, [
      { role: "witch", targets: [cursed], note: "诅咒 3 号" },
    ]);
    expect(n1.status, "首夜应到白天").toBe("day");

    // 女巫只有「行动确认」一步、没有独立结果页 ⇒ 只能读状态落库
    const witchSteps = stepsOf(n1, "witch").filter((x) => /女巫/.test(x.dialog));
    expect(witchSteps.length, "女巫首夜必须被唤醒").toBeGreaterThan(0);
    expect
      .soft(
        witchSteps.some((x) => x.picked.includes(cursed)),
        `女巫实际点选的座位应包含 ${cursed} 号`
      )
      .toBe(true);

    const after = await snapNow(page);
    const victim = (after?.seats ?? []).find((s: any) => s.id === cursed - 1);
    expect.soft(victim?.isCursed, "被诅咒者应落库 isCursed=true").toBe(true);
    expect
      .soft(
        (after?.seats ?? []).filter((s: any) => s.isCursed).length,
        "本局只应有 1 人被诅咒"
      )
      .toBe(1);
    expect.soft(witchSeat, "女巫座位应在场").toBeGreaterThanOrEqual(0);
  });

  test("被诅咒者次日的提名被当场拦下（不进投票），并因当日无执行触发涡流判胜", async ({
    page,
  }) => {
    /**
     * ✅ 链路已实测打通（曾经被我误判成「桥接缺失」，此处留档以免重犯）：
     *   `witch.ability` 写 `snapshot.witchCurse` → `useNightActionHandler` 桥接成
     *   legacy `witchCursedId/witchActive`（实测快照 `{witchCursedId:2, witchActive:true}`）
     *   → `useDayActions::executeNomination` 命中分支：写下
     *   「N号发起提名触发女巫诅咒立刻死亡」日志 + `killPlayer` + **拒绝本次提名**（return false）。
     *
     * ⚠️ 为什么不断言 `isDead`：本剧本（S11）同时有**涡流**，
     *   而涡流「当天无人被处决 ⇒ 邪恶获胜」会在同一黄昏立即终局；
     *   终局后持久化快照**停止写入**（项目既有约定：终局不落快照），
     *   所以死亡只能从「提名被拒绝 + 当日无执行 + 涡流判胜」这条链上间接确认。
     *
     * 因此本用例的判据（都可观测）：
     *   ① 提名**没有进入投票**（弹窗序列里没有「举手表决计票」）；
     *   ② 游戏立刻终局、胜者是邪恶、胜因写明「涡流：今日无人被处决」。
     */
    const snap = await bootS(page, "S11");
    const cursed = 3;
    const witchSeat = seatByRole(snap, "witch");
    expect.soft(roleAt(snap, cursed - 1), "被诅咒者应为 3 号旅店老板").toBe("innkeeper");

    const n1 = await driveNight(page, [{ role: "witch", targets: [cursed] }]);
    expect(n1.status, "首夜应到白天").toBe("day");

    // 诅咒必须落库（引擎→legacy 桥接的可见证据）
    const afterNight = await snapNow(page);
    expect.soft((afterNight as any)?.witchCursedId, "诅咒应桥接到 legacy witchCursedId").toBe(
      cursed - 1
    );
    expect.soft((afterNight as any)?.witchActive, "witchActive 应为 true").toBe(true);
    expect
      .soft(
        (afterNight?.seats ?? []).find((s: any) => s.id === cursed - 1)?.isCursed,
        "被诅咒座位应标记 isCursed"
      )
      .toBe(true);
    expect.soft(witchSeat, "女巫座位应在场").toBeGreaterThanOrEqual(0);

    const dusk = await driveDusk(page, { nominator: cursed, nominee: 5 });
    // ① 提名被当场拦下 ⇒ 不会出现投票弹窗
    const sawVote = dusk.dialogs.some((t) => /举手表决计票/.test(t));
    expect
      .soft(sawVote, "被诅咒者发起提名应被拦下（不得进入投票环节）")
      .toBe(false);
    expect.soft(dusk.nominated, "「确认发起提名」这一步本身应被点过").toBe(true);

    // ② 当日无执行 ⇒ 涡流判邪恶胜，胜因可读
    const live = await waitLive(page, (l) => l?.gameOverUi === true);
    expect.soft(live?.gameOverUi, "当日无人被处决 ⇒ 应立即终局").toBe(true);
    expect.soft(live?.winner, "胜者应为邪恶").toBe("evil");
    // ⚠️ 这里读**整页文本**而不是第一个 dialog：终局时「确认发起提名」的残窗还压在栈底，
    //   `querySelector('[role="dialog"]')` 会先命中它（实测）。胜因本身在终局卡片里。
    const overlay = await page.evaluate(() =>
      (document.body.innerText || "").replace(/\s+/g, "")
    );
    expect.soft(overlay, "胜因应写明涡流的处决强制规则").toContain("涡流");
    expect.soft(overlay, "胜因应点明「今日无人被处决」").toContain("无人被处决");
  });
});

// ═══════════════════════════════════════════════════════════════════
// G5 · S11 涡流「白天没人被处决 ⇒ 邪恶获胜」（已登记缺口）
// ═══════════════════════════════════════════════════════════════════
test.describe("窃窃私语 · G5 涡流处决强制", () => {
  test.setTimeout(6 * 60_000);

  test("第 1 昼有提名但裁定不处决 ⇒ 邪恶立即获胜（涡流规则生效路径）", async ({ page }) => {
    /**
     * 官方涡流：「如果白天没人被处决，邪恶阵营获胜。」
     * 本条验的是**提名已发生、但最终没执行处决**这条路径 —— 规则在这里是通的
     * （下面那条「完全没人提名」的路径是缺口，见下一个用例）。
     */
    await bootS(page, "S11");
    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    const dusk = await driveDusk(page, {
      nominator: 3,
      nominee: 5,
      decision: "noop",
      // 🔴 2026-10-22 修复：只给 `decision:"noop"` 不够 —— 那条分支只有在
      //   「处决判定弹窗」真的出现时才生效；本局票数够就直接判死。
      //   要构造「有人提名但没人被处决」，必须让票数不足 ⇒ `voters: []`（一票不投）。
      voters: [],
    });
    expect.soft(dusk.nominated, "应成功发起提名").toBe(true);
    // ⚠️ 不用 `dusk.executed`（那是「点过处决相关按钮」的痕迹，不是真死亡）；
    //   只看真实死亡名单与胜因
    expect.soft(dusk.deadAfter ?? [], "本用例不应处决掉任何人").toEqual([]);

    const live = await waitLive(page, (l) => l?.gameOverUi === true);
    expect.soft(live?.gameOverUi, "当天无人被处决 ⇒ 应立即终局").toBe(true);
    expect.soft(live?.winner, "胜者应为邪恶（涡流）").toBe("evil");

    // 胜因必须写明是涡流的处决强制规则
    const winBtn = page.locator("button").filter({ hasText: /查看获胜结果/ }).first();
    await winBtn.click({ timeout: 8000 }).catch(() => {});
    const overlay = await page.evaluate(
      () => (document.querySelector('[role="dialog"]')?.textContent ?? "").replace(/\s+/g, "")
    );
    expect.soft(overlay, "胜利依据必须写明「涡流：今日无人被处决」").toContain("涡流");
    expect.soft(overlay, "胜利依据应点明「无人被处决」").toContain("无人被处决");
  });

  test("第 1 昼完全无人提名 ⇒ 入夜前也要判邪恶获胜", async ({ page }) => {
    /**
     * 🔴 2026-10-22 修复：这条规则此前只在「**有提名**但最终没处决」的路径生效
     *   （`gameLogic.checkGameEnd` 的 `lastAction === "execution"` 分支）。
     *   玩家完全跳过提名、直接点「入夜」时**没人判胜** ⇒ 游戏照常进第 2 夜；
     *   而 SST 判据 `isVortoxDuskWinActive` 当时**全仓库零生产调用点**。
     *   修法：在「黄昏 → 入夜」的唯一收口点（`startSubsequentNight` 监听器）补判，
     *   与既有路径共用同一判据与胜因文案，并按终局四条写 winResult/winReason/phase。
     */
    const snap = await bootS(page, "S11");
    const vottoxSeat = seatByRole(snap, "vortox");
    const spySeat = seatByRole(snap, "spy");
    const witchSeat = seatByRole(snap, "witch");

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    // ── 涡流本身：是唯一恶魔，且「恶魔互认」要列出两名爪牙 + 3 个不在场伪装 ──
    expect.soft(roleAt(snap, vottoxSeat), "涡流应坐镇 1 号").toBe("vortox");
    expect
      .soft(
        (snap.seats as any[]).filter((s: any) => isSeatDemon(s)).length,
        "本局只能有 1 名恶魔"
      )
      .toBe(1);
    const demonStep = stepsOf(n1, "vortox").find((x) => /不在场伪装/.test(x.dialog));
    expect(demonStep, "涡流应收到恶魔互认 + 伪装告知").toBeTruthy();
    expect.soft(demonStep!.dialog, "互认必须列出间谍").toContain(`${spySeat + 1}号`);
    expect.soft(demonStep!.dialog, "互认必须列出女巫").toContain(`${witchSeat + 1}号`);
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

    const dusk = await driveDusk(page, {});
    expect.soft(dusk.nominated, "本用例刻意不提名").toBe(false);

    const live = await waitLive(page, (l) => l?.gameOverUi === true);
    expect.soft(live?.gameOverUi, "官方：当天无人被处决 ⇒ 应立刻终局").toBe(true);
    expect.soft(live?.winner, "胜者应为邪恶").toBe("evil");

    // 终局横幅必然写明阵营（seat 网格里也有「涡流」字样，不能拿它当胜因证据）
    const banner = await page.evaluate(() =>
      (document.body.innerText || "").replace(/\s+/g, "")
    );
    expect.soft(banner, "终局横幅应写明邪恶阵营胜利").toContain("邪恶阵营胜利");

    // 打开「查看获胜结果」读胜因（每局只渲染一次）
    const winBtn = page.locator("button").filter({ hasText: /查看获胜结果/ }).first();
    const hasWinBtn = (await winBtn.count()) > 0;
    expect.soft(hasWinBtn, "终局应提供「查看获胜结果」入口").toBe(true);
    if (hasWinBtn) {
      await winBtn.click({ timeout: 8000 });
      const card = await page.evaluate(() =>
        (document.querySelector('[role="dialog"]')?.textContent ?? "").replace(/\s+/g, "")
      );
      expect.soft(card, "胜因卡片应写明涡流规则").toContain("涡流");
      expect.soft(card, "胜因卡片应点明「无人被处决」").toContain("无人被处决");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// G6 · S12 弄臣：首次处决不死，第二次处决必死
// ═══════════════════════════════════════════════════════════════════
test.describe("窃窃私语 · G6 弄臣两次处决", () => {
  test.setTimeout(8 * 60_000);

  test("第 1 天处决弄臣 ⇒ 不死；第 2 天再处决 ⇒ 死亡", async ({ page }) => {
    // S12：1珀 2造谣者 3数学家 4神谕者 5侍女 6弄臣 7政客 8瘟疫医生 9刺客
    const snap = await bootS(page, "S12");
    const foolSeat = seatByRole(snap, "fool"); // 6
    const nominator = [2, 3, 4].find((x) => x !== foolSeat + 1)!;

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    // ── 第 1 天：处决弄臣 → 免死 ──
    const dusk1 = await driveDusk(page, {
      nominator,
      nominee: foolSeat + 1,
      decision: "execute",
    });
    expect.soft(dusk1.executed, "第 1 天应完成处决结算").toBe(true);
    const after1 = await snapNow(page);
    expect
      .soft(
        (after1?.seats ?? []).find((s: any) => s.id === foolSeat)?.isDead,
        "官方：首次将要死亡时不会死亡"
      )
      .toBe(false);
    expect
      .soft(
        (after1?.seats ?? []).filter((s: any) => s.isDead).length,
        "第 1 天不应有人死亡"
      )
      .toBe(0);
    expect.soft(dusk1.status, "弄臣活着 ⇒ 游戏继续入夜").toBe("night");

    // ── 第 2 夜：恶魔/刺客都不动（避免污染），直接到第 2 天 ──
    const n2 = await driveNight(page, [
      { role: "po", targets: [], note: "不选目标" },
      { role: "assassin", targets: [], note: "不选目标" },
    ]);
    expect.soft(n2.status, "第 2 夜应到白天").toBe("day");

    // ── 第 2 天：再处决一次 → 这次必须死（免死已消费）──
    const dusk2 = await driveDusk(page, {
      nominator,
      nominee: foolSeat + 1,
      decision: "execute",
    });
    expect.soft(dusk2.executed, "第 2 天应完成处决结算").toBe(true);
    const after2 = await snapNow(page);
    const fool = (after2?.seats ?? []).find((s: any) => s.id === foolSeat);
    expect.soft(fool?.isDead, "免死只能用一次 ⇒ 第二次处决必须死亡").toBe(true);
    expect
      .soft(
        fool?.foolUsed === true || fool?.hasUsedFoolAbility === true,
        "免死标记应被消费"
      )
      .toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G7 · S12 刺客：每局限一次
// ═══════════════════════════════════════════════════════════════════
test.describe("窃窃私语 · G7 刺客限一次", () => {
  test.setTimeout(8 * 60_000);

  test("第 2 夜刺客击杀落库；第 3 夜不再有刺客行动", async ({ page }) => {
    const snap = await bootS(page, "S12");
    const assassinSeat = seatByRole(snap, "assassin"); // 9
    const victim = seatByRole(snap, "mathematician") + 1; // 3 号数学家

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    const n2 = await driveNight(page, [
      { role: "assassin", targets: [victim], note: "暗杀数学家" },
      { role: "po", targets: [], note: "不选目标" },
    ]);
    expect.soft(n2.status, "第 2 夜应到白天").toBe("day");
    const after2 = await snapNow(page);
    expect
      .soft(
        (after2?.seats ?? []).find((s: any) => s.id === victim - 1)?.isDead,
        "刺客的暗杀必须落库（不受任何保护影响）"
      )
      .toBe(true);
    expect.soft(assassinSeat, "刺客座位应在场").toBeGreaterThanOrEqual(0);

    // 第 2 昼 → 第 3 夜
    expect((await driveDusk(page, {})).status, "第 2 昼应能直接入夜").toBe("night");
    const n3 = await driveNight(page, [
      { role: "po", targets: [], note: "不选目标" },
    ]);
    expect.soft(n3.status, "第 3 夜应到白天").toBe("day");
    expect
      .soft(
        stepsOf(n3, "assassin").length,
        "官方：刺客「每局游戏限一次」⇒ 用过之后第 3 夜不得再被唤醒"
      )
      .toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G8 · S12 珀：目标数契约（已登记缺口）
// ═══════════════════════════════════════════════════════════════════
test.describe("窃窃私语 · G8 珀的目标数", () => {
  test.setTimeout(10 * 60_000);

  test("珀：未蓄力只能选 1 名；「上次没选人」后当晚可选 3 名并真的三杀", async ({ page }) => {
    /**
     * 🔴 2026-10-22 修的两个缺陷（本用例是回归证据）：
     * ① 蓄力标记 `poCharged` 只写在**中间件快照顶层**（每次行动现构的临时对象）
     *    ⇒ 从不同步回状态、也不进持久化 ⇒ **下一夜读不到**，三杀机制根本不存在；
     * ② `targetConfig` 写死 `{min:0,max:3}` ⇒ 说书人每夜都能选 3 人（实测第 2/3 夜都是「最多3人」）。
     * 修法：蓄力写回**恶魔座位**（座位会同步+持久化）；弹窗上限按座位标记动态取 1/3；
     *       能力侧再加一道预检（超量直接中止并留原因）。
     *
     * 官方：「每个夜晚*，你可以选择一名玩家：他死亡。
     *   如果你上次选择时没有选择任何玩家，当晚你要选择三名玩家：他们死亡。」
     */
    const snap = await bootS(page, "S12");
    const poSeat = seatByRole(snap, "po"); // 1
    const maxOf = (dlg: string) => (dlg.match(/最多(\d+)人/) ?? [])[1] ?? "?";

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    // ── 第 2 夜：首次真正行动（此前没有「上次选择」）⇒ 只能选 1 名 ──
    const n2 = await driveNight(page, [
      { role: "assassin", targets: [], note: "不选目标" },
      { role: "po", targets: [], note: "本夜刻意一个都不选（蓄力）" },
    ]);
    const po2 = stepsOf(n2, "po").find((x) => /行动确认/.test(x.dialog));
    expect(po2, "珀第 2 夜应被唤醒").toBeTruthy();
    expect
      .soft(maxOf(po2!.dialog), "未蓄力时官方只允许选 1 名（首夜不行动算「没有上次」）")
      .toBe("1");

    // 蓄力必须落到**座位**上（否则下一夜读不到）
    let after2 = await snapNow(page);
    expect
      .soft(
        (after2?.seats ?? []).find((s: any) => s.id === poSeat)?.poCharged,
        "「一个都不选」必须把蓄力标记写到恶魔座位上"
      )
      .toBe(true);
    expect
      .soft(
        (after2?.seats ?? []).filter((s: any) => s.isDead).length,
        "第 2 夜无人死亡（珀没选人、刺客也没杀）"
      )
      .toBe(0);

    // ── 第 3 夜：已蓄力 ⇒ 可选 3 名，并且真的三杀 ──
    expect((await driveDusk(page, {})).status, "第 2 昼应能直接入夜").toBe("night");
    const kills = [2, 3, 4]; // 造谣者 / 数学家 / 神谕者
    const n3 = await driveNight(page, [
      { role: "assassin", targets: [], note: "不选目标" },
      { role: "po", targets: kills, note: "蓄力后三杀" },
    ]);
    const po3 = stepsOf(n3, "po").find((x) => /行动确认/.test(x.dialog));
    expect(po3, "珀第 3 夜应被唤醒").toBeTruthy();
    expect.soft(maxOf(po3!.dialog), "已蓄力 ⇒ 官方允许选 3 名").toBe("3");
    expect.soft(po3!.picked, "实际点选的三个座位应与计划一致").toEqual(kills);

    const after3 = await snapNow(page);
    const dead = (after3?.seats ?? []).filter((s: any) => s.isDead).map((s: any) => s.id + 1);
    expect.soft(dead.sort(), "蓄力三杀必须三具尸体（无保护角色干扰）").toEqual(kills);
    // 蓄力是**一次性**：标记带「哪一夜蓄的」，只有紧接的下一夜才算数
    //   （不依赖「记得清标记」——实测击杀分支里清会被 React 座位回写覆盖）
    expect
      .soft(
        (after3?.seats ?? []).find((s: any) => s.id === poSeat)?.poChargedNight,
        "蓄力应记录生效夜晚（第 2 夜），因此第 3 夜一次性用掉"
      )
      .toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G9 · S12 神谕者：处决邪恶后，死亡邪恶数必须等于独立复算
// ═══════════════════════════════════════════════════════════════════
test.describe("窃窃私语 · G9 神谕者复算", () => {
  test.setTimeout(8 * 60_000);

  test("处决刺客（邪恶）⇒ 第 2 夜神谕者报「1 名死亡玩家为邪恶」", async ({ page }) => {
    const snap = await bootS(page, "S12");
    const assassinSeat = seatByRole(snap, "assassin"); // 9
    const oracleSeat = seatByRole(snap, "oracle"); // 4
    const nominator = [2, 3, 5].find((x) => x !== assassinSeat + 1)!;

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    const dusk = await driveDusk(page, {
      nominator,
      nominee: assassinSeat + 1,
      decision: "execute",
    });
    expect.soft(dusk.executed, "应完成处决结算").toBe(true);
    expect.soft(dusk.status, "处决爪牙不会终局（恶魔仍在）⇒ 应入夜").toBe("night");

    const n2 = await driveNight(page, [
      { role: "assassin", targets: [], note: "已死，不应被唤醒" },
      { role: "po", targets: [], note: "不选目标" },
    ]);
    const orc = resultStep(n2, "oracle");
    expect(orc, "神谕者第 2 夜必须被唤醒").toBeTruthy();
    const orcNum = Number((orc!.dialog.match(/(\d+)\s*名死亡玩家/) ?? [])[1] ?? NaN);

    const after = await snapNow(page);
    const deadEvil = (after?.seats ?? []).filter(
      (s: any) => s.isDead && isMinionOrDemonRole(s.role)
    ).length;
    expect.soft(deadEvil, "死亡且邪恶的座位应恰好 1 个（刺客）").toBe(1);
    expect.soft(orcNum, "神谕者数字必须等于独立复算值").toBe(deadEvil);
    expect
      .soft(
        (after?.seats ?? []).find((s: any) => s.id === oracleSeat)?.isDead,
        "神谕者本人不应被处决"
      )
      .toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G10 · S13 造谣者：声明真假必须与当晚死亡数一致
// ═══════════════════════════════════════════════════════════════════
test.describe("窃窃私语 · G10 造谣者声明", () => {
  test.setTimeout(8 * 60_000);

  /** 打开造谣者表单并裁定真假（`verdict`: "true" | "false"） */
  async function declare(page: Page, text: string, verdict: "true" | "false") {
    const opened = await openDayAbility(page, /使用\s*造谣者/);
    expect.soft(opened, "造谣者日间表单应能打开").toBe(true);
    await page.locator('[role="dialog"] textarea').first().fill(text);
    await page.locator('[role="dialog"] select').first().selectOption(verdict);
    await page
      .locator('[role="dialog"] button')
      .filter({ hasText: /^确认$/ })
      .first()
      .click({ timeout: 8000 });
    // 等表单真的关掉（`[role="dialog"] select` 消失），而不是盲等
    await page
      .waitForFunction(
        () => document.querySelector('[role="dialog"] select') === null,
        null,
        { timeout: 5_000 }
      )
      .catch(() => {});
  }

  /**
   * ⚠️ 拆成两条独立用例：同一 page 上重复 `bootScene` 会在第二次卡住
   *   （`locator.click: Timeout 15000ms exceeded`，实测两次），
   *   而 Playwright 每个 test 都是新 page ⇒ 分开跑最稳。
   */
  test("裁定「为假」⇒ 当晚无人死亡", async ({ page }) => {
    const snap = await bootS(page, "S13");
    const gossipSeat = seatByRole(snap, "gossip"); // 7
    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    await declare(page, "恶魔是隔壁老王", "false");
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    const n2 = await driveNight(page, [
      { role: "innkeeper", targets: [11, 12], note: "保护两人" },
      { role: "devils_advocate", targets: [2], note: "常规保护" },
      { role: "zombuul", targets: [], note: "不选目标" },
      // ⚠️ 造谣者的击杀目标由说书人在**夜间确认窗**里选（最少 0 / 最多 1）
      //   ⇒ 不选目标就什么都不会发生（那是「未选目标」，不是缺陷）。
      //   这里照实选 8 号，用来证明「声明为假时，即使指定了目标也不会死」。
      { role: "gossip", targets: [8], note: "指定致死目标（应被声明为假挡下）" },
    ]);
    expect.soft(n2.status, "第 2 夜应到白天").toBe("day");

    const gs = stepsOf(n2, "gossip");
    expect.soft(gs.length, "造谣者当晚必须被唤醒结算").toBeGreaterThan(0);
    expect
      .soft(gs.map((x) => x.dialog).join("|"), "裁定「为假」⇒ 结算应写「声明错误」")
      .toContain("声明错误");

    const after = await snapNow(page);
    expect
      .soft(
        (after?.seats ?? []).filter((s: any) => s.isDead).length,
        "声明为假 ⇒ 当晚不得有人死亡"
      )
      .toBe(0);
    expect.soft(gossipSeat, "造谣者座位应在场").toBeGreaterThanOrEqual(0);
  });

  test("裁定「为真」⇒ 当晚必有人被这条声明害死", async ({ page }) => {
    /**
     * 🔴 2026-10-22 修的两个真实缺陷（本用例就是回归证据）：
     * ① **三字段互相覆盖**：三个 setter 各带全量三项、另两项取自同一帧 `state`
     *    ⇒ 连续调用只剩最后一项落库（`{statement:"", isTrue:true, sourceId:null}`）。
     *    改成 reducer 局部合并 + setter 只写自己那一项。
     * ② **夜间读不到声明**：`gossip.ability` 读 `storytellerInput.statement/isStatementTrue`，
     *    而夜间管道的 `storytellerInput` 恒为「本次弹窗的座位选择」
     *    ⇒ `isStatementTrue` 恒 false ⇒ 永远「声明错误」。
     *    修法：把两项带进夜间管道快照（`gossipStatementToday/gossipTrueTonight`），
     *    能力侧 `storytellerInput?.x ?? snapshot.gossipX` 兜底。
     */
    await bootS(page, "S13");
    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    await declare(page, "今天会有坏人被投出去", "true");
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    const killTarget = 8; // 8 号陌客（不在旅店老板保护名单里）
    const n2 = await driveNight(page, [
      { role: "innkeeper", targets: [11, 12], note: "保护 11/12，避免误挡" },
      { role: "devils_advocate", targets: [2], note: "常规保护" },
      { role: "zombuul", targets: [], note: "不选目标" },
      // 造谣者的致死目标由说书人在夜间确认窗里指定
      { role: "gossip", targets: [killTarget], note: "指定致死目标" },
    ]);
    expect.soft(n2.status, "第 2 夜应到白天").toBe("day");

    const gossipDialog = stepsOf(n2, "gossip").map((x) => x.dialog).join("|");
    expect.soft(gossipDialog, "裁定「为真」⇒ 结算应写「声明正确」").toContain("声明正确");

    const after = await snapNow(page);
    const deaths = (after?.seats ?? [])
      .filter((s: any) => s.isDead)
      .map((s: any) => s.id + 1);
    // 声明为真 ⇒ 说书人指定的那个人必须死，且当晚只死这一个
    expect
      .soft(deaths, `声明为真 ⇒ 指定的 ${killTarget} 号必须死亡`)
      .toEqual([killTarget]);
    expect.soft(gossipDialog, "结算文案应点明受害者").toContain(`${killTarget}号`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G11 · S13 艺术家：日间提问一次，用完入口消失
// ═══════════════════════════════════════════════════════════════════
test.describe("窃窃私语 · G11 艺术家提问", () => {
  test.setTimeout(6 * 60_000);

  test("艺术家日间提问：弹窗含提问框与是/否/不知道，用完后入口消失", async ({ page }) => {
    const snap = await bootS(page, "S13");
    const artistSeat = seatByRole(snap, "artist"); // 2
    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    const opened = await openDayAbility(page, /使用\s*艺术家/);
    expect(opened, "艺术家日间表单应能打开").toBe(true);

    const dlg = page.locator('[role="dialog"]').first();
    const text = (await dlg.textContent()) ?? "";
    expect.soft(text, "弹窗标题应为艺术家提问").toContain("艺术家提问");
    expect.soft(text, "官方：说书人回答「是」「否」或「不知道」").toContain("不知道");

    await page.locator('[role="dialog"] textarea').first().fill("本局恶魔是不是 1 号？");
    await page.locator('[role="dialog"] button').filter({ hasText: /^是$/ }).first().click();
    // 等「每局限一次」的入口真的被消耗掉，而不是盲等
    await page
      .waitForFunction(
        () =>
          !Array.from(document.querySelectorAll("button")).some((b) =>
            /使用\s*艺术家/.test(b.textContent || "")
          ),
        null,
        { timeout: 8_000 }
      )
      .catch(() => {});

    // 每局限一次 ⇒ 入口应消失
    const remain = await page.locator("button").filter({ hasText: /使用\s*艺术家/ }).count();
    expect.soft(remain, "艺术家每局游戏限一次 ⇒ 用完后入口必须消失").toBe(0);

    const after = await snapNow(page);
    expect.soft(roleAt(after, artistSeat), "艺术家角色不变").toBe("artist");
    expect
      .soft(
        (after?.seats ?? []).find((s: any) => s.id === artistSeat)?.isDead,
        "艺术家不应因提问而死亡"
      )
      .toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G12 · S13 圣徒：被处决 ⇒ 邪恶立刻获胜
// ═══════════════════════════════════════════════════════════════════
test.describe("窃窃私语 · G12 圣徒处决", () => {
  test.setTimeout(6 * 60_000);

  test("处决圣徒 ⇒ 邪恶获胜，胜因必须可读且写明圣徒", async ({ page }) => {
    const snap = await bootS(page, "S13");
    const saintSeat = seatByRole(snap, "saint"); // 6
    const nominator = [2, 3, 4].find((x) => x !== saintSeat + 1)!;

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

    const winBtn = page.locator("button").filter({ hasText: /查看获胜结果/ }).first();
    await winBtn.click({ timeout: 8000 }).catch(() => {});
    const overlay = await page.evaluate(
      () => (document.querySelector('[role="dialog"]')?.textContent ?? "").replace(/\s+/g, "")
    );
    expect.soft(overlay, "胜因必须可读且点名圣徒").toContain("圣徒");
  });
});

// ═══════════════════════════════════════════════════════════════════
// G13 · S13 魔鬼代言人：保护对象次日被处决不死
// ═══════════════════════════════════════════════════════════════════
test.describe("窃窃私语 · G13 魔鬼代言人保护", () => {
  test.setTimeout(6 * 60_000);

  test("魔鬼代言人保护 2 号 ⇒ 次日处决 2 号不死", async ({ page }) => {
    const snap = await bootS(page, "S13");
    const daSeat = seatByRole(snap, "devils_advocate"); // 11
    const protectedSeat = 2; // 2 号艺术家
    expect.soft(roleAt(snap, protectedSeat - 1), "被保护者应为艺术家").toBe("artist");
    expect.soft(daSeat, "魔鬼代言人座位应在场").toBeGreaterThanOrEqual(0);

    const n1 = await driveNight(page, [
      { role: "devils_advocate", targets: [protectedSeat], note: "保护 2 号" },
    ]);
    expect(n1.status, "首夜应到白天").toBe("day");
    const da = stepsOf(n1, "devils_advocate").find((x) => /保护了/.test(x.dialog));
    expect(da, "魔鬼代言人应给出保护结果").toBeTruthy();
    expect.soft(da!.dialog, "结果应点名保护 2 号").toContain("保护了2号");

    const nominator = [3, 4, 12].find((x) => x !== protectedSeat)!;
    const dusk = await driveDusk(page, {
      nominator,
      nominee: protectedSeat,
      decision: "execute",
    });
    expect.soft(dusk.executed, "应完成处决结算").toBe(true);

    const after = await snapNow(page);
    expect
      .soft(
        (after?.seats ?? []).find((s: any) => s.id === protectedSeat - 1)?.isDead,
        "官方：明天白天他被处决时不会死亡"
      )
      .toBe(false);
    expect.soft(dusk.status, "被保护 ⇒ 无人死亡 ⇒ 游戏继续入夜").toBe("night");
  });
});

// ═══════════════════════════════════════════════════════════════════
// G14 · S12 瘟疫医生：死亡后说书人获得一个爪牙能力
// ═══════════════════════════════════════════════════════════════════
test.describe("窃窃私语 · G14 瘟疫医生", () => {
  test.setTimeout(6 * 60_000);

  test("瘟疫医生被夜杀 ⇒ 「说书人获得一个爪牙能力」必须可追溯", async ({ page }) => {
    /**
     * 官方：「当你死亡时，说书人会获得一个爪牙能力。」
     *
     * 🔴 2026-10-22 修：引擎把这条写在 `snapshot.storytellerAbilities`，
     *   而那是**每次行动现构的临时快照** —— 不同步回 React 状态、也不在持久化白名单
     *   ⇒ 实测 `clocktower_current_snapshot` 里根本没这个字段，刷新即丢、事后无法追溯。
     *   修法：额外把「获得了哪个爪牙能力」记到**瘟疫医生的座位**上（座位会同步+持久化）。
     *
     * ⚠️ 仍未做（登记在 §17.3 缺口 5 的后半段）：说书人目前**没有入口去『使用』**
     *   这个爪牙能力。本用例只证明「它被记录、可追溯」，不声称能力可用。
     */
    const snap = await bootS(page, "S12");
    const pdSeat = seatByRole(snap, "plague_doctor"); // 8
    expect.soft(pdSeat, "瘟疫医生应在场").toBeGreaterThanOrEqual(0);

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    const n2 = await driveNight(page, [
      { role: "assassin", targets: [pdSeat + 1], note: "暗杀瘟疫医生" },
      { role: "po", targets: [], note: "不选目标" },
    ]);
    expect.soft(n2.status, "第 2 夜应到白天").toBe("day");

    const after = await snapNow(page);
    const pd = (after?.seats ?? []).find((s: any) => s.id === pdSeat);
    expect.soft(pd?.isDead, "瘟疫医生应被暗杀").toBe(true);
    expect
      .soft(
        pd?.storytellerGrantedMinion,
        "死亡时必须记录「说书人获得的爪牙能力」（座位级，可持久化）"
      )
      .toBeTruthy();
    expect
      .soft(
        pd?.storytellerGrantedMinionName,
        "记录里必须带**中文名**（英文 id 不能上屏，见既往 L1 矩阵 G2b 修复）"
      )
      .not.toBe(pd?.storytellerGrantedMinion);
    expect
      .soft(
        pd?.storytellerAbilityGrantedAtNight,
        "记录里应带获得时的夜数，便于追溯"
      )
      .toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G15 · S12 政客：终局「负最大责任」判定（登记缺口）
// ═══════════════════════════════════════════════════════════════════
test.describe("窃窃私语 · G15 政客", () => {
  test.setTimeout(6 * 60_000);

  test("政客在场：不改写自身真值、不抢占配比（终局归属待补裁定入口）", async ({ page }) => {
    /**
     * ⚠️ 登记缺口（不是「通过」）：
     *   官方：「如果你是对你的阵营落败负最大责任的人，你转变阵营并获胜，即使你已死亡。」
     *   引擎里 `politician.ability` 走 `evaluatePoliticianEndgame`，但结论来自
     *   `storytellerInput.isMostResponsible`（说书人主观裁定），
     *   当前 UI **没有**这个入口 ⇒ E2E 无法产生「政客转变阵营」的终局。
     *   所以本用例**只验可观测的部分**，终局归属明确标为「未验证」：
     *   · 政客确实是外来者、在 9 人局里按外来者计配比（5 镇民 / 2 外来者 / 1 爪牙 / 1 恶魔）；
     *   · 政客不会因为「另一名外来者（瘟疫医生）死亡」而改角色或改阵营；
     *   · **未验证**：善良落败时政客是否转变阵营获胜（缺说书人裁定入口）。
     */
    const snap = await bootS(page, "S12");
    const polSeat = seatByRole(snap, "politician"); // 7
    expect.soft(polSeat, "政客应在场").toBeGreaterThanOrEqual(0);
    expect.soft(roleAt(snap, polSeat), "政客真值").toBe("politician");
    expect
      .soft((snap.seats as any[]).find((s: any) => s.id === polSeat)?.role?.type, "政客是外来者")
      .toBe("outsider");

    const byType = (t: string) =>
      (snap.seats as any[]).filter((s: any) => s.role?.type === t).length;
    expect.soft(byType("outsider"), "9 人局外来者应为 2（政客 + 瘟疫医生）").toBe(2);
    expect.soft(byType("demon"), "恶魔 1 名").toBe(1);
    expect.soft(byType("minion"), "爪牙 1 名").toBe(1);

    // 政客不因他人死亡而改自身真值（跑一夜，处决瘟疫医生所在的同阵营外来者不成立，
    // 这里只验「夜过后角色字段稳定」这一条不变量）
    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");
    const after = await snapNow(page);
    expect.soft(roleAt(after, polSeat), "首夜过后政客真值不变").toBe("politician");
    expect
      .soft(
        (after?.seats ?? []).find((s: any) => s.id === polSeat)?.isDead,
        "政客不应无故死亡"
      )
      .toBe(false);
  });
});
