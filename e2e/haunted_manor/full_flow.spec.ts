import { expect, test } from "@playwright/test";
import {
  advanceNightFast,
  advanceNightToDay,
  completeDuskEnterNight,
  readNightQueue,
  readSnapshot,
  resolveCharades,
  waitForSnapshot,
} from "../helpers/scriptFlow";

/**
 * L4（E2E）· 凶宅魅影（haunted_manor，21 角色）+ 无上愉悦（high_pleasure，16 角色）
 * ==================================================================
 * ⚠️ 为什么必须有这一层：L1/L2/L3/L5 全在 Node / jsdom 里跑，证明不了
 *   「说书人在**真实浏览器**里点得动、点完之后**状态真的落库**」。
 *
 * ✅ 断言分两类，**以第二类为主**：
 *   ① 交互层：落座点得上 / 能撤销 / 队列渲染得出（DOM）
 *   ② 状态层：读 `localStorage["clocktower_current_snapshot"]` 的
 *      **状态字段**（`role.id` / `role.type` / 阵营配额 / `isDead` /
 *      `isCursed` / `statusEffects[].type` / `gamePhase` / `nightCount`），
 *      **绝不用文案代替状态**（规范 §0 硬门槛）。
 *
 * ── 阵容怎么变成「确定」的（本轮实测出的关键手法）──────────────
 *   7 人局只能坐 7 个角色，靠「随机落座」抽不到想测的角色就断言不了状态。
 *   实测发现 `⚡快速开始 → 选人数` 弹窗**会先展示这一把随机抽到的阵容预览**
 *   （镇民 5 人逐个列名 + 爪牙/恶魔），并且弹窗里有 **「🔄 刷新 / 换一批」**
 *   可以重抽。⇒ 本文件用 `rerollUntil()` 在**真实 UI** 上重抽到目标角色
 *   （如「女巫」「投毒者」「小恶魔」）再落座，从而让「能选目标 / 能确认 /
 *   状态真的落库」三条判据都能**确定性**断言。
 *   实测：预览里出现的阵容与 `🎲随机落座` 之后的座位**逐位一致**。
 *
 * ── 覆盖策略（与罂粟花开 / 窃窃私语同口径，且写明卡点）────────
 *   · 判据1「能唤醒」：座位上限 7 ⇒ 一局只能覆盖 7 个角色。本文件覆盖
 *     首夜型 / 其他夜型 / 被动型 / 爪牙 / 恶魔 五类代表；**其余角色的
 *     「今晚是否入队」由 L2c + L3 用 `generateDynamicNightQueue`
 *     逐角色真实队列断言覆盖**（同一份引擎代码，非管道模拟）。
 *   · 判据2/3/4「能选目标 / 能确认 / 能撤销」：两局里真的点了
 *     0 目标 / 1 目标两种弹窗，并断言落库字段；撤销走「点已落座的角色卡」。
 *   · ⚠️ **已知卡点（本轮实测，未确证是否为生产缺陷）**：
 *     准备阶段点**座位序号圆圈**不会落座/取消落座（本文件改用
 *     「点已落座角色卡」撤销，这条路径实测有效）。详见交付报告。
 *     逐角色深度点击流（每人单独一局）单次 >2 分钟，见 `e2e/wip/`。
 *
 * ⚠️ 端口固定 3100（本机 3000/3001 常被残留进程占用，可能返回别的 App）。
 *   由外部先起：`NODE_OPTIONS="" PORT=3100 npx next dev -p 3100`。
 */

const HM = "凶宅魅影";
const HP = "无上愉悦";

/** roleId → app/data 中文名（DOM 与队列文案断言用） */
const NAME: Record<string, string> = {
  balloonist: "气球驾驶员",
  mathematician: "数学家",
  clockmaker: "钟表匠",
  seamstress: "女裁缝",
  town_crier: "城镇公告员",
  juggler: "杂耍艺人",
  philosopher: "哲学家",
  artist: "艺术家",
  courtier: "侍臣",
  choir_boy: "唱诗男孩",
  king: "国王",
  mutant: "畸形秀演员",
  barber: "理发师",
  fool: "弄臣",
  saint: "圣徒",
  witch: "女巫",
  godfather: "教父",
  assassin: "刺客",
  devils_advocate: "魔鬼代言人",
  no_dashii: "诺-达",
  fang_gu: "方古",
  pukka: "普卡",
  washerwoman: "洗衣妇",
  investigator: "调查员",
  chef: "厨师",
  librarian: "图书管理员",
  empath: "共情者",
  fortune_teller: "占卜师",
  monk: "僧侣",
  ravenkeeper: "守鸦人",
  butler: "管家",
  drunk: "酒鬼",
  recluse: "陌客",
  poisoner: "投毒者",
  scarlet_woman: "红唇女郎",
  baron: "男爵",
  imp: "小恶魔",
  zombuul: "僵怖",
};

const HM_ROSTER = [
  "balloonist", "mathematician", "clockmaker", "seamstress", "juggler",
  "philosopher", "artist", "town_crier", "courtier", "choir_boy",
  // 👑 国王：**不在** `app/data.ts::haunted_manor.roleIds` 里（刻意如此 —— 见下方说明），
  //    但发牌结果**允许**出现它：官方【唱诗男孩】标记 `[+国王]`
  //    ⇒ 设置阶段把国王加入并替换掉一名其他镇民
  //      （`utils/expansionMechanics::injectChoirboyKing`，由 `quickStartGenerator` 调用）。
  //    ⚠️ 不要因为这里需要它，就把它写进剧本 `roleIds` ——
  //      `quickStartGenerator` 的取牌池 = `roleIds` 过滤，
  //      写进去会允许**随机发出「没有唱诗男孩的国王」**（另有护栏
  //      `death_trigger_contract ⑬` 守着这件事）。
  "king",
  "mutant", "barber", "fool", "saint", "witch", "godfather", "assassin",
  "devils_advocate", "no_dashii", "fang_gu", "pukka",
];
const HP_ROSTER = [
  "washerwoman", "investigator", "chef", "librarian", "empath",
  "fortune_teller", "monk", "ravenkeeper", "butler", "drunk", "recluse",
  "poisoner", "scarlet_woman", "baron", "imp", "zombuul",
];
/** 阵营真值（独立于 app/data 的硬编码，防止「两边一起改」） */
const TYPE: Record<string, string> = {
  balloonist: "townsfolk", mathematician: "townsfolk", clockmaker: "townsfolk",
  seamstress: "townsfolk", town_crier: "townsfolk", juggler: "townsfolk",
  philosopher: "townsfolk", artist: "townsfolk", courtier: "townsfolk",
  choir_boy: "townsfolk", king: "townsfolk", mutant: "outsider", barber: "outsider",
  fool: "townsfolk", saint: "outsider", witch: "minion", godfather: "minion",
  assassin: "minion", devils_advocate: "minion", no_dashii: "demon",
  fang_gu: "demon", pukka: "demon", washerwoman: "townsfolk",
  investigator: "townsfolk", chef: "townsfolk", librarian: "townsfolk",
  empath: "townsfolk", fortune_teller: "townsfolk", monk: "townsfolk",
  ravenkeeper: "townsfolk", butler: "outsider", drunk: "outsider",
  recluse: "outsider", poisoner: "minion", scarlet_woman: "minion",
  baron: "minion", imp: "demon", zombuul: "demon",
};
/** 7 人局标准配比（本脚本两个剧本都是 7-15 / 5-8 人，7 人 = 5T/0O/1M/1D） */
const SEVEN = { townsfolk: 5, outsider: 0, minion: 1, demon: 1 };

// ─────────────────────────── helpers ───────────────────────────

/** 清掉上一局的残留快照，回到「请选择剧本」首页 */
async function resetToHome(page: any) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    try {
      localStorage.clear();
    } catch {}
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
}

/** 进配置页 → 快速开始 → 选人数；**停在人数弹窗（阵容预览）上** */
async function openCountModal(page: any, scriptName: string, count: number) {
  await page
    .getByRole("button", { name: new RegExp(scriptName) })
    .last()
    .click({ timeout: 15_000 });
  const quick = page.getByText("⚡ 快速开始").first();
  await expect(quick).toBeVisible({ timeout: 20_000 });
  await quick.click({ timeout: 15_000 });
  await page
    .getByText(`${count}人`, { exact: false })
    .first()
    .click({ timeout: 15_000 });
  await page.waitForTimeout(300);
}

const dialog = (page: any) => page.locator('[role="dialog"]').last();

/**
 * 在人数弹窗里重抽，直到**阵容预览**满足条件。
 * ⚠️ 返回最终预览文本；调用方必须断言条件成立（失败要吵，不许静默降级）。
 */
async function rerollUntil(
  page: any,
  cond: (t: string) => boolean,
  maxTries = 80
): Promise<string> {
  const read = async () =>
    (await dialog(page).innerText().catch(() => "")).replace(/\s+/g, "");
  const reroll = page.locator("button").filter({ hasText: /换一批|刷新/ }).first();
  let text = await read();
  for (let i = 0; i < maxTries; i++) {
    if (cond(text)) return text;
    if (!(await reroll.count())) break;
    await reroll.click({ timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(120);
    text = await read();
  }
  return text;
}

/** 落座（用预览里这一把的随机阵容）→ 配置伪装 → 分发核对 → 入夜 */
async function dealAndEnterNight(page: any) {
  await page.getByText("随机落座").first().click({ timeout: 15_000 });
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
  return waitForSnapshot(
    page,
    (s) => seatsOf(s).length === 7 && seatsOf(s).every((x: any) => x.role?.id),
    20_000
  );
}

function seatsOf(snap: any): any[] {
  return Array.isArray(snap?.seats) ? snap.seats : [];
}

/** 快照里「装上了」的状态（状态层判据，不看文案） */
function armedStates(snap: any) {
  const seats = seatsOf(snap);
  return {
    dead: seats.filter((s: any) => s.isDead === true).length,
    cursed: seats.filter((s: any) => s.isCursed === true).length,
    poisoned: seats.filter((s: any) =>
      (s.statusEffects ?? []).some((e: any) => e?.type === "poisoned")
    ).length,
  };
}

/** 快照里的阵营配额 */
function campCounts(snap: any) {
  const out: Record<string, number> = {
    townsfolk: 0, outsider: 0, minion: 0, demon: 0,
  };
  for (const s of seatsOf(snap)) {
    const t = String(s.role?.type ?? "");
    if (t in out) out[t]++;
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════
test.describe("L4 · 凶宅魅影：真实点击流必须产生真实状态", () => {
  test("① 落座 7 人 ⇒ 快照 role.id / type 逐位 + 阵营配额 5/0/1/1；点已落座角色卡可撤销", async ({
    page,
  }) => {
    await resetToHome(page);
    await openCountModal(page, HM, 7);
    await page.getByText("随机落座").first().click({ timeout: 15_000 });
    await page.waitForTimeout(1000);

    // ⭐ 判据4「能撤销」：点**已落座的角色卡**（title = 「已在 N号座位落座，点击取消落座」）
    //    ⚠️ 不能用「第 1 个带 ✓ 的卡」去推座位号 —— 角色卡是按阵营分组的，
    //       ✓ 卡的顺序与座位序无关（踩过：断言座位 1，实际取消的是别的座位）。
    const seatText = async (i: number) =>
      ((await page
        .locator(`[data-seat-id="${i}"]`)
        .first()
        .textContent()) ?? "").replace(/\s+/g, " ");
    // 座位节点（SeatNode）里的文本 = 座位号 + 角色名；空座时只有座位号。
    // ⚠️ 这里**不能**断言「含『空』字」——座位圆圈从不渲染「空」字，
    //    那样 `not.toContain("空")` 恒真 = 假过（踩过）。
    expect(
      await page.locator("[data-seat-id]").count(),
      "❌ 圆桌上找不到座位节点（[data-seat-id] 缺失，说明 SeatNode 没渲染）"
    ).toBeGreaterThanOrEqual(7);
    /** 撤销前的 ✓ 角色卡总数（用于**增量**断言，见下方说明） */
    const chipSel = "button[data-role-id]";
    const checkedBefore = await page.locator(chipSel).filter({ hasText: /✓/ }).count();
    const takenChip = page
      .locator("button[data-role-id]")
      .filter({ hasText: /✓/ })
      .first();
    expect(
      await takenChip.count(),
      "❌ 落座后找不到任何带 ✓ 的角色卡（UI 与状态不一致）"
    ).toBeGreaterThan(0);
    const chipTitle = (await takenChip.getAttribute("title")) ?? "";
    const seatNo = Number((chipTitle.match(/(\d+)\s*号座位/) ?? [])[1] ?? 0);
    expect(
      seatNo,
      `❌ 已落座角色卡的 title 里读不到座位号（实际 title="${chipTitle}"）`
    ).toBeGreaterThanOrEqual(1);
    const chipRoleId = (await takenChip.getAttribute("data-role-id")) ?? "";
    const chipRoleName = NAME[chipRoleId] ?? "";
    expect(
      chipRoleName,
      `❌ 角色卡 data-role-id="${chipRoleId}" 不在本文件的真值表里`
    ).not.toBe("");
    const before0 = await seatText(seatNo - 1);
    expect(
      before0,
      `❌ ${seatNo} 号座位本该显示【${chipRoleName}】，实际 DOM 显示「${before0}」`
    ).toContain(chipRoleName);


    /**
     * ⭐ 撤销动作：点击**已落座的角色卡**（`onClick` → `handleSeatClick(该座位)`）
     *
     * ⚠️ 必须用**按 roleId 钉死**的定位器，不能直接 `takenChip.click()`：
     *   `takenChip` 是 `<chipSel>.filter(/✓/).first()`，而 Locator 在每次使用时会**重新解析**。
     *   若在读完 `title` 与点击之间卡片列表发生重排，`.first()` 可能指向**另一张卡**
     *   ⇒ 撤销落到别的座位，而断言的那个座位原封不动（假红）。
     *   按 `data-role-id`（角色卡唯一）定位则不会漂移。
     */
    await page
      .locator(`${chipSel}[data-role-id="${chipRoleId}"]`)
      .first()
      .click({ timeout: 15_000 });
    await page.waitForTimeout(500);
    /**
     * ⚠️ 用**有限轮询**等待座位文本更新，不要读一次就断言。
     *   圆桌座位节点是 framer-motion 组件（`+ ScaleLayout` 缩放），
     *   与右侧角色卡列表的普通 DOM 更新**不同步**（卡片先变、座位后变）；
     *   读一次就断言会在这个瞬时窗口里**假红**。
     *   ⚠️ `seatText` 是 **async 且接收座位序号**（它自己做 locator）——
     *      切勿把 `textContent()` 的结果传进去（会得到 Promise，`.includes` 报 TypeError）。
     */
    const checkedAfter = await page.locator(chipSel).filter({ hasText: /✓/ }).count();
    let lastSeatText = await seatText(seatNo - 1);
    const __deadline = Date.now() + 8_000;
    while (lastSeatText.includes(chipRoleName) && Date.now() < __deadline) {
      await page.waitForTimeout(200);
      lastSeatText = await seatText(seatNo - 1);
    }
    expect(
      lastSeatText,
      `❌ 点已落座角色卡后 ${seatNo} 号座位仍显示【${chipRoleName}】（撤销没生效）：${lastSeatText}｜✓ 卡 ${checkedBefore}→${checkedAfter}`
    ).not.toContain(chipRoleName);
    expect(
      await page
        .locator(`button[data-role-id="${chipRoleId}"]`)
        .filter({ hasText: /✓/ })
        .count(),
      `❌ 撤销后角色卡【${chipRoleName}】仍然带 ✓（撤销没生效）`
    ).toBe(0);
    /**
     * ⚠️⚠️ 判据必须是**增量**，不能硬编码「7 → 6」（2026-09-21 修正）。
     *
     * 原写法 `expect(✓ 总数).toBe(6)` 隐含「7 个座位 ⇒ 7 张 ✓ 卡」，
     * 但**注入角色没有角色卡**：官方【唱诗男孩】标记 `[+国王]`
     * ⇒ 设置阶段把国王加入（`injectChoirboyKing`，`quickStartGenerator` 调用）；
     * 而角色卡面板只渲染 `script.roleIds` 里的 21 个角色，**不含 king**
     * ⇒ 本局实坐 7 席，✓ 卡只有 **6** 张（国王那席无卡）⇒ 撤销后是 5，断言 `toBe(6)` 必然假红。
     *
     * 🔬 实测证据（临时诊断日志）：
     *   `[DBG before-click] all=21 checked=6`
     *   `[DBG after-click]  all=21 checked=5`
     *
     * ✅ 正确判据：撤销**恰好**让 ✓ 总数减 1（与「本局坐了几个可点卡的角色」解耦）。
     */
    expect(
      checkedAfter,
      "❌ 撤销后 ✓ 角色卡数量没有减少（应恰好 -1；" +
        "撤销前 " + checkedBefore + " → 撤销后 " + checkedAfter + "）"
    ).toBe(checkedBefore - 1);

    // 重新随机落座，继续做入夜断言
    await page.getByText("⚡ 快速开始").first().click({ timeout: 15_000 });
    await page.getByText("7人", { exact: false }).first().click({ timeout: 15_000 });
    await page.waitForTimeout(300);
    const snap = await dealAndEnterNight(page);
    expect(snap, "❌ 入夜后 localStorage 里没有快照 —— 状态没被持久化").not.toBeNull();

    const got = seatsOf(snap).map((s: any) => s.role?.id);
    expect(got.length, "❌ 座位数应为 7").toBe(7);
    expect(
      got.every((id: string) => HM_ROSTER.includes(id)),
      `❌ 凶宅魅影发出了不属于本剧本的角色：${JSON.stringify(got)}`
    ).toBe(true);
    expect(
      seatsOf(snap).map((s: any) => s.role?.type),
      `❌ 快照里的阵营与独立真值不一致：${JSON.stringify(got)}`
    ).toEqual(got.map((id: string) => TYPE[id]));
    expect(
      campCounts(snap),
      "❌ 7 人局阵营配额不是 5/0/1/1（发牌与人数预设不一致）"
    ).toEqual(SEVEN);
  });

  test("② 入夜后队列：首夜角色必在、其他夜角色必不在、爪牙/恶魔互认必在", async ({
    page,
  }) => {
    await resetToHome(page);
    await openCountModal(page, HM, 7);
    // 确定性阵容：爪牙=女巫（首夜第 52 位）、镇民含城镇公告员（**非首夜**）
    // 同时排除「选角色型」夜步（哲学家 / 侍臣）以免自动推进被卡住
    const preview = await rerollUntil(
      page,
      (t) =>
        t.includes(NAME.witch) &&
        t.includes(NAME.town_crier) &&
        !t.includes(NAME.philosopher) &&
        !t.includes(NAME.courtier)
    );
    expect(
      preview.includes(NAME.witch),
      `❌ 重抽 80 次仍未抽到【女巫】的阵容预览：${preview.slice(-200)}`
    ).toBe(true);
    expect(
      preview.includes(NAME.town_crier),
      `❌ 重抽 80 次仍未抽到【城镇公告员】：${preview.slice(-200)}`
    ).toBe(true);

    const snap = await dealAndEnterNight(page);
    expect(snap, "❌ 入夜后快照不可读").not.toBeNull();

    const phase = String(snap?.gamePhase ?? "");
    expect(
      ["firstNight", "night", "dusk", "day"].includes(phase),
      `❌ gamePhase="${phase}" —— 入夜后阶段没有推进`
    ).toBe(true);
    expect(Number(snap?.nightCount ?? 0), "❌ nightCount 必须 ≥ 1").toBeGreaterThanOrEqual(1);

    // ⭐ 判据1「能唤醒」：读真实页面渲染的唤醒队列
    const queue: string[] = await readNightQueue(page, 20_000);
    expect(queue.length, "❌ 夜间行动顺序为空 —— 没有任何角色被唤醒").toBeGreaterThan(0);
    const queueText = queue.join("\n");

    expect(
      queueText,
      `❌ 首夜应唤醒【女巫】，但队列里没有\n队列：${queueText.slice(0, 400)}`
    ).toContain(NAME.witch);
    expect(
      queueText,
      `❌ 【城镇公告员】是非首夜角色，首夜不应出现在唤醒队列\n队列：${queueText.slice(0, 400)}`
    ).not.toContain(NAME.town_crier);
    expect(queueText, "❌ 首夜队列缺少「爪牙互认」步骤").toContain("爪牙互认");
    expect(queueText, "❌ 首夜队列缺少「恶魔互认」步骤").toContain("恶魔互认");
  });

  test("③ 推进整夜 ⇒ 白天 · 首夜零死亡 · 女巫诅咒真的落库（isCursed）", async ({
    page,
  }) => {
    await resetToHome(page);
    await openCountModal(page, HM, 7);
    const preview = await rerollUntil(
      page,
      (t) =>
        t.includes(NAME.witch) &&
        !t.includes(NAME.philosopher) &&
        !t.includes(NAME.courtier)
    );
    expect(
      preview.includes(NAME.witch),
      `❌ 重抽 80 次仍未抽到【女巫】：${preview.slice(-200)}`
    ).toBe(true);

    await dealAndEnterNight(page);
    const result = await advanceNightFast(page);
    expect(
      result,
      `❌ 夜间推进未到白天（返回 ${result}；已排除选角色型夜步，不应熔断）`
    ).toBe("day");

    const after = await waitForSnapshot(page, (s) => s?.gamePhase === "day", 15_000);
    expect(after, "❌ 进入白天后快照仍不可读").not.toBeNull();
    expect(after?.gamePhase, "❌ gamePhase 仍是夜间 —— 只有 UI 变了").toBe("day");

    const armed = armedStates(after);
    // ⭐ 凶宅魅影三个恶魔（普卡/方古/诺-达）首夜都不杀人 ⇒ 首夜结束必无死亡
    expect(
      armed.dead,
      `❌ 首夜不应有人死亡，实际 ${armed.dead} 人（${seatsOf(after)
        .filter((s: any) => s.isDead === true)
        .map((s: any) => s.role?.id)
        .join(",")}）`
    ).toBe(0);
    // ⭐ 判据2/3「能选目标 + 能确认 ⇒ 状态真的落库」：女巫首夜必选 1 人 ⇒ 恰好 1 人 isCursed
    expect(
      armed.cursed,
      `❌ 女巫选完目标后，快照里应恰好 1 个座位 isCursed=true，实际 ${armed.cursed}`
    ).toBe(1);

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
test.describe("L4 · 无上愉悦：第二剧本必须可独立跑通", () => {
  test("④ 无上愉悦 7 人局入夜 ⇒ 快照落库 · 全部本剧本角色 · 队列含投毒者", async ({
    page,
  }) => {
    await resetToHome(page);
    await openCountModal(page, HP, 7);
    // 爪牙固定要投毒者（首夜第 30 位，必选 1 人）⇒ 才能断言 poisoned 落库
    const preview = await rerollUntil(page, (t) => t.includes(NAME.poisoner));
    expect(
      preview.includes(NAME.poisoner),
      `❌ 重抽 80 次仍未抽到【投毒者】：${preview.slice(-200)}`
    ).toBe(true);

    const snap = await dealAndEnterNight(page);
    expect(snap, "❌ 无上愉悦入夜后快照不可读").not.toBeNull();

    const unassigned = seatsOf(snap).filter((s: any) => !s.role?.id);
    expect(unassigned.length, "❌ 有座位没有 role.id（UI 显示已分配 ≠ 状态落库）").toBe(0);
    expect(
      ["firstNight", "night", "dusk", "day"].includes(String(snap?.gamePhase ?? "")),
      `❌ 无上愉悦 gamePhase="${snap?.gamePhase}" 未推进`
    ).toBe(true);

    const got = seatsOf(snap).map((s: any) => s.role?.id);
    for (const id of got) {
      expect(
        HP_ROSTER.includes(id),
        `❌ 无上愉悦发出了不属于本剧本的角色：${id}（全部：${JSON.stringify(got)}）`
      ).toBe(true);
    }
    expect(campCounts(snap), "❌ 7 人局阵营配额不是 5/0/1/1").toEqual(SEVEN);

    const queue = await readNightQueue(page, 20_000);
    expect(queue.length, "❌ 无上愉悦夜间队列为空").toBeGreaterThan(0);
    const queueText = queue.join("\n");
    expect(
      queueText,
      `❌ 首夜应唤醒【投毒者】\n队列：${queueText.slice(0, 400)}`
    ).toContain(NAME.poisoner);
    // 首夜必有的两个系统步骤
    expect(queueText, "❌ 首夜队列缺少「爪牙互认」步骤").toContain("爪牙互认");
    expect(queueText, "❌ 首夜队列缺少「恶魔互认」步骤").toContain("恶魔互认");
  });

  test("⑤ 推进整夜 ⇒ 白天 · 首夜零死亡 · 投毒者的 poisoned 状态真的落库", async ({
    page,
  }) => {
    await resetToHome(page);
    await openCountModal(page, HP, 7);
    const preview = await rerollUntil(page, (t) => t.includes(NAME.poisoner));
    expect(
      preview.includes(NAME.poisoner),
      `❌ 重抽 80 次仍未抽到【投毒者】：${preview.slice(-200)}`
    ).toBe(true);

    await dealAndEnterNight(page);
    const result = await advanceNightFast(page);
    expect(result, `❌ 无上愉悦夜间推进未到白天（返回 ${result}）`).toBe("day");

    const after = await waitForSnapshot(page, (s) => s?.gamePhase === "day", 15_000);
    expect(after, "❌ 进入白天后快照仍不可读").not.toBeNull();
    expect(after?.gamePhase, "❌ gamePhase 仍是夜间 —— 只有 UI 变了").toBe("day");

    const armed = armedStates(after);
    // 无上愉悦两个恶魔（小恶魔 otherNightPriority=45 / 僵怖 46）首夜都不行动
    expect(
      armed.dead,
      `❌ 首夜不应有人死亡（恶魔首夜不行动），实际 ${armed.dead} 人`
    ).toBe(0);
    expect(
      armed.poisoned,
      `❌ 投毒者选完目标后，快照里应恰好 1 个座位带 statusEffects.poisoned，实际 ${armed.poisoned}`
    ).toBe(1);
    for (const s of seatsOf(after)) {
      expect(typeof s.isDead, `❌ ${s.id + 1}号 isDead 不是布尔`).toBe("boolean");
    }
  });

  test("⑥ 推进到第 2 夜 ⇒ 小恶魔杀人真的落库（恰好 1 人死亡 + 记录死亡来源）", async ({
    page,
  }) => {
    await resetToHome(page);
    await openCountModal(page, HP, 7);
    // 恶魔固定要小恶魔：首夜不行动、**第二夜必杀 1 人**（僵怖第二夜可能选择不杀）
    const preview = await rerollUntil(page, (t) => t.includes(NAME.imp));
    expect(
      preview.includes(NAME.imp),
      `❌ 重抽 80 次仍未抽到【小恶魔】：${preview.slice(-200)}`
    ).toBe(true);

    await dealAndEnterNight(page);
    const r1 = await advanceNightFast(page);
    expect(r1, `❌ 首夜推进未到白天（返回 ${r1}）`).toBe("day");
    const day1 = await waitForSnapshot(page, (s) => s?.gamePhase === "day", 15_000);
    expect(day1, "❌ 白天快照不可读").not.toBeNull();
    expect(armedStates(day1).dead, "❌ 首夜结束后不应有死亡").toBe(0);

    const dusk = await completeDuskEnterNight(page);
    expect(dusk, `❌ 未能从白天进入第 2 夜（返回 ${dusk}）`).toBe("night");

    const reachedDay2 = await advanceNightToDay(page);
    expect(reachedDay2, "❌ 第 2 夜未能推进到第 2 天").toBe(true);

    const day2 = await waitForSnapshot(
      page,
      (s) => s?.gamePhase === "day" && Number(s?.nightCount ?? 0) >= 2,
      20_000
    );
    expect(day2, "❌ 第 2 天快照不可读").not.toBeNull();
    expect(Number(day2?.nightCount ?? 0), "❌ nightCount 未推进到 2").toBeGreaterThanOrEqual(2);

    // ⭐⭐ L4 最深的一条：小恶魔点了确认 ⇒ 快照里真的有人 isDead
    const armed = armedStates(day2);
    expect(
      armed.dead,
      `❌ 第 2 夜小恶魔应杀死恰好 1 人，实际 ${armed.dead} 人\n` +
        `死亡座位：${JSON.stringify(
          seatsOf(day2)
            .filter((s: any) => s.isDead === true)
            .map((s: any) => ({ seat: s.id + 1, role: s.role?.id }))
        )}`
    ).toBe(1);
    const deadSeat = seatsOf(day2).find((s: any) => s.isDead === true);
    expect(
      deadSeat?.deathSource !== undefined ||
        deadSeat?.deathAtNight !== undefined ||
        deadSeat?.killedBy !== undefined,
      `❌ 死亡座位没有记录任何死亡来源字段：${JSON.stringify(Object.keys(deadSeat ?? {}))}`
    ).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════
test.describe("L4 · 快照完整性（与角色无关的结构契约）", () => {
  test("⑦ 快照刷新后不丢，且角色分配 / 阵营字段都不变", async ({ page }) => {
    await resetToHome(page);
    await openCountModal(page, HM, 7);
    await dealAndEnterNight(page);

    const first = await waitForSnapshot(page, (s) => seatsOf(s).length === 7, 20_000);
    expect(first, "❌ 凶宅魅影快照不可读").not.toBeNull();
    expect(seatsOf(first).length, "❌ 座位数应为 7").toBe(7);

    // 刷新后快照必须仍在（说明真的持久化了，而不是只活在内存里）
    await page.reload({ waitUntil: "domcontentloaded" });
    const second = await readSnapshot(page);
    expect(second, "❌ 刷新后快照丢失 —— 状态只存在内存里").not.toBeNull();
    expect(seatsOf(second).length, "❌ 刷新后座位数变了").toBe(seatsOf(first).length);

    const rolesBefore = seatsOf(first).map((s: any) => s.role?.id);
    const rolesAfter = seatsOf(second).map((s: any) => s.role?.id);
    expect(rolesAfter, "❌ 刷新后角色分配变了 —— 持久化不完整").toEqual(rolesBefore);
    for (const s of seatsOf(second)) {
      expect(s.role?.type, `❌ 刷新后 ${s.id + 1}号 的 role.type 丢失`).toBeTruthy();
      expect(typeof s.isDead, `❌ 刷新后 ${s.id + 1}号 isDead 不是布尔`).toBe("boolean");
    }
    expect(
      campCounts(second),
      "❌ 刷新后阵营配额变化（序列化丢字段）"
    ).toEqual(SEVEN);
  });
});
