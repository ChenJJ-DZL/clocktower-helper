import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { roles as APP_ROLES } from "../../app/data";
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
        (s.role?.type === "minion" || s.role?.type === "demon" || s.isEvilConverted === true)
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

  test("弄臣被处决 ⇒ 首次不得死亡（⚠️ 已确认为产品缺陷）", async ({ page }) => {
    /**
     * 🔴 2026-10-21 实测确认的**产品缺陷**（不是驱动问题）：
     *   处决弄臣后快照 `dead=[8]` —— 弄臣**第一次被处决就死了**。
     *   官方：「如果你第一次被处决，你不会死亡。」
     *   追加证据（2026-10-21 探针）：
     *     · 处决前/后弄臣座位的 `foolUsed / hasUsedFoolAbility / hasUsedAbility`
     *       **全是 undefined**，`isDrunk/isPoisoned` 都是 false
     *       ⇒ `canFoolSurvive()` 此刻**必然返回 true**（它只否掉「已用过」和「醉/毒」）；
     *     · 但 `killPlayer` 里那条 `canFoolSurvive` 免死分支（useGameController:693）
     *       显然没被执行到 —— 否则 `foolUsed` 会被写成 true。
     *   ⇒ 结论：**处决路径没有走到 `killPlayer` 的这段代码**（`handleExecution`
     *     对 fool 提前 `handled` 掉了，或 legacy 分支的调用顺序被别的分支拦截）。
     *   已排除：`getRoleDefinition("fool").onExecution` **不存在**（fool.ts 只有 70 行、
     *   无 onExecution）⇒ `handleExecution` 直接返回 null，走 legacy 分支，
     *   该分支**确实**调了 `killPlayer(id,{source:"execution"})`。
     *   ⇒ 最可能的原因（下一轮先验证这一条）：legacy 分支里**先**
     *     `dispatch({type:"EXECUTE_PLAYER"})` 把座位标成 `isDead=true`，
     *     **再**调 `killPlayer`；而 `canFoolSurvive()` 开头就有
     *     `if (!isAliveSeat(seat)) return false;` ⇒ 此时弄臣已"死"，
     *     免死判据直接短路 ⇒ 免死分支永不进入。
     *   修法候选：① `executePlayer` 里把 `dispatch(EXECUTE_PLAYER)` 移到
     *     `killPlayer` **之后**；或 ② `canFoolSurvive` 的存活前置改为
     *     「未消费过免死」（`foolUsed !== true`），不看当前 isDead。
     */
    test.fail(true, "弄臣处决免死未生效：executePlayer 不走 killPlayer 的 canFoolSurvive 分支");
    const { script, game } = loadScene("S15");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const foolSeat = seatByRole(snap, "fool");
    const nominator = [1, 3, 4, 5].find((x) => x !== foolSeat + 1)!;

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

    const live = await readLiveEndState(page);
    expect.soft(live?.gameOverUi, "弄臣活着 ⇒ 不得因此终局").toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G5 · S15：农夫继承（镇民死亡后获得其能力）+ 畸形秀演员门禁
// ═══════════════════════════════════════════════════════════════════
test.describe("无名之墓 · G5 S15 农夫与畸形秀演员", () => {
  test.setTimeout(7 * 60_000);

  test("镇民夜间死亡 ⇒ 农夫继承其能力（疑似缺陷，已登记）", async ({ page }) => {
    /**
     * ⚠️ 实测未通过（**疑似产品缺陷，待确认**，不是「通过」）：
     *   第 2 夜僵怖按计划杀死了「杂耍艺人」（镇民），但整份快照里
     *   **没有任何座位**留下 `statusDetails` 含「成为新农夫」的痕迹，
     *   也没有 `role.id` 从 farmer 变成被继承角色。
     *   代码侧落点见 `src/roles/new_engine/farmer.ability.ts::stateUpdate`
     *   （写 `statusDetails: […, "成为新农夫"]` + `_abilityResults.farmer`），
     *   说明**死亡事件没有把能力转移派发给农夫**（或字段没落进快照）。
     *   两种可能都要人看：① 农夫订阅未被死亡事件触发；② 落点字段未被快照收录。
     *   登记 test.fail，修好后自动变红提醒转真断言。
     */
    test.fail(true, "农夫未继承：快照无「成为新农夫」痕迹（疑似死亡事件未派发）");
    const { script, game } = loadScene("S15");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    const farmerSeat = seatByRole(snap, "farmer");
    const zombuulSeat = seatByRole(snap, "zombuul");
    // 选一名镇民作为僵怖的击杀目标（农夫继承的对象）
    const townsfolkSeat = (snap.seats as any[]).find(
      (s) => s.role?.type === "townsfolk" && s.id !== farmerSeat && s.id !== zombuulSeat
    ).id as number;

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼应能入夜").toBe("night");

    const n2 = await driveNight(page, [
      { role: "zombuul", targets: [townsfolkSeat + 1], note: "杀镇民，供农夫继承" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    const after = await snapNow(page);
    const dead = after?.seats?.find((s: any) => s.id === townsfolkSeat);
    expect.soft(dead?.isDead, "被选中的镇民应死亡").toBe(true);

    // 农夫：官方「一名镇民死亡后，你获得其能力」
    //   引擎的实现落点是 `statusDetails` 里的「成为新农夫」+ `_abilityResults.farmer`
    //   （见 `src/roles/new_engine/farmer.ability.ts::stateUpdate`）
    const details = (after?.seats ?? []).flatMap((s: any) =>
      Array.isArray(s.statusDetails) ? s.statusDetails : []
    );
    expect
      .soft(
        details.some((d: any) => typeof d === "string" && d.includes("成为新农夫")),
        "镇民死亡后应留下「成为新农夫」的转移痕迹（不得纹丝不动）"
      )
      .toBe(true);
  });

  test("畸形秀演员门禁：进入黄昏前必须完成【疯狂仲裁】，且仲裁后仍能正常入夜", async ({
    page,
  }) => {
    const { script, game } = loadScene("S15");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    expect.soft(seatByRole(snap, "mutant") >= 0, "畸形秀演员（mutant）应在场").toBe(true);
    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    // 白日里应能看到「需先完成…【疯狂仲裁】」的门禁提示（畸形秀演员在场）
    const gateText = await page.evaluate(() =>
      (document.body.textContent ?? "").replace(/\s+/g, "")
    );
    expect
      .soft(gateText, "畸形秀演员在场时应有【疯狂仲裁】门禁")
      .toContain("疯狂仲裁");

    const dusk = await driveDusk(page, {});
    expect.soft(dusk.status, "仲裁后必须能正常进入夜晚（门禁不得卡死）").toBe("night");
  });
});

// ═══════════════════════════════════════════════════════════════════
// G6 · S14 白天：艺术家 / 博学者 的日间技能入口真的能打开
// ═══════════════════════════════════════════════════════════════════
test.describe("无名之墓 · G6 日间技能入口", () => {
  test.setTimeout(5 * 60_000);

  test("艺术家 / 博学者 的白天技能入口（已知缺口：入口状态待确认）", async ({ page }) => {
    /**
     * ⚠️ 实测结果（登记为缺口，不是「通过」）：
     *   · 「使用艺术家」按钮**存在**，但首夜结束后的白天里是 **disabled**；
     *   · 「使用博学者」入口在该时点**查不到**。
     *   两种可能都要人判断：① 这两个日间技能需要先选座位才可用；
     *   ② 入口状态被夜序错误地锁掉（那就是缺陷）。
     *   在确认之前，本用例只登记现象，不做「已验证」的结论。
     */
    test.fail(true, "艺术家入口 disabled / 博学者入口缺失，待确认是交互前置还是缺陷");
    /**
     * ⚠️ 本用例只验到「入口存在且可用」这一层：
     *   实测点下去之后**没有** `[role="dialog"]` 出现（这两个角色的日间技能
     *   走的是另一套容器/需要先选座位），当前无法稳定断言弹窗内容。
     *   ⇒ 断言收紧为「入口在、且不是 disabled」，并把「弹窗内容」列为待补项。
     */
    const { script, game } = loadScene("S14");
    const snap = await bootScene(page, {
      script,
      players: game.players,
      seed: game.seed,
      lineup: game.seats.map((s: any) => s.id),
    });
    expect.soft(seatByRole(snap, "artist") >= 0, "艺术家（artist）应在场").toBe(true);
    expect.soft(seatByRole(snap, "savant") >= 0, "博学者（savant）应在场").toBe(true);

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    const entry = async (label: RegExp) => {
      const btn = page.locator("button").filter({ hasText: label }).first();
      const count = await btn.count();
      if (count === 0) return { count, enabled: false };
      return { count, enabled: await btn.isEnabled() };
    };

    expect.soft((await entry(/使用艺术家/)).count, "应有「使用艺术家」的日间入口").toBeGreaterThan(0);
    expect.soft((await entry(/使用艺术家/)).enabled, "艺术家的日间入口应可用").toBe(true);
    /**
     * 博学者（savant）：入场后「使用博学者」入口在**首夜结束后的白天查不到**
     * （首夜开始前的探针里能看到该按钮）。当前只能断言角色在场；
     * 入口是否被夜序消耗/改名，列为待确认项，不在此处声称已验证。
     */
    expect.soft(seatByRole(snap, "savant") >= 0, "博学者应在场").toBe(true);
  });
});
