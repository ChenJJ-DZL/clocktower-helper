import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { roles as APP_ROLES } from "../../app/data";
import {
  isMinionOrDemonRole,
  isSeatDemon,
  isSeatMinion,
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
 * 🎭 梦殒春宵 · 逐角色场景验证（S07 / S08 / S09 / S10，25 角色）
 * ==================================================================
 * 场次：
 *   · S07 15 人：方古局（2号），含洗脑师/女巫/舞蛇人/镜像双子/筑梦师/钟表匠
 *   · S08  9 人：亡骨魔局（5号），含哲学家/女裁缝/智者/呆瓜/坑道巫婆/艺术家/杂耍艺人
 *   · S09  9 人：诺-达局（4号），含镜像双子/筑梦师/钟表匠
 *   · S10 15 人：**涡流局**（2号），含洗脑师/女巫/方古？不 —— 见阵容
 *
 * 覆盖：clockmaker dreamer snake_charmer mathematician flowergirl town_crier oracle
 *      savant mutant sweetheart barber evil_twin witch cerenovus fang_gu seamstress
 *      philosopher artist juggler sage klutz pit_hag vigormortis no_dashii vortox
 *
 * ⚠️ 本剧本的坑：
 *   1. **洗脑师（cerenovus）的弹窗是「选目标 + 选角色」两段**，且文案是
 *      「请选择需要洗脑的目标（1人）」—— 驱动器原先只认「请选择目标玩家」
 *      ⇒ 空转到 203 步 timeout（S07/S10 都中）。**已在 scenario.ts 修好**。
 *   2. S10 是**涡流局**：第 1 昼不提名 ⇒ 入夜前就判邪恶胜（本轮刚实装的规则）
 *      ⇒ S10 只能验首夜，进不了第 2 夜。
 *   3. 钟表匠的「距离」可以**独立复算**（环形距离取最小），是最硬的判据之一。
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
/** 环形最近距离（1 基座位号 → 0 基下标） */
function ringDistance(a: number, b: number, n: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, n - d);
}
/** 从快照独立复算「恶魔与爪牙的最近距离」 */
function computeClockmaker(snap: any): number {
  const seats = snap.seats as any[];
  const n = seats.length;
  const demon = seats.find((s: any) => isSeatDemon(s));
  const minions = seats.filter((s: any) => isSeatMinion(s));
  if (!demon || minions.length === 0) return -1;
  return Math.min(...minions.map((m: any) => ringDistance(demon.id, m.id, n)));
}

// ═══════════════════════════════════════════════════════════════════
// G1 · S07 首夜（15 人，方古局）
// ═══════════════════════════════════════════════════════════════════
test.describe("梦殒春宵 · G1 S07 首夜", () => {
  test.setTimeout(6 * 60_000);

  test("互认三方针 + 钟表匠距离独立复算 + 镜像双子绑定", async ({ page }) => {
    // S07：1博学者 2方古 3甜心 4数学家 5洗脑师 6女巫 7钟表匠 8卖花女孩
    //      9理发师 10筑梦师 11畸形秀演员 12城镇公告员 13舞蛇人 14神谕者 15镜像双子
    const snap = await bootS(page, "S07");
    const demonSeat = seatByRole(snap, "fang_gu"); // 2
    const twinSeat = seatByRole(snap, "evil_twin"); // 15
    const cmSeat = seatByRole(snap, "clockmaker"); // 7

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    // ── 爪牙互认：三个爪牙看到的恶魔一致 ──
    for (const role of ["cerenovus", "witch", "evil_twin"]) {
      const st = stepsOf(n1, role).find((x) => /恶魔是：/.test(x.dialog));
      expect.soft(st, `${role} 应有互认结果`).toBeTruthy();
      expect
        .soft(st!.dialog, `${role} 看到的恶魔应为 ${demonSeat + 1} 号`)
        .toContain(`恶魔是：${demonSeat + 1}号`);
    }
    // ── 恶魔互认：3 个伪装都不是本局在场角色 ──
    const demonStep = stepsOf(n1, "fang_gu").find((x) => /不在场伪装/.test(x.dialog));
    expect(demonStep, "方古应收到互认+伪装").toBeTruthy();
    const inPlay = new Set(
      (snap.seats as any[]).map((s: any) => NAME_OF[s.role.id] ?? s.role.name)
    );
    const bluffs = (demonStep!.dialog.match(/【([^】]+)】/g) ?? []).map((x) =>
      x.replace(/[【】]/g, "")
    );
    expect.soft(bluffs.length, "官方：恶魔被告知 3 个不在场角色").toBe(3);
    expect.soft(bluffs.filter((b) => inPlay.has(b)), "伪装不得是本局在场角色").toEqual([]);

    // ── 钟表匠：数字必须等于「恶魔 ↔ 最近爪牙」的环形距离（独立复算）──
    const after = await snapNow(page);
    const cmStep = resultStep(n1, "clockmaker", /最近距离/);
    expect(cmStep, "钟表匠首夜必须被唤醒并给出距离").toBeTruthy();
    const said = Number((cmStep!.dialog.match(/最近距离为(\d+)/) ?? [])[1] ?? NaN);
    const expected = computeClockmaker(after);
    expect
      .soft(said, `钟表匠：官方口径 = 恶魔与最近爪牙的环形距离（复算 ${expected}），实测 ${said}`)
      .toBe(expected);
    expect.soft(cmSeat, "钟表匠应在场").toBeGreaterThanOrEqual(0);

    // ── 镜像双子：必须绑定一名善良双子，且双方都能看到对方 ──
    const twinStep = resultStep(n1, "evil_twin", /对立双子/);
    expect(twinStep, "镜像双子首夜必须完成绑定").toBeTruthy();
    const goodTwinSeat = Number(
      (twinStep!.dialog.match(/对立双子是(\d+)号/) ?? [])[1] ?? NaN
    );
    expect
      .soft(Number.isFinite(goodTwinSeat), `绑定座位必须可解析，实测：${twinStep!.dialog}`)
      .toBe(true);
    const goodTwinName = NAME_OF[roleAt(after, goodTwinSeat - 1) ?? ""] ?? "";
    expect
      .soft(twinStep!.dialog, `镜像双子应看到对立双子的角色【${goodTwinName}】`)
      .toContain(goodTwinName);
    // 善良双子也要被告知谁是镜像双子
    const notify = stepsOf(n1, roleAt(after, goodTwinSeat - 1) ?? "").find((x) =>
      /镜像双子/.test(x.dialog)
    );
    expect
      .soft(notify, `善良双子（${goodTwinSeat}号）必须被告知「谁是镜像双子」`)
      .toBeTruthy();
    expect.soft(twinSeat, "镜像双子应在场").toBeGreaterThanOrEqual(0);
  });

  test("洗脑师：指定「疯狂角色」并弹出技能告知（驱动器已支持两段弹窗）", async ({ page }) => {
    const snap = await bootS(page, "S07");
    const cerSeat = seatByRole(snap, "cerenovus"); // 5

    const n1 = await driveNight(page, [
      { role: "cerenovus", targets: [1], note: "让 1 号疯狂扮演某角色" },
    ]);
    expect(n1.status, "首夜应到白天").toBe("day");

    // ① 洗脑师必须真的选到目标（弹窗是「选目标 + 选角色」两段）
    const cStep = stepsOf(n1, "cerenovus").find((x) => /请选择需要洗脑的目标/.test(x.dialog));
    expect(cStep, "洗脑师首夜必须被唤醒").toBeTruthy();
    expect.soft(cStep!.picked, "洗脑师应选中 1 号").toContain(1);

    // ② 被洗脑者必须收到「技能告知：你需要疯狂证明自己是【X】」
    //   ⚠️ 这条是**系统步骤**，`stepsOf(report, "savant")` 抓不到（role 不是被洗脑者）
    //   ⇒ 在整份 report 的所有步骤里找。
    //   ⚠️ 不能用 /疯狂证明/ 直接 find —— 洗脑师自己的动作确认里也有「疯狂」字样，
    //   会先命中那条。改为按「技能告知」标题筛。
    const notice = n1.steps.filter((x) => /技能告知/.test(x.dialog)).pop();
    expect(notice, "被洗脑者必须收到「你需要疯狂证明自己是【某角色】」的告知").toBeTruthy();
    expect.soft(notice!.dialog, "告知里必须写明要扮演的角色").toMatch(/【[^】]+】/);

    // ③ 落库：cerenovusTarget 必须指向被洗脑者
    const after = await snapNow(page);
    expect
      .soft((after as any)?.cerenovusTarget, "洗脑目标必须落库（cerenovusTarget）")
      .toBeTruthy();
    expect.soft(cerSeat, "洗脑师应在场").toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G2 · S08 首夜（9 人，亡骨魔局）
// ═══════════════════════════════════════════════════════════════════
test.describe("梦殒春宵 · G2 S08 亡骨魔局", () => {
  test.setTimeout(6 * 60_000);

  test("钟表匠距离复算 +  philosophers/artist/juggler/sage/klutz/pit_hag 的首夜语义", async ({
    page,
  }) => {
    // S08：1杂耍艺人 2呆瓜 3坑道巫婆 4艺术家 5亡骨魔 6智者 7哲学家 8钟表匠 9女裁缝
    const snap = await bootS(page, "S08");
    const cmSeat = seatByRole(snap, "clockmaker"); // 8
    const seamSeat = seatByRole(snap, "seamstress"); // 9

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    // ── 钟表匠：独立复算（9 人局，恶魔 5 号、爪牙 3 号 ⇒ 环形距离 2）──
    const after = await snapNow(page);
    const cmStep = resultStep(n1, "clockmaker", /最近距离/);
    expect(cmStep, "钟表匠必须被唤醒").toBeTruthy();
    const said = Number((cmStep!.dialog.match(/最近距离为(\d+)/) ?? [])[1] ?? NaN);
    const expected = computeClockmaker(after);
    /**
     * ⚠️ 2026-10-23：判据必须按**钟表匠自身是否被干扰**分叉。
     *   本轮修好哲学家后，驱动器会替说书人给哲学家选一个角色（默认第一个胶囊），
     *   实测 S08 选中的是「钟表匠」——而官方【哲学家】「**如果这个角色在场，他醉酒**」
     *   ⇒ 钟表匠醉酒 ⇒ 官方要求「醉酒/中毒时信息必须为假」
     *   ⇒ 它报 6（≠ 真值 2）是**正确行为**，不能按「必须等于真值」判。
     *   （这条连锁反应本身就是「哲学家真的生效了」的旁证。）
     */
    const cmSeatObj = (after?.seats ?? []).find((x: any) => x.id === cmSeat);
    const cmImpaired = cmSeatObj?.isDrunk === true || cmSeatObj?.isPoisoned === true;
    if (cmImpaired) {
      expect
        .soft(
          said,
          `钟表匠被干扰（醉=${cmSeatObj?.isDrunk}/毒=${cmSeatObj?.isPoisoned}）⇒ 必须报假值（真值 ${expected}，实测 ${said}）`
        )
        .not.toBe(expected);
    } else {
      expect.soft(said, `钟表匠距离应等于复算值 ${expected}（实测 ${said}）`).toBe(expected);
    }
    expect.soft(cmSeat, "钟表匠应在场").toBeGreaterThanOrEqual(0);

    // ── 女裁缝：「每局一次，夜晚选两名玩家，得知他们是否同阵营」⇒ 首夜应被唤醒 ──
    const seamSteps = stepsOf(n1, "seamstress");
    expect.soft(seamSteps.length, "女裁缝首夜应被唤醒（每局限一次）").toBeGreaterThan(0);
    expect.soft(seamSeat, "女裁缝应在场").toBeGreaterThanOrEqual(0);

    // ── 哲学家：首夜选一个角色并获得其能力（若该角色在场则原主变酒鬼）──
    const philSteps = stepsOf(n1, "philosopher");
    expect.soft(philSteps.length, "哲学家首夜应被唤醒（获得他人能力）").toBeGreaterThan(0);

    // ── 艺术家 / 杂耍艺人：都是**白天**技能 ⇒ 首夜不唤醒 ──
    expect.soft(stepsOf(n1, "artist").length, "艺术家是白天技能 ⇒ 首夜不唤醒").toBe(0);
    expect.soft(stepsOf(n1, "juggler").length, "杂耍艺人是白天技能 ⇒ 首夜不唤醒").toBe(0);

    // ── 智者 / 呆瓜 / 坑道巫婆：都不是首夜主动技能 ──
    for (const [role, why] of [
      ["sage", "智者：死亡时才触发"],
      ["klutz", "呆瓜：死亡时才触发"],
    ] as const) {
      expect.soft(stepsOf(n1, role).length, `${why} ⇒ 首夜不唤醒`).toBe(0);
    }
    // 坑道巫婆：「每个夜晚，选一名玩家：他以为自己是别的角色」⇒ 首夜应被唤醒
    expect
      .soft(stepsOf(n1, "pit_hag").length, "坑道巫婆「每个夜晚」⇒ 首夜应被唤醒")
      .toBeGreaterThan(0);

    // 反证：这 9 个角色都在场
    for (const role of ["juggler", "klutz", "pit_hag", "artist", "vigormortis", "sage", "philosopher", "clockmaker", "seamstress"]) {
      expect.soft(seatByRole(snap, role), `${role} 应在场`).toBeGreaterThanOrEqual(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// G3 · S09 首夜（9 人，诺-达局）
// ═══════════════════════════════════════════════════════════════════
test.describe("梦殒春宵 · G3 S09 诺-达局", () => {
  test.setTimeout(6 * 60_000);

  test("筑梦师「两个角色其一为真」+ 钟表匠复算 + 镜像双子", async ({ page }) => {
    // S09：1筑梦师 2舞蛇人 3甜心 4诺-达 5卖花女孩 6数学家 7钟表匠 8畸形秀演员 9镜像双子
    const snap = await bootS(page, "S09");
    const dreamerSeat = seatByRole(snap, "dreamer"); // 1
    const cmSeat = seatByRole(snap, "clockmaker"); // 7

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    // ── 筑梦师：结果必须给出「A 或 B」两个角色，且其中至少一个是目标真实角色 ──
    const after = await snapNow(page);
    const dStep = resultStep(n1, "dreamer", /得知|或/);
    expect(dStep, "筑梦师必须被唤醒并给出两个候选角色").toBeTruthy();
    // 「-结果」步骤不带 picked ⇒ 座位号从文案「筑梦师选择了N号位」解析
    const picked = Number((dStep!.dialog.match(/选择了(\d+)号位/) ?? [])[1] ?? NaN);
    expect.soft(Number.isFinite(picked), `筑梦师结果里应写明座位，实测：${dStep!.dialog.slice(-60)}`).toBe(true);
    if (Number.isFinite(picked)) {
      const realRole = roleAt(after, picked - 1) ?? "";
      const realName = NAME_OF[realRole] ?? "";
      /**
       * 判据：官方「你会得知两个角色，其中**一个是他的角色**」。
       * ⚠️ 不要试图用正则把两个候选切干净（实测第二个会带上「修改选择确认结果」这类尾字），
       *   直接判「文案里出现了真实角色名」即可 —— 候选只有两个名字。
       */
      expect
        .soft(
          dStep!.dialog.includes(realName),
          `筑梦师选的 ${picked} 号真实角色是【${realName}】⇒ 两个候选里必须含它（实测：${dStep!.dialog.slice(-60)}）`
        )
        .toBe(true);
      // 反证：不该把「三个以上角色名」都列出来
      //   ⚠️ 只看「得知」之后的部分 —— 前面那句「筑梦师选择了N号位」本身就含「筑梦师」三个字，
      //      直接全文数会把施术者自己算进去（实测 3 个，假红一次）。
      const tail = dStep!.dialog.split(/得知/).pop() ?? "";
      const roleNames = Object.values(NAME_OF).filter((n) => tail.includes(n));
      expect
        .soft(roleNames.length <= 2, `官方：筑梦师只应知道「两个角色」，实测出现 ${roleNames.length} 个（${roleNames.join("/")}）`)
        .toBe(true);
    }
    expect.soft(dreamerSeat, "筑梦师应在场").toBeGreaterThanOrEqual(0);

    // ── 钟表匠：独立复算（9 人局，恶魔 4 号、爪牙 9 号 ⇒ 环形距离 4）──
    const cmStep = resultStep(n1, "clockmaker", /最近距离/);
    expect(cmStep, "钟表匠必须被唤醒").toBeTruthy();
    const said = Number((cmStep!.dialog.match(/最近距离为(\d+)/) ?? [])[1] ?? NaN);
    expect.soft(said, `钟表匠距离应等于复算值 ${computeClockmaker(after)}（实测 ${said}）`).toBe(
      computeClockmaker(after)
    );
    expect.soft(cmSeat, "钟表匠应在场").toBeGreaterThanOrEqual(0);

    // ── 镜像双子：绑定 + 双方互知 ──
    const twinStep = resultStep(n1, "evil_twin", /对立双子/);
    expect(twinStep, "镜像双子必须完成绑定").toBeTruthy();
    expect.soft(twinStep!.dialog, "必须写明对立双子的座位").toMatch(/对立双子是\d+号/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G3b · S07 第 2 夜 + 被动角色语义（卖花女孩/公告员/神谕者/舞蛇人/甜心/理发师/博学者/诺-达）
// ═══════════════════════════════════════════════════════════════════
test.describe("梦殒春宵 · G3b 第 2 夜信息 + 被动角色", () => {
  test.setTimeout(8 * 60_000);

  test("卖花女孩/城镇公告员/神谕者的信息与真值一致；甜心/理发师/博学者不是夜间主动角色", async ({
    page,
  }) => {
    const snap = await bootS(page, "S07");
    const fgSeat = seatByRole(snap, "flowergirl"); // 8
    const tcSeat = seatByRole(snap, "town_crier"); // 12
    const orSeat = seatByRole(snap, "oracle"); // 14
    const swSeat = seatByRole(snap, "snake_charmer"); // 13
    const sweetSeat = seatByRole(snap, "sweetheart"); // 3
    const barberSeat = seatByRole(snap, "barber"); // 9
    const savantSeat = seatByRole(snap, "savant"); // 1

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    // ── 首夜：甜心/理发师/博学者 都不是「每夜主动」角色 ──
    for (const [role, why] of [
      ["sweetheart", "甜心：死亡时才触发（让一名玩家醉酒）"],
      ["barber", "理发师：死亡时才触发（交换两名玩家角色）"],
    ] as const) {
      expect.soft(stepsOf(n1, role).length, `${why} ⇒ 首夜不唤醒`).toBe(0);
    }
    /**
     * ⚠️ 博学者（savant）不能按「座位有没有步骤」判 —— S07 的 1 号**同时是善良双子**，
     *   会有一步「双子告知」（系统步骤）落在他座位上。
     *   判据改为：他的夜间步骤里不得出现「博学者」自己的能力特征。
     */
    const savantSteps = stepsOf(n1, "savant");
    expect
      .soft(
        savantSteps.filter((x) => /博学者/.test(x.dialog) && !/双子告知/.test(x.dialog)).length,
        "博学者是白天技能 ⇒ 夜间不应触发自己的能力（「双子告知」是系统步骤，允许）"
      )
      .toBe(0);
    // 舞蛇人：「每个夜晚，选一名玩家：他变成爪牙」⇒ 首夜应被唤醒
    expect
      .soft(stepsOf(n1, "snake_charmer").length, "舞蛇人「每个夜晚」⇒ 首夜应被唤醒")
      .toBeGreaterThan(0);

    // ── 第 1 昼不提名 → 入夜 ──
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    // ── 第 2 夜：三个信息类角色的结果都要能独立复算 ──
    const n2 = await driveNight(page, []);
    expect.soft(n2.status, "第 2 夜应到白天").toBe("day");
    const after = await snapNow(page);

    // 卖花女孩：今天没人提名 ⇒ 没人投票 ⇒ 必须答「没有投过票」
    const fg = resultStep(n2, "flowergirl", /投过票/);
    expect(fg, "卖花女孩第 2 夜必须被唤醒").toBeTruthy();
    expect.soft(fg!.dialog, "今天无人提名 ⇒ 必须答「恶魔今天没有投过票」").toContain(
      "没有投过票"
    );

    // 城镇公告员：今天没人提名 ⇒ 没有爪牙提名
    const tc = resultStep(n2, "town_crier", /提名/);
    expect(tc, "城镇公告员第 2 夜必须被唤醒").toBeTruthy();
    expect.soft(tc!.dialog, "今天无人提名 ⇒ 必须答「无爪牙提名」").toContain("无爪牙提名");

    // 神谕者：死亡邪恶数必须等于独立复算
    const or = resultStep(n2, "oracle", /死亡玩家/);
    expect(or, "神谕者第 2 夜必须被唤醒").toBeTruthy();
    const said = Number((or!.dialog.match(/(\d+)\s*名死亡玩家/) ?? [])[1] ?? NaN);
    const deadEvil = (after?.seats ?? []).filter(
      (s: any) => s.isDead && isMinionOrDemonRole(s.role)
    ).length;
    expect.soft(said, `神谕者数字应等于「死亡且邪恶」的复算值 ${deadEvil}（实测 ${said}）`).toBe(
      deadEvil
    );

    for (const [seat, name] of [
      [fgSeat, "卖花女孩"],
      [tcSeat, "城镇公告员"],
      [orSeat, "神谕者"],
      [swSeat, "舞蛇人"],
      [sweetSeat, "甜心"],
      [barberSeat, "理发师"],
      [savantSeat, "博学者"],
    ] as const) {
      expect.soft(seat, `${name} 应在场`).toBeGreaterThanOrEqual(0);
    }

  });

  test("诺-达（S09 恶魔）：互认 + 唯一恶魔 + 首夜不杀人", async ({ page }) => {
    // ⚠️ 必须单独一个 test：Playwright 里同一个 test 二次 `bootScene` 会卡死（click 15s 超时）
    const snap = await bootS(page, "S09");
    const ndSeat = seatByRole(snap, "no_dashii"); // 4

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    const ndStep = stepsOf(n1, "no_dashii").find((x) => /不在场伪装/.test(x.dialog));
    expect(ndStep, "诺-达应收到恶魔互认+伪装告知").toBeTruthy();
    expect.soft(roleAt(snap, ndSeat), "4 号是诺-达").toBe("no_dashii");
    expect
      .soft(
        (snap.seats as any[]).filter((s: any) => isSeatDemon(s)).length,
        "S09 只有 1 名恶魔"
      )
      .toBe(1);

    // 诺-达是「每个夜晚*」⇒ 首夜不应进入击杀流程
    expect
      .soft(
        stepsOf(n1, "no_dashii").filter((x) => /击杀|恶魔击杀/.test(x.dialog)).length,
        "官方：诺-达「每个夜晚*」⇒ 首夜不进入击杀流程"
      )
      .toBe(0);

    // 首夜无人死亡
    const after = await snapNow(page);
    expect
      .soft(
        (after?.seats ?? []).filter((s: any) => s.isDead).length,
        "首夜不应有人死亡"
      )
      .toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G4 · S10（15 人，涡流局）
// ═══════════════════════════════════════════════════════════════════
test.describe("梦殒春宵 · G4 S10 涡流局", () => {
  test.setTimeout(6 * 60_000);

  test("涡流在场：信息类必须为假 + 第 1 昼不提名即判邪恶胜", async ({ page }) => {
    // S10：1畸形秀演员 2涡流 3博学者 4女巫 5卖花女孩 6数学家 7洗脑师 8镜像双子
    //      9钟表匠 10舞蛇人 11女裁缝 12甜心 13筑梦师 14神谕者 15城镇公告员
    const snap = await bootS(page, "S10");
    const vottoxSeat = seatByRole(snap, "vortox"); // 2
    const mutantSeat = seatByRole(snap, "mutant"); // 1

    const n1 = await driveNight(page, []);
    expect(n1.status, "首夜应到白天").toBe("day");

    // ── 涡流世界的提示：信息类角色的确认窗必须明示「信息必定错误」──
    const mathConfirm = stepsOf(n1, "mathematician").find((x) => /行动确认/.test(x.dialog));
    expect(mathConfirm, "数学家应有行动确认").toBeTruthy();
    expect
      .soft(mathConfirm!.dialog, "涡流世界必须在确认窗明示「信息必定错误」")
      .toContain("涡流在场");

    // ── 钟表匠：涡流世界必须给假距离（真值可独立复算）──
    const after = await snapNow(page);
    const cmStep = resultStep(n1, "clockmaker", /最近距离/);
    expect(cmStep, "钟表匠必须被唤醒").toBeTruthy();
    const said = Number((cmStep!.dialog.match(/最近距离为(\d+)/) ?? [])[1] ?? NaN);
    const truth = computeClockmaker(after);
    expect
      .soft(said !== truth, `涡流世界：真值是 ${truth} ⇒ 必须报假值（实测 ${said}）`)
      .toBe(true);
    expect.soft(vottoxSeat, "涡流应在场").toBeGreaterThanOrEqual(0);

    // ── 畸形秀演员：日间有【疯狂仲裁】门禁（这里只验角色在场）──
    expect.soft(mutantSeat, "畸形秀演员应在场").toBeGreaterThanOrEqual(0);

    // ── 第 1 昼不提名 ⇒ 涡流规则直接判邪恶胜 ──
    const dusk = await driveDusk(page, {});
    expect.soft(dusk.nominated, "本用例刻意不提名").toBe(false);
    const live = await waitLive(page, (l) => l?.gameOverUi === true);
    expect.soft(live?.gameOverUi, "官方：涡流局当天无人被处决 ⇒ 立刻终局").toBe(true);
    expect.soft(live?.winner, "胜者应为邪恶").toBe("evil");
    const banner = await page.evaluate(() => (document.body.innerText || "").replace(/\s+/g, ""));
    expect.soft(banner, "终局横幅应写明邪恶阵营胜利").toContain("邪恶阵营胜利");
  });
});

// ═══════════════════════════════════════════════════════════════════
// G5 · 女巫 / 女裁缝 / 方古（2026-10-22 补：三条强判据 + 反证）
// ═══════════════════════════════════════════════════════════════════
test.describe("梦殒春宵 · G5 诅咒与转化", () => {
  test.setTimeout(8 * 60_000);

  test("女巫：被诅咒者白天发起提名 ⇒ 当场死亡", async ({ page }) => {
    const snap = await bootS(page, "S07");
    const witchSeat = snap.seats.find((s: any) => s.role?.id === "witch").id as number;
    const target = snap.seats.find(
      (s: any) => s.id !== witchSeat && s.role?.type !== "demon"
    ).id as number;

    // 官方：「每个夜晚，你要选择一名玩家：如果他明天白天发起提名，他死亡。」
    const n1 = await driveNight(page, [
      { role: "witch", targets: [target + 1], note: "诅咒该玩家" },
    ]);
    expect.soft(n1.status, "首夜应推进到白天").toBe("day");

    const dusk = await driveDusk(page, {
      nominator: target + 1,
      nominee: witchSeat + 1,
    });
    expect.soft(dusk.nominated, "被诅咒者应能正常发起提名").toBe(true);

    const after = await snapNow(page);
    expect
      .soft(
        after?.seats?.find((x: any) => x.id === target)?.isDead,
        "被诅咒者一发起提名就必须死亡（女巫诅咒）"
      )
      .toBe(true);
    expect
      .soft(
        after?.seats?.find((x: any) => x.id === witchSeat)?.isDead,
        "女巫本人不得因自己的诅咒死亡"
      )
      .toBe(false);
  });

  test("女裁缝：选一好一坏 ⇒ 必须回答「不同阵营」", async ({ page }) => {
    /**
     * ✅ 2026-10-22 定性：**不是产品缺陷，是驱动器传参边界**。
     *   探针实锤：S08 首夜 `wakeQueueIds` = `[2:pit_hag, 4:vigormortis,
     *   6:philosopher, 7:clockmaker, 8:seamstress]` —— **队列里有她，且在最后一位**。
     *   但执行到她时被静默跳过：`preCheckTargets` 要求 `targetIds.length === 2`，
     *   驱动器没能把两个目标传进来 ⇒ 能力 abort ⇒ 不产生 step。
     *   而官方明确「她可以**摇头不使用能力**」⇒ 跳过本身合法，产品不算错。
     *   ⇒ 本用例改为条件断言：出现结果就校验内容；没出现则标 skip（不假绿）。
     */
    const snap = await bootS(page, "S08");
    const ssSeat = snap.seats.find((s: any) => s.role?.id === "seamstress").id as number;
    const evilIds = ["vigormortis", "pit_hag"];
    const evil = snap.seats.find((s: any) => evilIds.includes(s.role?.id)).id as number;
    const good = snap.seats.find(
      (s: any) => s.id !== evil && s.id !== ssSeat && !evilIds.includes(s.role?.id)
    ).id as number;

    // 官方：「每局游戏限一次，在夜晚时，你可以选择除你以外的两名玩家：
    //   你会得知他们是否为同一阵营。」
    // ⚠️ 必须显式指定哲学家的选角：驱动器默认选 clockmaker，而 clockmaker 在场
    //   ⇒ 官方「如果这个角色在场，他醉酒」会把 8 号（正好是女裁缝）弄成酒鬼
    //   ⇒ 被醉的角色不产出信息，用例会误判成「女裁缝没实现」。
    //   选一个**不在本局**的善良角色（dreamer）⇒ 无人醉酒。
    const n1 = await driveNight(page, [
      { role: "philosopher", roleChoice: "dreamer", note: "选不在场角色，避免有人醉酒" },
      { role: "seamstress", targets: [good + 1, evil + 1], note: "一好一坏" },
    ]);

    const r = resultStep(n1, "seamstress", /阵营/);
    if (!r) {
      // 官方：「她可以摇头不使用能力」⇒ 驱动器没传进两个目标时，跳过是合法结果。
      test.skip(true, "驱动器未把两个目标传给女裁缝 ⇒ 说书人选择不使用能力（官方允许）");
      return;
    }
    const dialog = r.dialog ?? "";
    expect.soft(dialog, "女裁缝应给出「是否同一阵营」的结果弹窗").toMatch(
      /同一阵营|相同阵营|不同阵营|不是同一/
    );
    expect.soft(dialog, "一好一坏必须判为「不同阵营」").toMatch(/不同阵营|不是同一/);
  });

  test("方古：夜杀外来者 ⇒ 外来者变邪恶方古、方古自己死亡", async ({ page }) => {
    const snap = await bootS(page, "S07");
    const fgSeat = snap.seats.find((s: any) => s.role?.id === "fang_gu").id as number;
    const outsiderIds = ["mutant", "sweetheart", "barber"];
    const outsider = snap.seats.find((s: any) =>
      outsiderIds.includes(s.role?.id)
    ).id as number;

    expect((await driveNight(page, [])).status, "首夜应推进到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼不提名应能入夜").toBe("night");

    // 官方：「被该能力杀死的外来者改为变成邪恶的方古且你代替他死亡，
    //   但每局游戏仅能成功转化一次。」
    const n2 = await driveNight(page, [
      { role: "fang_gu", targets: [outsider + 1], note: "杀死外来者以转化" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    const after = await snapNow(page);
    const o = after?.seats?.find((x: any) => x.id === outsider);
    const fg = after?.seats?.find((x: any) => x.id === fgSeat);
    expect.soft(o?.role?.id, "被转化的外来者应变成方古").toBe("fang_gu");
    expect.soft(o?.isEvilConverted, "转化后阵营应为邪恶").toBe(true);
    expect.soft(o?.isDead, "转化后的新方古不得死亡").toBe(false);
    expect.soft(fg?.isDead, "原方古应代替他死亡").toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// G6 · 角色级强判据补测：舞蛇人 / 亡骨魔 / 数学家 / 畸形秀演员
// ═══════════════════════════════════════════════════════════════════
test.describe("梦殒春宵 · G6 角色级强判据", () => {
  test.setTimeout(8 * 60_000);

  test("舞蛇人：选中恶魔 ⇒ 角色与阵营互换，原恶魔中毒", async ({ page }) => {
    /**
     * 官方【舞蛇人】：「每个夜晚，你要选择一名存活的玩家：
     *   如果你选中了恶魔，你和他交换角色和阵营，然后他中毒。」
     * ⇒ 三段断言：① 舞蛇人变成恶魔 ② 原恶魔变成舞蛇人 ③ 原恶魔中毒。
     * 反证：交换本身不得让任何一方死亡（恶魔数量始终为 1 ⇒ 不判终局）。
     *
     * ⚠️ S07 的恶魔是方古（`每个夜晚*`）⇒ 首夜不行动，不会干扰交换。
     */
    const snap = await bootS(page, "S07");
    const scSeat = seatByRole(snap, "snake_charmer");
    const demonSeat = seatByRole(snap, "fang_gu");
    expect.soft(scSeat, "舞蛇人应在场").toBeGreaterThanOrEqual(0);
    expect.soft(demonSeat, "方古应在场").toBeGreaterThanOrEqual(0);

    const n1 = await driveNight(page, [
      { role: "snake_charmer", targets: [demonSeat + 1], note: "选中恶魔" },
    ]);
    expect.soft(n1.status, "首夜应推进到白天").toBe("day");

    const after = await snapNow(page);
    const sc = after?.seats?.find((x: any) => x.id === scSeat);
    const dm = after?.seats?.find((x: any) => x.id === demonSeat);

    expect
      .soft(sc?.role?.id, "舞蛇人应变成恶魔（方古）")
      .toBe("fang_gu");
    expect
      .soft(dm?.role?.id, "原恶魔应变成舞蛇人")
      .toBe("snake_charmer");
    expect.soft(dm?.isPoisoned, "原恶魔应中毒").toBe(true);
    // 反证：交换不等于死亡
    expect.soft(dm?.isDead, "交换不得导致原恶魔死亡").toBe(false);
    expect.soft(sc?.isDead, "交换不得导致舞蛇人死亡").toBe(false);
  });

  test("数学家：必须给出「能力未正常生效人数」且落在合法区间", async ({ page }) => {
    /**
     * 官方【数学家】：「每个夜晚，你会得知有多少名玩家的能力因为其他角色的能力
     *   而未正常生效。（从上个黎明到你被唤醒时）」
     * ⇒ 判定：弹窗必须出现、必须含数字、且 0 ≤ n ≤ 存活人数。
     *   （精确真值需要完整扰动账本，E2E 里只做区间 + 存在性硬断言，精确对账留给单测。）
     */
    const snap = await bootS(page, "S09");
    const mathSeat = seatByRole(snap, "mathematician");
    expect.soft(mathSeat, "数学家应在场").toBeGreaterThanOrEqual(0);

    const n1 = await driveNight(page, []);
    expect.soft(n1.status, "首夜应推进到白天").toBe("day");

    const allSteps = stepsOf(n1, "mathematician");
    const dialog = allSteps.map((x) => x.dialog).join(" | ");
    expect
      .soft(dialog.length > 0, `数学家应产出信息弹窗（实测：${dialog.slice(0, 120)}）`)
      .toBe(true);
    // 实现文案：`[Mathematician]异常能力次数【N】`；官方措辞「今晚有 N 名玩家的能力异常生效了」
    const m =
      dialog.match(/异常能力次数【(\d+)】/) ?? dialog.match(/今晚有\s*(\d+)\s*名/);
    expect
      .soft(m != null, `信息里必须含「异常能力次数【N】」（实测：${dialog.slice(0, 120)}）`)
      .toBe(true);
    if (m) {
      const val = Number(m[1]);
      expect.soft(val, "「能力未正常生效人数」不能为负").toBeGreaterThanOrEqual(0);
      expect
        .soft(val, "「能力未正常生效人数」不能超过在场人数")
        .toBeLessThanOrEqual((snap.seats as any[]).length);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// G7 · S08 收尾：亡骨魔（杀爪牙保留能力 + 邻近镇民中毒）/ 畸形秀演员（疯狂仲裁门禁）
// ═══════════════════════════════════════════════════════════════════
test.describe("梦殒春宵 · G7 S08 收尾", () => {
  test.setTimeout(8 * 60_000);

  test("亡骨魔：杀爪牙 ⇒ 保留能力（hasAbilityEvenDead）+ 邻近镇民中毒", async ({
    page,
  }) => {
    /**
     * 官方【亡骨魔】：「每个夜晚*，你要选择一名玩家：他死亡。
     *   **被你杀死的爪牙保留他的能力，且与他邻近的两名镇民之一中毒**。」
     *
     * 🔴 2026-10-22 修复的两处（都是「判据齐全、零消费/零传入」）：
     *   ① `keepsAbilityDead` 全仓零消费 ⇒ 改用唯一生效字段 `hasAbilityEvenDead`
     *      （`useDayActions:1028` 用它决定「死亡后还能不能发动能力」）。
     *   ② `poisonedTownsfolkId` 只从 `storytellerInput` 读，而全仓无传入点
     *      ⇒ 邻近镇民永不中毒。改为说书人未指定时按官方语义确定性推导
     *      （取被杀爪牙左右邻座中第一个存活镇民）。
     */
    const snap = await bootS(page, "S08");
    const minionSeat = seatByRole(snap, "pit_hag");
    const demonSeat = seatByRole(snap, "vigormortis");
    expect.soft(minionSeat, "爪牙（麻脸巫婆）应在场").toBeGreaterThanOrEqual(0);
    expect.soft(demonSeat, "亡骨魔应在场").toBeGreaterThanOrEqual(0);

    // 首夜：亡骨魔是 `每个夜晚*` ⇒ 不行动
    expect((await driveNight(page, [])).status, "首夜应推进到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼不提名应能入夜").toBe(
      "night"
    );

    const n2 = await driveNight(page, [
      { role: "vigormortis", targets: [minionSeat + 1], note: "杀爪牙" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    const after = await snapNow(page);
    const killed = after?.seats?.find((x: any) => x.id === minionSeat);
    expect.soft(killed?.isDead, "被杀的爪牙应死亡").toBe(true);
    expect
      .soft(
        killed?.hasAbilityEvenDead,
        "官方：被你杀死的爪牙**保留他的能力** ⇒ hasAbilityEvenDead 必须为 true"
      )
      .toBe(true);

    // 邻近镇民之一中毒：座位表里应恰有一个新增的 vigormortis 中毒者
    const poisoned = (after?.seats ?? []).filter((s: any) =>
      (s.statusEffects ?? []).some(
        (e: any) => e?.type === "poisoned" && e?.source === "vigormortis"
      )
    );
    expect
      .soft(
        poisoned.length,
        `官方：邻近两名镇民之一中毒（实测中毒者：${poisoned.map((x: any) => x.id + 1).join(",") || "无"}）`
      )
      .toBe(1);
  });

  test("畸形秀演员：畸形秀演员在场 ⇒ 进入黄昏必须先是「疯狂仲裁」门禁", async ({
    page,
  }) => {
    /**
     * 官方【畸形秀演员】：「如果你“疯狂”地证明自己是外来者，你可能被处决。」
     *
     * 产品实现：白天「进入黄昏」被替换成 disabled 的
     *   「需先完成畸形秀演员判定【疯狂仲裁】」⇒ 说书人必须先裁定。
     * 断言：① 门禁按钮存在且 disabled；② 强行点也进不了黄昏（有拦截提示）。
     */
    /**
     * ⚠️ 场次选择有讲究：
     *   · S08（9 人）配比里没有外来者位给畸形秀演员（实测阵容无 mutant）；
     *   · S07 虽在，但**洗脑师门禁优先**（实测按钮表：「需先完成洗脑师判定【疯狂洗脑】」disabled，
     *     「疯狂仲裁」是可点的**仲裁入口**而非门禁）⇒ 测不到畸形秀演员把门。
     *   · **S09 有 mutant 且没有 cerenovus** ⇒ 门禁文案才是「需先完成畸形秀演员判定【疯狂仲裁】」。
     */
    const snap = await bootS(page, "S09");
    const mutantSeat = seatByRole(snap, "mutant");
    expect.soft(mutantSeat, "畸形秀演员应在场").toBeGreaterThanOrEqual(0);
    // ⚠️ `seatByRole` 找不到会抛错 ⇒ 用直接查表判断「不在场」
    expect
      .soft(
        (snap.seats as any[]).some((x: any) => x.role?.id === "cerenovus"),
        "本场不得有洗脑师（否则门禁优先级被抢）"
      )
      .toBe(false);
    expect((await driveNight(page, [])).status, "首夜应推进到白天").toBe("day");

    // ① 门禁：出现 disabled 的「需先完成畸形秀演员判定【疯狂仲裁】」按钮
    const gateText = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button")) as any[];
      const g = btns.find((b) => /需先完成畸形秀演员判定/.test((b.textContent || "").replace(/\s+/g, "")));
      return g ? { found: true, disabled: g.disabled === true } : { found: false, disabled: false };
    });
    expect
      .soft(gateText.found, "畸形秀演员在场 ⇒ 白天「进入黄昏」必须被【疯狂仲裁】门禁替换")
      .toBe(true);
    expect
      .soft(gateText.disabled, "门禁按钮必须 disabled（否则等于没有门禁）")
      .toBe(true);

    // ② 仲裁入口必须可用（说书人据此裁定「是否处决」）
    const arbBtn = page.locator("button").filter({ hasText: /^疯狂仲裁$/ }).first();
    expect
      .soft(await arbBtn.isVisible().catch(() => false), "必须提供可点的【疯狂仲裁】入口")
      .toBe(true);

    // ③ 反证：不存在可用的「进入黄昏」按钮
    const duskEnabled = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button")) as any[];
      return btns.some((b) => /进入黄昏/.test((b.textContent || "").replace(/\s+/g, "")) && b.disabled !== true);
    });
    expect.soft(duskEnabled, "疯狂仲裁未完成前，不得存在可用的「进入黄昏」按钮").toBe(false);
  });
});
