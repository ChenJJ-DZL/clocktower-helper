import { expect, test, type Page } from "@playwright/test";
import {
  readSnapshot,
  resolveCharades,
  waitForEither,
  waitForSnapshot,
} from "../helpers/scriptFlow";

/**
 * L4（E2E）· **逐角色真实点击流** —— 梦殒春宵 25 角色
 * ==================================================================
 * ── 为什么必须有这一辑（2026-09-22）────────────────────────────────
 * 对比 `e2e/whispering_secrets/full_flow.spec.ts`：它有两个「逐角色」批次
 * （⑦-1/⑦-2/⑦-3 覆盖窃窃私语 19 角色、⑧-1~⑧-3 覆盖无名之墓 19 角色），
 * 而**梦殒春宵此前完全没有逐角色点击流** —— 只有 7 人局的手工阵容
 * （`full_flow.spec.ts` 用 `SNV_COMP` 只覆盖 7 个角色）+ 我刚补的 4 条状态断言。
 *
 * ⇒ 其余 18 个角色在**真实浏览器**里「点得动吗、点完状态真的落库吗」
 *   从来没有被验证过。本文件按官方配比逐角色各开一局，走**真实鼠标点击**
 *   完成「选剧本 → 人数 → 手动落座 → 分发&核对 → 入夜」，再读快照断言状态。
 *
 * ── 判据（与 ⑦/⑧ 同口径，绝不看文案代状态）────────────────────────
 *   ① 座位 0 的快照 `role.id` 必须**就是**该角色（UI 显示 ≠ 状态落库的防线）
 *   ② `role.type` 必须与**独立真值表** `TYPE` 一致
 *   ③ 座位数 = 该局人数；`gamePhase` 已推进；`nightCount >= 1`
 *   ④ 快照里**每个**座位都已发牌（不得有空洞）
 *
 * ── 阵容怎么保证合法（关键）────────────────────────────────────────
 * 应用会用 `utils/setupComposition.ts::STANDARD_COMPOSITIONS` 校验配比：
 *   5 → 3T/0O/1M/1D ｜ 7 → 5T/0O/1M/1D ｜ 8 → 5T/1O/1M/1D
 * 而角色的阵营决定能不能塞进某个人数：
 *   · **镇民**（13）→ 7 人局：`[本角色 + 4 镇民 + 1 爪牙 + 1 恶魔]`
 *   · **外来者**（4）→ **8** 人局：`[本角色 + 5 镇民 + 1 爪牙 + 1 恶魔]`
 *     ⚠️ 7 人局标准配比是 0 外来者 ⇒ 硬塞会触发「阵容配置错误」弹窗、进不了夜。
 *   · **爪牙**（4）→ 7 人局：`[5 镇民 + 本角色 + 1 恶魔]`
 *   · **恶魔**（4）→ 7 人局：`[5 镇民 + 1 爪牙 + 本角色]`
 * 🔎 已核实：SNV 25 个角色**全都没有 `setupAdjustment`**（`[+1外来者]` 等只是文案标记）
 *   ⇒ 配比校验只看数量，不需要额外补偿。
 *
 * ── 填充角色怎么选（防假红）────────────────────────────────────────
 * 默认填充一律取「无设置修正、不改变配比、不会让入夜被拦」的角色：
 *   镇民填充 = clockmaker / dreamer / oracle / artist / sage / juggler
 *   爪牙填充 = witch ｜ 恶魔填充 = no_dashii（⚡ `fang_gu` 有 `[+1外来者]` 语义，
 *   且它是会「跳变」的恶魔，不适合当通用填充）
 *
 * ── ⚠️ 与「每局一角色」的代价 ──────────────────────────────────────
 * 一个角色 = 一次完整配置 + 落座 + 入夜（约 10~15s）。25 角色分 4 组，
 * 每组单独 `test` 并放宽 `setTimeout`（与 ⑦/⑧ 同做法）。
 */

const SNV = "梦殒春宵";

/** 官方阵营真值（**独立于 app/data 的硬编码**，防「两边一起改」） */
const TYPE: Record<string, string> = {
  clockmaker: "townsfolk", dreamer: "townsfolk", snake_charmer: "townsfolk",
  mathematician: "townsfolk", flowergirl: "townsfolk", town_crier: "townsfolk",
  oracle: "townsfolk", savant: "townsfolk", seamstress: "townsfolk",
  philosopher: "townsfolk", artist: "townsfolk", juggler: "townsfolk",
  sage: "townsfolk",
  mutant: "outsider", sweetheart: "outsider", barber: "outsider", klutz: "outsider",
  evil_twin: "minion", witch: "minion", cerenovus: "minion", pit_hag: "minion",
  fang_gu: "demon", vigormortis: "demon", no_dashii: "demon", vortox: "demon",
};

const ROSTER = Object.keys(TYPE);

const TOWN = ROSTER.filter((r) => TYPE[r] === "townsfolk");
const OUTSIDER = ROSTER.filter((r) => TYPE[r] === "outsider");
const MINION = ROSTER.filter((r) => TYPE[r] === "minion");
const DEMON = ROSTER.filter((r) => TYPE[r] === "demon");

/** 通用填充（见文件头「填充角色怎么选」） */
const FILL_T = ["clockmaker", "dreamer", "oracle", "artist", "sage", "juggler"];
const FILL_M = "witch";
const FILL_D = "no_dashii";

/** 按角色阵营构造**合法配比**阵容 + 该局人数 */
function compFor(roleId: string): { count: number; comp: string[] } {
  if (TOWN.includes(roleId)) {
    const rest = FILL_T.filter((x) => x !== roleId).slice(0, 4);
    return { count: 7, comp: [roleId, ...rest, FILL_M, FILL_D] };
  }
  if (OUTSIDER.includes(roleId)) {
    return { count: 8, comp: [roleId, ...FILL_T.slice(0, 5), FILL_M, FILL_D] };
  }
  if (MINION.includes(roleId)) {
    return { count: 7, comp: [...FILL_T.slice(0, 5), roleId, FILL_D] };
  }
  return { count: 7, comp: [...FILL_T.slice(0, 5), FILL_M, roleId] };
}

// ─────────────────────────── helpers ───────────────────────────

function seatsOf(snap: any): any[] {
  return Array.isArray(snap?.seats) ? snap.seats : [];
}

/** 座位序号圆圈（`title="N号座位"`）——落座/取消落座的唯一入口 */
function seatCircleAt(page: Page, i: number) {
  return page.getByTitle(`${i + 1}号座位`).first();
}

/**
 * ⭐ **真实鼠标点击**座位圆圈（不是 `dispatchEvent`）。
 *   本项目曾有过「拖拽浮层吞掉 mouseup/click」的缺陷（已修，见
 *   `full_flow.spec.ts` 用例②的正例回归）；逐角色批次继续走**真实点击**
 *   ⇒ 任何命中测试回归会在这里被 25 局连续放大暴露。
 */
async function clickSeatReal(page: Page, i: number) {
  await seatCircleAt(page, i).click({ timeout: 15_000 });
}

function seatTextOf(page: Page, i: number) {
  return page
    .locator(`[data-seat-id="${i}"]`)
    .first()
    .textContent()
    .then((t) => (t ?? "").replace(/\s+/g, ""));
}

/**
 * 从**角色卡自身文本**取中文名（避免硬编码 25 个名字带来的漂移）。
 *
 * ⚠️ 不能用 `card.textContent().split(" ")[0]`：角色卡的结构是
 *   `<div><span>{name}</span><span>{id.replace(/_/g," ")}</span>…</div>`，
 *   `textContent` 把两个 span **无分隔符**拼接 ⇒ 会得到「钟表匠clockmaker」
 *   （实测踩过）。正解：取卡片内**第一个 span** 的文本。
 */
async function roleCardName(page: Page, rid: string): Promise<string> {
  const card = page.locator(`button[data-role-id="${rid}"]`).first();
  const fromSpan = (
    (await card.locator("span").first().textContent().catch(() => "")) ?? ""
  ).trim();
  if (fromSpan) return fromSpan;
  // 兜底：`innerText` 会把块级子元素折成换行
  const inner = ((await card.innerText().catch(() => "")) ?? "").trim();
  return inner.split("\n")[0].trim();
}

/** 进入配置页并**关闭快速开始弹窗**（不随机落座）→ 停在空座位的手动落座界面 */
async function enterConfigManual(page: Page, scriptName: string, count: number) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: new RegExp(scriptName) })
    .last()
    .click({ timeout: 15_000 });
  const quick = page.getByText("⚡ 快速开始").first();
  await expect(quick).toBeVisible({ timeout: 20_000 });
  await quick.click({ timeout: 15_000 });
  await page.getByText(`${count}人`, { exact: false }).first().click({ timeout: 15_000 });
  // ⚠️「快速开始」弹窗只有「随机落座」/「取消」两个出口；
  //    只有点「取消」才进入**空座位**的手动落座界面。
  await page.getByRole("button", { name: "取消" }).first().click({ timeout: 15_000 });
  await expect(page.getByText("⚡ 快速开始").first()).toBeVisible({ timeout: 15_000 });
}

/** 逐位真实点击落座：选角色卡 → 点座位圆圈；每位最多重试 4 次 */
async function assignCompReal(page: Page, comp: string[]) {
  for (let i = 0; i < comp.length; i++) {
    const rid = comp[i];
    const want = await roleCardName(page, rid);
    expect(want, `❌ 角色卡 ${rid} 读不出中文名（真值表/卡片渲染异常）`).not.toBe("");
    for (let attempt = 0; attempt < 4; attempt++) {
      const cur = await seatTextOf(page, i);
      if (cur.includes(want)) break;
      if (!cur.endsWith("空")) await clickSeatReal(page, i); // 先腾空
      await page
        .locator(`button[data-role-id="${rid}"]`)
        .first()
        .click({ timeout: 15_000 });
      await clickSeatReal(page, i);
    }
    expect(
      await seatTextOf(page, i),
      `❌ ${i + 1}号 未落座【${want}】—— 真实鼠标点击落座失效`
    ).toContain(want);
  }
}

/** 分发核对 → 入夜（全部真实点击） */
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

  // 阵容不符（如配比错误）→ 弹窗「仍然分发&核对身份」；本文件阵容都是合法的，
  // 若这里出现说明 compFor 构造错了（要吵，不许静默点过去）
  //
  // ⚠️⚠️ 2026-09-22 修复**竞态**：该弹窗**异步出现**，而原实现用
  //   `await force.isVisible({ timeout: 2500 })` 判断 —— **`isVisible()` 不会等待**
  //   （`timeout` 对即时查询无效）⇒ 弹窗稍晚出现就会**漏判**
  //   ⇒ 本该「吵」的负向断言变成**静默通过**（假绿）。
  //   ✅ 改用共享夹具 `waitForEither`：同时轮询「仍然分发」与「确认无误…入夜」，
  //      只要前者出现过就报红。
  const force = page
    .locator("button")
    .filter({ hasText: /仍然分发&核对身份/ })
    .first();
  const enterNight = page
    .locator("button")
    .filter({ hasText: /确认无误[\s\S]*入夜/ })
    .first();
  const which = await waitForEither(force, enterNight, 15_000);
  expect(
    which,
    "❌ 出现「仍然分发&核对身份」弹窗 —— 说明本文件构造的阵容配比不合法（compFor 有误）"
  ).not.toBe("a");

  await expect(
    enterNight,
    "❌ 找不到「确认无误，入夜」——可能因缺少恶魔/配比不符而禁用"
  ).toBeVisible({ timeout: 20_000 });
  await enterNight.click({ timeout: 15_000 });
}

/** 一个角色的完整 L4 往返：配置 → 落座 → 入夜 → 读状态断言 */
async function perRoleFlow(page: Page, roleId: string) {
  const { count, comp } = compFor(roleId);
  /** 目标角色在阵容里的**落座位**（爪牙/恶魔刻意排在末尾，不是 0 号） */
  const idx = comp.indexOf(roleId);
  expect(
    idx,
    "❌ compFor 没把目标角色放进阵容（真值表/阵营划分有误）"
  ).toBeGreaterThanOrEqual(0);

  // ⚠️ 同一 test 内连跑多局：localStorage 跨 `goto` 复用 ⇒
  //    上一局快照会被当成「恢复中的对局」直接恢复 ⇒ 拿不到配置页（静默偏航）。
  //    每局开头清 localStorage（**清的是测试上下文，不是生产代码**）。
  await page.goto("/", { waitUntil: "domcontentloaded" }).catch(() => undefined);
  await page
    .evaluate(() => {
      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
    })
    .catch(() => undefined);

  await enterConfigManual(page, SNV, count);
  await assignCompReal(page, comp);
  await confirmAndEnterNight(page);

  const snap = await waitForSnapshot(
    page,
    (s) => seatsOf(s).length === count && seatsOf(s).every((x: any) => x.role?.id),
    25_000
  );
  expect(
    snap,
    `❌ [${roleId}] 入夜后快照不可读/不完整 —— 状态没落库`
  ).not.toBeNull();

  const seats = seatsOf(snap);
  expect(
    seats[idx]?.role?.id,
    `❌ [${roleId}] ${idx + 1} 号座位快照里的角色不是它（UI 显示 ≠ 状态落库）\n` +
      `实际 ${JSON.stringify(seats.map((s: any) => s.role?.id))}`
  ).toBe(roleId);
  expect(
    seats[idx]?.role?.type,
    `❌ [${roleId}] 快照里的阵营与**独立真值**不一致`
  ).toBe(TYPE[roleId]);
  expect(seats.length, `❌ [${roleId}] 座位数应为 ${count}`).toBe(count);
  expect(
    String(snap?.gamePhase ?? ""),
    `❌ [${roleId}] gamePhase 未推进`
  ).toMatch(/^(firstNight|night|dusk|day)$/);
  expect(
    Number(snap?.nightCount ?? 0),
    `❌ [${roleId}] nightCount 必须 ≥ 1`
  ).toBeGreaterThanOrEqual(1);
}

// ══════════════════════════════════════════════════════════════════════
test.describe("L4 · 逐角色真实点击流（梦殒春宵 25 角色）", () => {
  /** 自证：名册与阵营划分必须恰好 25 个（少一个就有角色没被覆盖） */
  test("⓪ 自证：真值表覆盖 25 角色，且四阵营划分无遗漏", () => {
    expect(ROSTER.length, "❌ 梦殒春宵应为 25 个角色").toBe(25);
    expect(
      TOWN.length + OUTSIDER.length + MINION.length + DEMON.length,
      "❌ 四阵营划分漏了角色"
    ).toBe(25);
    expect([TOWN.length, OUTSIDER.length, MINION.length, DEMON.length]).toEqual([
      13, 4, 4, 4,
    ]);
    // 反向对照：默认填充角色必须真的存在且阵营正确（否则 compFor 会静默造错阵容）
    for (const t of FILL_T) {
      expect(TYPE[t], `❌ 填充镇民 ${t} 不在真值表里`).toBe("townsfolk");
    }
    expect(TYPE[FILL_M], "❌ 填充爪牙必须存在").toBe("minion");
    expect(TYPE[FILL_D], "❌ 填充恶魔必须存在").toBe("demon");
  });

  const chunks: string[][] = [];
  for (let i = 0; i < ROSTER.length; i += 7) {
    chunks.push(ROSTER.slice(i, i + 7));
  }
  chunks.forEach((group, gi) => {
    test(`⑦-${gi + 1} 真实点击落座 + 入夜：${group.join(" / ")}`, async ({ page }) => {
      test.setTimeout(600_000);
      const failed: string[] = [];
      for (const roleId of group) {
        try {
          await perRoleFlow(page, roleId);
        } catch (e: any) {
          failed.push(roleId + " ⇒ " + String(e?.message ?? e).split("\n")[0]);
        }
      }
      expect(
        failed,
        "❌ 以下角色在真实点击流里失败（前 1 条错误）：\n  " + failed.join("\n  ")
      ).toEqual([]);
    });
  });
});
