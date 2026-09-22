import { expect, test, type Page } from "@playwright/test";
import {
  advanceNightFast,
  enterScriptConfig,
  readNightQueue,
  readSnapshot,
  resolveCharades,
  waitForSnapshot,
} from "../helpers/scriptFlow";

/**
 * L4（E2E）· 梦殒春宵 / 游园惊梦 —— **真实浏览器点击流 + 读 localStorage 断言**
 * ==================================================================
 * ⚠️ 为什么必须有这一层：L1/L2/L3/L5 都在 Node/jsdom 里跑，证明不了
 *   「说书人在真实浏览器里点得动、点了之后状态真的落库」。
 *   本文件所有**状态断言**都读 `localStorage["clocktower_current_snapshot"]`
 *   的字段（`seats[].role.id` / `isDead` / `gamePhase`），不锚文案。
 *
 * ⚠️ 端口固定 3100（本机 3000/3001/3002 常被残留进程占用，可能返回别的 App）。
 *   由外部先起：`PORT=3100 npx next dev -p 3100`。Playwright 不托管 dev server。
 *
 * ✅ 已修复（2026-09-21 复测）：准备阶段座位圆圈的原生鼠标点击**已能正常落座/取消**
 *   （原「缺陷登记」的浮层吞 click 问题不再复现，证据见用例 ②）。
 *   本文件的「落座/取消落座」仍沿用 `dispatchEvent("click")` ——
 *   它是**真实 DOM 节点上的真实 click 事件、走 React 真实 onClick 处理器、
 *   产生真实状态变更并落库**，与 `runRole()` 之类的引擎直调有本质区别；
 *   且**不依赖命中测试**，抗浮层/动效回归。用例 ② 则专门用**原生鼠标点击**兜住这条路径。
 *   其余所有步骤（选剧本 / 快速开始 / 人数 / 角色卡 / 分发&核对身份 / 入夜 / 推夜）
 *   一律使用 Playwright 原生鼠标点击。
 */

const SNV = "梦殒春宵";
const GARDEN = "游园惊梦";

/**
 * 7 人局合法阵容（5 镇民 / 0 外来者 / 1 爪牙 / 1 恶魔），
 * 全部取自**梦殒春宵本剧本**，且都不含免死/免疫角色。
 */
const SNV_COMP = [
  "clockmaker", // 镇民（首夜 61）
  "dreamer", // 镇民（首夜 62）
  "oracle", // 镇民（其他夜 98）
  "sage", // 镇民（死亡触发）
  "artist", // 镇民（日间）
  "witch", // 爪牙（首夜 39）
  "fang_gu", // 恶魔（其他夜 50）
];

/** roleId → app/data 中文名（用于落座阶段的 DOM 断言） */
const SEAT_LABEL: Record<string, string> = {
  clockmaker: "钟表匠",
  dreamer: "筑梦师",
  oracle: "神谕者",
  sage: "贤者",
  artist: "艺术家",
  witch: "女巫",
  fang_gu: "方古",
};

/** 进入配置页并**关闭快速开始弹窗**（不随机落座）→ 停在空座位的手动落座界面 */
async function enterConfigManual(page: Page, scriptName: string, count: number) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: new RegExp(scriptName) }).last().click({ timeout: 15_000 });
  const quick = page.getByText("⚡ 快速开始").first();
  await expect(quick).toBeVisible({ timeout: 20_000 });
  await quick.click({ timeout: 15_000 });
  await page.getByText(`${count}人`, { exact: false }).first().click({ timeout: 15_000 });
  // ⚠️ 「快速开始」弹窗只有「随机落座」和「取消」两个出口；
  //    点「取消」才会进入**空座位**的手动落座界面（否则会被随机发牌）。
  await page.getByRole("button", { name: "取消" }).first().click({ timeout: 15_000 });
  await expect(page.getByText("⚡ 快速开始").first()).toBeVisible({ timeout: 15_000 });
}

/** 座位序号圆圈（`title="N号座位"`）——落座/取消落座的唯一入口 */
function seatCircle(page: Page, seatId: number) {
  return page.getByTitle(`${seatId + 1}号座位`).first();
}

/**
 * 落座/取消落座的**有效**点击：对真实 DOM 节点派发真实 click 事件。
 *
 * ⚠️ 为什么默认仍用 `dispatchEvent`（而非 `seatCircle().click()`）：
 *   它**不依赖浏览器命中测试**，任何浮层/动效/布局回归都影响不到它，
 *   适合"只想稳定落座、不测点击通路"的批量步骤（本文件 `assignComp` 等）。
 *   「原生鼠标点击能否落座」这条通路由**用例 ②** 专门兜住（且那条缺陷已修复）。
 */
async function clickSeat(page: Page, seatId: number) {
  await seatCircle(page, seatId).dispatchEvent("click");
}

/** 真实鼠标点击座位序号圆圈（用例 ② 用它守卫「点击通路」） */
async function clickSeatWithMouse(page: Page, seatId: number) {
  await seatCircle(page, seatId).click({ timeout: 8_000 });
}
/** 手动把 comp 逐位落到 0..n-1 号座位：**真实点角色卡** + 对座位派发 click */
async function assignComp(page: Page, comp: string[]) {
  for (let i = 0; i < comp.length; i++) {
    await page.locator(`[data-role-id="${comp[i]}"]`).first().click({ timeout: 15_000 });
    await clickSeat(page, i);
  }
}

/** 分发核对 → 入夜（全部真实点击） */
async function confirmAndEnterNight(page: Page) {
  await resolveCharades(page);
  const distribute = page.getByText("分发&核对身份").first();
  await expect(distribute).toBeVisible({ timeout: 20_000 });
  await distribute.click({ timeout: 15_000 });
  const enterNight = page
    .locator("button")
    .filter({ hasText: /确认无误[\s\S]*入夜/ })
    .first();
  await expect(enterNight).toBeVisible({ timeout: 20_000 });
  await enterNight.click({ timeout: 15_000 });
}

function seatsOf(snap: any): any[] {
  return Array.isArray(snap?.seats) ? snap.seats : [];
}

function seatText(raw: string | null) {
  return (raw ?? "").replace(/\s+/g, "");
}

test.describe("L4 · 梦殒春宵：真实点击流必须产生真实状态", () => {
  test("① 手动落座 7 位本剧本角色 ⇒ 入夜后快照 role.id 逐位对上；点座位可撤销", async ({
    page,
  }) => {
    await enterConfigManual(page, SNV, 7);

    // 落座阶段 localStorage **尚未持久化**（快照只在开局后写入）
    // ⇒ 这一段的断言只能锚 DOM；状态断言放到入夜之后。
    for (let i = 0; i < SNV_COMP.length; i++) {
      await page.locator(`[data-role-id="${SNV_COMP[i]}"]`).first().click({ timeout: 15_000 });
      await clickSeat(page, i);
      const text = await page.locator(`[data-seat-id="${i}"]`).first().textContent();
      expect(
        seatText(text),
        `❌ UI 上 ${i + 1}号 未显示 ${SEAT_LABEL[SNV_COMP[i]]}（落座无效）`
      ).toContain(SEAT_LABEL[SNV_COMP[i]]);
    }

    // L4 判据：**能撤销** —— 再点一次座位必须回到「空」
    await clickSeat(page, 0);
    const afterUndo = await page.locator(`[data-seat-id="0"]`).first().textContent();
    expect(
      seatText(afterUndo),
      `❌ 撤销落座后 UI 仍显示 ${SEAT_LABEL[SNV_COMP[0]]} —— 撤销没有生效`
    ).not.toContain(SEAT_LABEL[SNV_COMP[0]]);
    // 还原，保证阵容满 7 人
    await page.locator(`[data-role-id="${SNV_COMP[0]}"]`).first().click({ timeout: 15_000 });
    await clickSeat(page, 0);

    await confirmAndEnterNight(page);

    const snap = await waitForSnapshot(
      page,
      (s) => seatsOf(s).length >= 7 && seatsOf(s).slice(0, 7).every((x: any) => x.role?.id),
      20_000
    );
    expect(snap, "❌ 入夜后 localStorage 里没有快照 —— 状态没被持久化").not.toBeNull();

    const got = seatsOf(snap)
      .slice(0, 7)
      .map((s: any) => s.role?.id);
    expect(
      got,
      `❌ 手动落座的角色与快照不一致（UI 显示 ≠ 状态落库）\n实际 ${JSON.stringify(got)}`
    ).toEqual(SNV_COMP);
  });

  /**
   * ② 座位圆圈的原生鼠标点击 —— **原「缺陷登记」已修复 ⇒ 转正例回归护栏**
   *
   * ── 历史（2026-09-21 之前）────────────────────────────────────────
   * 准备阶段（`gamePhase==="setup"`，`isDragSwapEnabled===true`）点座位序号圆圈
   * **点不动**：`handleSeatDragStart` 在 `pointerdown` 时**无位移阈值**立即进入拖拽
   * ⇒ 立刻挂载全视口浮层，浮层内复用的真实 `SeatNode` 根节点带 `pointer-events-auto`
   * ⇒ 压在光标正下方**实心拦截** `mouseup` ⇒ 浏览器不合成 `click` ⇒ 落座失效。
   * 当时的证据：`[data-seat-id]` 节点数 **15 → 16**（浮层挂载）、
   * `mouseup`/`click` 从未命中目标；`dispatchEvent("click")` 却立刻成功。
   *
   * ── 现状（2026-09-21 复测，本用例转为正例）──────────────────────
   * 修复后实测：
   *   · `[data-seat-id]` 节点数 **15 / 15 / 15**（pointerdown 期间**不再**挂载浮层）；
   *   · 事件链完整命中目标：`pointerdown → mousedown → pointerup → mouseup → click`；
   *   · 真实鼠标点击 ⇒ 落座成功（"1钟表匠"），再点一次 ⇒ 取消成功（"1空"）。
   *
   * ✅ 因此本用例改为**正反双向**守卫：
   *   · 正：真鼠标点击必须能落座 / 取消；**带位移**的拖拽必须仍能进入拖拽（防「修复过头」）；
   *   · 反：**纯按下-抬起（无位移）期间不得挂载拖拽浮层**（吞 click 的根因）。
   */
  test("② ⭐ 座位圆圈的原生鼠标点击必须能落座/取消（原「缺陷登记」已修复 ⇒ 转正例回归）", async ({
    page,
  }) => {
    await enterConfigManual(page, SNV, 7);

    // 2.1 真实鼠标点击 ⇒ 必须落座
    await page.locator(`[data-role-id="clockmaker"]`).first().click({ timeout: 15_000 });
    await clickSeatWithMouse(page, 0);
    const afterMouse = await page.locator(`[data-seat-id="0"]`).first().textContent();
    expect(
      seatText(afterMouse),
      "❌ 原生鼠标点击座位圆圈**未能落座** —— 「拖拽浮层吞掉 click」的缺陷复发" +
        "（根因见 `RoundTable.tsx::handleSeatDragStart` 是否又对 mouse 路径去掉了位移阈值）"
    ).toContain("钟表匠");

    // 2.2 再点一次同一圆圈 ⇒ 必须取消落座（落座是 toggle，不是单向）
    await clickSeatWithMouse(page, 0);
    const afterToggle = await page.locator(`[data-seat-id="0"]`).first().textContent();
    expect(
      seatText(afterToggle),
      "❌ 第二次鼠标点击未能取消落座 —— toggle 语义失效"
    ).not.toContain("钟表匠");

    // 2.3 ⭐ 机制护栏（反）：纯按下-抬起无位移 ⇒ **不得**挂载拖拽浮层
    const before = await page.locator("[data-seat-id]").count();
    const box = (await seatCircle(page, 0).boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(250);
    const during = await page.locator("[data-seat-id]").count();
    await page.mouse.up();
    await page.waitForTimeout(250);
    expect(
      during,
      "❌ pointerdown 无位移时**又**挂载了拖拽浮层（节点数 " + before + "→" + during + "）—— " +
        "这正是「浮层压在光标下吞掉 mouseup/click」的根因，会导致手动落座全部失效"
    ).toBe(before);

    // 2.4 ⭐ 正向对照：**带位移**的按下-拖动必须仍能进入拖拽（防「修复过头砍掉拖拽」）
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy + 120, { steps: 8 });
    await page.waitForTimeout(250);
    const dragging = await page.locator("[data-seat-id]").count();
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(
      dragging,
      "❌ 带位移的拖拽未挂载浮层（节点数 " + before + "→" + dragging + "）—— " +
        "说明「修复吞 click」时把【拖拽换位】功能一起砍掉了（两不可缺）"
    ).toBeGreaterThan(before);

    // 2.5 对照组：`dispatchEvent("click")` 仍有效（既有 helper `clickSeat` 依赖此路径）
    //     ⚠️ 必须先**重新选中角色卡**：落座会**消耗**选中态（落座后 selectedRole 被清空）
    //        ⇒ 取消落座后直接点座位是无操作（实测：dispatchEvent / pw .click() 都点不动，
    //          那是"没有选中角色"，**不是**落座链路坏了 —— 别把这里误判成缺陷）。
    await page.locator(`[data-role-id="clockmaker"]`).first().click({ timeout: 15_000 });
    await seatCircle(page, 0).dispatchEvent("click");
    await page.waitForTimeout(250);
    const afterDispatch = await page.locator(`[data-seat-id="0"]`).first().textContent();
    expect(
      seatText(afterDispatch),
      "❌ 选中角色后派发 click 事件仍没落座 —— 落座链路本身坏了（不只是鼠标事件投递）"
    ).toContain("钟表匠");
  });

  test("③ 入夜后：gamePhase 进入夜间 · 座位全部已发牌 · 队列必须包含被唤醒角色", async ({
    page,
  }) => {
    await enterConfigManual(page, SNV, 7);
    await assignComp(page, SNV_COMP);
    await confirmAndEnterNight(page);

    const snap = await waitForSnapshot(
      page,
      (s) => seatsOf(s).length >= 7 && seatsOf(s).slice(0, 7).every((x: any) => x.role?.id),
      20_000
    );
    expect(snap, "❌ 入夜后快照不可读").not.toBeNull();

    const phase = String(snap?.gamePhase ?? "");
    expect(
      ["firstNight", "night", "dusk", "day"].includes(phase),
      `❌ gamePhase="${phase}" —— 入夜后阶段没有推进`
    ).toBe(true);
    expect(Number(snap?.nightCount ?? 0), "❌ nightCount 必须 ≥ 1").toBeGreaterThanOrEqual(1);

    // ⭐ L4 判据「能唤醒」：UI 上的「夜晚行动顺序」面板（说书人真实看到的清单）
    const panel: string[] = await readNightQueue(page, 20_000);
    expect(panel.length, "❌ 夜间行动顺序为空 —— 没有任何角色被唤醒").toBeGreaterThan(0);
    const panelText = panel.join("\n");
    expect(
      /女巫|钟表匠|筑梦师/.test(panelText),
      `❌ 队列里找不到本阵容的镇民/爪牙 ⇒ 本剧本角色没有被排进夜序\n队列：${panelText.slice(0, 300)}`
    ).toBe(true);

    // ⭐ 判据：**状态里的唤醒队列**（wakeQueueIds）必须与 UI 清单长度一致 ——
    //    证明「说书人看到的队列」就是「引擎真正要唤醒的队列」，不是两套东西。
    const queueIds: number[] = Array.isArray(snap?.wakeQueueIds) ? snap.wakeQueueIds : [];
    expect(
      queueIds.length,
      `❌ wakeQueueIds 长度(${queueIds.length}) 与 UI 队列条目数(${panel.length}) 不一致`
    ).toBe(panel.length);

    // ⭐ 官方首夜夜序（rolesData.json firstNightOrder）：
    //    爪牙互认 → 恶魔互认 → 女巫(39) → 钟表匠(61) → 筑梦师(62)
    //    座位按 SNV_COMP 顺序落座 ⇒ witch=5号 / fang_gu=6号 / clockmaker=1号 / dreamer=2号
    const roleById = seatsOf(snap).map((s: any) => s.role?.id);
    const wokeRoles = queueIds.map((i) => roleById[i]);
    expect(
      wokeRoles,
      `❌ 真实唤醒队列与官方首夜夜序不符\n队列=${JSON.stringify(wokeRoles)}`
    ).toEqual(["witch", "fang_gu", "witch", "clockmaker", "dreamer"]);

    // ⭐ 官方规则：fang_gu 的**能力**属其他夜（otherNightPriority=50），
    //    首夜出现只因「恶魔互认」这一系统步骤 ⇒ 剔除互认步骤后队列里不得再出现方古。
    const abilitySteps = panel.filter((s) => !/互认/.test(s));
    expect(
      /方古/.test(abilitySteps.join("\n")),
      `❌ 方古 only-other-night，首夜不应有**能力**唤醒（互认步骤除外）\n能力步骤：${abilitySteps.join(" / ")}`
    ).toBe(false);
  });

  test("④ 推进整夜 ⇒ gamePhase 真的变成白天 · 首夜无人死亡 · 字段类型合法", async ({ page }) => {
    await enterConfigManual(page, SNV, 7);
    await assignComp(page, SNV_COMP);
    await confirmAndEnterNight(page);

    const result = await advanceNightFast(page);
    expect(result, "❌ 夜间推进未能到达白天（卡在某个环节）").toBe("day");

    const after = await waitForSnapshot(page, (s) => s?.gamePhase === "day", 15_000);
    expect(after, "❌ 进入白天后快照仍不可读").not.toBeNull();
    expect(after?.gamePhase, "❌ gamePhase 仍是夜间 —— 只有 UI 变了").toBe("day");

    // ⭐ 官方：首夜恶魔不杀人（fang_gu otherNightPriority=50）⇒ 首夜结束必无死亡
    const dead = seatsOf(after).filter((s: any) => s.isDead === true);
    expect(
      dead.length,
      `❌ 首夜不应有人死亡，实际 ${dead.length} 人（${dead.map((s: any) => s.role?.id).join(",")}）`
    ).toBe(0);

    for (const s of seatsOf(after)) {
      expect(typeof s.isDead, `❌ ${s.id + 1}号 isDead 不是布尔`).toBe("boolean");
      if (s.statusEffects !== undefined) {
        expect(Array.isArray(s.statusEffects), `❌ ${s.id + 1}号 statusEffects 不是数组`).toBe(true);
      }
    }
  });
});

test.describe("L4 · 游园惊梦：第二剧本必须可独立跑通", () => {
  test("⑤ 游园惊梦 7 人局入夜 ⇒ 快照落库 · 队列非空", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await enterScriptConfig(page, GARDEN, 7);
    await confirmAndEnterNight(page);

    const snap = await waitForSnapshot(
      page,
      (s) => seatsOf(s).length >= 7 && seatsOf(s).slice(0, 7).every((x: any) => x.role?.id),
      20_000
    );
    expect(snap, "❌ 游园惊梦入夜后快照不可读").not.toBeNull();

    const unassigned = seatsOf(snap).slice(0, 7).filter((s: any) => !s.role?.id);
    expect(unassigned.length, "❌ 有座位没有 role.id（UI 显示已分配 ≠ 状态落库）").toBe(0);
    expect(
      ["firstNight", "night", "dusk", "day"].includes(String(snap?.gamePhase ?? "")),
      `❌ 游园惊梦 gamePhase="${snap?.gamePhase}" 未推进`
    ).toBe(true);

    const queue = await readNightQueue(page, 20_000);
    expect(queue.length, "❌ 游园惊梦夜间队列为空").toBeGreaterThan(0);
  });

  test("⑥ 游园惊梦手动落座 4 名本剧本角色 ⇒ 快照逐位对上", async ({ page }) => {
    const comp = ["clockmaker", "dreamer", "oracle", "sage", "artist", "witch", "fang_gu"];
    await enterConfigManual(page, GARDEN, 7);
    await assignComp(page, comp);
    await confirmAndEnterNight(page);

    const snap = await waitForSnapshot(
      page,
      (s) => seatsOf(s).length >= 7 && seatsOf(s).slice(0, 7).every((x: any) => x.role?.id),
      20_000
    );
    expect(snap, "❌ 游园惊梦入夜后快照不可读").not.toBeNull();
    expect(
      seatsOf(snap)
        .slice(0, 7)
        .map((s: any) => s.role?.id),
      "❌ 游园惊梦与梦殒春宵共用角色池 —— 同名角色手动落座后快照必须一致"
    ).toEqual(comp);
  });
});

test.describe("L4 · 快照完整性（与角色无关的结构契约）", () => {
  test("⑦ 快照必须可重复读取且字段类型稳定（刷新后不丢）", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await enterScriptConfig(page, SNV, 7);
    await confirmAndEnterNight(page);

    const first = await waitForSnapshot(page, (s) => seatsOf(s).length >= 7, 20_000);
    expect(first, "❌ 快照不可读").not.toBeNull();
    expect(seatsOf(first).length, "❌ 座位数应 ≥ 7").toBeGreaterThanOrEqual(7);

    // 刷新后快照仍在（说明真的持久化了，而不是只活在内存里）
    await page.reload({ waitUntil: "domcontentloaded" });
    const second = await readSnapshot(page);
    expect(second, "❌ 刷新后快照丢失 —— 状态只存在内存里").not.toBeNull();
    expect(seatsOf(second).length, "❌ 刷新后座位数变了").toBe(seatsOf(first).length);

    const rolesBefore = seatsOf(first).map((s: any) => s.role?.id);
    const rolesAfter = seatsOf(second).map((s: any) => s.role?.id);
    expect(rolesAfter, "❌ 刷新后角色分配变了 —— 持久化不完整").toEqual(rolesBefore);
  });
});

/* ==================================================================
 * ✅ 已修复（2026-09-21 复测）—— 原「缺陷登记」退役
 * ==================================================================
 * 原现象：**准备阶段（`gamePhase==="setup"`）点击座位「序号圆圈」无法落座/取消落座**
 *   —— 原生鼠标点击被拖拽浮层吞掉（详见下方历史证据与根因）。
 *
 * ── 历史证据链（修复前实测）───────────────────────────────────────
 *   1. `pointerdown` / `mousedown` 正常命中圆圈按钮；
 *      `mouseup` / `click` **从未派发**（在 `[data-seat-id="0"]` 上挂 capture 监听实测）。
 *   2. `pointerdown` 那一刻 `[data-seat-id]` 节点数 15 → **16**（拖拽浮层被挂载），
 *      松手后回到 15 ⇒ 浮层在整个按下-抬起期间都压在光标下。
 *   3. 对同一圆圈 `dispatchEvent("click")` ⇒ 立刻落座成功
 *      ⇒ 事件链、状态链、React onClick 全部正常，坏的只有**鼠标事件投递**。
 *
 * ── 历史根因 ──────────────────────────────────────────────────────
 *   · `RoundTable.tsx::handleSeatDragStart` 在 `pointerdown` 时**无位移阈值**立即进入拖拽
 *     （touch 路径有阈值，mouse/pointer 路径没有）；
 *   · 立刻挂载全视口浮层，浮层容器虽 `pointer-events-none`，但内部复用的真实
 *     `SeatNode` 根节点带 `pointer-events-auto`（`SeatNode.tsx:346`）
 *     ⇒ 浮层在光标正下方**实心拦截** `mouseup`；`mouseup` 落到浮层 SeatNode
 *     （其 `onSeatClick={() => {}}`）⇒ 原座位收不到 ⇒ 浏览器不合成 `click` ⇒ 落座失效。
 *   影响面：准备 / 核对身份两阶段（`isDragSwapEnabled` 为真）的「手动落座」入口全部失效。
 *
 * ── 现状（2026-09-21 复测：**已不复现**）────────────────────────────
 *   实测三项：
 *     · `[data-seat-id]` 节点数 **15 / 15 / 15**（pointerdown 期间不再挂载浮层）；
 *     · 事件链完整命中目标：`pointerdown → mousedown → pointerup → mouseup → click`；
 *     · 真实鼠标点击 ⇒ 落座成功（"1钟表匠"）、再点一次 ⇒ 取消成功（"1空"）。
 *
 *   守卫已转为**正例回归**：见用例 ②（正：真鼠标点击可落座/取消 + **带位移仍能拖拽**；
 *   反：**无位移的按下-抬起期间不得挂载拖拽浮层**）。
 *   ⇒ 该缺陷若复发（例如又对 mouse 路径去掉位移阈值），用例 ② 会立刻变红。
 *
 * ── 遗留待核 ──────────────────────────────────────────────────────
 *   · 「落座会**消耗**选中角色卡」的行为已实测确认（落座后 selectedRole 清空）
 *     —— 属设计语义，非缺陷；但**取消落座后不会恢复选中态**，连续落座需重新选卡。
 *     用例 ② 的 2.5 已按此语义书写（说明见该处注释）。
 * ================================================================== */
