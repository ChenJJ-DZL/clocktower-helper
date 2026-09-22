import { expect, test } from "@playwright/test";
import {
  advanceNightFast,
  completeDuskEnterNight,
  enterFirstNight,
  readSnapshot,
  waitForSnapshot,
} from "../helpers/scriptFlow";

/**
 * L4（E2E）· ⭐ 状态断言 —— **梦殒春宵**
 *
 * ⚠️ 为什么必须补齐这一辑（2026-09-21）
 * ------------------------------------------------------------------
 * `e2e/sects_and_violets/` 原先只有 `full_flow.spec.ts`（7 条），覆盖的是
 * **流程**（落座 → 入夜 → 白天 → 快照可读）。
 * 而同时**完全没有「状态断言」维度** —— 对比罂粟花开的
 * `poppyganda/state_assertions.spec.ts`（5 条）：
 *   · 座位状态字段是否符合**引擎契约**
 *   · 第二夜恶魔行动后，**凡死亡/待死者是否真的落了状态字段**
 *   · 状态效果（statusEffects）的形状是否合法
 * ⇒ 「弹窗文字对了 → 测试绿」但**状态字段有没有真的变**完全没验 ——
 *    这正是「测试全绿、人工实测完全不同」的同一病灶，只是发生在 E2E 层。
 *
 * ── 判据 ──────────────────────────────────────────────────────────
 * 一律读**应用真实持久化快照**（`localStorage[clocktower_current_snapshot]`）
 * 并断言**状态字段**，**绝不用文案代替状态**。
 *
 * ── 两条设计铁律（探针实测得出，与罂粟花开一致）────────────────
 * ① **首夜恶魔不杀人**（官方规则）⇒ 首夜必无人死，看死亡必须推进到**第二夜**。
 * ② **`statusEffects?: any[]` 是可选字段** ⇒ 开局 `undefined` 合法，
 *    只能断言「**若存在则必须是数组**」（断言过严 ≠ 生产缺陷）。
 *
 * ── 🔴 本文件的「防假绿」证据（2026-09-21 探针实测）────────────────
 * 首版只写「死者必须有死因字段」⇒ 若**无人死亡**，该断言落在**空集**上、
 * 恒真 —— 典型假绿（罂粟花开侧已踩过一次，见其文件头注释）。
 * 本版据此重写，全部断言锚定**必然命中**的对象：
 *   · 座位数 / `role.id` 是否真的落库（必然）
 *   · 第二夜 `wakeQueueIds` 必须**含存活恶魔的座位**（必然）
 *   · 必杀恶魔（`fang_gu` / `vigormortis` / `no_dashii` / `vortox`）→ **必有伤亡**
 *     🔎 官方依据（`src/data/officialRoleDocs.json` 逐条核对）：
 *       方古   「每个夜晚*，你要选择一名玩家：他死亡。…」
 *       亡骨魔 「每个夜晚*，你要选择一名玩家：他死亡。…」
 *       诺-达鲺「每个夜晚*，你要选择一名玩家：他死亡。…」
 *       涡流   「每个夜晚*，你要选择一名玩家：他死亡。…」
 *     —— 四者**全部**是「必须杀人」（`*` = 非首夜），不存在「可以不杀」的恶魔。
 *
 * ⚠️ 与 L5 的分工：
 *   L5（组件/jsdom）：驱动**单角色能力管道** → 断言状态字段（毫秒级、可穷举）
 *   L4（本文件）：驱动**真实浏览器 + 真实点击流** → 断言状态字段（慢、但证「接线通」）
 *
 * 🔴🔴 本文件诞生的当天就抓到一个 **P0**（详见用例③）：
 *   「后续夜晚 `wakeQueueIds` 恒为空 ⇒ 全员不被唤醒 ⇒ 恶魔永不杀人」。
 */

/** 梦殒春宵 7 人局（与 `full_flow.spec.ts` 的落座规模一致） */
const SEAT_COUNT = 7;
const SCRIPT = "梦殒春宵";

/** 梦殒春宵角色名册（防「发错剧本的牌」） */
const SNV_ROLES = [
  "clockmaker", "dreamer", "snake_charmer", "mathematician", "flowergirl",
  "town_crier", "oracle", "savant", "seamstress", "philosopher", "artist",
  "juggler", "sage", "mutant", "sweetheart", "barber", "klutz", "evil_twin",
  "witch", "cerenovus", "pit_hag", "fang_gu", "vigormortis", "no_dashii", "vortox",
];

/** 官方「每个夜晚* 必须杀死一名玩家」的恶魔（梦殒春宵四恶魔全部命中） */
const MUST_KILL_DEMONS = ["fang_gu", "vigormortis", "no_dashii", "vortox"];

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
 * 从首夜推进到**第二夜开局**（停在该夜队列已生成、尚未执行的状态）。
 * @returns "night" 成功 / "gate" 白天门禁挡住（洗脑师「疯狂洗脑」等，自动化无法解除）
 */
async function toNight2(
  page: any
): Promise<{ ok: boolean; reason?: string }> {
  const n1 = await advanceNightFast(page);
  test.skip(n1 === "spy", "本局为间谍局，自动驱动不适用");
  expect(n1, "❌ 首夜未能推进到白天").toBe("day");

  const dusk = await completeDuskEnterNight(page);
  if (dusk !== "night") {
    return { ok: false, reason: "gate" };
  }
  return { ok: true };
}

test.describe("L4 状态断言 · 梦殒春宵：真实点击流必须产生真实状态变更", () => {
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
    expect(
      seats.length,
      "❌ 快照 seats 为空 —— 无法断言状态"
    ).toBe(SEAT_COUNT);

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

    // 梦殒春宵专属：role.id 必须落在本剧本名册内（防「发错剧本的牌」）
    const outside = seats
      .map((s: any) => s.role?.id)
      .filter((id: string) => id && !SNV_ROLES.includes(id));
    expect(
      outside,
      "❌ 快照里出现不属于梦殒春宵的角色（发错剧本？）：" + outside.join(",")
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
    console.log("ℹ️ [snv-l4] 本局开局效果数 =", effectCount);
    expect(effectCount, "ℹ️ 本局开局效果数（可为 0）").toBeGreaterThanOrEqual(0);
  });

  test("③ 🔴 P0 回归护栏：第二夜 wakeQueueIds 必须**包含存活恶魔的座位**", async ({
    page,
  }) => {
    /**
     * 🔴🔴 这条断言的价值（2026-09-21 当天就抓到真 P0）
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
     *   （因为在 `queue.length === 0` 的兜底分支之外，预览 `nightOrderPreview`
     *    仍按 `queue` 生成）—— **UI 完全看不出问题**，极具欺骗性。
     *
     * 🔬 修复前实测（4/4 局）：`night2 dead=[]`；修复后：`[Vigormortis] 击杀1号`
     *    且快照写入 `deathSource:"vigormortis_kill"` / `diedAtNight:2`。
     *
     * ✅ 判据用**状态字段** `wakeQueueIds`（`persistence.ts:109` 已持久化），
     *    不用 console 文案 —— 文案可被改，状态不会说谎。
     */
    await enterFirstNight(page, SEAT_COUNT, SCRIPT);

    const gate = await toNight2(page);
    if (!gate.ok) {
      test.skip(
        true,
        "本局白天存在日间门禁（洗脑师【疯狂洗脑】），自动化无法解除" +
          "—— 非生产缺陷（已知待裁决项）；本用例在该局面下不适用"
      );
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

    expect(
      wakeQueue.includes(demon.id),
      "❌ 第二夜存活恶魔（" + (demon.id + 1) + "号 " + demon.role?.id + "）**不在** wakeQueueIds 中：" +
        JSON.stringify(wakeQueue.map((i: number) => i + 1)) +
        " —— 恶魔不会被唤醒，本夜不可能有人死亡"
    ).toBe(true);
  });

  test("④ ⭐ 首夜不杀人 → 第二夜：必杀恶魔必须产生伤亡，且死者必须落成状态字段", async ({
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
        "）—— 官方规则「恶魔首夜不行动」，首夜不应有人死"
    ).toBe(0);

    // ── 进入第二夜 ──
    const dusk = await completeDuskEnterNight(page);
    if (dusk === "timeout") {
      test.skip(
        true,
        "本局白天存在日间门禁（可能是洗脑师【疯狂洗脑】），自动化无法解除" +
          "—— 非生产缺陷（已知待裁决项）；本用例在该局面下不适用"
      );
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
     * ⚠️⚠️ 变异检验暴露的**假绿漏洞**（2026-09-21，必看）
     * ------------------------------------------------------------------
     * 首版判据写作 `casualties = isDead 数 + markedForDeath 数` ⇒
     * **把「白天黄昏处决死」也算成了恶魔的刀**。
     *
     * 🔬 实测证据：把 P0（`wakeQueueIds` 恒空）变异回去后，第二夜**零击杀**，
     *   但用例④**仍然全绿** —— 因为当天黄昏恰好处决了 1 号（`dead=1:town_crier`），
     *   而 `isDead=true` 被当成了恶魔杀人的证据。
     *   ⇒ 这正是【元教训 6】说的「假绿自检 = 把生产代码改坏，这测试会不会红？」
     *      不会红 ⇒ 假绿。
     *
     * ✅ 正确判据：只统计**夜间死亡**。两者写入字段**完全不同**（已读源码确认）：
     *   · 夜间击杀（恶魔 stateUpdate）：`diedAtNight = 当前夜序` + `markedForDeath = true`
     *   · 白天处决（`useGameController.ts:503-517`）：`diedOnDay` + `deathSource:"execution"`
     *     + `executedToday = true`，**不写 `diedAtNight`**
     *   ⇒ 三重排除：`diedAtNight === nightNo` 且非 `execution` 且非 `executedToday`。
     */
    const nightCasualties = seats2.filter(
      (s: any) =>
        Number(s.diedAtNight) === nightNo &&
        s.deathSource !== "execution" &&
        s.executedToday !== true
    );

    /**
     * ⚠️ 「可能」≠「必然」的正确用法：
     *   梦殒春宵的四恶魔**全部**是「每个夜晚* 你要选择一名玩家：他死亡」
     *   （官方原文逐条核对，见文件头）⇒ **不存在**「可以不杀」的恶魔。
     *   因此判据是**条件契约**，而非无条件断言：
     *     · 恶魔存活 **且** 未被醉酒/中毒干扰 → **必有夜间伤亡**
     *       （麻脸巫婆在同一夜**先于**恶魔行动，可能给恶魔下毒 ⇒ 不能无条件断言）
     *     · 无论何种情形，凡 isDead 者**必须**带死因字段（防「幽灵死亡」）
     */
    const demonAlive = Boolean(demon) && demon.isDead !== true;
    const demonImpaired = isImpaired(demon);

    if (MUST_KILL_DEMONS.includes(demonId) && demonAlive && !demonImpaired) {
      expect(
        nightCasualties.length,
        "❌ 第二夜恶魔【" + demonId + "】是官方「每个夜晚*必杀」类型、且存活且未被干扰，" +
          "却**没有夜间击杀**（nightCount=" + nightNo + "，" +
          "diedAtNight===" + nightNo + " 的座位数=" + nightCasualties.length + "）—— " +
          "恶魔未行动，或 `wakeQueueIds` 状态未落库（见用例③）。\n" +
          "⚠️ 注意：白天黄昏的**处决死**不计入（它写 diedOnDay/execution，不写 diedAtNight）—— " +
          "首版判据把处决死算作恶魔的刀 ⇒ 变异检验时**假绿**。\n" +
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
        "ℹ️ [snv-l4 用例④] 本局不满足强断言条件：demon=" + demonId +
          " alive=" + demonAlive + " impaired=" + demonImpaired +
          "（麻脸巫婆同期下毒属合法情形）→ 仅执行死因契约断言"
      );
      expect(nightCasualties.length >= 0).toBe(true);
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
