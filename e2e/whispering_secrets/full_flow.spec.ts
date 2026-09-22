import { expect, test, type Page } from "@playwright/test";
import {
  advanceNightFast,
  readNightQueue,
  readSnapshot,
  resolveCharades,
  waitForSnapshot,
} from "../helpers/scriptFlow";

/**
 * L4（E2E）· 窃窃私语 + 无名之墓 —— **真实点击流 + 读 localStorage 状态断言**
 * ==================================================================
 * ⚠️ 为什么必须有这一层：L1/L2/L3/L5 全在 Node / jsdom 里跑，证明不了
 *   「说书人在**真实浏览器**里点得动、点了之后状态**真的落库**」。
 *
 * ✅ 本文件的**结论性断言全部读状态**：
 *   `localStorage["clocktower_current_snapshot"]`
 *   的 `seats[].role.id` / `seats[].role.type` / `gamePhase` / `nightCount` /
 *   `isDead` / `statusEffects` / 夜序唤醒队列，
 *   **绝不用 `toBeVisible` / `toContainText` 代替状态**（文案层断言只用于
 *   「按钮点得动/座位点得上」这类**交互层前置检查**）。
 *
 * ⚠️ 端口固定 3100（本机 3000/3001/3002 常被残留进程占用，可能返回别的 App）。
 *   由外部先起：`NODE_OPTIONS="" PORT=3100 npx next dev -p 3100`。
 *   Playwright **不托管** dev server（托管会导致进程无法退出）。
 *
 * ⚠️ 本文件刻意**不做「逐角色点选目标」的深度点击流** ——
 *   一整个夜晚要连点数十次，单次 >2 分钟，不适合纳入默认套件。
 *   本文件的做法是：用**手动落座**把被测角色钉进阵容，
 *   再用「夜序队列 + 快照字段」证明它**确实被唤醒/落库**（L4 第 1 条判据）。
 *
 * ── ⚠️⚠️ 圆桌座位：Playwright 真实点击 **静默无效**（探针实测，非猜测）──────
 * 现象（同一局、同一座位，7 人局，本目录 `zz_probe` 探针）：
 *   · `page.getByTitle("1号座位").click()`        → 座位**纹丝不动**
 *   · `page.locator('[data-seat-id="0"] .seat-token').click()` → **纹丝不动**
 *   · 页内 `document.querySelector('[data-seat-id="0"] [title="1号座位"]').click()`
 *     → ✅ 落座 / 取消落座**立即生效**
 *
 * 事件链实录（浏览器内 `addEventListener(capture)` 打印）：
 *   ```
 *   pointerdown @(460,136) target=DIV.seat-token
 *   mouseup     @(460,135) target=DIV#clocktower-drag-portal-root
 *   click       @(460,135) target=BODY            ← 落在 <body>，座位 onClick 永不触发
 *   ```
 * 机制：`SeatNode` 的 `onPointerDown`（`SeatNode.tsx:354-359`）在**按下**时就调
 * `onSeatDragStart`（`RoundTable.tsx:219`），后者把 `#clocktower-drag-portal-root`
 * （`RoundTable.tsx:12-23`，全视口 `position:fixed`）挂到 `<body>`；
 * 于是**抬起**的命中目标变成了这个浮层，浏览器把 `click` 派发到 mousedown /
 * mouseup 的**最近公共祖先**（`<body>`）⇒ `onSeatClick` 收不到。
 *
 * ⇒ 落座/撤销统一用 `clickSeat()`（页内 `element.click()`）驱动。
 *   ⚠️ 这是**自动化能力边界**：页内 `element.click()` 命中生产代码里**同一条**
 *     `onClick`（`SeatNode.tsx:446-451`），而"点完之后快照里 seats[].role.id
 *     是否真的变了"由 localStorage 断言兜底 —— 没有绕过任何生产逻辑。
 *   （同类现象在 `e2e/bad_moon_rising`、`e2e/haunted_manor` 也有记录，团队统一处理。）
 *
 * ── ⚠️ 阵容的设计取舍 ────────────────────────────────────────────
 * 窃窃私语 7 人局（5 镇民 / 0 外来者 / 1 爪牙 / 1 恶魔），**全部取自本剧本**：
 *   · **不用间谍** —— 间谍的「查看魔典」步骤没有确认按钮，`advanceNightFast`
 *     会自动熔断（返回 `"spy"`），不适合纳入可自动推进的用例。
 *   · **不用弄臣/圣徒/陌客/政客** —— 免死 / 终局 / 登记干扰类，会污染死亡断言。
 *   · 恶魔选 **涡流(vortox)**：`otherNightPriority = 52` ⇒ **首夜不杀人**，
 *     于是「首夜结束后零死亡」成为可断言的确定事实。
 */

const WS = "窃窃私语";
const TOMB = "无名之墓";

const WS_COMP = [
  "chambermaid", // 镇民（首夜 82，需选 2 人）
  "mathematician", // 镇民（首夜 84，0 目标）
  "gossip", // 镇民（**其他夜** 73，白天声明）
  "oracle", // 镇民（**其他夜** 98）
  "artist", // 镇民（日间）
  "witch", // 爪牙（首夜 39，需选 1 人）
  "vortox", // 恶魔（**其他夜** 52）
];

/** 首夜确实会被唤醒的座位（其余角色首夜不行动） */
const WS_FIRST_NIGHT = ["chambermaid", "mathematician", "witch"];
/** 仅其他夜行动 ⇒ 首夜队列里**不得**出现 */
const WS_OTHER_NIGHT_ONLY = ["gossip", "oracle", "vortox"];

/**
 * 无名之墓 7 人局合法阵容（5 镇民 / 0 外来者 / 1 爪牙 / 1 恶魔），
 * 全部取自**本剧本**，且都是**首夜会行动**的角色（便于「队列非空」判据）：
 *   undertaker 首夜（得知当日处决者）· gambler 首夜（猜身份）·
 *   savant 首夜（两条信息）· juggler 首夜（猜角色）· clockmaker 首夜（数距离）·
 *   poisoner 首夜（下毒）· shabaloth 首夜（吞食）
 * 刻意**不含酒鬼(drunk)** —— 酒鬼需要先配置「伪装身份」才能入夜，
 * 会引入额外的自动化分支；酒鬼由用例④（随机发牌全流程）覆盖。
 */
const TOMB_COMP = [
  "undertaker",
  "gambler",
  "savant",
  "juggler",
  "clockmaker",
  "poisoner",
  "shabaloth",
];

/** roleId → app/data 中文名（落座阶段的 DOM 断言用） */
const SEAT_LABEL: Record<string, string> = {
  chambermaid: "侍女",
  mathematician: "数学家",
  gossip: "造谣者",
  oracle: "神谕者",
  artist: "艺术家",
  witch: "女巫",
  vortox: "涡流",
  undertaker: "送葬者",
  gambler: "赌徒",
  savant: "博学者",
  juggler: "杂耍艺人",
  clockmaker: "钟表匠",
  poisoner: "投毒者",
  shabaloth: "沙巴洛斯",
};

/**
 * roleId → 阵营（**独立于 app/data 的硬编码真值**，防止"两边一起改"）。
 * ⚠️ 真值来源 = 官方角色文档（`officialRoleDocs.json` / 剧本角色表），
 *    **不是** `app/data.ts`——否则「数据被改错」时测试会跟着一起错。
 *    覆盖 32 个角色（窃窃私语 19 ∪ 无名之墓 19，去重 6 个重名 = 32）。
 */
const TYPE: Record<string, string> = {
  // ── 窃窃私语 19 ──────────────────────────────────────────────
  chambermaid: "townsfolk",
  gossip: "townsfolk",
  oracle: "townsfolk",
  mathematician: "townsfolk",
  artist: "townsfolk",
  flowergirl: "townsfolk",
  innkeeper: "townsfolk",
  fool: "townsfolk",
  saint: "outsider",
  recluse: "outsider",
  politician: "outsider",
  spy: "minion",
  witch: "minion",
  assassin: "minion",
  devils_advocate: "minion",
  vortox: "demon",
  po: "demon",
  zombuul: "demon",
  plague_doctor: "outsider",
  // ── 无名之墓 19（与上面重名的 6 个：gossip/artist/oracle/fool/assassin/zombuul）──
  undertaker: "townsfolk",
  gambler: "townsfolk",
  savant: "townsfolk",
  juggler: "townsfolk",
  clockmaker: "townsfolk",
  sailor: "townsfolk",
  farmer: "townsfolk",
  scapegoat: "outsider",
  drunk: "outsider",
  mutant: "outsider",
  baron: "minion",
  poisoner: "minion",
  shabaloth: "demon",
};

const TOMB_ROLES = new Set([
  "undertaker", "gambler", "savant", "gossip", "artist", "juggler",
  "clockmaker", "oracle", "sailor", "farmer", "fool", "scapegoat",
  "drunk", "mutant", "baron", "poisoner", "assassin", "shabaloth", "zombuul",
]);

// ══════════════════════════════════════════════════════════════════════
// 真实点击辅助
// ══════════════════════════════════════════════════════════════════════

/**
 * 进配置页（**不点随机落座**），完成「剧本 → ⚡快速开始 → 人数」。
 *
 * ⚠️ **必须重试**：同机多 agent 并发改生产文件时，`next dev` 会**热重编译**，
 *   这段时间 `goto("/")` 拿到的是一张**全空白页**（实测截图纯黑），
 *   剧本卡片一个都不渲染 ⇒ 直接 click 会 15s 超时假红。
 *   （full-bmr 的 L4 也记录了同型现象：首页只渲染「请选择剧本」而列表为空。）
 */
async function enterConfigNoDeal(page: Page, scriptName: string, count: number) {
  const scriptBtn = page
    .getByRole("button", { name: new RegExp(scriptName) })
    .last();
  let ready = false;
  for (let attempt = 1; attempt <= 6 && !ready; attempt++) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    ready = await scriptBtn
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!ready) await page.waitForTimeout(3_000); // 等 dev server 编译完
  }
  if (!ready) {
    throw new Error(
      `[${scriptName}] 首页剧本卡片连续 6 次未渲染（dev server 可能正在重编译）`
    );
  }
  await scriptBtn.click({ timeout: 15_000 });
  const quick = page.getByText("⚡ 快速开始").first();
  await expect(quick).toBeVisible({ timeout: 20_000 });
  await quick.click({ timeout: 15_000 });
  await page
    .locator("button")
    .filter({ hasText: new RegExp(`^${count}人`) })
    .first()
    .click({ timeout: 15_000 });
}

/** 座位 DOM 文本（按 data-seat-id 升序），形如 ["1侍女","2空",...] */
async function seatTexts(page: Page, count: number): Promise<string[]> {
  return page.evaluate((n) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const el = document.querySelector(`[data-seat-id="${i}"]`);
      out.push((el?.textContent ?? "").replace(/\s+/g, ""));
    }
    return out;
  }, count);
}

async function waitSeats(
  page: Page,
  count: number,
  pred: (t: string[]) => boolean,
  label: string
) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const t = await seatTexts(page, count);
    if (pred(t)) return t;
    if (Date.now() > deadline) {
      throw new Error(`[${label}] 座位状态未达到期望：${JSON.stringify(t)}`);
    }
    await page.waitForTimeout(120);
  }
}

/**
 * 点座位（落座 / 取消落座）。
 *
 * ⚠️ **必须用页内原生 `click()`**，理由见文件头「圆桌座位」一节：
 *   Playwright 真实鼠标点击会被 `#clocktower-drag-portal-root` 浮层吃掉抬起事件，
 *   `click` 落到 `<body>`，`onSeatClick` 永不触发（**静默无效**，最危险的一类失败）。
 */
async function clickSeat(page: Page, seatId: number) {
  const ok = await page.evaluate((id) => {
    const root = document.querySelector(`[data-seat-id="${id}"]`);
    if (!root) return false;
    // 优先序号圆圈：它的 onClick 直接调 onSeatClick，没有 isValidTarget 门控
    const btn = root.querySelector(
      `[title="${id + 1}号座位"]`
    ) as HTMLElement | null;
    const target = btn ?? (root.querySelector(".seat-token") as HTMLElement | null);
    if (!target) return false;
    target.click();
    return true;
  }, seatId);
  if (!ok) throw new Error(`座位 ${seatId + 1}号 不存在，无法点击`);
  await page.waitForTimeout(110);
}

/** 角色卡文案（`[data-role-id]` 卡片首行 = 中文名） */
async function roleCardName(page: Page, roleId: string): Promise<string> {
  const txt = (
    await page.locator(`[data-role-id="${roleId}"]`).first().innerText()
  ).replace(/\s+/g, " ");
  return txt.split(" ")[0];
}

/**
 * 随机发牌 → 等发牌落地 → 清空 → 等全空 → 逐位指定（带回读校验重试）。
 * ⚠️ `随机落座` 的发牌是**异步提交**的，点完立刻清座位会与发牌竞态。
 */
/**
 * ⚠️ 必须走「随机落座」这一步：`⚡快速开始` 弹窗里**只有「🎲随机落座」会
 *   `onConfirm(人数, 角色)` 并关闭弹窗**（`QuickStartModal.tsx:231-248`），
 *   「取消」只关闭不落座 ⇒ 座位数不会按所选人数生效。
 *   所以「要一个空的、人数正确的配置页」= 随机落座 → 逐位清空。
 */
async function dealAndSeat(page: Page, comp: string[]) {
  const count = comp.length;
  await page.getByText("随机落座").first().click({ timeout: 15_000 });
  // ⭐ `随机落座` 的发牌是**异步提交**的：点完立刻清座位会与发牌竞态
  await waitSeats(page, count, (t) => t.every((x) => !x.endsWith("空")), "发牌后");

  for (let i = 0; i < count; i++) {
    if ((await seatTexts(page, count))[i].endsWith("空")) continue;
    await clickSeat(page, i);
  }
  await waitSeats(page, count, (t) => t.every((x) => x.endsWith("空")), "清空后");

  for (let i = 0; i < count; i++) {
    const rid = comp[i];
    const want = SEAT_LABEL[rid] ?? (await roleCardName(page, rid));
    for (let attempt = 0; attempt < 4; attempt++) {
      const cur = (await seatTexts(page, count))[i];
      if (cur.includes(want)) break;
      if (!cur.endsWith("空")) await clickSeat(page, i);
      await page
        .locator(`[data-role-id="${rid}"]`)
        .first()
        .click({ timeout: 15_000 });
      await page.waitForTimeout(110);
      await clickSeat(page, i);
      await page.waitForTimeout(140);
    }
    const cur = (await seatTexts(page, count))[i];
    expect(
      cur,
      `❌ 落座失败：${i + 1}号 期望【${want}】，实际「${cur}」—— 落座点击无效`
    ).toContain(want);
  }
}

/** 分发核对 → 入夜（含「阵容不符 → 仍然分发」与「待设置伪装身份」两条兜底） */
async function confirmAndEnterNight(page: Page) {
  await resolveCharades(page);

  const distribute = page
    .locator("button")
    .filter({ hasText: /分发&核对身份/ })
    .first();
  await expect(
    distribute,
    "❌ 找不到「分发&核对身份」——落座未生效或人数不足 5 人"
  ).toBeVisible({ timeout: 20_000 });
  await distribute.click({ timeout: 15_000 });

  // 阵容不符（如男爵 +2 外来者超出池子）→ 弹窗「仍然分发&核对身份」
  const force = page
    .locator("button")
    .filter({ hasText: /仍然分发&核对身份/ })
    .first();
  if (await force.isVisible({ timeout: 2500 }).catch(() => false)) {
    await force.click({ timeout: 15_000 });
  }

  const enterNight = page
    .locator("button")
    .filter({ hasText: /确认无误[\s\S]*入夜/ })
    .first();
  await expect(enterNight).toBeVisible({ timeout: 20_000 });
  await enterNight.click({ timeout: 15_000 });
  await page.waitForTimeout(1200);
}

function seatsOf(snap: any): any[] {
  return Array.isArray(snap?.seats) ? snap.seats : [];
}

/** 入夜后快照里 seats[].role.id（按座位序） */
async function snapshotRoleIds(page: Page, count: number) {
  const snap = await waitForSnapshot(
    page,
    (s) =>
      seatsOf(s).length === count && seatsOf(s).every((x: any) => x.role?.id),
    20_000
  );
  expect(snap, "❌ 入夜后 localStorage 里没有快照 —— 状态没被持久化").not.toBeNull();
  return seatsOf(snap).map((s: any) => s.role?.id) as string[];
}

// ══════════════════════════════════════════════════════════════════════
test.describe("L4 · 窃窃私语：真实点击流必须产生真实状态", () => {
  test("① 手动落座 7 位本剧本角色 ⇒ 快照 role.id 逐位对上；点座位可撤销再还原", async ({
    page,
  }) => {
    await enterConfigNoDeal(page, WS, 7);

    // 随机发牌（**真实点击**）→ 手动逐位覆盖为确定阵容（证明「手动覆盖发牌」）
    await dealAndSeat(page, WS_COMP);

    // L4 判据「能撤销」：再点一次 ⇒ UI 必须回到「空」
    await clickSeat(page, 0);
    const afterUndo = (await seatTexts(page, 7))[0];
    expect(
      afterUndo,
      "❌ 撤销落座后 UI 仍显示角色 —— 撤销没有生效"
    ).not.toContain(SEAT_LABEL[WS_COMP[0]]);
    // 还原
    await page
      .locator(`[data-role-id="${WS_COMP[0]}"]`)
      .first()
      .click({ timeout: 15_000 });
    await clickSeat(page, 0);
    expect((await seatTexts(page, 7))[0]).toContain(SEAT_LABEL[WS_COMP[0]]);

    await confirmAndEnterNight(page);

    // ⭐ 状态层：UI 显示 ≠ 状态落库，必须读快照
    const got = await snapshotRoleIds(page, 7);
    expect(
      got,
      `❌ 手动落座的角色与快照不一致（UI 显示 ≠ 状态落库）\n实际 ${JSON.stringify(got)}`
    ).toEqual(WS_COMP);

    // 阵营契约：快照里的 role.type 必须与独立真值一致
    const snap = await readSnapshot(page);
    const types = seatsOf(snap).map((s: any) => s.role?.type);
    expect(
      types,
      `❌ 快照里的阵营与真值不一致\n实际 ${JSON.stringify(types)}`
    ).toEqual(WS_COMP.map((id) => TYPE[id]));
  });

  test("② 入夜后：gamePhase 推进 · 队列必须含首夜角色、不含其他夜角色", async ({
    page,
  }) => {
    await enterConfigNoDeal(page, WS, 7);
    await dealAndSeat(page, WS_COMP);
    await confirmAndEnterNight(page);

    const got = await snapshotRoleIds(page, 7);
    expect(got, "❌ 落座阵容未落库").toEqual(WS_COMP);

    const snap = await readSnapshot(page);
    const phase = String(snap?.gamePhase ?? "");
    expect(
      ["firstNight", "night", "dusk", "day"].includes(phase),
      `❌ gamePhase="${phase}" —— 入夜后阶段没有推进`
    ).toBe(true);
    expect(
      Number(snap?.nightCount ?? 0),
      "❌ nightCount 必须 ≥ 1"
    ).toBeGreaterThanOrEqual(1);

    // ⭐ L4 判据「能唤醒」：读真实快照里的唤醒队列
    const queue: string[] = await readNightQueue(page, 20_000);
    expect(
      queue.length,
      "❌ 夜间行动顺序为空 —— 没有任何角色被唤醒"
    ).toBeGreaterThan(0);
    const queueText = queue.join("\n");

    for (const id of WS_FIRST_NIGHT) {
      expect(
        queueText,
        `❌ 首夜应唤醒 ${SEAT_LABEL[id]}（${id}），但队列里没有\n队列：${queueText.slice(0, 300)}`
      ).toContain(SEAT_LABEL[id]);
    }

    /*
     * ⚠️ 「其他夜角色」的负向对照必须**排除带括注的固定环节**。
     *   实测队列（7 人局，本阵容）：
     *     1. [6号] 爪牙互认
     *     2. [7号] 涡流(恶魔互认)   ← 官方首夜**固定**的恶魔/爪牙互认，不是涡流的技能步骤
     *     3. [6号] 女巫
     *     4. [1号] 侍女
     *     5. [2号] 数学家
     *   ⇒ 「涡流」在首夜出现是**正确的官方行为**（恶魔首夜必须认识爪牙），
     *     所以负向对照只看**不带括注**的技能步骤条目。
     */
    const abilitySteps = queue.filter((l) => !/[（(]/.test(l)).join("\n");
    for (const id of WS_OTHER_NIGHT_ONLY) {
      expect(
        abilitySteps,
        `❌ ${SEAT_LABEL[id]}（${id}）是其他夜角色，首夜不应出现它的技能步骤\n队列：${queueText.slice(0, 300)}`
      ).not.toContain(SEAT_LABEL[id]);
    }
  });

  test("③ 推进整夜 ⇒ gamePhase 真的变成白天 · 首夜无人死亡 · 字段结构合法", async ({
    page,
  }) => {
    await enterConfigNoDeal(page, WS, 7);
    await dealAndSeat(page, WS_COMP);
    await confirmAndEnterNight(page);

    const result = await advanceNightFast(page);
    expect(
      result,
      `❌ 夜间推进未能到达白天（返回 ${result}；本阵容不含间谍，不应熔断）`
    ).toBe("day");

    const after = await waitForSnapshot(
      page,
      (s) => s?.gamePhase === "day",
      15_000
    );
    expect(after, "❌ 进入白天后快照仍不可读").not.toBeNull();
    expect(after?.gamePhase, "❌ gamePhase 仍是夜间 —— 只有 UI 变了").toBe("day");

    // 阵容契约（推进整夜后角色分配不得漂移）
    expect(
      seatsOf(after).map((s: any) => s.role?.id),
      "❌ 推进整夜后角色分配发生漂移"
    ).toEqual(WS_COMP);

    // ⭐ 官方：首夜恶魔不杀人（vortox otherNightPriority=52）⇒ 首夜结束必无死亡
    const dead = seatsOf(after).filter((s: any) => s.isDead === true);
    expect(
      dead.length,
      `❌ 首夜不应有人死亡，实际 ${dead.length} 人（${dead
        .map((s: any) => s.role?.id)
        .join(",")}）`
    ).toBe(0);

    // 结构断言：isDead 必须是布尔；statusEffects 若存在必须是数组
    for (const s of seatsOf(after)) {
      expect(typeof s.isDead, `❌ ${s.id + 1}号 isDead 不是布尔`).toBe("boolean");
      if (s.statusEffects !== undefined) {
        expect(
          Array.isArray(s.statusEffects),
          `❌ ${s.id + 1}号 statusEffects 不是数组`
        ).toBe(true);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
test.describe("L4 · 无名之墓：第二剧本必须可独立跑通", () => {
  test("④ 无名之墓随机发牌 7 人局入夜 ⇒ 快照落库 · 全是本剧本角色 · 队列非空", async ({
    page,
  }) => {
    await enterConfigNoDeal(page, TOMB, 7);
    await page.getByText("随机落座").first().click({ timeout: 15_000 });
    await waitSeats(page, 7, (t) => t.every((x) => !x.endsWith("空")), "发牌后");
    // 无名之墓含**酒鬼/男爵**⇒ 可能需先配置伪装身份、或跨过「仍然分发」弹窗
    await confirmAndEnterNight(page);

    const got = await snapshotRoleIds(page, 7);
    for (const id of got) {
      expect(
        TOMB_ROLES.has(id),
        `❌ 无名之墓发出了不属于本剧本的角色：${id}（全部：${JSON.stringify(got)}）`
      ).toBe(true);
    }

    const snap = await readSnapshot(page);
    expect(
      ["firstNight", "night", "dusk", "day"].includes(String(snap?.gamePhase ?? "")),
      `❌ 无名之墓 gamePhase="${snap?.gamePhase}" 未推进`
    ).toBe(true);

    const queue = await readNightQueue(page, 20_000);
    expect(queue.length, "❌ 无名之墓夜间队列为空").toBeGreaterThan(0);
  });

  test("⑤ 无名之墓手动落座 7 位本剧本角色 ⇒ 快照逐位对上 + 阵营契约", async ({
    page,
  }) => {
    await enterConfigNoDeal(page, TOMB, 7);
    await dealAndSeat(page, TOMB_COMP);
    await confirmAndEnterNight(page);

    const got = await snapshotRoleIds(page, 7);
    expect(
      got,
      `❌ 无名之墓手动落座与快照不一致\n实际 ${JSON.stringify(got)}`
    ).toEqual(TOMB_COMP);

    const snap = await readSnapshot(page);
    expect(
      seatsOf(snap).map((s: any) => s.role?.type),
      "❌ 无名之墓快照里的阵营与真值不一致"
    ).toEqual(TOMB_COMP.map((id) => TYPE[id]));

    // 首夜队列：本阵容 7 位全部是首夜角色 ⇒ 队列必须同时含投毒者与沙巴洛斯
    const queue = await readNightQueue(page, 20_000);
    const queueText = queue.join("\n");
    expect(queueText, "❌ 队列里没有投毒者").toContain(SEAT_LABEL.poisoner);
    expect(queueText, "❌ 队列里没有沙巴洛斯").toContain(SEAT_LABEL.shabaloth);
  });
});

// ══════════════════════════════════════════════════════════════════════
/**
 * L4 · **逐角色**真实点击流（32 角色一个不漏）
 * ==================================================================
 * ⑦~⑩ 把 32 个角色**逐个**钉进 0 号座位，跑一次「落座 → 分发核对 → 入夜」，
 * 然后断言 localStorage 快照里：
 *   ① `seats[0].role.id` 正是被测角色（**UI 显示 ≠ 状态落库**，必须读状态）
 *   ② `seats[0].role.type` 与**独立硬编码真值** `TYPE` 一致（防"两边一起改"）
 *   ③ 全部 5 个座位都有 `role.id`（发牌完整性）
 *   ④ `gamePhase` 已推进且 `nightCount ≥ 1`（真的进夜了）
 *
 * ⚠️ 为什么不做成「一个测试跑 32 个角色」：Playwright 默认 `timeout: 120_000`，
 *   32 局约 7 分钟 ⇒ 必然超时。拆成 4 个测试（每 8 个角色）并各放大超时。
 *
 * ⚠️ 填充位**必须取自本剧本自己的角色池**（配置页只列本剧本角色），
 *   且优先选「无日间能力 / 不需伪装身份」的角色，避免引入无关分支；
 *   喝酒鬼/畸形秀演员需要先配「伪装身份」，由 `confirmAndEnterNight` 里的
 *   `resolveCharades` 兜底；男爵等造成的配比不符由「仍然分发&核对身份」兜底。
 */
const WS_ROSTER = [
  "chambermaid", "gossip", "oracle", "mathematician", "artist", "flowergirl",
  "innkeeper", "fool", "saint", "recluse", "politician", "spy", "witch",
  "assassin", "devils_advocate", "vortox", "po", "zombuul", "plague_doctor",
];
const TOMB_ROSTER = [
  "undertaker", "gambler", "savant", "gossip", "artist", "juggler",
  "clockmaker", "oracle", "sailor", "farmer", "fool", "scapegoat", "drunk",
  "mutant", "baron", "poisoner", "assassin", "shabaloth", "zombuul",
];

/** 窃窃私语填充位池（无日间能力 / 无伪装需求优先） */
const WS_FILL = [
  "oracle", "mathematician", "innkeeper", "spy", "recluse", "witch",
  "vortox", "po", "zombuul", "plague_doctor", "assassin",
];
/** 无名之墓填充位池（同理；刻意排除 drunk/mutant —— 它们要配伪装身份） */
const TOMB_FILL = [
  "oracle", "clockmaker", "sailor", "farmer", "poisoner", "shabaloth",
  "baron", "gossip", "artist", "juggler", "savant", "undertaker", "gambler",
];

/**
 * 组成 5 人局：`[被测角色, (恶魔), ...填充位]`，**且必须恰好含一名恶魔**。
 *
 * ⚠️ 恶魔是硬要求，不是可选项：`ControlPanel.tsx:135-152` 的 `isDisabled` 要求
 *   `hasDemon === true`，否则入夜按钮的文案会变成「缺少恶魔角色 ⚠️」
 *   （`:178`），与 `确认无误，入夜` 不匹配 ⇒ 永远进不了夜（静默卡死）。
 */
function comp5(script: string, roleId: string): string[] {
  const DEMONS = script === WS ? ["vortox", "po", "zombuul"] : ["shabaloth", "zombuul"];
  const demon = DEMONS.includes(roleId) ? null : DEMONS[0];
  const fill = (script === WS ? WS_FILL : TOMB_FILL).filter(
    (x) => x !== roleId && x !== demon
  );
  return [roleId, ...(demon ? [demon] : []), ...fill].slice(0, 5);
}

/** 一个角色的完整 L4 往返：落座 → 入夜 → 读状态断言 */
async function perRoleFlow(page: Page, script: string, roleId: string) {
  const comp = comp5(script, roleId);
  // ⚠️ 同一个 test 里连跑多局：Playwright 的 context/localStorage 是**跨 goto 复用**的，
  //   上一局的快照会被应用当成"恢复中的对局"直接恢复 ⇒ 拿不到配置页（静默偏航）。
  //   所以每局开头先清 localStorage（**清的是测试上下文，不是生产代码**）。
  await page
    .goto("/", { waitUntil: "domcontentloaded" })
    .catch(() => undefined);
  await page
    .evaluate(() => {
      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
    })
    .catch(() => undefined);
  await enterConfigNoDeal(page, script, 5);
  await dealAndSeat(page, comp);
  await confirmAndEnterNight(page);

  const snap = await waitForSnapshot(
    page,
    (s) => seatsOf(s).length === 5 && seatsOf(s).every((x: any) => x.role?.id),
    25_000
  );
  expect(
    snap,
    `❌ [${roleId}] 入夜后快照不可读/不完整 —— 状态没落库`
  ).not.toBeNull();

  const seats = seatsOf(snap);
  expect(
    seats[0]?.role?.id,
    `❌ [${roleId}] 0 号座位快照里的角色不是它（UI 显示 ≠ 状态落库）` +
      `\n实际 ${JSON.stringify(seats.map((s: any) => s.role?.id))}`
  ).toBe(roleId);
  expect(
    seats[0]?.role?.type,
    `❌ [${roleId}] 快照里的阵营与独立真值不一致`
  ).toBe(TYPE[roleId]);
  expect(seats.length, `❌ [${roleId}] 座位数应为 5`).toBe(5);
  expect(
    String(snap?.gamePhase ?? ""),
    `❌ [${roleId}] gamePhase 未推进`
  ).toMatch(/^(firstNight|night|dusk|day)$/);
  expect(
    Number(snap?.nightCount ?? 0),
    `❌ [${roleId}] nightCount 必须 ≥ 1`
  ).toBeGreaterThanOrEqual(1);
}

test.describe("L4 · 逐角色真实点击流（窃窃私语 19 角色）", () => {
  const chunks: string[][] = [];
  for (let i = 0; i < WS_ROSTER.length; i += 7) {
    chunks.push(WS_ROSTER.slice(i, i + 7));
  }
  chunks.forEach((group, gi) => {
    test(`⑦-${gi + 1} 真实点击落座 + 入夜：${group.join(" / ")}`, async ({
      page,
    }) => {
      test.setTimeout(600_000);
      for (const roleId of group) await perRoleFlow(page, WS, roleId);
    });
  });
});

test.describe("L4 · 逐角色真实点击流（无名之墓 19 角色）", () => {
  const chunks: string[][] = [];
  for (let i = 0; i < TOMB_ROSTER.length; i += 7) {
    chunks.push(TOMB_ROSTER.slice(i, i + 7));
  }
  chunks.forEach((group, gi) => {
    test(`⑧-${gi + 1} 真实点击落座 + 入夜：${group.join(" / ")}`, async ({
      page,
    }) => {
      test.setTimeout(600_000);
      for (const roleId of group) await perRoleFlow(page, TOMB, roleId);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════
test.describe("L4 · 快照完整性（与角色无关的结构契约）", () => {
  test("⑥ 快照刷新后不丢，且角色分配不变", async ({ page }) => {
    await enterConfigNoDeal(page, WS, 7);
    await dealAndSeat(page, WS_COMP);
    await confirmAndEnterNight(page);

    const first = await waitForSnapshot(
      page,
      (s) => seatsOf(s).length === 7,
      20_000
    );
    expect(first, "❌ 快照不可读").not.toBeNull();
    expect(seatsOf(first).length, "❌ 座位数应为 7").toBe(7);
    expect(
      seatsOf(first).map((s: any) => s.role?.id),
      "❌ 刷新前阵容落库不正确"
    ).toEqual(WS_COMP);

    // 刷新后快照必须仍在（说明真的持久化了，而不是只活在内存里）
    await page.reload({ waitUntil: "domcontentloaded" });
    const second = await readSnapshot(page);
    expect(second, "❌ 刷新后快照丢失 —— 状态只存在内存里").not.toBeNull();
    expect(seatsOf(second).length, "❌ 刷新后座位数变了").toBe(
      seatsOf(first).length
    );

    const rolesBefore = seatsOf(first).map((s: any) => s.role?.id);
    const rolesAfter = seatsOf(second).map((s: any) => s.role?.id);
    expect(rolesAfter, "❌ 刷新后角色分配变了 —— 持久化不完整").toEqual(
      rolesBefore
    );
  });
});
