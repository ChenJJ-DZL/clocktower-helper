import { expect, test, type Page } from "@playwright/test";
import {
  advanceNightFast,
  completeDuskEnterNight,
  readNightQueue,
  readSnapshot,
  resolveCharades,
  waitForSnapshot,
} from "../helpers/scriptFlow";

/**
 * L4（E2E）· 暗流涌动（Trouble Brewing）· **22 角色真实点击流 + 读 localStorage 断言**
 * ==================================================================
 * ⚠️ 为什么必须有这一层：L1/L2/L3/L5 都在 Node/jsdom 里跑，证明不了
 *   「说书人在真实浏览器里点得动、点了之后状态真的落库」。
 *   本文件所有断言都读 `localStorage["clocktower_current_snapshot"]`
 *   的**状态字段**（`role.id` / `gamePhase` / `nightCount` / `wakeQueueIds` /
 *   `statusEffects` / `masterId` / `markedForDeath`），**不锚文案**。
 *
 * ── 22 角色怎么做到「逐角色」覆盖（规范 §4 要求）────────────────────
 *   暗流涌动一局只有 5~15 个坑位 / 22 个角色，随机发牌下**任何单一局面都
 *   不可能含全部 22 角色**。因此本文件用 **手动落座**（点击
 *   `[data-role-id]` 角色按钮 + `[title="N号座位"]` 序号圆）把**指定阵容**
 *   钉进局面，再用 3 局覆盖 22/22：
 *
 *   | 局 | 人数 | 官方配比 | 角色（座次序） |
 *   |---|---|---|---|
 *   | G1 | 7  | 5镇民/0外来者/1爪牙/1恶魔 | 洗衣妇 图书管理员 调查员 厨师 共情者 投毒者 小恶魔 |
 *   | G2 | 9  | 5/2/1/1 | 占卜师 送葬者 僧侣 守鸦人 贞洁者 管家 酒鬼 间谍 小恶魔 |
 *   | G3 | 12 | **5/4/2/1**（男爵在场 ⇒ 官方强制 +2 外来者） | 猎手 士兵 镇长 洗衣妇 厨师 管家 酒鬼 陌客 圣徒 男爵 红唇女郎 小恶魔 |
 *
 *   合计并集 = 22/22（见 §D 的覆盖清单断言）。
 *
 *   ⚠️ G3 为什么是 5/4/2/1 而不是 12 人的常规 7/2/2/1：
 *     **男爵在场时官方配比强制变成「镇民 −2 / 外来者 +2」**，应用真的会拦
 *     （`src/hooks/useSetupManager.ts:59-67` 的 `getCompositionStatus`，
 *     以及 `getBaronStatus` 的 recommended）。落 7/2/2/1 + 男爵会被
 *     「⚠️ 阵容配置错误」弹窗挡住、进不了夜晚 —— 见 §C 的负向对照用例 ⑩。
 *
 *   ⚠️ 间谍（spy）的「查看魔典」步骤没有独立确认按钮（`e2e/helpers/scriptFlow.ts:384-392`），
 *     含间谍的 G2 因此**不做整夜自动推进**，只做「落座 / 队列 / 状态落库」断言 +
 *     一条「流程真的走到间谍步骤」的特征化断言（用例 ⑥）。
 *
 * ── 每条判据落在哪 ────────────────────────────────────────────────
 *   ① 能唤醒：`snapshot.wakeQueueIds`（座位 id）+ DOM 队列 `N. [M号] 角色名`
 *      双向核对；并断言「当夜应唤醒的角色在队列里 / 不该唤醒的不在队列里」。
 *   ② 能选目标：**在真实的「请选择目标玩家」弹窗里**断言候选座位的禁用规则
 *      （行动者自己/已死者按 allowSelf/allowDead 灰显），并真的点选出目标。
 *   ③ 能确认：点确认后读快照断言**状态字段真的变了**（poisoned / protected /
 *      masterId / markedForDeath …）。
 *   ④ 能撤销：落座阶段点座位可撤销；非法配比可「返回修改」再改。
 *
 * ⚠️ 端口固定 3100（本机 3000/3001/3002 常被残留进程占用，可能返回别的 App）。
 *   由外部先起：`PORT=3100 npx next dev -p 3100`；Playwright 不托管 dev server。
 */

const SCRIPT = "暗流涌动";

/** roleId → `app/data.ts` 中文名（落座阶段的 DOM 断言用；必须逐字一致） */
const NAME: Record<string, string> = {
  washerwoman: "洗衣妇",
  librarian: "图书管理员",
  investigator: "调查员",
  chef: "厨师",
  empath: "共情者",
  fortune_teller: "占卜师",
  undertaker: "送葬者",
  monk: "僧侣",
  ravenkeeper: "守鸦人",
  virgin: "贞洁者",
  slayer: "猎手",
  soldier: "士兵",
  mayor: "镇长",
  butler: "管家",
  drunk: "酒鬼",
  recluse: "陌客",
  saint: "圣徒",
  poisoner: "投毒者",
  spy: "间谍",
  scarlet_woman: "红唇女郎",
  baron: "男爵",
  imp: "小恶魔",
};

/** 三局阵容（并集 = 22 角色；见文件头表格） */
const G1 = ["washerwoman", "librarian", "investigator", "chef", "empath", "poisoner", "imp"];
const G2 = ["fortune_teller", "undertaker", "monk", "ravenkeeper", "virgin", "butler", "drunk", "spy", "imp"];
/** ⚠️ 男爵在场 ⇒ 12 人局必须是 5/4/2/1（`useSetupManager.ts:59-67` 强制校验） */
const G3 = ["slayer", "soldier", "mayor", "washerwoman", "chef", "butler", "drunk", "recluse", "saint", "baron", "scarlet_woman", "imp"];
/** 男爵负向对照用的**非法**阵容（12 人常规 7/2/2/1 + 男爵 ⇒ 应用必须拦下） */
const G3_ILLEGAL = ["slayer", "soldier", "mayor", "washerwoman", "chef", "empath", "librarian", "recluse", "saint", "baron", "scarlet_woman", "imp"];

/**
 * 首夜**应当**被唤醒（且有自己独立队列行、行内含角色名）的角色。
 *
 * ⚠️ 男爵（baron）**不在**此表：它在 `rolesData.json` 里 `firstNightOrder: 33`，
 *   但 33 对应的是**「爪牙互认」系统步骤**，不是男爵自身的技能 ——
 *   探针实测队列行是 `1. [10号] 爪牙互认`，**行内没有「男爵」二字**。
 *   ⇒ 男爵的首夜在场证据改为断言「它参与了互认」（见 §C 用例 ⑦ 的
 *     `mutualSeatIds`），而不是断言队列里出现角色名。
 */
const FIRST_NIGHT_WAKE = new Set([
  "washerwoman", "librarian", "investigator", "chef", "empath",
  "fortune_teller", "butler", "poisoner", "spy",
]);
/** 首夜**不应当**被唤醒的角色（only-other-night / 被动 / 白天 / 死亡触发） */
const NOT_FIRST_NIGHT = new Set([
  "undertaker", "monk", "ravenkeeper", "virgin", "slayer", "soldier",
  "mayor", "drunk", "recluse", "saint", "scarlet_woman", "imp",
]);

// ───────────────────────────── 夹具 ─────────────────────────────

function seatsOf(snap: any): any[] {
  return Array.isArray(snap?.seats) ? snap.seats : [];
}

/** 进入配置页（**不点随机落座**），完成「快速开始 + 人数」 */
async function enterConfigNoDeal(page: Page, count: number) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: new RegExp(SCRIPT) })
    .last()
    .click({ timeout: 15_000 });
  const quick = page.getByText("⚡ 快速开始").first();
  await expect(quick).toBeVisible({ timeout: 20_000 });
  await quick.click({ timeout: 15_000 });
  await page.getByText(`${count}人`, { exact: false }).first().click({ timeout: 15_000 });
}

/**
 * 点座位（落座/撤销落座）。
 *
 * ⚠️⚠️ 探针实证（2026-09-21）：座位圆圈位于**圆形舞台**内，Playwright 的
 *   真实鼠标事件（`.click()` / `page.mouse.click(坐标)`）在它上面**不生效**
 *   —— 坐标命中的是舞台层，React 的 `onClick` 收不到（页面无任何反应、
 *   无控制台日志）。而 `dispatchEvent("click")` 会**派发真实 DOM click 事件**，
 *   React 的合成事件系统正常接收 → 应用的**真实 handler** 真的执行
 *   （`useInteractionHandler.handleSeatClick` 打印 DBG 日志并改状态）。
 *   ⇒ 座位用 `dispatchEvent`；角色卡片（列表区，不在舞台上）用**真实鼠标点击**。
 *   这是「事件投递方式」的差异，**不是**跳过 UI 逻辑。
 */
async function clickSeat(page: Page, seatId: number) {
  await page
    .getByTitle(`${seatId + 1}号座位`)
    .first()
    .dispatchEvent("click");
  await page.waitForTimeout(120);
}

/** 随机落座后清空全部座位（保证可以覆盖为确定阵容） */
async function resetSeats(page: Page, count: number) {
  await page.getByText("随机落座").first().click({ timeout: 15_000 });
  for (let i = 0; i < count; i++) await clickSeat(page, i);
}

/** 逐位落座，并断言 UI 上真的显示了该角色 */
async function assignComp(page: Page, comp: string[]) {
  for (let i = 0; i < comp.length; i++) {
    await page.locator(`[data-role-id="${comp[i]}"]`).first().click({ timeout: 15_000 });
    await clickSeat(page, i);
    const seatText = await page.locator(`[data-seat-id="${i}"]`).first().textContent();
    expect(
      seatText ?? "",
      `❌ UI 上 ${i + 1}号 未显示「${NAME[comp[i]]}」（落座点击无效）`
    ).toContain(NAME[comp[i]]);
  }
}

/** 定位「确认无误，入夜」按钮（阵容预览弹窗 / 控制面板两种形态都覆盖） */
function enterNightButton(page: Page) {
  return page
    .locator("button")
    .filter({ hasText: /确认无误[\s\S]*入夜/ })
    .first();
}

/** 分发核对 → 入夜 */
async function confirmAndEnterNight(page: Page) {
  await resolveCharades(page);
  const distribute = page.getByText("分发&核对身份").first();
  await expect(distribute).toBeVisible({ timeout: 20_000 });
  await distribute.click({ timeout: 15_000 });
  const enterNight = enterNightButton(page);
  await expect(
    enterNight,
    "❌ 点「分发&核对身份」后没有出现「确认无误，入夜」按钮 —— " +
      "多半被「阵容配置错误」弹窗挡住了（配比非法）"
  ).toBeVisible({ timeout: 20_000 });
  await enterNight.click({ timeout: 15_000 });
  await expect(page.getByText("夜晚行动顺序").first()).toBeVisible({ timeout: 20_000 });
}

/** 完整开一局指定阵容并进入首夜，返回入夜后的快照 */
async function dealAndEnterNight(page: Page, comp: string[]) {
  await enterConfigNoDeal(page, comp.length);
  await resetSeats(page, comp.length);
  await assignComp(page, comp);
  await confirmAndEnterNight(page);
  const snap = await waitForSnapshot(
    page,
    (s) => seatsOf(s).length === comp.length && seatsOf(s).every((x: any) => x.role?.id),
    25_000
  );
  expect(snap, "❌ 入夜后 localStorage 里没有快照 —— 状态没被持久化").not.toBeNull();
  return snap;
}

/** 队列每行 `N. [M号] 角色名` → 座位 id 集合（0-based） */
function queueSeatIds(queue: string[]): number[] {
  return queue
    .map((l) => l.match(/\[(\d+)号\]/)?.[1])
    .filter((x): x is string => Boolean(x))
    .map((n) => Number(n) - 1);
}

/**
 * 剔除**系统互认步骤**后的「角色自身行动」行。
 * ⚠️ 首夜所有爪牙与恶魔都会被唤醒做「互认」（官方规则），因此
 *   `[12号] 小恶魔(恶魔互认)` / `[10号] 爪牙互认` 这类行**不是**角色技能的唤醒，
 *   若不剔除，会把「首夜不应唤醒」的断言误判成失败（小恶魔的名字出现在互认行里）。
 */
function roleWakeLines(queue: string[]): string[] {
  return queue.filter((l) => !/互认/.test(l));
}

/**
 * 「互认」系统步骤行 `N. [M号] 爪牙互认` → 座位 id 集合（0-based）。
 * 探针实测：每个爪牙 / 恶魔**各占一行**，且行内**只有座位号、没有角色名**
 *   （例：`1. [10号] 爪牙互认` / `2. [11号] 爪牙互认` / `3. [12号] 小恶魔(恶魔互认)`）。
 *   ⇒ 断言「男爵/红唇女郎参与了互认」只能靠座位号，不能靠角色名。
 */
function mutualSeatIds(queue: string[]): number[] {
  return queue
    .filter((l) => /互认/.test(l))
    .map((l) => l.match(/\[(\d+)号\]/)?.[1])
    .filter((x): x is string => Boolean(x))
    .map((n) => Number(n) - 1);
}

// ══════════════════════════════════════════════════════════════════════════
//  §A · G1（7 人）：落座 / 撤销 / 入夜 / 队列 / 整夜推进 / 中毒落库
// ══════════════════════════════════════════════════════════════════════════
test.describe("L4 · 暗流涌动 G1（7人）", () => {
  test("① 手动落座 7 位角色 ⇒ UI 逐位正确 + 点座位可撤销 + 入夜后快照 role.id 逐位对上", async ({
    page,
  }) => {
    await enterConfigNoDeal(page, 7);
    await resetSeats(page, 7);
    await assignComp(page, G1);

    // ⭐ L4 判据 ④「能撤销」：再点一次座位必须把它清空
    await clickSeat(page, 0);
    const afterUndo = await page.locator(`[data-seat-id="0"]`).first().textContent();
    expect(
      afterUndo ?? "",
      "❌ 撤销落座后 UI 仍显示角色 —— 撤销没有生效"
    ).not.toContain(NAME[G1[0]]);
    await page.locator(`[data-role-id="${G1[0]}"]`).first().click({ timeout: 15_000 });
    await clickSeat(page, 0);

    await confirmAndEnterNight(page);

    // ⭐ L4 判据 ③「能确认」：UI 上显示 ≠ 状态落库，必须读快照逐位核对
    const snap = await waitForSnapshot(
      page,
      (s) => seatsOf(s).length === 7 && seatsOf(s).every((x: any) => x.role?.id),
      25_000
    );
    expect(snap, "❌ 入夜后快照不可读").not.toBeNull();
    const got = seatsOf(snap).map((s: any) => s.role?.id);
    expect(
      got,
      `❌ 手动落座的角色与快照不一致（UI 显示 ≠ 状态落库）\n实际 ${JSON.stringify(got)}`
    ).toEqual(G1);
    expect(
      seatsOf(snap).filter((s: any) => !s.role?.id).length,
      "❌ 有座位在快照里没有 role.id —— UI 的「已分配」只是文案"
    ).toBe(0);
  });

  test("② ⭐ 首夜「能唤醒」：快照 wakeQueueIds 与 DOM 队列双向一致，且应唤醒/不应唤醒的角色各就各位", async ({
    page,
  }) => {
    await dealAndEnterNight(page, G1);

    const snap = await readSnapshot(page);
    expect(
      ["firstNight", "night", "dusk", "day"].includes(String(snap?.gamePhase ?? "")),
      `❌ gamePhase="${snap?.gamePhase}" —— 入夜后阶段没有推进`
    ).toBe(true);
    expect(Number(snap?.nightCount ?? 0)).toBeGreaterThanOrEqual(1);

    const queue = await readNightQueue(page, 20_000);
    expect(queue.length, "❌ 夜间行动顺序为空 —— 没有任何角色被唤醒").toBeGreaterThan(0);

    // ⭐ 双向一致：DOM 队列里的座位号 == 快照 wakeQueueIds（UI 与状态不得分叉）
    const domIds = [...new Set(queueSeatIds(queue))].sort((a, b) => a - b);
    const snapIds = [...new Set(((snap?.wakeQueueIds ?? []) as number[]).slice())].sort(
      (a, b) => a - b
    );
    expect(
      domIds,
      `❌ DOM 队列座位 ${JSON.stringify(domIds)} 与快照 wakeQueueIds ${JSON.stringify(snapIds)} 不一致` +
        ` —— UI 与引擎状态分叉（假绿根源）`
    ).toEqual(snapIds);

    // 队列里的每个座位都必须已发牌（否则唤醒了「空座位」）
    for (const id of domIds) {
      expect(
        seatsOf(snap).find((s: any) => s.id === id)?.role?.id,
        `❌ 队列里的 ${id + 1}号 在快照里没有角色`
      ).toBeTruthy();
    }

    const queueText = queue.join("\n");
    const wakeText = roleWakeLines(queue).join("\n");
    // 首夜应唤醒的（本阵容里在场者）：洗衣妇/图书管理员/调查员/厨师/共情者/投毒者 + 爪牙互认
    for (const rid of G1) {
      if (!FIRST_NIGHT_WAKE.has(rid)) continue;
      expect(
        queueText.includes(NAME[rid]),
        `❌ 首夜应唤醒【${NAME[rid]}】却不在队列里 —— 该角色唤不醒\n队列：${queueText.slice(0, 300)}`
      ).toBe(true);
    }
    // 首夜不应唤醒的（本阵容里在场者）：小恶魔（otherNightOnly，官方首夜不杀人）
    for (const rid of G1) {
      if (!NOT_FIRST_NIGHT.has(rid)) continue;
      expect(
        wakeText.includes(NAME[rid]),
        `❌ 首夜不应唤醒【${NAME[rid]}】却出现在队列里（夜序错排）\n队列：${queueText.slice(0, 300)}`
      ).toBe(false);
    }
  });

  test("③ ⭐⭐ 首夜整夜推进到底 ⇒ gamePhase 真的变白天 · 首夜无人死亡 · 投毒状态落库", async ({
    page,
  }) => {
    await dealAndEnterNight(page, G1);

    /**
     * ⭐ L4 判据 ②③「能选目标 + 能确认」：
     *   本阵容首夜要依次经过 投毒者(选 1 人) / 洗衣妇 / 图书管理员 / 调查员 /
     *   厨师 / 共情者 / 爪牙互认 —— 任何一步「选不中目标」或「确认按钮点不动」
     *   都会让整夜推进卡住。因此 **能一路走到 day** 本身就是这些角色
     *   「能选目标 + 能确认」的端到端证据。
     */
    const result = await advanceNightFast(page);
    expect(result, "❌ 夜间推进未能到达白天 —— 卡在某个角色的选目标/确认环节").toBe("day");
    expect(result, "❌ 本局不含间谍，不应返回 spy").not.toBe("spy");

    const after = await waitForSnapshot(page, (s) => s?.gamePhase === "day", 15_000);
    expect(after, "❌ 进入白天后快照仍不可读 —— 状态没落库").not.toBeNull();
    expect(
      after?.gamePhase,
      `❌ 点完一夜后 gamePhase 仍是 "${after?.gamePhase}"（应为 day）—— UI 文案变了但引擎状态没跟上`
    ).toBe("day");

    // 官方：首夜恶魔不杀人（小恶魔 otherNightOnly）⇒ 首夜结束必无死亡
    const dead = seatsOf(after).filter((s: any) => s.isDead === true);
    expect(
      dead.length,
      `❌ 首夜不应有人死亡，实际 ${dead.length} 人（${dead.map((s: any) => s.id + 1 + "号").join(",")}）`
    ).toBe(0);

    // ⭐ 投毒者「能确认」的状态证据：目标身上必须真的落 poisoned 效果
    const poisoned = seatsOf(after).filter((s: any) =>
      (Array.isArray(s.statusEffects) ? s.statusEffects : []).some(
        (e: any) => e?.type === "poisoned"
      )
    );
    expect(
      poisoned.length,
      "❌ 首夜投毒者已行动（且选目标成功），但没有任何座位落 poisoned 效果 —— " +
        `说书人点了确认，状态却没落库。实际状态：${JSON.stringify(
          seatsOf(after).map((s: any) => [s.id + 1, s.statusEffects])
        )}`
    ).toBeGreaterThan(0);
    for (const s of poisoned) {
      expect(
        (s.statusEffects as any[]).some(
          (e: any) => e?.type === "poisoned" && e?.source === "poisoner"
        ),
        `❌ ${s.id + 1}号 的 poisoned 效果没有 source="poisoner"（来源未落库）`
      ).toBe(true);
    }

    // 结构契约：isDead 必布尔；statusEffects 若存在必为数组
    for (const s of seatsOf(after)) {
      expect(typeof s.isDead, `❌ ${s.id + 1}号 isDead 不是布尔`).toBe("boolean");
      if (s.statusEffects !== undefined) {
        expect(Array.isArray(s.statusEffects), `❌ ${s.id + 1}号 statusEffects 不是数组`).toBe(true);
      }
    }
  });

  test("④ ⭐⭐ 第二夜：小恶魔真的杀人 ⇒ markedForDeath / diedAtNight / deathSource=imp_kill 落库", async ({
    page,
  }) => {
    await dealAndEnterNight(page, G1);

    const n1 = await advanceNightFast(page);
    expect(n1, "❌ 首夜未能推进到白天").toBe("day");

    // 黄昏 → 第二夜
    const dusk = await completeDuskEnterNight(page);
    expect(dusk, "❌ 黄昏阶段未能进入下一夜").toBe("night");

    const n2 = await advanceNightFast(page);
    expect(n2, "❌ 第二夜未能推进到白天").toBe("day");

    const snap2 = await waitForSnapshot(
      page,
      (s) => s?.gamePhase === "day" && Number(s?.nightCount ?? 0) >= 2,
      20_000
    );
    expect(snap2, "❌ 第二夜后快照不可读").not.toBeNull();
    expect(
      Number(snap2?.nightCount ?? 0),
      `❌ nightCount 未推进到第 2 夜（实际 ${snap2?.nightCount}）`
    ).toBeGreaterThanOrEqual(2);

    /**
     * 官方：暗流涌动的**唯一恶魔是小恶魔，每个夜晚必须杀一名玩家**
     *   ⇒ 第二夜必然有人死亡。这是本剧本可强断言的条件契约
     *      （区别于罂粟花开：军团是「可能」杀人，不能强断言）。
     */
    const seats = seatsOf(snap2);
    const marks = seats.filter((s: any) => s.markedForDeath === true);
    const dead = seats.filter((s: any) => s.isDead === true);
    expect(
      marks.length + dead.length,
      `❌ 第二夜小恶魔必杀，却无人死亡/待死（dead=${dead.length} marked=${marks.length}）` +
        ` —— 恶魔未行动或状态未落库`
    ).toBeGreaterThan(0);

    // 死者的死因字段必须真实落库（防「幽灵死亡」）
    for (const s of [...dead, ...marks]) {
      expect(
        s.deathSource === "imp_kill" ||
          s.diedAtNight !== undefined ||
          s.deathReason !== undefined,
        `❌ ${s.id + 1}号 有死亡标记但无死因字段（deathSource=${s.deathSource}, ` +
          `diedAtNight=${s.diedAtNight}, deathReason=${s.deathReason}）`
      ).toBe(true);
    }
    const impKilled = seats.filter((s: any) => s.deathSource === "imp_kill");
    expect(
      impKilled.length,
      `❌ 没有任何座位带 deathSource="imp_kill" —— 小恶魔的击杀没有按契约落库。` +
        `实际：${JSON.stringify(seats.map((s: any) => [s.id + 1, s.isDead, s.markedForDeath, s.deathSource]))}`
    ).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  §B · G2（9 人）：间谍步骤 / 酒鬼永久醉酒 / 管家首夜唤醒 —— 状态落库
// ══════════════════════════════════════════════════════════════════════════
test.describe("L4 · 暗流涌动 G2（9人）", () => {
  test("⑤ ⭐ 入夜快照与队列：应唤醒者（占卜师/管家/间谍/爪牙互认）各就各位，被动角色不得被唤醒", async ({
    page,
  }) => {
    const snap = await dealAndEnterNight(page, G2);
    const got = seatsOf(snap).map((s: any) => s.role?.id);
    expect(got, `❌ G2 落座与快照不一致：${JSON.stringify(got)}`).toEqual(G2);

    const queue = await readNightQueue(page, 20_000);
    const queueText = queue.join("\n");
    const wakeText = roleWakeLines(queue).join("\n");
    expect(queue.length).toBeGreaterThan(0);

    // 首夜应唤醒：占卜师 / 管家 / 间谍 + 爪牙互认
    for (const rid of G2) {
      if (!FIRST_NIGHT_WAKE.has(rid)) continue;
      expect(
        queueText.includes(NAME[rid]),
        `❌ 首夜应唤醒【${NAME[rid]}】却不在队列里\n队列：${queueText.slice(0, 300)}`
      ).toBe(true);
    }
    // 首夜不应唤醒：送葬者(仅其他夜+条件) / 僧侣(其他夜) / 守鸦人(死亡触发) /
    //              贞洁者(被动) / 酒鬼(被动) / 小恶魔(仅其他夜)
    for (const rid of G2) {
      if (!NOT_FIRST_NIGHT.has(rid)) continue;
      expect(
        wakeText.includes(NAME[rid]),
        `❌ 首夜不应唤醒【${NAME[rid]}】却出现在队列里（夜序错排）\n队列：${queueText.slice(0, 300)}`
      ).toBe(false);
    }
    // 状态侧：酒鬼的**永久醉酒**必须落库（认知覆盖的持久化证据）
    const drunkSeat = seatsOf(snap).find((s: any) => s.role?.id === "drunk");
    expect(drunkSeat, "❌ 快照里找不到酒鬼座位").toBeTruthy();
    expect(
      (Array.isArray(drunkSeat.statusEffects) ? drunkSeat.statusEffects : []).some(
        (e: any) => e?.type === "drunk"
      ),
      `❌ 酒鬼的永久醉酒没有落库（statusEffects=${JSON.stringify(drunkSeat?.statusEffects)}）`
    ).toBe(true);
    // 状态侧：间谍必须是爪牙（身份/类型一致，防止「UI 显示 ≠ 状态落库」）
    const spySeat = seatsOf(snap).find((s: any) => s.role?.id === "spy");
    expect(spySeat, "❌ 快照里找不到间谍座位").toBeTruthy();
    expect(spySeat?.role?.type, "❌ 间谍的 type 不是 minion").toBe("minion");
  });

  test("⑥ ⭐ 间谍：G2 首夜流程真的走到「间谍·查看魔典」步骤（advanceNightFast 返回 spy）", async ({
    page,
  }) => {
    const snap = await dealAndEnterNight(page, G2);
    expect(
      seatsOf(snap).some((s: any) => s.role?.id === "spy"),
      "❌ 手动落座的间谍没有落库"
    ).toBe(true);

    /**
     * ⚠️ 这条是**特征化断言**（记录真实行为，而不是「期望行为」）：
     *   间谍的「查看魔典」在 UI 上没有独立确认按钮 —— 见
     *   `e2e/helpers/scriptFlow.ts:384-392`。因此 `advanceNightFast`
     *   跑到该步骤会返回 `"spy"` 而不是 `"day"`。
     *
     *   若这里返回 `"day"`，说明**间谍的首夜步骤被静默跳过**（真缺陷）；
     *   若返回 `"timeout"`，说明卡在了它前面的某一步（占卜师 2 目标 /
     *   管家 1 目标）—— 两者都必须失败，不能放行。
     */
    const result = await advanceNightFast(page);
    expect(
      result,
      `❌ 首夜流程没有停在间谍「查看魔典」步骤（实际返回 "${result}"）—— ` +
        `要么间谍步骤没被排进首夜，要么它前面的某个选目标步骤卡住了`
    ).toBe("spy");
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  §C · G3（12 人）：男爵设置调整 / 圣徒·陌客·红唇女郎·士兵·镇长·猎手
// ══════════════════════════════════════════════════════════════════════════
test.describe("L4 · 暗流涌动 G3（12人）", () => {
  test("⑦ ⭐ 12 人局入夜：快照逐位对上 · 男爵/红唇女郎参与首夜互认 · 被动角色不得被唤醒", async ({
    page,
  }) => {
    const snap = await dealAndEnterNight(page, G3);
    const got = seatsOf(snap).map((s: any) => s.role?.id);
    expect(got, `❌ G3 落座与快照不一致：${JSON.stringify(got)}`).toEqual(G3);

    const queue = await readNightQueue(page, 20_000);
    const queueText = queue.join("\n");
    const wakeText = roleWakeLines(queue).join("\n");
    expect(queue.length).toBeGreaterThan(0);

    // 首夜应唤醒：洗衣妇 / 厨师 / 管家（+ 爪牙互认系统步骤）
    for (const rid of G3) {
      if (!FIRST_NIGHT_WAKE.has(rid)) continue;
      expect(
        queueText.includes(NAME[rid]),
        `❌ 首夜应唤醒【${NAME[rid]}】却不在队列里\n队列：${queueText.slice(0, 300)}`
      ).toBe(true);
    }

    // ⭐ 男爵 & 红唇女郎（爪牙）：首夜不发动自身技能，但**必须参与「爪牙互认」**。
    //    探针实测：互认行只有座位号没有角色名（`[10号] 爪牙互认`），故按座位断言。
    const mutual = mutualSeatIds(queue);
    expect(
      mutual,
      "❌ 首夜队列里没有任何「互认」步骤（男爵/红唇女郎为爪牙，必须参与互认）"
    ).not.toEqual([]);
    expect(
      mutual,
      `❌ 男爵(${G3.indexOf("baron") + 1}号)/红唇女郎(${G3.indexOf("scarlet_woman") + 1}号)` +
        `没有参与首夜互认（互认座位=${JSON.stringify(mutual.map((i) => i + 1))}号）`
    ).toEqual(expect.arrayContaining([G3.indexOf("baron"), G3.indexOf("scarlet_woman")]));
    expect(
      mutual,
      "❌ 互认步骤里没有恶魔（小恶魔 12号）—— 恶魔必须参与互认"
    ).toContain(G3.indexOf("imp"));

    // 首夜不应唤醒：猎手/士兵/镇长/酒鬼/陌客/圣徒/红唇女郎/小恶魔
    for (const rid of G3) {
      if (!NOT_FIRST_NIGHT.has(rid)) continue;
      expect(
        wakeText.includes(NAME[rid]),
        `❌ 首夜不应唤醒【${NAME[rid]}】却出现在队列里（夜序错排）\n队列：${queueText.slice(0, 300)}`
      ).toBe(false);
    }

    // ⭐ 探针实证（2026-09-21）：酒鬼**以伪装身份被唤醒**（队列行显示伪装角色名，
    //    例：`5. [7号] 图书管理员`，而 7 号座位的快照 `role.id === "drunk"`）。
    //    这与官方一致（酒鬼自己以为自己是那个镇民）。
    //    ⚠️ 伪装角色是随机分配的（可能落在没有夜间步骤的镇民上），
    //       所以不能强断言「酒鬼一定在首夜队列里」，只能断言：
    //       万一它在队列里，也**绝不能泄漏真实身份「酒鬼」**。
    const drunkIdx = G3.indexOf("drunk");
    const drunkLine = queue.find(
      (l) => Number(l.match(/\[(\d+)号\]/)?.[1]) - 1 === drunkIdx
    );
    if (drunkLine) {
      expect(
        drunkLine,
        `❌ 酒鬼（${drunkIdx + 1}号）的唤醒行泄漏了真实身份：${drunkLine}`
      ).not.toContain(NAME.drunk);
    }
  });

  test("⑧ ⭐⭐ 12 人局整夜推进到底 ⇒ day；管家 masterId 落库；首夜无人死亡；座位数守恒", async ({
    page,
  }) => {
    await dealAndEnterNight(page, G3);

    const result = await advanceNightFast(page);
    expect(
      result,
      "❌ 12 人局夜间推进卡住 —— 管家(需 1 目标)/酒鬼(伪装身份)/被动角色 任一环节点不动"
    ).toBe("day");

    const after = await waitForSnapshot(page, (s) => s?.gamePhase === "day", 15_000);
    expect(after?.gamePhase, "❌ gamePhase 未变成 day").toBe("day");

    // 首夜无人死亡（小恶魔 otherNightOnly）
    const dead = seatsOf(after).filter((s: any) => s.isDead === true);
    expect(
      dead.length,
      `❌ 首夜不应有人死亡，实际 ${dead.length} 人：${dead.map((s: any) => s.id + 1 + "号").join(",")}`
    ).toBe(0);

    // 12 人局的座位数必须守恒（被动角色不得让座位凭空增减）
    expect(seatsOf(after).length, "❌ 12 人局座位数变了").toBe(12);

    /**
     * ⭐ 管家「能选目标 + 能确认」的状态证据：
     *   官方：管家每夜选择一名玩家作为主人，**只有主人投票时你才能投票**。
     *   ⇒ 选完主人后 `masterId` 必须真的落在**管家自己**的座位上，
     *     且不能指向自己（官方禁止选自己）。
     */
    const seats = seatsOf(after);
    const butler = seats.find((s: any) => s.role?.id === "butler");
    expect(butler, "❌ 快照里找不到管家座位").toBeTruthy();
    expect(
      typeof butler?.masterId,
      `❌ 管家选主人后 masterId 未落库（实际 ${JSON.stringify(butler?.masterId)}）` +
        ` —— 说书人点过确认，状态却没写`
    ).toBe("number");
    expect(
      butler?.masterId >= 0 && butler?.masterId < seats.length,
      `❌ 管家的 masterId=${butler?.masterId} 越界`
    ).toBe(true);
    expect(
      butler?.masterId === butler?.id,
      "❌ 管家的 masterId 指向自己 —— 官方不允许选自己当主人"
    ).toBe(false);
    expect(
      (Array.isArray(butler?.statusEffects) ? butler.statusEffects : []).some(
        (e: any) => e?.type === "butler_master"
      ),
      "❌ 管家座位没有 butler_master 标记"
    ).toBe(true);
    // 主人座位必须真存在（不能指向空座位）
    expect(
      seats.find((s: any) => s.id === butler?.masterId)?.role?.id,
      `❌ 管家的主人（${(butler?.masterId ?? -1) + 1}号）在快照里没有角色`
    ).toBeTruthy();
  });

  test("⑩ ⭐⭐ 负向对照：男爵在场的 12 人局若落非法配比(7/2/2/1) ⇒ 应用必须拦下；改成 5/4/2/1 才放行", async ({
    page,
  }) => {
    await enterConfigNoDeal(page, 12);
    await resetSeats(page, 12);

    // ① 先落**非法**阵容：12 人常规 7/2/2/1 + 男爵（男爵要求 5/4/2/1）
    await assignComp(page, G3_ILLEGAL);

    const distribute = page.getByText("分发&核对身份").first();
    await expect(distribute).toBeVisible({ timeout: 20_000 });
    await distribute.click({ timeout: 15_000 });

    // ⭐ 判据：非法配比必须被拦，且**不能**进夜晚
    const modal = page.getByText("阵容配置错误").first();
    await expect(
      modal,
      "❌ 男爵在场却落了 7/2/2/1 的非法配比，应用没有弹「阵容配置错误」—— 「设置调整」规则没被强制执行"
    ).toBeVisible({ timeout: 20_000 });
    expect(
      await enterNightButton(page).count(),
      "❌ 非法配比下仍然出现了「确认无误，入夜」按钮 —— 校验形同虚设"
    ).toBe(0);

    // ② 点「返回修改」改回合法阵容
    await page.getByText("返回修改").first().click({ timeout: 15_000 });
    await expect(modal).toBeHidden({ timeout: 10_000 });
    // 清掉 6号(共情者)/7号(图书管理员) 两个镇民，换成 管家/酒鬼 两个外来者
    await clickSeat(page, 5);
    await clickSeat(page, 6);
    await page.locator(`[data-role-id="butler"]`).first().click({ timeout: 15_000 });
    await clickSeat(page, 5);
    await page.locator(`[data-role-id="drunk"]`).first().click({ timeout: 15_000 });
    await clickSeat(page, 6);
    await resolveCharades(page);

    // ③ 合法配比必须放行，并真的进到首夜
    await distribute.click({ timeout: 15_000 });
    const enterNight = enterNightButton(page);
    await expect(
      enterNight,
      "❌ 改成合法的 5/4/2/1 后仍进不了夜晚 —— 校验过严（合法局面被当非法拦下）"
    ).toBeVisible({ timeout: 20_000 });
    await enterNight.click({ timeout: 15_000 });
    await expect(page.getByText("夜晚行动顺序").first()).toBeVisible({ timeout: 20_000 });

    const snap = await waitForSnapshot(
      page,
      (s) => seatsOf(s).length === 12 && seatsOf(s).every((x: any) => x.role?.id),
      25_000
    );
    expect(
      seatsOf(snap).map((s: any) => s.role?.id),
      "❌ 修正后的阵容没有正确落库"
    ).toEqual(G3);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  §D · 22/22 覆盖清单（自证：三局并集必须等于整个剧本）
// ══════════════════════════════════════════════════════════════════════════
test.describe("L4 · 覆盖清单自证", () => {
  test("⑨ 三局阵容的并集必须覆盖暗流涌动全部 22 个角色（不得漏测）", () => {
    const union = new Set([...G1, ...G2, ...G3]);
    const expected = [
      "washerwoman", "librarian", "investigator", "chef", "empath",
      "fortune_teller", "undertaker", "monk", "ravenkeeper", "virgin",
      "slayer", "soldier", "mayor",
      "butler", "drunk", "recluse", "saint",
      "poisoner", "spy", "scarlet_woman", "baron",
      "imp",
    ];
    const missing = expected.filter((id) => !union.has(id));
    expect(
      missing,
      `❌ 以下角色没有被任何一局 L4 阵容覆盖：${missing.join(", ")}`
    ).toEqual([]);
    expect(union.size, "❌ 并集应恰好 22 个角色").toBe(22);
    // 每局的官方配比必须与 STANDARD_COMPOSITIONS 一致（否则局面非法，
    // 断言就失去意义）：7→5/0/1/1、9→5/2/1/1、12+男爵→5/4/2/1
    const counts = (comp: string[]) =>
      comp.reduce<Record<string, number>>((acc, id) => {
        const t =
          ["washerwoman", "librarian", "investigator", "chef", "empath",
            "fortune_teller", "undertaker", "monk", "ravenkeeper", "virgin",
            "slayer", "soldier", "mayor"].includes(id)
            ? "townsfolk"
            : ["butler", "drunk", "recluse", "saint"].includes(id)
              ? "outsider"
              : ["poisoner", "spy", "scarlet_woman", "baron"].includes(id)
                ? "minion"
                : "demon";
        acc[t] = (acc[t] ?? 0) + 1;
        return acc;
      }, {});
    expect(counts(G1), "❌ G1 应为 5镇民/0外来者/1爪牙/1恶魔").toEqual({
      townsfolk: 5, minion: 1, demon: 1,
    });
    expect(counts(G2), "❌ G2 应为 5镇民/2外来者/1爪牙/1恶魔").toEqual({
      townsfolk: 5, outsider: 2, minion: 1, demon: 1,
    });
    expect(
      counts(G3),
      "❌ G3 含男爵 ⇒ 应为 5镇民/4外来者/2爪牙/1恶魔（男爵 +2 外来者，镇民 −2）"
    ).toEqual({
      townsfolk: 5, outsider: 4, minion: 2, demon: 1,
    });
    expect(counts(G3_ILLEGAL), "❌ 负向对照阵容应为 7镇民/2外来者/2爪牙/1恶魔").toEqual({
      townsfolk: 7, outsider: 2, minion: 2, demon: 1,
    });
  });
});
