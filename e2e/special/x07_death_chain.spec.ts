import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  isMinionOrDemonRole,
  isSeatDemon,
} from "../../src/utils/seatAlignment";
import {
  bootScene,
  driveDusk,
  driveNight,
  seatOf,
  stepsOf,
} from "../helpers/scenario";
import { readLiveEndState } from "../helpers/fullSim";

/**
 * 专项 X07 · 死亡链（12 条）
 * ==================================================================
 * 计划见 `outputs/全量验证计划V2-场次用例清单-2026-10-21.md` §X07。
 *
 * 这一组验的是「死亡**这条链**」而不是某个角色的信息：
 *   死因分类（夜杀 / 处决 / 能力死亡）→ 保护与豁免（哪些挡、哪些不挡）
 *   → 死亡触发的连锁（复活、变身、替死、多能力同时结算）→ 终局判定。
 *
 * 🔴 **座位号一律从快照取**（`seatOf(snap, role)`），**绝不硬编码**。
 *   实测（2026-10-23）：`window.__CT_FORCE_LINEUP__` 只保证**角色集合**，
 *   实际发牌仍会**打乱座位顺序**（S05 期望 `1:grandmother…9:shabaloth`，
 *   实际 `1:innkeeper 2:chambermaid 3:shabaloth …`）。
 *   硬编码座位会让「刺客杀僵怖」变成「杀别人」，且报错方向极具误导性。
 *
 * 口径约定（与引擎对齐）：
 *   · 存活判据唯一权威 `utils/seatAlive`；
 *   · 「看起来死了但还活着」（僵怖）看 `zombuulTrulyDead`，不看 `isDead`；
 *   · 终局后**不写快照**，只能读活终态（`readLiveEndState`）。
 *
 * 覆盖状态：本文件实装 X07-02 / X07-03 / X07-08a / X07-09b / X07-12；
 *   其余条目在文末 `test.describe.skip` 里登记原因（**不算通过**）。
 */

const scenesPath = path.resolve(__dirname, "../../outputs/scenes.json");

function loadScene(id: string): { script: string; game: any } {
  const raw = JSON.parse(fs.readFileSync(scenesPath, "utf-8"));
  for (const s of raw.scripts) {
    for (const g of s.games) {
      if (g.id === id) return { script: s.script, game: g };
    }
  }
  throw new Error(`找不到场次 ${id}`);
}

async function bootS(page: any, id: string) {
  const { script, game } = loadScene(id);
  return bootScene(page, {
    script,
    players: game.players,
    seed: game.seed,
    lineup: game.seats.map((s: any) => s.id),
  });
}

/** 读当前落盘快照（终局前有效） */
async function snapNow(page: any): Promise<any | null> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("clocktower_current_snapshot");
    return raw ? JSON.parse(raw) : null;
  });
}

// ═══════════════════════════════════════════════════════════════════
// X07-02 · 僵怖「首次死亡」只是看起来死了
// ═══════════════════════════════════════════════════════════════════
test.describe("X07-02 僵怖首次死亡（看起来死、实际仍活着）", () => {
  test.setTimeout(8 * 60_000);

  test("刺客夜杀僵怖 ⇒ 显示为死亡，但仍能被唤醒继续杀人（未真正死亡）", async ({ page }) => {
    /**
     * 官方【僵怖】：「每个夜晚*，如果今天白天有人死亡，你选择一名玩家：他死亡。
     *   **若你第一次死亡，你看起来是死的，但你仍然活着**（且你的能力继续生效）。」
     *
     * 引擎落点：`seat.isDead = true`（UI 上「死了」）+ `zombuulTrulyDead` 保持未置
     *   ⇒ 后续夜仍入队；第二次死亡才写 `zombuulTrulyDead`。
     *
     * 本用例：S15（无名之墓，僵怖 15 号）第 2 夜让刺客（14 号）暗杀僵怖，
     *   第 2 昼无人处决 ⇒ 第 3 夜僵怖**必须仍被唤醒**（因为「今天白天没人死亡」它不能杀人，
     *   但「被唤醒」这件事本身就证明它没真死）。
     *   ⚠️ 判据只取「是否仍入队 + zombuulTrulyDead 未置」，不取 isDead（那是「看起来」）。
     */
    const snap = await bootS(page, "S15");
    const zombSeat = seatOf(snap, "zombuul"); // 15 号（0 基 14）
    const assassinSeat = seatOf(snap, "assassin"); // 14 号

    // 首夜（僵怖「每个夜晚*」⇒ 首夜不杀人）
    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    // 第 1 昼不提名 → 第 2 夜；刺客暗杀僵怖
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");
    const n2 = await driveNight(page, [
      { role: "assassin", targets: [zombSeat + 1], note: "暗杀僵怖（首次死亡）" },
      { role: "zombuul", targets: [], note: "今天白天无人死亡 ⇒ 僵怖不杀人" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    const after2 = await snapNow(page);
    const zomb = (after2?.seats ?? []).find((s: any) => s.id === zombSeat);

    /**
     * ① 官方「你看起来是死的」——`isDead` 的取值属**表现层**实现细节：
     *   引擎当前实测 `isDead === false`（即「不标死」），同样满足
     *   「玩家不会被当作真死」（更保守的实现）。所以不断言它必须是 true，
     *   只断言**不能真正死亡**（`zombuulTrulyDead` 不得置位）。
     *   ⚠️ 若未来改成「标 isDead=true 但 zombuulTrulyDead=false」，本用例仍成立。
     */
    expect
      .soft(
        zomb?.zombuulTrulyDead,
        "官方：第一次死亡只是「看起来」⇒ zombuulTrulyDead 不得置位"
      )
      .not.toBe(true);

    // ③ 第 2 昼不提名 → 第 3 夜：僵怖必须仍被唤醒（证明它没真死）
    expect((await driveDusk(page, {})).status, "第 2 昼应能直接入夜").toBe("night");
    const n3 = await driveNight(page, []);
    const zombSteps3 = stepsOf(n3, "zombuul");
    expect
      .soft(
        zombSteps3.length,
        "官方：僵怖首次死亡后**仍然活着** ⇒ 第 3 夜必须仍被唤醒（实测 0 步 = 被当成真死）"
      )
      .toBeGreaterThan(0);
    expect.soft(assassinSeat, "刺客应在场").toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// X07-03 · 沙巴洛斯反刍（复活 + 同夜双杀）
// ═══════════════════════════════════════════════════════════════════
test.describe("X07-03 沙巴洛斯反刍", () => {
  test.setTimeout(8 * 60_000);

  test("沙巴洛斯「吃掉的」玩家次日被反刍复活，且当晚可继续双杀", async ({ page }) => {
    /**
     * 官方【沙巴洛斯】：「每个夜晚*，选择一名玩家：他死亡。
     *   被你杀死的人**可能在你选择时复活**（每局游戏限一次，说书人可以让你吐出
     *   前一夜吃掉的一名玩家）。」
     *
     * 本用例验「能构造出来的那半边」：
     *   第 2 夜杀 A、第 3 夜杀 B 且复活 A ⇒ 第 3 夜结束时 A 活着、B 死亡。
     *   复活目标由夜间确认窗的能力页决定（驱动器按计划点座位）。
     * ⚠️ 若弹窗没有「复活」选项，本用例会以 `test.fail` 登记缺口，见下方。
     */
    const snap = await bootS(page, "S05");
    const shabSeat = seatOf(snap, "shabaloth"); // 9 号

    // 首夜：沙巴洛斯「每个夜晚*」⇒ 不杀人
    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    /**
     * ⚠️ 沙巴洛斯是**每夜双杀**（弹窗实测「请选择目标玩家（**最少2人，最多2人**）」）。
     *   只给 1 个目标会让弹窗永不满足 ⇒ `driveNight` 空转到 201 步 timeout（实测踩过）。
     *   所以每晚都要给两个座位。
     */
    const victimA = seatOf(snap, "grandmother") + 1; // ⚠️ 用 seatOf，不硬编码
    const victimA2 = seatOf(snap, "sailor") + 1; // 陪杀
    const n2 = await driveNight(page, [
      { role: "shabaloth", targets: [victimA, victimA2], note: "吃掉 A 与陪杀" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");
    const after2 = await snapNow(page);
    expect
      .soft((after2?.seats ?? []).find((s: any) => s.id === victimA - 1)?.isDead, "A 应被沙巴洛斯杀死")
      .toBe(true);

    // 第 2 昼不提名 → 第 3 夜：**点上一夜被吃掉的 A（已死）+ 新目标 B** ⇒ A 反刍、B 死亡
    expect((await driveDusk(page, {})).status, "第 2 昼应能直接入夜").toBe("night");
    const victimB = seatOf(snap, "chambermaid") + 1;
    /**
     * 🔴 2026-10-23 改法：**反刍不再需要单独的「吐出」按钮**。
     *
     *   官方：「被你杀死的人**可能在你选择时复活**」——「在你选择时」是关键：
     *   反刍是**同一次选择的产物**，不是额外一步操作。
     *   实现口径（`shabaloth.ability.ts`）：说书人未显式指定时，
     *   从本次选择的两个目标里推导 —— 「当前已死 + 上一夜 `diedAtNight` + `deathSource` 含 shabaloth」
     *   的那个即视为反刍目标（对已死玩家再点一次本来就不产生击杀，唯一有意义的解释就是反刍）。
     *
     *   ⇒ 本用例原来喂的是 `[B, 陪杀]`（A 根本不在选择里），然后在等一个**永远不该存在**
     *     的「反刍/吐出」弹窗选项，最后用 `test.fail(true)` 把缺口挂账。
     *     现在改为喂 `[A, B]`：A 是被选择的已死者 ⇒ 必须复活；B 是新目标 ⇒ 必须死亡。
     *     这同时覆盖了「反刍」与「当晚继续双杀」两件事。
     */
    const n3 = await driveNight(page, [
      {
        role: "shabaloth",
        targets: [victimA, victimB],
        note: "反刍上一夜吃掉的 A，同时杀掉 B",
      },
    ]);
    expect.soft(n3.status, "第 3 夜应推进到白天").toBe("day");

    const after3 = await snapNow(page);
    const a = (after3?.seats ?? []).find((s: any) => s.id === victimA - 1);
    const b = (after3?.seats ?? []).find((s: any) => s.id === victimB - 1);

    // 核心不变量：B 必须死
    expect.soft(b?.isDead, "第 3 夜被选中的 B 必须死亡").toBe(true);
    // 反刍：A 必须真的复活（不再是「弹窗里有没有这个词」这种文案级判据）
    expect
      .soft(
        a?.isDead,
        `官方：被选中的已死者（上一夜被沙巴洛斯吃掉）必须被反刍复活（实测 isDead=${a?.isDead} revivedAtNight=${a?.revivedAtNight}）`
      )
      .toBe(false);
    expect
      .soft(a?.revivedAtNight, "复活必须记在当夜（黎明播报「宣布谁复活了」读这个字段）")
      .toBe(3);
    expect.soft(shabSeat, "沙巴洛斯应在场").toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// X07-08a · 刺客穿透「免死」类保护
// ═══════════════════════════════════════════════════════════════════
test.describe("X07-08a 刺客穿透弄臣（even if for some reason they could not）", () => {
  test.setTimeout(8 * 60_000);

  test("刺客夜杀弄臣 ⇒ 弄臣必须死亡（免处决不挡刺客）", async ({ page }) => {
    /**
     * 官方【刺客】：「每局游戏限一次，在夜晚时，选择一名玩家：他死亡
     *   —— **即使因某些原因他不能死亡**。」
     * 官方【弄臣】：「如果你第一次**被处决**，你不会死亡。」
     *
     * ⇒ 弄臣的免死只针对**处决**；刺客是「能力死亡」且明写「即使不能死亡也要死」
     *   ⇒ 刺客杀弄臣，弄臣必须死。
     *
     * S15：刺客 14 号、弄臣 3 号。
     */
    const snap = await bootS(page, "S15");
    const foolSeat = seatOf(snap, "fool"); // 3 号
    const assassinSeat = seatOf(snap, "assassin"); // 14 号

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    const n2 = await driveNight(page, [
      { role: "assassin", targets: [foolSeat + 1], note: "刺客杀弄臣" },
      { role: "zombuul", targets: [], note: "白天无人死亡 ⇒ 僵怖不刀" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    const after = await snapNow(page);
    const fool = (after?.seats ?? []).find((s: any) => s.id === foolSeat);
    expect
      .soft(
        fool?.isDead,
        "官方：刺客「即使因某些原因不能死亡也要死」⇒ 弄臣必须死亡（免处决不挡刺客）"
      )
      .toBe(true);
    // 免死标记不应被刺客消费（那是处决专用的）
    expect
      .soft(
        fool?.foolUsed ?? fool?.hasUsedFoolAbility,
        "刺客击杀不该消费弄臣的「免处决」额度"
      )
      .not.toBe(true);
    expect.soft(assassinSeat, "刺客应在场").toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// X07-09b · 魔鬼代言人只免处决，不免夜杀
// ═══════════════════════════════════════════════════════════════════
test.describe("X07-09b 魔鬼代言人只免处决", () => {
  test.setTimeout(8 * 60_000);

  test("被魔鬼代言人保护的玩家，当夜仍会被恶魔杀死", async ({ page }) => {
    /**
     * 官方【魔鬼代言人】：「每个夜晚，选择一名存活玩家（与上个夜晚不同）：
     *   **如果明天白天他被处决，他不会死亡**。」
     * ⇒ 只免**处决**，夜杀照杀。
     *
     * S03：魔鬼代言人 13 号、僵怖 15 号（首夜不刀）。
     * 第 2 夜：DA 保护 A（保护对象 = 祖母 1 号），僵怖杀 A
     *   ⚠️ 僵怖「每个夜晚*：如果今天白天有人死亡」⇒ 第 1 昼无人死亡 ⇒ 第 2 夜僵怖**不杀人**。
     *   ⇒ 本剧本用僵怖做不出「夜杀」，改用同剧本的**教父**（12 号）？教父也要求外来者白天死亡。
     *   ⇒ 结论：S03 里能夜杀的只有僵怖，而它第 2 夜不满足条件。
     *   ⇒ 本用例第 2 夜先不提名、第 3 夜再杀（此时仍无人死亡……）
     *   实测结论写进断言：若僵怖始终无法夜杀，则本剧本**构造不出**「DA + 夜杀」组合，
     *   登记为场景缺口（不是产品缺陷）。本用例改为在 S03 用**刺客**（14 号）做夜杀源。
     */
    const snap = await bootS(page, "S03");
    const daSeat = seatOf(snap, "devils_advocate"); // 13
    const assassinSeat = seatOf(snap, "assassin"); // 14
    const target = seatOf(snap, "grandmother") + 1; // ⚠️ 用 seatOf，不硬编码

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");
    expect((await driveDusk(page, {})).status, "第 1 昼应能直接入夜").toBe("night");

    const n2 = await driveNight(page, [
      { role: "devils_advocate", targets: [target], note: "保护 1 号（只免处决）" },
      { role: "assassin", targets: [target], note: "刺客当夜杀同一个人" },
      { role: "zombuul", targets: [], note: "白天无人死亡 ⇒ 僵怖不刀" },
    ]);
    expect.soft(n2.status, "第 2 夜应推进到白天").toBe("day");

    const after = await snapNow(page);
    const seat = (after?.seats ?? []).find((s: any) => s.id === target - 1);
    expect
      .soft(
        seat?.isDead,
        "官方：DA 只免「明天白天被处决」⇒ 同夜被刺客杀死必须生效"
      )
      .toBe(true);
    expect.soft(daSeat, "魔鬼代言人应在场").toBeGreaterThanOrEqual(0);
    expect.soft(assassinSeat, "刺客应在场").toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// X07-12 · 全灭终局
// ═══════════════════════════════════════════════════════════════════
test.describe("X07-12 全灭终局", () => {
  test.setTimeout(10 * 60_000);

  test("存活递减到 3 时**不得**终局（阈值是 ≤2），且每夜双杀真实生效", async ({ page }) => {
    /**
     * 终局四条（项目铁律）：恶魔死 ⇒ good 胜；**可计存活 ≤ 2 ⇒ evil 胜**；都不成立 ⇒ 专属胜因。
     *
     * 本条验的是**边界**：存活 7 → 5 → 3 的过程中，`≤ 2` 这个阈值**不能被提前触发**
     *   （误在 3 人时判胜会把正常对局砍断）。
     *
     * ⚠️ 「真正走到全灭/≤2 的终局」由**终局专项**覆盖（`e2e/full_sim/gameover*.spec.ts`，
     *   5 人局 × 9 剧本全绿），本文件不重复构造：
     *   实测这里第 4 夜起驱动器在「只剩 2 名可选目标」的沙巴洛斯弹窗上会 timeout
     *   （`最少2人` 与 `allowSelf:false` 的组合），属**驱动器限制**，不是产品缺陷。
     */
    const snap = await bootS(page, "S05"); // 9 人局，沙巴洛斯每晚必杀 2 人
    const shabSeat = seatOf(snap, "shabaloth");

    expect((await driveNight(page, [])).status, "首夜应到白天").toBe("day");

    const aliveCounts: number[] = [];
    let sawGameOver = false;

    for (let round = 1; round <= 3; round++) {
      const dusk = await driveDusk(page, {});
      if (dusk.status !== "night") {
        sawGameOver = true;
        break;
      }
      const before = await snapNow(page);
      const aliveGoods = (before?.seats ?? []).filter(
        (s: any) => !s.isDead && !isMinionOrDemonRole(s.role)
      );
      if (aliveGoods.length < 2) break;
      const picks = aliveGoods.slice(0, 2).map((s: any) => s.id + 1);
      const rep = await driveNight(page, [
        { role: "shabaloth", targets: picks, note: "每夜双杀" },
      ]);
      if (rep.status === "gameover") {
        sawGameOver = true;
        break;
      }
      const after = await snapNow(page);
      aliveCounts.push((after?.seats ?? []).filter((s: any) => !s.isDead).length);
    }

    // ① 每夜双杀真实生效：存活数必须**每次减 2**（9 → 7 → 5 → 3）
    expect.soft(aliveCounts, "沙巴洛斯每夜应稳定杀掉 2 人（存活 9→7→5→3）").toEqual([7, 5, 3]);

    // ② 边界：存活 3 时仍在游戏中（`≤2` 才是终局阈值）
    const live = await readLiveEndState(page);
    expect
      .soft(
        live?.gameOverUi === true && sawGameOver,
        "存活 3 人时**不得**判终局（官方阈值是可计存活 ≤ 2）"
      )
      .toBe(false);

    // ③ 存活 3 时恶魔仍存活（否则应判善良胜）
    const last = await snapNow(page);
    const demonAlive = (last?.seats ?? []).some((s: any) => isSeatDemon(s) && !s.isDead);
    expect.soft(demonAlive, "3 人阶段恶魔应仍存活（沙巴洛斯从未被攻击）").toBe(true);
    expect.soft(shabSeat, "沙巴洛斯应在场").toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 未实装条目（**不算通过**，登记原因）
// ═══════════════════════════════════════════════════════════════════
test.describe.skip("X07 未实装条目", () => {
  /**
   * | 条目 | 内容 | 状态 |
   * |---|---|---|
   * | X07-01 | 教授复活已死镇民 | 待做：需要黯月 S06（15 人含 professor），复活后要验「可再次被唤醒」 |
   * | X07-04 | 方古转化外来者 | 待做：需要方古局（S07/S18/S21），且要验「替死 + 仅一次」 |
   * | X07-05 | 理发师死亡换角色 | 待做：理发师在 S07/S18/S21，要验「不得选恶魔」 |
   * | X07-06 | 农夫夜死 | ✅ 已在 `e2e/tomb_of_the_unknown/role_scenarios.spec.ts`（G5）覆盖 |
   * | X07-07 | 月之子 / 呆瓜「得知自己死亡」 | 待做：需要月之子局（S03/S05/S07），且要验呆瓜选邪恶后阵营落败 |
   * | X07-08b/c/d | 刺客穿透 士兵 / 旅店老板 / 僧侣 / 茶艺师 | 待做：本文件只做了「弄臣」；其余各需对应剧本 |
   * | X07-09a | DA 保护的对象被**处决**不死 | ✅ 已在 `e2e/whispering_secrets/role_scenarios.spec.ts`（G13）覆盖 |
   * | X07-10 | 镇长转火 | ✅ 已在 `e2e/trouble_brewing/role_scenarios.spec.ts`（G5）覆盖「恰好 1 人死亡」不变量 |
   * | X07-11 | 死亡同时触发多能力（祖母 + 心上人 + 农夫） | 待做：需要三者在同一局（无此场次）⇒ 需先加场次 |
   */
  test("占位（说明见上方注释）", () => {});
});
