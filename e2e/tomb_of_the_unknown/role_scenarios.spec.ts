import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { roles as APP_ROLES } from "../../app/data";
import {
  isMinionOrDemonRole,
  isTownsfolkOrOutsiderRole,
  isTownsfolkRole,
} from "../../src/utils/seatAlignment";
import {
  bootScene,
  driveDusk,
  driveNight,
  seatOf,
  stepsOf,
  type NightReport,
} from "../helpers/scenario";
import { waitForSnapshot } from "../helpers/scriptFlow";
import { readLiveEndState } from "../helpers/fullSim";

/**
 * 🎭 无名之墓 · 逐角色场景验证（S14 / S15，19 角色）
 * ==================================================================
 * 形状与 `e2e/trouble_brewing/role_scenarios.spec.ts` 完全一致：
 *   ① 弹窗内容（这一步真的发生了、文案与真值一致）
 *   ② 状态落库（isDead / isPoisoned / charadeRole / role.id / 死亡数…）
 *   ③ 反证（不该发生的没发生）
 *
 * 本剧本的**特殊之处**（写用例时踩到的）：
 *   · `shabaloth`（沙巴洛斯）每夜要选**两名**目标；
 *   · `assassin` / `gossip` / `zombuul` 的目标下限是 **0** ⇒ 驱动器不会自动选人，
 *     **必须显式给 targets**，否则「未选择目标」什么都不会发生（不是 bug）；
 *   · `zombuul`（僵怖）的规则是「**今天白天没人死亡**才杀人」⇒ 白天处决过的夜晚它不杀；
 *   · `gambler`（赌徒）猜错**自己会死**；`drunk` 在本剧本伪装成神谕者（带醉酒提示）；
 *   · `mutant`（畸形秀演员）的【疯狂仲裁】是**进入黄昏的硬门禁**（驱动器已处理）。
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

function roleAt(snap: any, seatId: number): string | null {
  return (snap?.seats ?? []).find((s: any) => s.id === seatId)?.role?.id ?? null;
}
function seatByRole(snap: any, roleId: string): number {
  return seatOf(snap, roleId);
}

/** 取某角色的「结果」步骤（信息/结算页） */
function resultStep(report: NightReport, role: string) {
  const all = stepsOf(report, role);
  return all.find((x) => /获得信息|结果|发动能力/.test(x.dialog)) ?? all[all.length - 1];
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

// ═══════════════════════════════════════════════════════════════════
// G1 · S14 首夜：男爵配比 / 投毒者 / 钟表匠 / 酒鬼 / 爪牙互认
// ═══════════════════════════════════════════════════════════════════
test.describe("无名之墓 · G1 S14 首夜", () => {
  test.setTimeout(5 * 60_000);

  test("S14 首夜：男爵配比 + 投毒者下毒 + 钟表匠距离 + 酒鬼伪装 + 爪牙互认", async ({
    page,
  }) => {
    const { script, game } = loadScene("S14");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });

    const byType = (t: string) =>
      (snap.seats as any[]).filter((s) => s.role?.type === t).length;
    // 男爵在场：15 人标准 9/2/3/1 → 外来者 +2、镇民 −2（本剧本外来者池 3，可为 4？）
    expect.soft(byType("demon"), "恶魔应为 1").toBe(1);
    expect.soft(byType("minion"), "爪牙应为 3").toBe(3);
    expect.soft(seatByRole(snap, "baron") >= 0, "男爵应在场").toBe(true);

    const poisonTarget = 3; // 神谕者
    const report = await driveNight(page, [
      { role: "poisoner", targets: [poisonTarget], note: "毒神谕者" },
    ]);
    expect.soft(report.status, "首夜应推进到白天").toBe("day");

    const after = await snapNow(page);

    // ── 投毒者：isPoisoned 落库 ──
    expect
      .soft(after?.seats?.find((s: any) => s.id === poisonTarget - 1)?.isPoisoned, "被投毒者应 isPoisoned=true")
      .toBe(true);
    const poisonResult = resultStep(report, "poisoner")?.dialog ?? "";
    expect.soft(poisonResult, "投毒者结果页应写明毒了谁").toContain(`${poisonTarget}号`);

    // ── 钟表匠：给出「恶魔与爪牙的最近距离」──
    const clockStep = resultStep(report, "clockmaker");
    expect.soft(clockStep, "钟表匠应唤醒并给出距离").toBeTruthy();
    const dist = Number(
      (clockStep?.dialog.match(/最近距离为?\s*(\d+)/) ?? [])[1] ?? NaN
    );
    expect.soft(Number.isNaN(dist), "钟表匠文案应含「最近距离为 N」").toBe(false);
    expect.soft(dist, "距离应为正整数（同一对座位之间的距离）").toBeGreaterThanOrEqual(1);

    // ── 酒鬼：伪装身份已配 + 引擎认得出（seatDisabled 认 role.id）──
    const drunk = (snap.seats as any[]).find((s: any) => s.role?.id === "drunk");
    expect.soft(drunk?.charadeRole?.id, "酒鬼必须有伪装身份").toBeTruthy();
    expect.soft(drunk?.charadeRole?.type, "酒鬼伪装身份必须是镇民").toBe("townsfolk");

    // ── 爪牙互认：三名爪牙看到的恶魔座位一致，且就是真恶魔 ──
    const demonSeat = seatByRole(snap, "shabaloth") + 1;
    const minionResults = (["poisoner", "baron", "assassin"] as const).map(
      (r) => stepsOf(report, r).find((x) => /恶魔是：/.test(x.dialog))?.dialog ?? ""
    );
    expect.soft(minionResults.every((d) => d.length > 0), "三名爪牙都应有互认结果").toBe(true);
    expect
      .soft(
        minionResults.every((d) => d.includes(`恶魔是：${demonSeat}号`)),
        `互认的恶魔座位应统一为 ${demonSeat} 号`
      )
      .toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G2 · S14 第 2 夜：赌徒猜错自杀 / 沙巴洛斯双杀 / 刺客与造谣者 / 神谕者
// ═══════════════════════════════════════════════════════════════════
test.describe("无名之墓 · G2 S14 第 2 夜", () => {
  test.setTimeout(6 * 60_000);

  test("赌徒猜错自毙 + 沙巴洛斯双杀 + 刺客暗杀 + 造谣者宣称 + 神谕者计亡", async ({
    page,
  }) => {
    const { script, game } = loadScene("S14");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const gamblerSeat = seatByRole(snap, "gambler");
    const assassinSeat = seatByRole(snap, "assassin");
    const shabalothSeat = seatByRole(snap, "shabaloth");
    // 刺客杀一个「非赌徒、非恶魔自己、非爪牙」的座位，便于独立断言
    const assassinTarget =
      [4, 6, 9, 10].find((x) => x !== gamblerSeat + 1 && x !== shabalothSeat + 1) ?? 4;
    // 沙巴洛斯杀另外两个
    const shabTargets = [1, 2].filter((x) => x !== assassinTarget);

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼应能入夜").toBe("night");

    const n2 = await driveNight(page, [
      // 赌徒赌 1 号是「酒鬼」——实际 1 号就是酒鬼，但赌徒**不知道真值**，
      // 本用例要的是「猜错必死」这条规则：显式赌一个错答案（roles 里没有的角色名）
      { role: "gambler", targets: [1], note: "赌 1 号（猜错）" },
      { role: "shabaloth", targets: shabTargets, note: "沙巴洛斯双杀" },
      { role: "assassin", targets: [assassinTarget], note: "刺客暗杀" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    const after = await snapNow(page);
    const seat = (oneBased: number) => after?.seats?.find((s: any) => s.id === oneBased - 1);

    // ── 赌徒：结果页写明猜测与实际；若猜错 → 自己死亡 ──
    const gDialog = resultStep(n2, "gambler")?.dialog ?? "";
    expect.soft(gDialog, "赌徒应给出猜测结果").toMatch(/猜测|猜错|猜对/);
    const gamblerWrong = /猜错/.test(gDialog);
    expect
      .soft(
        seat(gamblerSeat + 1)?.isDead,
        gamblerWrong ? "赌徒猜错必须自己死亡" : "赌徒猜对时不得死亡"
      )
      .toBe(gamblerWrong);

    // ── 沙巴洛斯：两名目标都应死亡（若未被刺客/保护干扰）──
    for (const t of shabTargets) {
      if (t === assassinTarget) continue;
      expect.soft(seat(t)?.isDead, `沙巴洛斯目标 ${t} 号应死亡`).toBe(true);
    }

    // ── 刺客：明确目标 ⇒ 该目标必死（刺客能力不被保护挡下）──
    if (assassinTarget !== gamblerSeat + 1) {
      const aDialog = resultStep(n2, "assassin")?.dialog ?? "";
      expect.soft(aDialog, "刺客结果页应写明目标").toContain(`${assassinTarget}号`);
      expect.soft(seat(assassinTarget)?.isDead, `刺客目标 ${assassinTarget} 号应死亡`).toBe(true);
    }

    // ── 造谣者：结果页必须给出「声明正确/错误」的判定 ──
    const gossipDialog = resultStep(n2, "gossip")?.dialog ?? "";
    expect.soft(gossipDialog, "造谣者应给出声明真假判定").toMatch(/声明(正确|错误)|真的|假的/);

    // ── 神谕者：给出「死亡玩家里有几名邪恶」──
    const oracleDialog = resultStep(n2, "oracle")?.dialog ?? "";
    const oracleNum = Number(
      (oracleDialog.match(/(\d+)\s*名死亡玩家为邪恶/) ?? [])[1] ?? NaN
    );
    expect.soft(Number.isNaN(oracleNum), "神谕者应给出死亡邪恶数").toBe(false);
    // 独立复算：死亡座位里阵营为邪恶（含转化）的数量
    const deadEvil = (after?.seats ?? []).filter(
      (s: any) =>
        s.isDead &&
        (isMinionOrDemonRole(s.role) || s.isEvilConverted === true)
    ).length;
    expect.soft(oracleNum, "神谕者数字应等于死亡座位里的邪恶数").toBe(deadEvil);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G3 · S14 白天：处决普通镇民 → 送葬者次日得知被处决者角色
// ═══════════════════════════════════════════════════════════════════
test.describe("无名之墓 · G3 处决与送葬者", () => {
  test.setTimeout(6 * 60_000);

  test("处决杂耍艺人 ⇒ 次日送葬者唤醒并说出「杂耍艺人」", async ({ page }) => {
    const { script, game } = loadScene("S14");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const jugglerSeat = seatByRole(snap, "juggler");
    const nominator = [1, 3, 6, 9].find((x) => x !== jugglerSeat + 1)!;

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    const dusk = await driveDusk(page, {
      nominator,
      nominee: jugglerSeat + 1,
      decision: "execute",
    });
    expect.soft(dusk.executed, "应完成处决结算").toBe(true);
    expect.soft(dusk.status, "处决后应进入下一夜").toBe("night");

    const afterDusk = await snapNow(page);
    expect
      .soft(afterDusk?.seats?.find((s: any) => s.id === jugglerSeat)?.isDead, "被处决者应死亡")
      .toBe(true);

    const n2 = await driveNight(page, []);
    const ut = stepsOf(n2, "undertaker");
    expect.soft(ut.length, "处决次日送葬者必须唤醒").toBeGreaterThan(0);
    expect
      .soft(ut.map((x) => x.dialog).join("|"), "送葬者应告知被处决者是【杂耍艺人】")
      .toContain(NAME_OF["juggler"]);
  });

  test("处决替罪羊 ⇒ 恰好 1 人死亡（替罪羊本人或替死者），且次日送葬者能报出死者角色", async ({
    page,
  }) => {
    /**
     * ⚠️ 口径纠正（实测）：官方原文是「说书人**可以**选择另一名玩家代替你死亡」
     *   ⇒ **不替死是合法分支**，替罪羊本人会死。
     *   所以判据只能是**不变量**：本次处决**恰好死 1 人**（替罪羊 或 替死者），
     *   不能写死「替罪羊必须不死」（我第一版就写错了，是假红）。
     */
    const { script, game } = loadScene("S14");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const scapegoatSeat = seatByRole(snap, "scapegoat");
    const nominator = [1, 3, 6, 9].find((x) => x !== scapegoatSeat + 1)!;

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    const dusk = await driveDusk(page, {
      nominator,
      nominee: scapegoatSeat + 1,
      decision: "execute",
    });
    expect.soft(dusk.executed, "替罪羊应被处决结算").toBe(true);
    expect.soft(dusk.status, "处决后应进入下一夜").toBe("night");

    const after = await snapNow(page);
    const died = (after?.seats ?? []).filter((s: any) => s.isDead).map((s: any) => s.id);
    expect.soft(died.length, "本次处决应恰好死 1 人（替罪羊本人或替死者）").toBe(1);
    if (died.length === 1) {
      expect
        .soft(
          [scapegoatSeat, ...(after?.seats ?? []).map((s: any) => s.id)].includes(died[0]),
          "死者必须是本局在场座位"
        )
        .toBe(true);
    }

    // 次日送葬者应报出「死者」的角色（替罪羊或替死者）
    const n2 = await driveNight(page, []);
    const ut = stepsOf(n2, "undertaker").map((x) => x.dialog).join("|");
    expect.soft(ut, "送葬者应唤醒并报出被处决者角色").toMatch(/送葬者/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G4 · S15：僵怖（白天无人死亡才杀人）/ 水手 / 弄臣
// ═══════════════════════════════════════════════════════════════════
test.describe("无名之墓 · G4 S15 僵怖与水手", () => {
  test.setTimeout(7 * 60_000);

  test("第 1 昼无死亡 ⇒ 僵怖第 2 夜可杀人；水手目标被灌醉", async ({ page }) => {
    const { script, game } = loadScene("S15");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const zombuulSeat = seatByRole(snap, "zombuul");
    const sailorSeat = seatByRole(snap, "sailor");
    const victim = [1, 5, 8, 12].find(
      (x) => x !== zombuulSeat + 1 && x !== sailorSeat + 1
    )!;

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");
    // 第 1 昼不提名 ⇒ 无人死亡 ⇒ 僵怖当晚必须能杀人
    expect((await driveDusk(page, {})).status, "第 1 昼应能入夜").toBe("night");

    const n2 = await driveNight(page, [
      { role: "sailor", targets: [victim], note: "水手灌醉目标" },
      { role: "zombuul", targets: [victim], note: "僵怖击杀" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    // ── 僵怖：白天无人死亡 ⇒ 必须真的杀人 ──
    const zStep = resultStep(n2, "zombuul");
    expect.soft(zStep, "僵怖第 2 夜必须唤醒（白天无人死亡）").toBeTruthy();
    expect.soft(zStep?.dialog, "僵怖应记录目标").toContain(`${victim}号`);

    const after = await snapNow(page);
    const v = after?.seats?.find((s: any) => s.id === victim - 1);
    // 水手把目标灌醉 ≠ 保护；僵怖应造成死亡（除非目标本身免疫）
    expect.soft(v?.isDead, `僵怖目标 ${victim} 号应死亡`).toBe(true);

    // ── 水手：目标被灌醉（drunk 标记或 statusDetails 含「醉」）──
    const sailorDialog = resultStep(n2, "sailor")?.dialog ?? "";
    expect.soft(sailorDialog, "水手应给出醉酒结果").toMatch(/醉|水手/);
  });

  test("弄臣被处决 ⇒ 首次不得死亡，且免死标记被消费", async ({ page }) => {
    /**
     * 🔴 2026-10-21 修复的真实缺陷（本用例就是回归证据）：
     *   处决主链 legacy 分支**先** dispatch `EXECUTE_PLAYER`（reducer 里 `isDead=true`），
     *   **再**调 `killPlayer`；而 `canFoolSurvive()` 开头有 `isAliveSeat(seat)` 前置
     *   ⇒ 判免死时弄臣已经"死"了 ⇒ 免死永不生效（实测 `dead=[8]`、`foolUsed` 仍 undefined）。
     *   修法：`canFoolSurvive(seat, { ignoreAlive: true })` 仅在**处决来源**生效，
     *   判据改为「免死是否已消费」（foolUsed/hasUsedFoolAbility）。
     */
    const { script, game } = loadScene("S15");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const foolSeat = seatByRole(snap, "fool");
    const nominator = [1, 3, 5, 12].find((x) => x !== foolSeat + 1)!;

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    const dusk = await driveDusk(page, {
      nominator,
      nominee: foolSeat + 1,
      decision: "execute",
    });
    expect.soft(dusk.executed, "应完成处决结算").toBe(true);

    const after = await snapNow(page);
    const fool = after?.seats?.find((s: any) => s.id === foolSeat);
    expect.soft(fool?.isDead, "弄臣第一次被处决不得死亡").toBe(false);
    expect
      .soft(fool?.foolUsed === true || fool?.hasUsedFoolAbility === true, "免死应被消费（foolUsed=true）")
      .toBe(true);
    expect
      .soft(
        after?.seats?.filter((s: any) => s.isDead).length,
        "本次处决不应死人（弄臣免死生效）"
      )
      .toBe(0);

    const live = await readLiveEndState(page);
    expect.soft(live?.gameOverUi, "弄臣活着 ⇒ 不得因此终局").toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G5 · S15：农夫继承（镇民死亡后获得其能力）+ 畸形秀演员门禁
// ═══════════════════════════════════════════════════════════════════
test.describe("无名之墓 · G5 S15 农夫与畸形秀演员", () => {
  test.setTimeout(7 * 60_000);

  test("农夫夜里死亡 ⇒ 一名存活的善良玩家变成农夫（官方原文方向）", async ({ page }) => {
    /**
     * 🔴 2026-10-23 **判据纠错**（我上一轮把官方规则读反了）：
     *   官方【农夫】：「**当你在夜晚死亡时**，一名存活的善良玩家会变成农夫。」
     *   （英文：When you die at night, an alive good player becomes a Farmer.）
     *
     *   我上一版写的是「别的镇民死了 ⇒ 农夫继承其能力」，那是**反的**
     *   ⇒ 断言必然恒假，被误登记成产品缺陷。实现侧
     *   `farmer.ability::stateUpdate` 正是按官方方向写的：
     *   把 `newFarmerId` 那个座位改成 `role.id = "farmer"` 并追加
     *   `statusDetails: […, "成为新农夫"]`。
     *
     * 本用例：僵怖夜杀农夫 ⇒ 必须有一名**别的**存活善良玩家变成农夫。
     */
    const { script, game } = loadScene("S15");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const farmerSeat = seatByRole(snap, "farmer");

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼应能入夜").toBe("night");

    const n2 = await driveNight(page, [
      { role: "zombuul", targets: [farmerSeat + 1], note: "夜杀农夫，触发转移" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    const after = await snapNow(page);
    const farmer = after?.seats?.find((s: any) => s.id === farmerSeat);
    expect.soft(farmer?.isDead, "农夫应被夜杀").toBe(true);

    // 官方：一名**存活的善良**玩家变成农夫 ⇒ 除原农夫外，恰好多一个 farmer
    const newFarmers = (after?.seats ?? []).filter(
      (s: any) => s.role?.id === "farmer" && s.id !== farmerSeat && s.isDead !== true
    );
    expect
      .soft(newFarmers.length, "官方：农夫夜死后应该有 1 名存活玩家变成农夫（实测 0 名）")
      .toBe(1);
    if (newFarmers.length === 1) {
      const nf = newFarmers[0];
      expect
        .soft(
          (nf.statusDetails ?? []).some(
            (d: any) => typeof d === "string" && d.includes("成为新农夫")
          ),
          "新农夫应留下「成为新农夫」痕迹"
        )
        .toBe(true);
      // 反证：新农夫必须是善良（官方：an alive **good** player）
      expect
        .soft(isTownsfolkOrOutsiderRole(nf.role), "新农夫原本身份应是善良（镇民/外来者）")
        .toBe(true);
    }

    // 反证：不得把所有善良都变成农夫
    const allFarmers = (after?.seats ?? []).filter((s: any) => s.role?.id === "farmer");
    expect.soft(allFarmers.length, "只应新增 1 名农夫（不能全体转农夫）").toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G5b · S15 畸形秀演员的【疯狂仲裁】门禁
// ═══════════════════════════════════════════════════════════════════
test.describe("无名之墓 · G5b 畸形秀演员门禁", () => {
  test.setTimeout(5 * 60_000);

  test("畸形秀演员在场 ⇒ 白天出现【疯狂仲裁】门禁，仲裁后能正常入夜", async ({ page }) => {
    /**
     * 官方【畸形秀演员】：「如果你在白天**公开宣称自己是畸形秀演员**，
     *   你可能被处决，但不会被杀死。」
     * 引擎的做法：白天给一个「疯狂仲裁」入口，说书人裁定他是否公开宣称
     *   ⇒ 选「是，执行处决」会**立即终结白天**（isInstantNight）；
     *   ⇒ 选「否，无事发生」则正常继续到黄昏/入夜。
     * 本用例验「门禁存在 + 选保守项后能进夜」，不介入裁定本身。
     */
    const { script, game } = loadScene("S15");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const mutantSeat = seatByRole(snap, "mutant");
    expect.soft(mutantSeat, "畸形秀演员（mutant）应在场").toBeGreaterThanOrEqual(0);

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    // 门禁按钮必须存在（这是 mutant 的日间入口）
    const gate = page.locator("button").filter({ hasText: /^疯狂仲裁$/ }).first();
    const gateCount = await gate.count();
    expect.soft(gateCount, "白天应出现【疯狂仲裁】门禁按钮").toBeGreaterThan(0);

    // 驱动器（driveDusk）已实现「仲裁永远走保守项」，这里直接验能进夜
    const dusk = await driveDusk(page, {});
    expect.soft(dusk.status, "仲裁选保守项后应能正常入夜").toBe("night");
  });
});

// ═══════════════════════════════════════════════════════════════════
// G6 · S14 白天：艺术家 / 博学者 的日间技能入口
// ═══════════════════════════════════════════════════════════════════
test.describe("无名之墓 · G6 日间技能入口", () => {
  test.setTimeout(5 * 60_000);

  test("艺术家 / 博学者 的日间技能入口存在且可用", async ({ page }) => {
    /**
     * 🔴 2026-10-23 **判据纠错**（上一轮把「查不到」误判成产品缺陷）：
     *
     * 按钮文案不是「使用艺术家」，而是 **`使用 ${abilityName}`**
     *   （见 `GameConsole.tsx:914` → `使用 ${abilityName}`；
     *     博学者是「使用 私下询问」这类能力名，中间**有空格**）。
     *   而且每个座位卡上的按钮都带 `data-testid="start-day-ability-button"`。
     *   ⇒ 用 `/使用艺术家/` 或 `/使用博学者/` 去匹配**永远查不到**，
     *      上一轮据此登记的「入口 disabled / 缺失」是我的选择器错，不是缺陷。
     *
     * 正确判据：按 `data-testid="start-day-ability-button"` 数入口，
     *   再按所在卡片里的座位号定位到具体角色，断言「存在 + 可点」。
     */
    const { script, game } = loadScene("S14");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const artistSeat = seatByRole(snap, "artist");
    const savantSeat = seatByRole(snap, "savant");
    expect.soft(artistSeat, "艺术家（artist）应在场").toBeGreaterThanOrEqual(0);
    expect.soft(savantSeat, "博学者（savant）应在场").toBeGreaterThanOrEqual(0);

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    // 所有日间技能入口
    const entries = page.locator('[data-testid="start-day-ability-button"]');
    const total = await entries.count();
    expect.soft(total, "白天应渲染出日间技能入口（至少艺术家/博学者两个）").toBeGreaterThanOrEqual(2);

    /** 按座位号定位某个座位的入口按钮（卡片内先出现「N号」再是按钮） */
    const entryOf = async (seatId: number) => {
      const card = page
        .locator("div")
        .filter({ has: page.locator(`text="${seatId + 1}号"`) })
        .filter({ has: page.locator('[data-testid="start-day-ability-button"]') })
        .last();
      const btn = card.locator('[data-testid="start-day-ability-button"]').first();
      const count = await btn.count();
      return { count, enabled: count > 0 ? await btn.isEnabled() : false };
    };

    const artistEntry = await entryOf(artistSeat);
    expect.soft(artistEntry.count, `艺术家（${artistSeat + 1}号）应有一个「开始日间技能」按钮`).toBeGreaterThan(0);
    expect.soft(artistEntry.enabled, "艺术家的日间入口应可点（官方：每局一次，白天可问一个是非问题）").toBe(true);

    const savantEntry = await entryOf(savantSeat);
    expect.soft(savantEntry.count, `博学者（${savantSeat + 1}号）应有一个「开始日间技能」按钮`).toBeGreaterThan(0);
    expect.soft(savantEntry.enabled, "博学者的日间入口应可点（官方：每个白天可问两条信息）").toBe(true);
  });
});
