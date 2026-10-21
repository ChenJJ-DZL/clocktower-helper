import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { roles as APP_ROLES } from "../../app/data";
import {
  isMinionOrDemonRole,
  isTownsfolkRole,
} from "../../src/utils/seatAlignment";
import { computeSetupComposition } from "../../src/utils/setupComposition";
import { bootScene, driveDusk, driveNight, seatOf, stepsOf, type NightReport } from "../helpers/scenario";
import { waitForSnapshot } from "../helpers/scriptFlow";
import { readLiveEndState } from "../helpers/fullSim";

/**
 * 🎭 无上愉悦（High Pleasure）· 逐角色场景验证
 * ==================================================================
 * 本文件是 `e2e/trouble_brewing/role_scenarios.spec.ts`（暗流涌动 22 角色模板）
 * 在**《无上愉悦》**剧本上的同形状复刻：只换 `SCENE_*` 与断言。
 *
 * 场次（`outputs/scenes.json`）：
 *   · S16（12 人 / 7 镇民 2 外来者 2 爪牙 1 恶魔）—— 小恶魔 + 红唇女郎 + 僧侣 + 占卜师
 *   · S17（12 人 / 6 镇民 3 外来者 2 爪牙 1 恶魔）—— 僵怖 + 男爵 + 陌客 + 守鸦人
 *
 * 覆盖的 16 个角色（一个不漏）：
 *   washerwoman, investigator, chef, librarian, empath, fortune_teller, monk,
 *   butler, drunk, poisoner, scarlet_woman, imp, ravenkeeper, recluse, baron, zombuul
 *
 * 每个用例必须同时给三类判据，缺一不可：
 *   ① **弹窗内容**：这一步真的出现了，且文案与真值一致
 *      （信息类角色：解析 `A号和B号之中有一名是【X】` 后**回查座位真值**）；
 *   ② **状态落库**：`isPoisoned / isProtected / isDead / diedAtNight / masterId /
 *      isDemonSuccessor / charadeRole / role.id` 等字段真的被改；
 *   ③ **反证**：不该发生的必须没发生（僧侣保护的人没死；红唇女郎继承后不判善良胜；
 *      僵怖杀人后自己不死；守鸦人死后才被唤醒）。
 *
 * ⚠️ 本剧本踩过的坑（模板里已知的坑，这里再加两条本剧本特有的）：
 *   1. **投毒者/僧侣/恶魔每夜都行动 ⇒ 必须显式给 `targets`**，
 *      否则驱动器按「第一个可选座位」选人 ⇒ 可能毒到/保护到你要测的那个人。
 *   2. **信息类角色会因「中毒/醉酒」拿到假信息** ⇒ 被断言的角色**不能**被投毒；
 *      本文件统一把「投毒者」的目标指向**不产出被断言信息**的座位
 *      （S16 → 红唇女郎；S17 → 男爵，二者的「爪牙互认」都发生在投毒**之前**）。
 *   3. **酒鬼（drunk）按伪装身份行动**：夜序里它的 `role.id` 仍是 `drunk`，
 *      但弹窗标题是伪装角色名 ⇒ 断言「酒鬼」时只能查 `charadeRole`，
 *      且**不要**给 `drunk` 写 `targets`（伪装角色可能需要 2 个目标）。
 *   4. **占卜师有「红罗刹」干扰项**（会被当成恶魔）⇒ 断言【没有】时必须避开红罗刹座位。
 *   5. **陌客（recluse）在厨师/共情者探查里默认被当作邪恶**
 *      （`resolveRecluseForChef/Empath` 默认 true）⇒ 期望值必须把陌客算成邪恶。
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
/** 座位（0 基）→ 座位对象 */
function seatAt(snap: any, seatId: number): any {
  return (snap?.seats ?? []).find((s: any) => s.id === seatId);
}
/**
 * 座位（0 基）→ **对外显示**的角色名
 * （引擎的规则：酒鬼用伪装身份显示；被转化/继任的也用显示角色）
 */
function displayNameOf(seat: any): string | undefined {
  if (!seat) return undefined;
  return seat.effectiveRole?.name ?? seat.charadeRole?.name ?? seat.role?.name;
}
/** 场上「某类阵营」的所有座位（用于校验信息类角色给出的角色名必须在场） */
function seatsOfType(snap: any, type: string): any[] {
  return (snap?.seats ?? []).filter((s: any) => s.role?.type === type);
}

/**
 * 相邻邪恶对数（与引擎 `chef.ability.ts` 同规则）：
 *  · 邪恶 = 爪牙 / 恶魔（`isSeatEvil`）；
 *  · **陌客默认被当作邪恶**（`resolveRecluseForChef` 默认 true）。
 */
function adjacentEvilPairs(snap: any): number {
  const seats = [...(snap?.seats ?? [])].sort((a: any, b: any) => a.id - b.id);
  const n = seats.length;
  const evil = (i: number) => {
    const s = seats[i];
    if (s.role?.id === "recluse") return true; // 陌客：默认登记为邪恶
    return isMinionOrDemonRole(s.role);
  };
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (evil(i) && evil((i + 1) % n)) count++;
  }
  return count;
}

/** 某座位两侧存活邻座中的邪恶数（同上规则） */
function neighborEvilCount(snap: any, seatId: number): number {
  const n = (snap?.seats ?? []).length;
  const neighbors = [(seatId - 1 + n) % n, (seatId + 1) % n];
  return neighbors.filter((id) => {
    const s = seatAt(snap, id);
    if (!s || s.isDead) return false;
    if (s.role?.id === "recluse") return true; // 陌客：默认登记为邪恶
    return isMinionOrDemonRole(s.role);
  }).length;
}

/** 解析「A号和B号之中有一名是【X】」 */
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

/** 解析「恶魔互认」的爪牙名单（形如「爪牙是：4号、5号」）→ 座位号（1 基） */
function parseDemonMinions(dialog: string): number[] {
  const m = dialog.match(/爪牙是：([\d、号]+)/);
  if (!m) return [];
  return [...m[1].matchAll(/(\d+)号/g)].map((x) => Number(x[1]));
}

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

/** 整夜所有步骤的弹窗全文拼起来（找黎明报告等系统播报用） */
function allDialogs(report: NightReport): string {
  return report.steps.map((s) => s.dialog).join("|");
}

/**
 * 信息类角色的通用断言：
 *   · 弹窗给出「A号和B号之中有一名是【X】」；
 *   · X 必须是**本局真实在场**的该阵营角色（不能凭空造角色）；
 *   · A/B 之中**恰有一人**对外显示为 X（回查座位真值）。
 */
function expectInfoPair(
  snap: any,
  dialog: string,
  type: string,
  label: string
) {
  const pair = parsePair(dialog);
  expect.soft(pair, `${label}弹窗应给出「A号和B号之中有一名是【X】」`).not.toBeNull();
  if (!pair) return;
  const validNames = new Set(
    seatsOfType(snap, type)
      .map((s: any) => displayNameOf(s))
      .filter(Boolean) as string[]
  );
  expect.soft(
    validNames.has(pair.name),
    `${label}给出的【${pair.name}】必须是本局在场的${type}角色（实际在场：${[...validNames].join("、")}）`
  ).toBe(true);
  const shown = [pair.a0, pair.b0].map((id) => displayNameOf(seatAt(snap, id)));
  expect.soft(
    shown.filter((n) => n === pair.name).length,
    `${label}：${pair.a}号/${pair.b}号之中应恰有一人显示为【${pair.name}】（实际：${shown.join("、")}）`
  ).toBe(1);
}

// ═══════════════════════════════════════════════════════════════════
// G1 · S16 首夜：信息类 + 投毒者 + 管家 + 酒鬼 + 爪牙互认 + 小恶魔互认
// ═══════════════════════════════════════════════════════════════════
test.describe("无上愉悦 · G1 S16 首夜信息与干扰", () => {
  test.setTimeout(6 * 60_000);

  test("S16 首夜：洗衣妇/图书管理员/调查员/厨师/共情者/占卜师/管家/酒鬼/投毒者/小恶魔/红唇女郎", async ({
    page,
  }) => {
    const { script, game } = loadScene("S16");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });

    const demonSeat = seatOf(snap, "imp");
    const scarletSeat = seatOf(snap, "scarlet_woman");
    const poisonerSeat = seatOf(snap, "poisoner");
    const butlerSeat = seatOf(snap, "butler");
    const drunkSeat = seatOf(snap, "drunk");
    const redHerring = (snap.seats as any[]).find(
      (s) => s.isFortuneTellerRedHerring === true
    )?.id as number | undefined;

    // 占卜师：恶魔 + 一名「非恶魔且非红罗刹」⇒ 必答「有」
    const ftGood = (snap.seats as any[]).find(
      (s) =>
        s.id !== demonSeat &&
        s.id !== redHerring &&
        s.id !== poisonerSeat &&
        s.id !== scarletSeat
    ).id as number;
    // 管家的主人：选一个善良座位（不选自己）
    const masterSeat = (snap.seats as any[]).find(
      (s) => s.id !== butlerSeat && isTownsfolkRole(s.role)
    ).id as number;

    const report = await driveNight(page, [
      // 投毒者的目标必须是「不产出被断言信息」的座位：
      // 红唇女郎的「爪牙互认」发生在投毒**之前** ⇒ 她的互认信息是真的
      { role: "poisoner", targets: [scarletSeat + 1], note: "毒红唇女郎" },
      { role: "fortune_teller", targets: [demonSeat + 1, ftGood + 1], note: "查恶魔" },
      { role: "butler", targets: [masterSeat + 1], note: "认主" },
    ]);
    expect.soft(report.status, "S16 首夜应推进到白天").toBe("day");

    // ── ① 洗衣妇：两名候选中恰有一人是所指的镇民 ──
    expectInfoPair(snap, resultStep(report, "washerwoman")?.dialog ?? "", "townsfolk", "洗衣妇");

    // ── ② 图书管理员：外来者 ──
    expectInfoPair(snap, resultStep(report, "librarian")?.dialog ?? "", "outsider", "图书管理员");

    // ── ③ 调查员：爪牙 ──
    expectInfoPair(snap, resultStep(report, "investigator")?.dialog ?? "", "minion", "调查员");

    // ── ④ 厨师：数字 === 相邻邪恶对数（陌客默认算邪恶；本局无陌客）──
    const chefDialog = resultStep(report, "chef")?.dialog ?? "";
    const chefNum = Number((chefDialog.match(/(\d+)\s*对相邻的邪恶玩家/) ?? [])[1] ?? NaN);
    expect.soft(Number.isNaN(chefNum), "厨师弹窗应给出「N 对相邻的邪恶玩家」").toBe(false);
    expect.soft(chefNum, "厨师数字应等于独立算出的相邻邪恶对数").toBe(adjacentEvilPairs(snap));

    // ── ⑤ 共情者：数字 === 两侧存活邻座中的邪恶数 ──
    const empSeat = seatOf(snap, "empath");
    const empDialog = resultStep(report, "empath")?.dialog ?? "";
    const empNum = Number((empDialog.match(/邻座中有(\d+)名邪恶玩家/) ?? [])[1] ?? NaN);
    expect.soft(Number.isNaN(empNum), "共情者弹窗应给出「你的邻座中有N名邪恶玩家」").toBe(false);
    expect.soft(empNum, "共情者数字应等于两侧邻座的邪恶数").toBe(neighborEvilCount(snap, empSeat));

    // ── ⑥ 占卜师：查「恶魔 + 好人」⇒ 答「有」 ──
    const ftSteps = stepsOf(report, "fortune_teller");
    expect.soft(ftSteps.length, "占卜师应有行动步骤").toBeGreaterThan(0);
    expect.soft(
      ftSteps.some((x) => x.picked.includes(demonSeat + 1)),
      `占卜师应点名恶魔所在的 ${demonSeat + 1} 号`
    ).toBe(true);
    expect.soft(resultStep(report, "fortune_teller")?.dialog ?? "", "占卜师查询「恶魔+好人」应回答「有」").toMatch(
      /【有】/
    );

    // ── ⑦ 管家：masterId 落库（认的是 1 基 masterSeat+1 ⇒ 0 基 masterSeat）──
    const after = await readSnapshotSafe(page);
    expect.soft(
      after?.seats?.find((s: any) => s.id === butlerSeat)?.masterId,
      "管家认主应落库 masterId"
    ).toBe(masterSeat);

    // ── ⑧ 投毒者：isPoisoned 落库（次日黄昏才清）──
    expect
      .soft(
        after?.seats?.find((s: any) => s.id === scarletSeat)?.isPoisoned,
        "投毒者下毒后目标应 isPoisoned=true"
      )
      .toBe(true);

    // ── ⑨ 酒鬼：伪装身份已配 + 真实身份仍是酒鬼 + 引擎认得出「醉酒」──
    const drunkSeatObj = after?.seats?.find((s: any) => s.id === drunkSeat);
    expect.soft(drunkSeatObj, "S16 阵容里应有酒鬼").toBeTruthy();
    expect.soft(drunkSeatObj?.charadeRole?.id, "酒鬼必须有伪装身份").toBeTruthy();
    expect.soft(drunkSeatObj?.charadeRole?.id, "酒鬼伪装身份不得是酒鬼自己").not.toBe("drunk");
    expect.soft(drunkSeatObj?.charadeRole?.type, "酒鬼伪装身份必须是镇民（官方：以为自己是镇民）").toBe(
      "townsfolk"
    );
    expect.soft(drunkSeatObj?.role?.id, "酒鬼的真实角色仍是酒鬼").toBe("drunk");
    expect.soft(
      (drunkSeatObj?.statusEffects ?? []).some((e: any) => e.type === "drunk"),
      "酒鬼身上应落「drunk」状态效果（引擎据此判定能力失效）"
    ).toBe(true);

    // ── ⑩ 爪牙互认：红唇女郎与投毒者都应得知恶魔座位 ──
    const scarletInfo = resultStep(report, "scarlet_woman")?.dialog ?? "";
    const poisonerInfo = resultStep(report, "poisoner")?.dialog ?? "";
    expect.soft(scarletInfo, "红唇女郎应有「爪牙互认」结果弹窗").toMatch(/爪牙互认/);
    expect.soft(
      scarletInfo.includes(`恶魔是：${demonSeat + 1}号`),
      `红唇女郎的爪牙互认应告知恶魔是 ${demonSeat + 1} 号（实际：${scarletInfo}）`
    ).toBe(true);
    expect.soft(
      poisonerInfo.includes(`恶魔是：${demonSeat + 1}号`),
      `投毒者的爪牙互认应告知恶魔是 ${demonSeat + 1} 号（实际：${poisonerInfo}）`
    ).toBe(true);

    // ── ⑪ 小恶魔：首夜「恶魔互认」应认出两名爪牙 ──
    const impInfo = resultStep(report, "imp")?.dialog ?? "";
    expect.soft(impInfo, "小恶魔应有「恶魔互认」结果弹窗").toMatch(/恶魔互认/);
    const impMinions = parseDemonMinions(impInfo);
    expect.soft(
      impMinions.includes(scarletSeat + 1),
      `小恶魔应认出红唇女郎（名单=${impMinions.join("、")}）`
    ).toBe(true);
    expect.soft(
      impMinions.includes(poisonerSeat + 1),
      `小恶魔应认出投毒者（名单=${impMinions.join("、")}）`
    ).toBe(true);

    // ── ⑫ 反证：首夜无人死亡（小恶魔首夜不杀人）──
    const nightDeaths = (after?.seats ?? []).filter(
      (s: any) => s.isDead && s.diedAtNight === 1
    );
    expect.soft(nightDeaths.length, "首夜不应有人死亡").toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G2 · S16 第 2/3 夜：僧侣保护 + 小恶魔夜杀
// ═══════════════════════════════════════════════════════════════════
test.describe("无上愉悦 · G2 S16 僧侣保护与小恶魔夜杀", () => {
  test.setTimeout(8 * 60_000);

  test("僧侣保护生效（第2夜被杀者不死）+ 小恶魔第3夜夜杀落库", async ({ page }) => {
    const { script, game } = loadScene("S16");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });

    const demonSeat = seatOf(snap, "imp");
    const monkSeat = seatOf(snap, "monk");
    const poisonedSeat = seatOf(snap, "scarlet_woman");

    // 第 2 夜：小恶魔杀「被僧侣保护的人」⇒ 应当无人死亡
    const protectedSeat = seatOf(snap, "butler");
    // 第 3 夜：小恶魔杀「无人保护的人」⇒ 应当真的死
    const victimSeat = seatOf(snap, "investigator");
    // 僧侣第 3 夜保护另一个人（不能是受害者）
    const protectedSeat2 = seatOf(snap, "chef");

    expect((await driveNight(page, [{ role: "poisoner", targets: [poisonedSeat + 1] }])).status).toBe(
      "day"
    );
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜（不提名）").toBe("night");

    // ── 第 2 夜：僧侣保护 + 小恶魔点杀同一目标 ──
    const n2 = await driveNight(page, [
      { role: "poisoner", targets: [poisonedSeat + 1] },
      { role: "monk", targets: [protectedSeat + 1], note: "保护管家" },
      { role: "imp", targets: [protectedSeat + 1], note: "杀管家（被保护）" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    const after2 = await readSnapshotSafe(page);
    expect.soft(
      after2?.seats?.find((s: any) => s.id === protectedSeat)?.isDead,
      "僧侣保护的座位不得死亡"
    ).toBeFalsy();
    expect
      .soft(
        after2?.seats?.find((s: any) => s.id === protectedSeat)?.isProtected,
        "僧侣的保护应落库 isProtected"
      )
      .toBe(true);
    const impStep2 = stepsOf(n2, "imp")[0];
    expect.soft(impStep2, "第 2 夜应有小恶魔行动步骤").toBeTruthy();
    expect.soft(impStep2?.picked, "小恶魔应选中被保护的那个座位").toContain(protectedSeat + 1);
    expect.soft(allDialogs(n2), "被保护时黎明应是平安夜").toMatch(/平安夜|无人死亡/);

    // ── 第 3 夜：小恶魔杀一个**没有**被保护的人 ⇒ 必须真死 ──
    expect((await driveDusk(page, {})).status, "第 2 昼应能直接入夜").toBe("night");
    const n3 = await driveNight(page, [
      { role: "poisoner", targets: [poisonedSeat + 1] },
      { role: "monk", targets: [protectedSeat2 + 1], note: "保护厨师（别挡刀）" },
      { role: "imp", targets: [victimSeat + 1], note: "杀调查员" },
    ]);
    expect.soft(n3.status, "第 3 夜应推进到白天").toBe("day");

    const after3 = await readSnapshotSafe(page);
    const victim = after3?.seats?.find((s: any) => s.id === victimSeat);
    expect.soft(victim?.isDead, "第 3 夜小恶魔的夜杀应真的杀人").toBe(true);
    expect.soft(victim?.diedAtNight, "死者应记为第 3 夜死亡").toBe(3);
    const nightDeaths3 = (after3?.seats ?? []).filter(
      (s: any) => s.isDead && s.diedAtNight === 3
    );
    expect.soft(nightDeaths3.length, "第 3 夜应恰好 1 人死亡").toBe(1);
    // 反证：小恶魔自己不得死于自己的夜杀
    expect.soft(after3?.seats?.find((s: any) => s.id === demonSeat)?.isDead, "小恶魔不得被自己的夜杀反噬").toBe(
      false
    );
    // 反证：僧侣保护的人不得死亡
    expect.soft(
      after3?.seats?.find((s: any) => s.id === protectedSeat2)?.isDead,
      "僧侣保护的厨师不得死亡"
    ).toBeFalsy();
    expect.soft(monkSeat, "僧侣应在场").toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G3 · S16 处决小恶魔 ⇒ 红唇女郎继承
// ═══════════════════════════════════════════════════════════════════
test.describe("无上愉悦 · G3 恶魔继承", () => {
  test.setTimeout(6 * 60_000);

  test("处决小恶魔（存活 ≥5）⇒ 红唇女郎变恶魔、游戏继续", async ({ page }) => {
    const { script, game } = loadScene("S16");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const demonSeat = seatOf(snap, "imp");
    const swSeat = seatOf(snap, "scarlet_woman");
    const nominator = (snap.seats as any[]).find(
      (s: any) => s.id !== demonSeat && isTownsfolkRole(s.role)
    ).id as number;

    const n1 = await driveNight(page, [
      { role: "poisoner", targets: [seatOf(snap, "scarlet_woman") + 1] },
    ]);
    expect(n1.status, "首夜应推进到白天").toBe("day");

    const dusk = await driveDusk(page, {
      nominator: nominator + 1,
      nominee: demonSeat + 1,
    });
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
    expect.soft(dusk.status, "继承后游戏必须继续（进入下一夜），不得判善良胜").toBe("night");

    // 反证：终局 UI 不得出现（不得判善良胜）
    const live = await readLiveEndState(page);
    expect.soft(live.gameOverUi, "恶魔被处决且红唇女郎继承后不得出现终局").toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G4 · S17 首夜：信息类 + 男爵 + 陌客 + 酒鬼 + 僵怖互认
// ═══════════════════════════════════════════════════════════════════
test.describe("无上愉悦 · G4 S17 首夜信息与男爵", () => {
  test.setTimeout(6 * 60_000);

  test("S17 首夜：洗衣妇/图书管理员/调查员/厨师/共情者/管家/酒鬼/投毒者/男爵/僵怖/陌客", async ({
    page,
  }) => {
    const { script, game } = loadScene("S17");
    const lineup = game.seats.map((s: any) => s.id);
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup,
    });

    const demonSeat = seatOf(snap, "zombuul");
    const baronSeat = seatOf(snap, "baron");
    const poisonerSeat = seatOf(snap, "poisoner");
    const butlerSeat = seatOf(snap, "butler");
    const drunkSeat = seatOf(snap, "drunk");
    const recluseSeat = seatOf(snap, "recluse");
    const masterSeat = (snap.seats as any[]).find(
      (s) => s.id !== butlerSeat && isTownsfolkRole(s.role)
    ).id as number;

    // ── 男爵：配比修正（外来者池只有 3 ⇒ +2 被钳制到 +1）──
    const byType = (t: string) =>
      (snap.seats as any[]).filter((s) => s.role?.type === t).length;
    const expected = computeSetupComposition(game.players, {
      baronInPlay: lineup.includes("baron"),
      availableOutsiderPool: 3, // 无上愉悦剧本的外来者：管家 / 酒鬼 / 陌客
      inPlayRoleIds: lineup,
    });
    expect.soft(byType("townsfolk"), `男爵在场 ⇒ 镇民应为 ${expected.counts.townsfolk}`).toBe(
      expected.counts.townsfolk
    );
    expect.soft(byType("outsider"), `男爵在场 ⇒ 外来者应为 ${expected.counts.outsider}`).toBe(
      expected.counts.outsider
    );
    expect.soft(byType("minion"), "爪牙应为 2（男爵 + 投毒者）").toBe(expected.counts.minion);
    expect.soft(byType("demon"), "恶魔应为 1").toBe(expected.counts.demon);
    expect.soft(
      expected.warnings.length,
      "外来者池只有 3 ⇒ 男爵的 +2 外来者应被钳制并产生告警"
    ).toBeGreaterThan(0);

    const report = await driveNight(page, [
      // 投毒者的目标 = 男爵（男爵的「爪牙互认」发生在投毒之前 ⇒ 互认信息是真的）
      { role: "poisoner", targets: [baronSeat + 1], note: "毒男爵" },
      { role: "butler", targets: [masterSeat + 1], note: "认主" },
    ]);
    expect.soft(report.status, "S17 首夜应推进到白天").toBe("day");

    // ── 洗衣妇 ──
    expectInfoPair(snap, resultStep(report, "washerwoman")?.dialog ?? "", "townsfolk", "洗衣妇");
    // ── 图书管理员 ──
    expectInfoPair(snap, resultStep(report, "librarian")?.dialog ?? "", "outsider", "图书管理员");
    // ── 调查员 ──
    expectInfoPair(snap, resultStep(report, "investigator")?.dialog ?? "", "minion", "调查员");

    // ── 厨师：陌客默认被当作邪恶 ⇒ 期望值必须把陌客算进去 ──
    const chefDialog = resultStep(report, "chef")?.dialog ?? "";
    const chefNum = Number((chefDialog.match(/(\d+)\s*对相邻的邪恶玩家/) ?? [])[1] ?? NaN);
    expect.soft(Number.isNaN(chefNum), "厨师弹窗应给出「N 对相邻的邪恶玩家」").toBe(false);
    expect.soft(chefNum, "厨师数字应等于相邻邪恶对数（陌客按邪恶计）").toBe(adjacentEvilPairs(snap));

    // ── 共情者 ──
    const empSeat = seatOf(snap, "empath");
    const empDialog = resultStep(report, "empath")?.dialog ?? "";
    const empNum = Number((empDialog.match(/邻座中有(\d+)名邪恶玩家/) ?? [])[1] ?? NaN);
    expect.soft(Number.isNaN(empNum), "共情者弹窗应给出「你的邻座中有N名邪恶玩家」").toBe(false);
    expect.soft(empNum, "共情者数字应等于两侧邻座的邪恶数（陌客按邪恶计）").toBe(
      neighborEvilCount(snap, empSeat)
    );

    // ── 管家：masterId 落库 ──
    const after = await readSnapshotSafe(page);
    expect.soft(
      after?.seats?.find((s: any) => s.id === butlerSeat)?.masterId,
      "管家认主应落库 masterId"
    ).toBe(masterSeat);

    // ── 投毒者：男爵中毒落库 ──
    expect
      .soft(
        after?.seats?.find((s: any) => s.id === baronSeat)?.isPoisoned,
        "投毒者下毒后男爵应 isPoisoned=true"
      )
      .toBe(true);

    // ── 酒鬼：伪装身份 ──
    const drunkSeatObj = after?.seats?.find((s: any) => s.id === drunkSeat);
    expect.soft(drunkSeatObj?.charadeRole?.id, "酒鬼必须有伪装身份").toBeTruthy();
    expect.soft(drunkSeatObj?.charadeRole?.id, "酒鬼伪装身份不得是酒鬼自己").not.toBe("drunk");
    expect.soft(drunkSeatObj?.charadeRole?.type, "酒鬼伪装身份必须是镇民").toBe("townsfolk");
    expect.soft(drunkSeatObj?.role?.id, "酒鬼的真实角色仍是酒鬼").toBe("drunk");
    expect.soft(
      (drunkSeatObj?.statusEffects ?? []).some((e: any) => e.type === "drunk"),
      "酒鬼身上应落「drunk」状态效果"
    ).toBe(true);

    // ── 男爵：爪牙互认得知恶魔座位 ──
    const baronInfo = resultStep(report, "baron")?.dialog ?? "";
    expect.soft(baronInfo, "男爵应有「爪牙互认」结果弹窗").toMatch(/爪牙互认/);
    expect.soft(
      baronInfo.includes(`恶魔是：${demonSeat + 1}号`),
      `男爵的爪牙互认应告知恶魔是 ${demonSeat + 1} 号（实际：${baronInfo}）`
    ).toBe(true);

    // ── 僵怖：首夜「恶魔互认」应认出两名爪牙 ──
    const zomInfo = resultStep(report, "zombuul")?.dialog ?? "";
    expect.soft(zomInfo, "僵怖应有「恶魔互认」结果弹窗").toMatch(/恶魔互认/);
    const zomMinions = parseDemonMinions(zomInfo);
    expect.soft(zomMinions.includes(baronSeat + 1), `僵怖应认出男爵（名单=${zomMinions.join("、")}）`).toBe(
      true
    );
    expect.soft(
      zomMinions.includes(poisonerSeat + 1),
      `僵怖应认出投毒者（名单=${zomMinions.join("、")}）`
    ).toBe(true);

    // ── 陌客：信息类查询不得改写其真实身份 ──
    const recluse = after?.seats?.find((s: any) => s.id === recluseSeat);
    expect.soft(recluse?.role?.id, "陌客的真实角色仍是陌客（查询不得改写真值）").toBe("recluse");
    expect.soft(recluse?.role?.type, "陌客的类型仍是外来者").toBe("outsider");
  });
});

// ═══════════════════════════════════════════════════════════════════
// G5 · S17 第 2 夜：僵怖击杀 ⇒ 守鸦人夜里被杀后被唤醒
// ═══════════════════════════════════════════════════════════════════
test.describe("无上愉悦 · G5 S17 僵怖夜杀与守鸦人", () => {
  test.setTimeout(8 * 60_000);

  test("僵怖夜里杀守鸦人 ⇒ 守鸦人死亡落库并被追加唤醒得知一名玩家角色", async ({ page }) => {
    const { script, game } = loadScene("S17");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });

    const demonSeat = seatOf(snap, "zombuul");
    const rkSeat = seatOf(snap, "ravenkeeper");
    const baronSeat = seatOf(snap, "baron");
    // 守鸦人死后要查看的玩家（选一个存活善良座位）
    const rkTarget = (snap.seats as any[]).find(
      (s: any) => s.id !== rkSeat && isTownsfolkRole(s.role) && !s.isDead
    ).id as number;

    expect((await driveNight(page, [{ role: "poisoner", targets: [baronSeat + 1] }])).status).toBe(
      "day"
    );
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜（不提名）").toBe("night");

    // ── 第 2 夜：僵怖杀守鸦人；守鸦人死后被追加唤醒 ──
    const n2 = await driveNight(page, [
      { role: "poisoner", targets: [baronSeat + 1] },
      { role: "zombuul", targets: [rkSeat + 1], note: "杀守鸦人" },
      { role: "ravenkeeper", targets: [rkTarget + 1], note: "查看一个玩家" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    const after = await readSnapshotSafe(page);
    const rk = after?.seats?.find((s: any) => s.id === rkSeat);

    // ── 僵怖：夜杀真的落库 ──
    expect.soft(rk?.isDead, "守鸦人应被僵怖夜杀").toBe(true);
    expect.soft(rk?.diedAtNight, "守鸦人应记为第 2 夜死亡").toBe(2);
    expect.soft(rk?.deathSource, "守鸦人的死因应是 zombuul_kill").toBe("zombuul_kill");
    const nightDeaths = (after?.seats ?? []).filter(
      (s: any) => s.isDead && s.diedAtNight === 2
    );
    expect.soft(nightDeaths.length, "该夜应恰好 1 人死亡").toBe(1);
    // 反证：僵怖自己不得死于自己的夜杀
    expect.soft(after?.seats?.find((s: any) => s.id === demonSeat)?.isDead, "僵怖不得被自己的夜杀反噬").toBe(
      false
    );

    // ── 守鸦人：死后被追加唤醒并得知一名玩家的角色 ──
    const rkSteps = stepsOf(n2, "ravenkeeper");
    expect.soft(rkSteps.length, "守鸦人夜里被杀后必须有追加唤醒步骤").toBeGreaterThan(0);
    const rkDialog = rkSteps.map((x) => x.dialog).join("|");
    expect.soft(rkDialog, "守鸦人应看到「某号 的角色是【X】」形态的结果弹窗").toMatch(/角色是【.+?】/);
    const m = rkDialog.match(/(\d+)号\D{0,10}角色是【(.+?)】/);
    expect.soft(m, "守鸦人的信息应可解析出座位与角色名").not.toBeNull();
    if (m) {
      const learnedSeat = Number(m[1]) - 1;
      expect.soft(
        displayNameOf(seatAt(snap, learnedSeat)),
        `守鸦人看到的角色名应与 ${learnedSeat + 1} 号的真实身份一致`
      ).toBe(m[2]);
    }
  });
});
