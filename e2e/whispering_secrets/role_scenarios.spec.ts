import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { roles as APP_ROLES } from "../../app/data";
import { isMinionOrDemonRole } from "../../src/utils/seatAlignment";
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

  test("S11 涡流局：侍女/卖花女孩/神谕者 三项「真值必为 0/没有」的信息都必须被翻转", async ({
    page,
  }) => {
    // S11：1涡流 2圣徒 3旅店老板 4陌客 5间谍 6神谕者 7侍女 8数学家 9造谣者 10女巫 11艺术家 12卖花女孩
    const snap = await bootS(page, "S11");
    const saintSeat = seatByRole(snap, "saint"); // 2
    const recluseSeat = seatByRole(snap, "recluse"); // 4

    // 侍女查「圣徒 + 陌客」（当夜都没有夜间能力 ⇒ 真值 0）
    const n1 = await driveNight(page, [
      {
        role: "chambermaid",
        targets: [saintSeat + 1, recluseSeat + 1],
        note: "查两个无夜能力的座位",
      },
    ]);
    expect(n1.status, "首夜应到白天").toBe("day");

    const cm = resultStep(n1, "chambermaid");
    expect(cm, "侍女必须被唤醒").toBeTruthy();
    const cmNum = Number((cm!.dialog.match(/(\d+)\s*人被唤醒/) ?? [])[1] ?? NaN);
    expect
      .soft(
        cmNum !== 0,
        `涡流世界：圣徒/陌客当夜都没被唤醒（真值 0）⇒ 报出的必须是假值（≠0），实测 ${cmNum}`
      )
      .toBe(true);

    // 第 1 昼不提名 ⇒ 今天无人投票、无人死亡
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    // 第 2 夜：涡流攻击 1 号自己以外的座位，避免把信息源杀掉
    // ⚠️ 目标不能是卖花女孩(12)/神谕者(6)：涡流会把人**杀死**，死者不再被唤醒 ⇒ 断言落空
    const n2 = await driveNight(page, [{ role: "vortox", targets: [11] }]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    // ── 卖花女孩：今天无人投票 ⇒ 真值「没有」，涡流必须答「有」 ──
    const fg = resultStep(n2, "flowergirl");
    expect(fg, "卖花女孩必须被唤醒").toBeTruthy();
    expect
      .soft(
        fg!.dialog.includes("有投过票") && !fg!.dialog.includes("没有投过票"),
        `涡流世界：今天无人投票（真值「没有」）⇒ 必须答「有」，实测：${fg!.dialog.slice(-40)}`
      )
      .toBe(true);

    // ── 神谕者：今天 0 人死亡 ⇒ 真值 0，涡流必须答非 0 ──
    const orc = resultStep(n2, "oracle");
    expect(orc, "神谕者必须被唤醒").toBeTruthy();
    const orcNum = Number((orc!.dialog.match(/(\d+)\s*名死亡玩家/) ?? [])[1] ?? NaN);
    expect
      .soft(
        orcNum !== 0,
        `涡流世界：0 名死亡（真值 0）⇒ 必须答非 0，实测 ${orcNum}`
      )
      .toBe(true);

    // ── 数学家：涡流世界必须给出「信息必定错误」的说书人提示 ──
    const mathStep = stepsOf(n2, "mathematician").find((x) => /行动确认/.test(x.dialog));
    expect(mathStep, "数学家应有行动确认步骤").toBeTruthy();
    expect
      .soft(mathStep!.dialog, "涡流世界必须在确认窗上明示「信息必定错误」")
      .toContain("涡流在场");
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

  test("被诅咒者次日在提名时立刻死亡（⚠️ 新引擎未桥接 legacy 状态）", async ({ page }) => {
    /**
     * 🔴 2026-10-22 实测：**魔咒不会杀人**（真实缺陷）。
     *
     * 引擎侧：`witch.ability.ts::stateUpdate` 正常写 `snapshot.witchCurse` + `seat.isCursed`。
     * 白天侧：`useDayActions.ts:253` 的杀人条件是
     *   `witchActive && witchCursedId !== null && witchCursedId === sourceId`
     *   —— 这两个都是 **legacy React 状态**，只有 `setWitchCursedId/setWitchActive` 能写入。
     * 🔴 但**全仓库搜不到任何把 `snapshot.witchCurse` 桥接到 `setWitchCursedId` 的代码**
     *   （`grep -rn "witchCurse" src/hooks/` 只有 `useExecutionHandlers.ts:113` 的一句
     *   **注释**说「需桥接」，实现从来没有）⇒ `witchCursedId` 恒为 null ⇒ 白天永不触发。
     * 实测：3 号发起提名后 `isDead=false`，只有涡流规则因「今日无人被处决」判邪恶胜。
     *
     * 修法方向：在新引擎夜间结算回写状态的那一处（与 `setDeadThisNight` 同一出口）
     * 补桥接：`setWitchCursedId(snapshot.witchCurse ?? null)` + `setWitchActive(涡流局外??)`，
     * 并保证「只有存活巫婆 + 未中毒/醉酒」时 `witchActive` 为 true。
     */
    test.fail(true, "女巫诅咒未桥接到 legacy witchCursedId ⇒ 白天提名不会死");

    const snap = await bootS(page, "S11");
    const cursed = 3;
    expect((await driveNight(page, [{ role: "witch", targets: [cursed] }])).status, "首夜应到白天").toBe("day");

    const dusk = await driveDusk(page, { nominator: cursed, nominee: 5, decision: "noop" });
    expect.soft(dusk.nominated, "3 号应成功发起提名").toBe(true);

    const after = await snapNow(page);
    expect
      .soft(
        (after?.seats ?? []).find((s: any) => s.id === cursed - 1)?.isDead,
        "官方：被女巫诅咒者白天发起提名 ⇒ 立即死亡"
      )
      .toBe(true);
    expect.soft(roleAt(after, cursed - 1), "被诅咒者身份不变").toBe("innkeeper");
    expect.soft(snap.seats.length, "12 人局不应在此时终局").toBe(12);
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

  test("第 1 昼完全无人提名 ⇒ 也应判邪恶获胜（⚠️ 该路径未接线）", async ({ page }) => {
    /**
     * 🔴 2026-10-22 实测：**「无人提名直接入夜」这条路径没有判胜**。
     *
     * 上面那条用例证明规则本身是通的（有提名路径会判），但玩家完全跳过提名、
     * 直接点「入夜」时，`checkGameEnd` 的涡流分支不会被跑到 ⇒ 游戏继续进第 2 夜。
     * `src/utils/vortoxWorld.ts::isVortoxDuskWinActive` 这个唯一事实源**没有任何生产调用点**
     * （`grep -rn isVortoxDuskWinActive src/ app/` 只命中定义与 `__tests__`；
     * `GameStage.tsx` 里那处是注释），判胜逻辑散落在提名/处决链里，没有收口。
     *
     * 修法方向：把「黄昏结束 → 入夜」收成唯一出口（`startSubsequentNight` 之前），
     * 在那里统一调 `isVortoxDuskWinActive(seatsRef.current, todayExecutedId !== null)`。
     */
    test.fail(true, "涡流：无人提名直接入夜时未判胜（规则散落在处决链，未收口到入夜出口）");

    await bootS(page, "S11");
    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");
    const dusk = await driveDusk(page, {});
    expect.soft(dusk.nominated, "本用例刻意不提名").toBe(false);
    const live = await readLiveEndState(page);
    expect.soft(live?.gameOverUi, "官方：当天无人被处决 ⇒ 应立即终局").toBe(true);
    expect.soft(live?.winner, "胜者应为邪恶").toBe("evil");
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
  test.setTimeout(8 * 60_000);

  test("珀平时只能选 1 名；只有「上次未选任何人」才可选 3 名（⚠️ 实测恒为 3）", async ({
    page,
  }) => {
    /**
     * 🔴 2026-10-22 实测：`po.ability.ts` 的 `targetConfig` 是**硬编码**
     *   `{ min: 0, max: 3 }`，没有任何「上次是否选了人」的状态判据
     *   （全文件只有一处 `if (targetIds.length > 3)` 兜底）。
     *   ⇒ 实测第 2 夜、第 3 夜（第 2 夜已选 1 名）都显示「最多3人」，
     *     说书人每夜都能杀 3 人。
     *
     * 官方：「每个夜晚*，你可以选择一名玩家：他死亡。**如果你上次选择时没有选择
     *      任何玩家**，当晚你要选择三名玩家：他们死亡。」
     *
     * 修法方向：把 `max` 做成动态值 —— 读 `snapshot._abilityResults.po.lastTargetCount`
     * （或新增 `poChoseNoOne` 布尔），为 0/未记录时 max=3，否则 max=1；
     * 并注意第 1 夜不行动（night*），「上次」应指上一次**被唤醒的夜晚**。
     */
    test.fail(true, "珀的目标上限恒为 3（应：平时 1 名，仅上次未选人时 3 名）");

    const snap = await bootS(page, "S12");
    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    const n2 = await driveNight(page, [
      { role: "assassin", targets: [], note: "不选目标" },
      { role: "po", targets: [2], note: "选 1 名" },
    ]);
    const po2 = stepsOf(n2, "po").find((x) => /行动确认/.test(x.dialog));
    expect(po2, "珀第 2 夜应被唤醒").toBeTruthy();
    expect.soft(po2!.dialog, "第 2 夜『上次』= 首夜（不行动）⇒ 允许 3 名").toContain("最多3人");

    expect((await driveDusk(page, {})).status, "第 2 昼应能直接入夜").toBe("night");
    const n3 = await driveNight(page, [
      { role: "assassin", targets: [], note: "不选目标" },
      { role: "po", targets: [2], note: "选 1 名" },
    ]);
    const po3 = stepsOf(n3, "po").find((x) => /行动确认/.test(x.dialog));
    expect(po3, "珀第 3 夜应被唤醒").toBeTruthy();
    expect
      .soft(
        po3!.dialog,
        "上次已选过 1 名 ⇒ 官方只允许选 1 名，弹窗应是「最多1人」"
      )
      .toContain("最多1人");
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

  test("裁定「为真」⇒ 当晚必有人被这条声明害死（⚠️ 夜间未读到声明）", async ({ page }) => {
    /**
     * 🔴 2026-10-22 实测：**「为真」不会产生死亡**，且夜间结算恒判「声明错误」。
     *
     * 已修掉的一半（本轮已提交）：日间表单的三个字段互相覆盖 ——
     *   `setGossipStatementToday / setGossipSourceSeatId / setGossipTrueTonight`
     *   各自把三项一起 dispatch，另两项取自**同一帧的 `state`** ⇒ 后一次用旧值覆盖前一次。
     *   修好后快照正确落库：`{statement:"今天会有坏人被投出去", isTrue:true, sourceId:6}`（实测）。
     *
     * 仍未修的一半：
     *   `gossip.ability.ts::calculateResult` 读的是
     *     `storytellerInput?.statement` / `storytellerInput?.isStatementTrue ?? false`
     *   而夜间管道的 `storytellerInput` 来自 `useNightActionHandler.ts:443`
     *     `storytellerInput: context.actionData`
     *   `actionData` 只装「本次弹窗的选择」（座位），**从不含造谣内容与真假裁定**
     *   ⇒ `isStatementTrue` 恒为 false ⇒ 永远「声明错误」、永不杀人。
     *   修法：① `gameStateSnapshot` 补 `gossipStatementToday / gossipTrueTonight`
     *        （`useNightActionHandler.ts` 的快照构造处，与 `todayExecutedId` 同批）；
     *        ② `gossip.ability.ts` 改成 `storytellerInput?.x ?? snapshot.gossipX` 兜底。
     */
    test.fail(true, "夜间管道未传造谣内容/真假（storytellerInput 仅含座位）⇒ 恒判声明错误");

    await bootS(page, "S13");
    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    await declare(page, "今天会有坏人被投出去", "true");
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    const n2 = await driveNight(page, [
      { role: "innkeeper", targets: [11, 12], note: "保护 11/12，避免误挡" },
      { role: "devils_advocate", targets: [2], note: "常规保护" },
      { role: "zombuul", targets: [], note: "不选目标" },
    ]);
    expect.soft(n2.status, "第 2 夜应到白天").toBe("day");

    const gossipDialog = stepsOf(n2, "gossip").map((x) => x.dialog).join("|");
    expect.soft(gossipDialog, "裁定「为真」⇒ 结算应写「声明正确」").toContain("声明正确");

    const after = await snapNow(page);
    const deaths = (after?.seats ?? [])
      .filter((s: any) => s.isDead)
      .map((s: any) => s.id + 1);
    // 不变量：要么死 1 人（正常），要么死者正好落在旅店老板保护的 11/12（被挡下）
    const ok =
      deaths.length === 1 ||
      (deaths.length === 0 && /受到保护|保护|未死亡/.test(gossipDialog));
    expect
      .soft(
        ok,
        `声明为真 ⇒ 当晚应有 1 人死亡（若受害者被旅店老板保护则为 0），实测死亡：${deaths.join(",")}`
      )
      .toBe(true);
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

  test("瘟疫医生被夜杀 ⇒ 说书人获得一个爪牙能力（⚠️ 该字段未进快照）", async ({
    page,
  }) => {
    /**
     * ⚠️ 登记缺口（不是「通过」）：实测**两个落点都读不到**。
     *
     * 引擎侧确实写了 `plague_doctor.ability.ts::stateUpdate` →
     *   `snapshot.storytellerAbilities = grantStorytellerMinionAbility(...)`
     *   `snapshot._abilityResults.plague_doctor = { grantedMinionRole, … }`
     * 但读回到的 `clocktower_current_snapshot` 里，`storytellerAbilities` 与
     * `_abilityResults` **都不存在** ⇒ 该字段没进快照白名单（`persistence` /
     * `undoSnapshot` 两处白名单），所以「说书人获得爪牙能力」这件事
     * 在 UI/存档层面不可见、刷新即丢。
     *
     * 下一步：① 确认 `storytellerAbilities` 是否应进 `SNAPSHOT_KEYS`；
     * ② 补一个「说书人技能栏」的可见入口（当前全仓没有渲染 `storytellerAbilities`）。
     * 修好后本用例会自动变红，提醒转真断言。
     */
    test.fail(true, "storytellerAbilities / _abilityResults.plague_doctor 均未进快照，读不到");
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

    const abilities = (after as any)?.storytellerAbilities;
    const hasAbility =
      Array.isArray(abilities) && abilities.length > 0
        ? true
        : Boolean((after as any)?._abilityResults?.plague_doctor?.grantedMinionRole);
    expect
      .soft(
        hasAbility,
        "官方：当你死亡时，说书人会获得一个爪牙能力 ⇒ 该能力必须落库（storytellerAbilities）"
      )
      .toBe(true);
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
