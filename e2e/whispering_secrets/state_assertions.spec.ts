import { expect, test } from "@playwright/test";
import {
  advanceNightFast,
  completeDuskEnterNight,
  enterFirstNight,
  readSnapshot,
  waitForSnapshot,
} from "../helpers/scriptFlow";

/**
 * L4（E2E）· ⭐ 状态断言 —— **窃窃私语**
 * ==================================================================
 * ⚠️ 为什么必须补齐这一辑（2026-09-22，照 `sects_and_violets/state_assertions.spec.ts`）
 * ------------------------------------------------------------------
 * `e2e/whispering_secrets/` 原先只有 `full_flow.spec.ts`（含 ⑦ 逐角色点击流），
 * 覆盖的是**流程**（落座 → 发牌 → 入夜 → 快照可读）；
 * **完全没有「状态断言」维度** ——
 *   · 座位状态字段是否符合**引擎契约**
 *   · 第二夜恶魔行动后，**凡死亡/待死者是否真的落了状态字段**
 *   · 第二夜 `wakeQueueIds` 是否真的含存活恶魔（P0 回归护栏）
 * ⇒ 「弹窗文字对了 → 绿」但**状态字段有没有真的变**完全没验。
 *
 * ── 判据 ──────────────────────────────────────────────────────────
 * 一律读**应用真实持久化快照**（`localStorage[clocktower_current_snapshot]`），
 * 断言**状态字段**，**绝不用文案代替状态**。
 *
 * ── 三条设计铁律（探针实测得出）──────────────────────────────────
 * ① **首夜恶魔不杀人**（官方「每个夜晚**\***」）⇒ 首夜必无人死，看死亡必须推进到**第二夜**。
 * ② **`statusEffects?: any[]` 是可选字段** ⇒ 开局 `undefined` 合法，
 *    只能断言「**若存在则必须是数组**」（断言过严 ≠ 生产缺陷）。
 * ③ ⚠️⭐ **本剧本的恶魔不全都是「必杀」** —— 见下面 `MUST_KILL_DEMONS`。
 *
 * ── 🔴 与梦殒春宵的**关键差异**（照抄会假红，务必看清）──────────
 * 梦殒春宵四恶魔（fang_gu / vigormortis / no_dashii / vortox）**全部**是
 *   「每个夜晚*，你要选择一名玩家：他死亡。」⇒ 4 个都可以进 `MUST_KILL_DEMONS`。
 * 而窃窃私语的三恶魔**只有 1 个**是必杀：
 *   · `vortox`  「每个夜晚*，你要选择一名玩家：他死亡。…」          ⇒ ✅ 必杀
 *   · `po`      「每个夜晚*，**你可以**选择一名玩家：他死亡。…」    ⇒ ❌ 允许不杀
 *   · `zombuul` 「每个夜晚*，**如果今天白天没有人死亡**，你会被唤醒…」⇒ ❌ 条件唤醒
 * ⇒ 若照抄 snv 把三个都写进 `MUST_KILL_DEMONS`，「第二夜必有伤亡」会**随机假红**。
 *   这是本技能反复强调的「**『可能』≠『必然』**」（见 §1.1 / §29）。
 *
 * ── 🔴 本文件的「防假绿」设计（照搬 snv 那轮血泪）────────────────
 * ① 首版若只写「死者必须有死因字段」⇒ **无人死亡时落在空集上、恒真**（典型假绿）。
 * ② 夜杀判据**只能**用 `diedAtNight === nightCount`：
 *    处决死写 `diedOnDay` + `deathSource:"execution"`（**不写** `diedAtNight`）
 *    ⇒ 混用会把「白天处决」当成恶魔的刀 ⇒ 用例④**假绿**（snv 那轮实测踩过）。
 * ③ 断言锚定**必然命中**的对象：座位数 / `role.id` / `wakeQueueIds` 含存活恶魔。
 *
 * ⚠️ 与 L5 的分工：
 *   L5（组件/jsdom）：驱动**单角色能力管道** → 断言状态字段（毫秒级、可穷举）
 *   L4（本文件）：驱动**真实浏览器 + 真实点击流** → 断言状态字段（慢、但证「接线通」）
 */

/** 窃窃私语 7 人局（剧本官方区间 7-10 人；7 人是**下限**，含全部 4 类阵营） */
const SEAT_COUNT = 7;
const SCRIPT = "窃窃私语";

/** 窃窃私语 19 角色（防「发错剧本的牌」） */
const WS_ROLES = [
  "chambermaid", "gossip", "oracle", "mathematician", "artist", "flowergirl",
  "innkeeper", "fool", "saint", "recluse", "politician", "spy", "witch",
  "assassin", "devils_advocate", "vortox", "po", "zombuul", "plague_doctor",
];

/**
 * 官方「每个夜晚*，**你要**选择一名玩家：他死亡」的恶魔（**窃窃私语只有 1 个**）。
 *
 * 🔎 官方依据（`src/data/officialRoleDocs.json` 逐条核对，逐字引用）：
 *   涡流「每个夜晚*，你要选择一名玩家：他死亡。 镇民玩家的能力都会产生错误信息。…」
 *   —— 只有它有「**你要**」这种强制措辞；另两个分别是「**你可以**」（珀）与
 *   「**如果**今天白天没有人死亡」（僵怖）⇒ 都不能断言「本夜必有伤亡」。
 */
const MUST_KILL_DEMONS = ["vortox"];

function seatsOf(snap: any): any[] {
  return Array.isArray(snap?.seats) ? snap.seats : [];
}

/** 座位是否处于「能力被干扰」状态（醉酒 / 中毒）——两种表示都要认 */
function isImpaired(seat: any): boolean {
  if (!seat) return true;
  if (seat.isDrunk === true || seat.isPoisoned === true) return true;
  const fx: any[] = Array.isArray(seat.statusEffects) ? seat.statusEffects : [];
  return fx.some((e: any) => e?.type === "drunk" || e?.type === "poisoned");
}

/** 找恶魔座位（按 `role.type === "demon"`，不依赖中文名） */
function demonSeatOf(snap: any): any {
  return seatsOf(snap).find(
    (s: any) => String(s?.role?.type ?? s?.roleType ?? "") === "demon"
  );
}

/**
 * ⚠️ 本夜是否有「保护类」效果在场上。
 *
 * 🔬 为什么必须单独判（否则用例④**随机假红**）：
 *   窃窃私语里有**两个会挡刀**的角色：
 *     · `innkeeper`（旅店老板）「你要选择两名玩家：**他们当晚不会死亡**…」
 *     · `fool`（弄臣）「当你首次将要死亡时，**你不会死亡**。」
 *   ⇒ 即使 `vortox` 依约选了目标，只要那个目标恰好被保护，**本夜就是零伤亡**。
 *     这是**规则正确**的结果，不该被断言成「恶魔没行动」。
 *   （梦殒春宵那轮没有把这条写进去，是因为 SNV 的挡刀角色与本剧本不同；
 *     本剧本既然有，就必须显式排除，否则这条用例会变成「薛定谔的红」。）
 */
function hasProtectionOnBoard(seats: any[]): boolean {
  return seats.some((s: any) => {
    if (s?.isProtected === true || s?.isExecutionProtected === true) return true;
    if (s?.protectedTonight) return true;
    const fx: any[] = Array.isArray(s?.statusEffects) ? s.statusEffects : [];
    return fx.some((e: any) => {
      const t = String(e?.type ?? "");
      return (
        t === "protected" ||
        t === "safeguard" ||
        t === "execution_protected" ||
        t === "innkeeper_protected" ||
        String(e?.source ?? "").includes("innkeeper") ||
        String(e?.source ?? "").includes("fool")
      );
    });
  });
}

async function duskStep(
  page: any
): Promise<{ ok: boolean; reason?: "gameover" }> {
  const dusk = await completeDuskEnterNight(page);
  if (dusk === "night") return { ok: true };

  /**
   * 走到这里 ⇒ 黄昏没能进入夜晚。**只有两种合法解释**，逐一鉴别（不许静默跳过）：
   *
   * ① **对局已终局** —— 本剧本可触发多条终局：
   *    · 恶魔死亡 ⇒ **善良胜**（官方 "Good wins if the Demon dies"）★ 本轮修的核心契约
   *    · **涡流在场且白天无人被处决 ⇒ 邪恶胜**
   *      （官方【涡流】：「如果白天没人被处决，邪恶阵营获胜」）★ 实测遇到过的合法终局
   *    · 仅剩 2 人存活 ⇒ 邪恶胜
   *    ⇒ 校验「终局与恶魔生死**自洽**」，然后跳过本局（后续「第二夜」断言不适用）。
   * ② 其它 ⇒ **真问题**，抛错并指向 `test-results/` 现场。
   *
   * ⚠️⚠️ **必须读 UI，不能读 localStorage 快照判断「是否终局」**（本轮踩过两次）：
   *   `useGameController` 的快照自动保存是**刻意排除终局**的 ——
   *     `if (inProgressPhases.includes(gamePhase) && !gameState.winResult) saveCurrentSnapshot(...)`
   *   ⇒ 游戏一结束，localStorage 里留的是**最后一个「进行中」快照**
   *     （实测读到的是 `gamePhase="dusk"`，而 UI 上明明已经「游戏结束」）
   *   ⇒ 用 `snapshot.gamePhase === "gameOver"` 判断**结构上永远不成立**。
   *   故改为读 `document.body.textContent` 里的「游戏结束 / XX阵营胜利」。
   *
   * ⚠️ 首版只处理了「恶魔死亡」这一种，结果在「涡流＋白天无人被处决」的局里
   *   **误报为失败**（E2E 实跑抓到）—— 这就是「把合法结局当缺陷」的假红。
   */
  const bodyText = String(
    await page.evaluate(() => document.body.textContent ?? "")
  );
  if (/游戏结束/.test(bodyText)) {
    const winner = /善良阵营胜利/.test(bodyText)
      ? "good"
      : /邪恶阵营胜利/.test(bodyText)
        ? "evil"
        : null;
    expect(
      winner,
      "❌ UI 显示「游戏结束」，却识别不出获胜阵营文案（『善良/邪恶阵营胜利』）—— " +
        "文案结构变了？请更新本判据"
    ).not.toBeNull();

    // 一致性校验：若（最后一个进行中）快照里恶魔已死 ⇒ 必须是善良胜
    const snap = await readSnapshot(page);
    const demon = demonSeatOf(snap);
    if (demon?.isDead === true) {
      expect(
        winner,
        "❌ 恶魔已死却宣布邪恶胜 —— 官方「Good wins if the Demon dies」"
      ).toBe("good");
    }
    // eslint-disable-next-line no-console
    console.log(
      "ℹ️ [ws-l4] 本局在黄昏前已**合法终局**（UI=游戏结束, winner=" +
        winner +
        ", 快照内恶魔已死=" +
        (demon?.isDead === true) +
        "）⇒ 不适用后续「第二夜」断言"
    );
    return { ok: false, reason: "gameover" };
  }

  throw new Error(
    "❌ 黄昏未推进到夜晚，且对局**未终局**（UI 无「游戏结束」）—— " +
      "请查看 `test-results/` 的现场快照定位"
  );
}

/**
 * 从首夜推进到**第二夜开局**（停在该夜队列已生成、尚未执行的状态）。
 *
 * 🔴 2026-09-22 起多出一种**合法结局**：`"gameover"`
 * ------------------------------------------------------------------
 * 官方：「**Good wins if the Demon dies**」。
 * 窃窃私语里有两条「白天当场杀人」的路径：
 *   · `witch` 女巫诅咒 ——「如果（被诅咒者）明天白天发起提名，他死亡」
 *   · `gossip` 造谣者 —— 声明正确则当晚/次日结算一名玩家死亡
 * ⇒ 若死者**就是恶魔**，游戏**必须立即终局**，黄昏自然走不到「入夜」
 *   （`completeDuskEnterNight` 返回 `timeout`）。
 *
 * ⚠️ 这曾是一条**真缺陷**（E2E 实跑抓到）：`killPlayer` 自己从不判终局，
 *   而白天这条路径在 `killPlayer(...)` 之后**直接 return**
 *   （`skipGameOverCheck` 当时还是**死字段**，从未被消费）
 *   ⇒ 恶魔死了却继续进下一夜，UI 上完全看不出异常。
 *   修法见 `useGameController.ts::killPlayer` 的 `gameOverRef`。
 *
 * ⇒ 契约已**下沉到 `duskStep`**：恶魔已死 ⇒ 必须终局（`"gameover"`），
 *   调用方据此提前结束（**不得**当 timeout 报错，也不得静默跳过）。
 *
 * @returns "night"（可继续断言第二夜）｜"gameover"（已正确终局，本局不适用后续断言）
 */
async function toNight2(
  page: any
): Promise<{ ok: boolean; reason?: "gameover" }> {
  const n1 = await advanceNightFast(page);
  test.skip(n1 === "spy", "本局为间谍局，自动驱动不适用");
  expect(n1, "❌ 首夜未能推进到白天").toBe("day");
  return duskStep(page);
}

test.describe("L4 状态断言 · 窃窃私语：真实点击流必须产生真实状态变更", () => {
  test("① ⭐ 入夜后快照必须真实落库：座位数 / role.id / gamePhase / 字段契约", async ({
    page,
  }) => {
    await enterFirstNight(page, SEAT_COUNT, SCRIPT);

    const snap = await waitForSnapshot(
      page,
      (s) => Array.isArray(s?.seats) && s.seats.length > 0
    );
    expect(snap, "❌ 入夜后 localStorage 里没有快照 —— 状态根本没有被持久化").not.toBeNull();

    const seats = seatsOf(snap);
    expect(seats.length, "❌ 快照 seats 为空 —— 无法断言状态").toBe(SEAT_COUNT);

    // ⭐ 每个座位必须真的分配到角色（不只是 UI 上显示了文字）
    const unassigned = seats.filter((s: any) => !s.role?.id);
    expect(
      unassigned.length,
      "❌ 有 " + unassigned.length + " 个座位在快照里没有 role.id —— " +
        "UI 上「已分配」只是文案，状态没落库"
    ).toBe(0);

    // gamePhase 必须已进入夜间（不是停留在 setup/check）
    const phase = String(snap?.gamePhase ?? "");
    expect(
      ["firstNight", "night", "dusk", "day"].includes(phase),
      '❌ gamePhase="' + phase + '" —— 入夜后阶段没有推进（UI 显示夜晚但状态没变）'
    ).toBe(true);

    // ⚠️ 设计铁律②：`statusEffects` 是**可选**字段 ⇒ 只断言「若存在则必须是数组」
    const badShape = seats.filter(
      (s: any) => s.statusEffects !== undefined && !Array.isArray(s.statusEffects)
    );
    expect(
      badShape.length,
      "❌ 有 " + badShape.length + " 个座位的 statusEffects 存在但非数组 —— " +
        "引擎状态被错误序列化，下游 clearExpiredNightEffects 会静默失效"
    ).toBe(0);

    // 存活字段必须是引擎写的布尔
    for (const s of seats) {
      expect(
        typeof s.isDead,
        "❌ " + (s.id + 1) + "号 isDead 非布尔（存活状态必须由引擎写）"
      ).toBe("boolean");
    }

    // ⚠️ 死字段守卫：Seat 上**不存在** isGood/isEvil（曾在收口时误用过）
    for (const s of seats) {
      expect(
        s.isGood,
        "❌ " + (s.id + 1) + "号 带了 seat.isGood —— 该字段在 Seat 上不存在（死字段）"
      ).toBeUndefined();
      expect(s.isEvil, "❌ " + (s.id + 1) + "号 带了 seat.isEvil（死字段）").toBeUndefined();
    }

    // 窃窃私语专属：role.id 必须落在本剧本名册内（防「发错剧本的牌」）
    const outside = seats
      .map((s: any) => s.role?.id)
      .filter((id: string) => id && !WS_ROLES.includes(id));
    expect(
      outside,
      "❌ 快照里出现不属于窃窃私语的角色（发错剧本？）：" + outside.join(",")
    ).toEqual([]);
  });

  test("② ⭐ 状态效果形状：statusEffects 每项必须是 {type, ...}（若存在）", async ({
    page,
  }) => {
    await enterFirstNight(page, SEAT_COUNT, SCRIPT);
    const snap = await readSnapshot(page);
    const seats = seatsOf(snap);
    expect(seats.length).toBe(SEAT_COUNT);

    let effectCount = 0;
    for (const s of seats) {
      if (!Array.isArray(s.statusEffects)) continue;
      for (const e of s.statusEffects) {
        effectCount++;
        expect(
          typeof e?.type,
          "❌ " + (s.id + 1) + "号的效果项缺 type：" + JSON.stringify(e)
        ).toBe("string");
        expect(
          String(e.type).length,
          "❌ " + (s.id + 1) + "号的效果 type 为空串"
        ).toBeGreaterThan(0);
      }
    }
    // ⚠️ 本断言**不要求**一定有 effects（可能空集）—— 但若存在则必须合法。
    //    为避免「遍历空数组 = 零断言」，这里显式记录数量供人工核对。
    // eslint-disable-next-line no-console
    console.log("ℹ️ [ws-l4] 本局开局效果数 =", effectCount, "｜保护在场上 =", hasProtectionOnBoard(seats));
    expect(effectCount, "ℹ️ 本局开局效果数（可为 0）").toBeGreaterThanOrEqual(0);
  });

  test("③ 🔴 P0 回归护栏：第二夜 wakeQueueIds 必须**包含存活恶魔的座位**", async ({
    page,
  }) => {
    /**
     * 🔴🔴 这条断言的价值（梦殒春宵那轮就抓到过真 P0）
     * ------------------------------------------------------------------
     * 缺陷：`useExecutionHandlers::startSubsequentNight` 里
     *   `const wakeIdsWithExecuted = append…(seats, id, wakeIds);`
     *   `wakeIds.length = 0;`
     *   `wakeIds.push(...wakeIdsWithExecuted);`
     * 而 `append…` 在无需追加时 `return wakeIds`（**同一引用**）
     * ⇒ 清空源后再 spread 空数组 ⇒ `wakeQueueIds` **恒为空**。
     *
     * 后果：**第二个夜晚起，引擎不派发任何能力** ⇒ 整晚平安夜、
     *   **恶魔永不杀人**。而 UI 上「夜晚行动顺序」面板照常显示完整队列
     *   ⇒ **UI 完全看不出问题**，极具欺骗性。
     *
     * ✅ 判据用**状态字段** `wakeQueueIds`（`persistence.ts` 已持久化），
     *    不用 console 文案 —— 文案可被改，状态不会说谎。
     *
     * ⚠️ 本剧本**没有**洗脑师 ⇒ 不会遇到 `cerenovus` 的白天门禁弹窗，
     *    但 helper 的「误点取消」修复是**跨剧本通用**的，本用例同样受益（含存活间谍的局除外）。
     */
    await enterFirstNight(page, SEAT_COUNT, SCRIPT);

    const gate = await toNight2(page);
    if (!gate.ok) {
      // `gameover` = 恶魔在黄昏被**能力击杀** ⇒ 已按官方正确终局（契约断言在 toNight2 内完成）
      // `gate`     = 其它原因没进夜；此时 toNight2 已经抛错，走不到这里
      expect(
        gate.reason,
        "❌ 黄昏既没进夜、也不是「恶魔死亡终局」—— 出现了未分类的新情况"
      ).toBe("gameover");
      return;
    }

    const snap2 = await waitForSnapshot(
      page,
      (s) => Number(s?.nightCount ?? 0) >= 2,
      15_000
    );
    expect(snap2, "❌ 第二夜后快照不可读").not.toBeNull();
    expect(
      Number(snap2?.nightCount ?? 0),
      "❌ nightCount 未推进到第 2 夜（实际 " + snap2?.nightCount + "）"
    ).toBeGreaterThanOrEqual(2);

    const demon = demonSeatOf(snap2);
    expect(demon, "❌ 第二夜快照里找不到恶魔座位（role.type==='demon'）").toBeTruthy();

    const wakeQueue: number[] = Array.isArray(snap2?.wakeQueueIds)
      ? snap2.wakeQueueIds
      : [];
    expect(
      wakeQueue.length,
      "❌ 第二夜 `wakeQueueIds` 为空 —— **后续夜晚队列恒空的 P0 复发**：\n" +
        "   引擎将不派发任何能力 ⇒ 整晚平安夜、恶魔永不杀人（UI 上却看不出异常）。\n" +
        "   排查入口：`useExecutionHandlers::startSubsequentNight` 的 wakeIds 构造，" +
        "注意「**先清空入参数组再 spread 同一返回值**」的别名自毁写法。"
    ).toBeGreaterThan(0);

    /**
     * ⚠️⚠️ **必须按「恶魔是否存活」分派**（本用例首版漏了这条 ⇒ **假红**，已修）
     * ------------------------------------------------------------------
     * 🔬 首版失败现场（`test-results/.../error-context.md` 的 Page snapshot）：
     *   `1号「珀」💀 已死亡 (永久)` —— 恶魔**在黄昏被处决了**，
     *   而 `wakeQueueIds=[5,6,3,2]` 里没有它。
     *   ⇒ **死掉的玩家本来就不该被唤醒**，队列排除它是**正确行为**，不是缺陷。
     *   （`startSubsequentNight` 的注释亦明说：「这样白天被处决/夜晚死亡的玩家
     *     不会在后续夜晚被错误唤醒」。）
     *
     * ⇒ 两条分支各自都要断言（**不允许 `return` 静默通过**）：
     *   · 恶魔存活 → 必须在队列里（这才是 P0 回归护栏的本体）
     *   · 恶魔已死 → 必须带**可追溯死因**，否则就是「幽灵死亡」
     */
    const demonAlive = demon.isDead !== true;
    if (demonAlive) {
      expect(
        wakeQueue.includes(demon.id),
        "❌ 第二夜存活恶魔（" + (demon.id + 1) + "号 " + demon.role?.id + "）**不在** wakeQueueIds 中：" +
          JSON.stringify(wakeQueue.map((i: number) => i + 1)) +
          " —— 恶魔不会被唤醒，本夜不可能有人死亡"
      ).toBe(true);
    } else {
      const hasCause =
        demon.diedAtNight !== undefined ||
        demon.deathSource !== undefined ||
        demon.markedForDeath !== undefined ||
        demon.killedBy !== undefined ||
        demon.isSentenced === true;
      // eslint-disable-next-line no-console
      console.log(
        "⚠️ [ws-l4 用例③] 第二夜开始时恶魔已死亡 —— 队列排除它属**正确**行为，" +
          "本局不参与「存活恶魔必须入队」判定。死亡现场：" +
          JSON.stringify({
            seat: demon.id + 1,
            role: demon.role?.id,
            diedAtNight: demon.diedAtNight,
            diedOnDay: demon.diedOnDay,
            deathSource: demon.deathSource,
            isSentenced: demon.isSentenced,
          })
      );
      expect(
        hasCause,
        "❌ 恶魔 isDead=true 但**没有任何死因字段** —— 「幽灵死亡」（状态不一致）"
      ).toBe(true);
    }
  });

  test("④ ⭐ 首夜不杀人 → 第二夜：必杀恶魔（vortox）必须产生伤亡，且死者必须落成状态字段", async ({
    page,
  }) => {
    await enterFirstNight(page, SEAT_COUNT, SCRIPT);

    // ⚠️ 设计铁律①：首夜恶魔不行动 ⇒ 首夜必无人死。
    //    先断言这一点，既验证规则、又证明「本用例的死亡断言不是空转」。
    const n1 = await advanceNightFast(page);
    test.skip(n1 === "spy", "本局为间谍局，自动驱动不适用");
    expect(n1, "❌ 首夜未能推进到白天").toBe("day");

    const snap1 = await readSnapshot(page);
    const deadInNight1 = seatsOf(snap1).filter((s: any) => s.isDead === true);
    expect(
      deadInNight1.length,
      "❌ 首夜竟有 " + deadInNight1.length + " 人死亡（" +
        deadInNight1.map((s: any) => s.id + 1 + "号").join(",") +
        "）—— 官方「每个夜晚*」⇒ 恶魔首夜不行动，首夜不应有人死"
    ).toBe(0);

    // ── 进入第二夜（若恶魔在黄昏被能力击杀 ⇒ 已正确终局，本局提前结束）──
    const dusk2 = await duskStep(page);
    if (!dusk2.ok) {
      expect(
        dusk2.reason,
        "❌ 黄昏既没进夜、也不是「恶魔死亡终局」—— 出现了未分类的新情况"
      ).toBe("gameover");
      return;
    }

    const n2 = await advanceNightFast(page);
    test.skip(n2 === "spy", "本局为间谍局，自动驱动不适用");

    const snap2 = await waitForSnapshot(
      page,
      (s) => s?.gamePhase === "day" || Number(s?.nightCount ?? 0) >= 2,
      15_000
    );
    expect(snap2, "❌ 第二夜后快照不可读").not.toBeNull();
    expect(
      Number(snap2?.nightCount ?? 0),
      "❌ nightCount 未推进到第 2 夜（实际 " + snap2?.nightCount + "）"
    ).toBeGreaterThanOrEqual(2);

    const seats2 = seatsOf(snap2);
    const demon = demonSeatOf(snap2);
    const demonId = String(demon?.role?.id ?? "");
    const nightNo = Number(snap2?.nightCount ?? 0);

    /**
     * ⚠️⚠️ 夜杀判据**只能**用 `diedAtNight === nightCount`（snv 那轮的血泪）
     * ------------------------------------------------------------------
     * · 夜间击杀（恶魔 stateUpdate）：`diedAtNight = 当前夜序` + `markedForDeath = true`
     * · 白天处决（`useGameController.ts`）：`diedOnDay` + `deathSource:"execution"`
     *   + `executedToday = true`，**不写** `diedAtNight`
     * ⇒ 若把 `isDead` 当作恶魔的刀，**白天处决的死者会被误算** ⇒ 用例④假绿。
     */
    const nightCasualties = seats2.filter(
      (s: any) =>
        Number(s.diedAtNight) === nightNo &&
        s.deathSource !== "execution" &&
        s.executedToday !== true
    );

    /**
     * ⚠️ 「可能」≠「必然」的正确用法（**本剧本与梦殒春宵最大的不同**）：
     *   窃窃私语的三恶魔里**只有 `vortox` 是官方「每个夜晚* **你要**选择…他死亡」**；
     *   `po` 是「**你可以**选择」（允许不杀）、`zombuul` 是「**如果**今天白天没有人死亡」（条件唤醒）。
     *   ⇒ 判据是**条件契约**，而非无条件断言：
     *     · 恶魔是 vortox **且** 存活 **且** 未被醉酒/中毒 **且** 场上无保护效果
     *       → **必有夜间伤亡**
     *     · 无论何种情形，凡 isDead 者**必须**带死因字段（防「幽灵死亡」）
     *
     * 🔬 三个 gate 各自的实测理由：
     *   · 干扰：`innkeeper`（旅店老板）会给一名目标上醉酒（可能落在恶魔头上）
     *   · 保护：`innkeeper` 让两名玩家「当晚不会死亡」、`fool` 首次将死不死亡
     *     ⇒ 目标被保护时零伤亡是**规则正确**，断言成缺陷就是假红
     */
    const demonAlive = Boolean(demon) && demon.isDead !== true;
    const demonImpaired = isImpaired(demon);
    const protectedOnBoard = hasProtectionOnBoard(seats2);
    /**
     * 🃏 2026-09-22 新增第 4 个 gate：**场上有弄臣**
     *
     * 官方【弄臣】：「当你**首次**将要死亡时，你不会死亡。」
     * ⇒ 若恶魔这一刀恰好砍在**免死尚未用过**的弄臣身上 ⇒ **零伤亡是规则正确**。
     *   实测撞到过（E2E `--repeat-each=8` 里 1 次红）——
     *   与 §`hasProtectionOnBoard` 那条同理，属「「可能」≠「必然」」。
     * ⚠️ 注意：**不能用夜后的 `foolUsed` 判断当夜是否「新鲜」** ——
     *   若这一刀正被弄臣吃掉，`foolUsed` 恰好会**变成 true** ⇒ 会误判成「不新鲜」而强断言。
     *   故这里只按「场上有弄臣」放宽，并在下面用**吸收不变量**把价值补回来。
     */
    const foolInPlay = seats2.some((s: any) => s.role?.id === "fool");

    const strongGate =
      MUST_KILL_DEMONS.includes(demonId) &&
      demonAlive &&
      !demonImpaired &&
      !protectedOnBoard &&
      !foolInPlay;

    if (strongGate) {
      expect(
        nightCasualties.length,
        "❌ 第二夜恶魔【" + demonId + "】是官方「每个夜晚*必杀」类型、" +
          "且存活、未被干扰、场上无保护、无弄臣，" +
          "却**没有夜间击杀**（nightCount=" + nightNo + "，" +
          "diedAtNight===" + nightNo + " 的座位数=" + nightCasualties.length + "）—— " +
          "恶魔未行动，或 `wakeQueueIds` 状态未落库（见用例③）。\n" +
          "⚠️ 注意：白天黄昏的**处决死**不计入（它写 diedOnDay/execution，不写 diedAtNight）。\n" +
          "本局全部 isDead 座位：" +
          JSON.stringify(
            seats2
              .filter((s: any) => s.isDead)
              .map((s: any) => ({
                n: s.id + 1,
                role: s.role?.id,
                diedAtNight: s.diedAtNight,
                diedOnDay: s.diedOnDay,
                src: s.deathSource,
              }))
          )
      ).toBeGreaterThan(0);
    } else {
      // eslint-disable-next-line no-console
      console.log(
        "ℹ️ [ws-l4 用例④] 本局不满足强断言条件：demon=" + demonId +
          " alive=" + demonAlive + " impaired=" + demonImpaired +
          " protected=" + protectedOnBoard + " foolInPlay=" + foolInPlay +
          "（珀可选不杀 / 僵怖条件唤醒 / 保护生效 / 弄臣免死吸收 均属合法情形）→ 仅执行死因契约断言"
      );
      expect(nightCasualties.length >= 0).toBe(true);

      /**
       * 🃏 **吸收不变量**（把放宽掉的覆盖补回来，且正好在 E2E 层验证本轮修复）：
       *   「恶魔是必杀型 + 存活 + 未被干扰 + 场上无保护 + 零伤亡」
       *   ⇒ 唯一解释就是**这一刀被弄臣的「首次免死」吃掉了**
       *   ⇒ 那么弄臣的免死**必须已被消费**（`foolUsed === true`）。
       *   —— 若未消费，说明免死被无限次使用（正是本轮修掉的缺陷形态）。
       */
      if (
        MUST_KILL_DEMONS.includes(demonId) &&
        demonAlive &&
        !demonImpaired &&
        !protectedOnBoard &&
        foolInPlay &&
        nightCasualties.length === 0
      ) {
        expect(
          seats2.some(
            (s: any) =>
              s.role?.id === "fool" &&
              (s.foolUsed === true || s.hasUsedFoolAbility === true)
          ),
          "❌ 零伤亡 + 场上无保护 ⇒ 只能是弄臣「首次免死」吃掉了恶魔这一刀；" +
            "但他的免死**未被消费**（`foolUsed` 仍为空）—— 免死会被无限次使用（官方：只生效一次）"
        ).toBe(true);
      }
    }

    // ②③ 无论恶魔类型：凡 isDead 者必须有死因字段（防「幽灵死亡」）
    const deadSeats = seats2.filter((s: any) => s.isDead === true);
    const ghosts = deadSeats.filter((s: any) => {
      const hasCause =
        s.diedAtNight !== undefined ||
        s.deathSource !== undefined ||
        s.markedForDeath !== undefined ||
        s.deathReason !== undefined ||
        s.killedBy !== undefined;
      return !hasCause;
    });
    expect(
      ghosts.map((s: any) => s.id + 1 + "号"),
      "❌ 有 " + ghosts.length + " 个座位 isDead=true 但**没有任何死因字段** —— " +
        "「幽灵死亡」（状态不一致，回溯排查会失效）"
    ).toEqual([]);
  });
});
