import { expect, test, type Page } from "@playwright/test";
import {
  readSnapshot,
  resolveCharades,
  waitForEither,
  waitForSnapshot,
} from "../helpers/scriptFlow";

/**
 * L4（E2E）· **逐角色真实点击流** —— 孤儿角色 58 个（全标准对齐批次 2026-10-08）
 * ==================================================================
 * 孤儿角色不在任何内置剧本 ⇒ 必须走「🛠️ 自建剧本」构建器：
 *   首页「自建剧本」→ 构建器内逐个点选角色卡 → 「保存并立即开局」→
 *   手动落座（真实鼠标）→ 分发&核对 → 入夜 → 读快照断言状态落库。
 *
 * ── 判据（与 S&V per_role 同口径，绝不看文案代状态）─────────────────
 *   ① 快照 `role.id` 必须就是该角色（UI 显示 ≠ 状态落库的防线）
 *   ② `role.type` 与独立真值表 TYPE 一致
 *   ③ 座位数 = 该局人数；gamePhase 已推进；nightCount ≥ 1
 *   ④ 快照里每个座位都已发牌
 *
 * ── 🔴 king 跳过（铁律）─────────────────────────────────────────
 *   king 不得进剧本 roleIds（唱诗男孩 [+国王] 设置期注入，官方语义）。
 *   自建剧本 UI 若放 king 也违反该机制语义 ⇒ 本文件跳过 king（59-1=58）。
 *
 * ── 配比（STANDARD_COMPOSITIONS 只看数量）───────────────────────
 *   7 人 = 5T/0O/1M/1D ｜ 8 人 = 5T/1O/1M/1D
 *   镇民孤儿 → 7 人 ｜ 外来者孤儿 → 8 人 ｜ 爪牙 → 7 人 ｜ 恶魔 → 7 人
 *   ⚠️ kazali/summoner 等带 setup 语义标记的角色：校验只看数量，可过。
 *   ⚠️ summoner 官方「无恶魔在场」：本局仍带恶魔填充——数量校验通过，
 *      其「第三夜召唤」逻辑由说书人语义处理，不影响入夜。
 */

const TYPE: Record<string, string> = {
  // townsfolk（26 - king = 25）
  astrologer: "townsfolk", saint_townsfolk: "townsfolk", bard: "townsfolk",
  miner: "townsfolk", professor_female: "townsfolk", monk_female: "townsfolk",
  missionary: "townsfolk", alchemist: "townsfolk", magician: "townsfolk",
  half_ogre: "townsfolk", banshee: "townsfolk", villager: "townsfolk",
  princess: "townsfolk", priestess: "townsfolk", knight: "townsfolk",
  steward: "townsfolk", conjurer: "townsfolk", pilgrim: "townsfolk",
  noble: "townsfolk", amnesiac: "townsfolk", engineer: "townsfolk",
  fisherman: "townsfolk", ranger: "townsfolk", atheist: "townsfolk",
  cannibal: "townsfolk",
  // outsider（10）
  qutler: "outsider", acrobat: "outsider", damsel: "outsider", golem: "outsider",
  puzzlemaster: "outsider", zealot: "outsider", hatter: "outsider",
  ogre: "outsider", heretic: "outsider", hermit: "outsider",
  // minion（13）
  widow: "minion", organ_grinder: "minion", boffin: "minion",
  fearmonger: "minion", wizard: "minion", xaan: "minion", wraith: "minion",
  vizier: "minion", boomdandy: "minion", summoner: "minion", harpy: "minion",
  psychopath: "minion", shaman: "minion",
  // demon（10）
  leech: "demon", hadesia: "demon", riot: "demon", lord_of_typhon: "demon",
  kazali: "demon", lloam: "demon", saint_demon: "demon", titus: "demon",
  leviathan: "demon", liz: "demon",
  // 填充角色（⓪ 反向对照需要）
  clockmaker: "townsfolk", dreamer: "townsfolk", oracle: "townsfolk",
  artist: "townsfolk", sage: "townsfolk", juggler: "townsfolk",
  witch: "minion", no_dashii: "demon",
};

const ROSTER = Object.keys(TYPE);
const TOWN = ROSTER.filter((r) => TYPE[r] === "townsfolk");
const OUTSIDER = ROSTER.filter((r) => TYPE[r] === "outsider");
const MINION = ROSTER.filter((r) => TYPE[r] === "minion");
const DEMON = ROSTER.filter((r) => TYPE[r] === "demon");

/** 通用填充（S&V 同款防假红填充；孤儿局必然含内置角色做同伴） */
const FILL_T = ["clockmaker", "dreamer", "oracle", "artist", "sage", "juggler"];
const FILL_M = "witch";
const FILL_D = "no_dashii";

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

function seatCircleAt(page: Page, i: number) {
  return page.getByTitle(`${i + 1}号座位`).first();
}

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

/** 构建器内角色卡按 data-role-id 定位（构建器数据源存在简繁异体，文本定位不可靠——实测） */
async function pickRoleInBuilder(page: Page, rid: string, _name: string) {
  const btn = page
    .locator(`button[data-role-id="${rid}"]`)
    .first();
  await btn.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => undefined);
  await btn.click({ timeout: 10_000 });
}

async function roleCardName(page: Page, rid: string): Promise<string> {
  const card = page.locator(`button[data-role-id="${rid}"]`).first();
  const fromSpan = (
    (await card.locator("span").first().textContent().catch(() => "")) ?? ""
  ).trim();
  if (fromSpan) return fromSpan;
  const inner = ((await card.innerText().catch(() => "")) ?? "").trim();
  return inner.split("\n")[0].trim();
}

/**
 * 自建剧本流：首页「🛠️ 自建剧本」→ 构建器选齐阵容 → 「保存并立即开局」
 * → 落座界面（手动落座，非随机）。
 */
async function enterViaBuilder(page: Page, comp: string[]) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /自建剧本/ }).last()
    .click({ timeout: 15_000 });
  // ⭐ 显式等构建器标题可见——goto 后立即点击会落在**未水合**按钮上（handler
  //    未挂载 → 点击无反应 → 构建器不开 → 角色卡 15s 超时，首轮实测）。
  await expect(page.getByText("自建剧本（自定义角色库）").first()).toBeVisible({
    timeout: 15_000,
  });
  for (const rid of comp) {
    const name = NAME[rid];
    expect(name, `❌ NAME 表缺 ${rid} 的中文名`).toBeTruthy();
    await pickRoleInBuilder(page, rid, name!);
  }
  await page.getByText("保存并立即开局").first().click({ timeout: 15_000 });
}

/** 逐位真实点击落座（data-role-id 定位；座位文本因繁体数据源不作精确校验，
 *  「状态落库」由快照断言兜底——role.id 才是 L4 核心判据） */
async function assignCompReal(page: Page, comp: string[]) {
  for (let i = 0; i < comp.length; i++) {
    const rid = comp[i];
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = await seatTextOf(page, i);
      if (before && !before.endsWith("空")) {
        await clickSeatReal(page, i); // 重试时先腾空
      }
      await page
        .locator(`button[data-role-id="${rid}"]`)
        .first()
        .click({ timeout: 15_000 });
      await clickSeatReal(page, i);
      const after = await seatTextOf(page, i);
      if (after && !after.endsWith("空")) break;
    }
    const final = await seatTextOf(page, i);
    expect(
      final && !final.endsWith("空"),
      `❌ ${i + 1}号 未落座（角色卡点击 4 次后座位仍为空）`
    ).toBe(true);
  }
}

async function confirmAndEnterNight(page: Page) {
  await resolveCharades(page);
  const distribute = page
    .locator("button")
    .filter({ hasText: /分发&核对身份/ })
    .first();
  await expect(distribute).toBeVisible({ timeout: 20_000 });
  await distribute.click({ timeout: 15_000 });
  const force = page
    .locator("button")
    .filter({ hasText: /仍然分发&核对身份/ })
    .first();
  const enterNight = page
    .locator("button")
    .filter({ hasText: /确认无误[\s\S]*入夜/ })
    .first();
  const which = await waitForEither(force, enterNight, 15_000);
  // 孤儿阵容按数量校验应合法；若出现「仍然分发」说明 compFor 需要修正
  expect(which).not.toBe("a");
  await expect(enterNight).toBeVisible({ timeout: 20_000 });
  await enterNight.click({ timeout: 15_000 });
}

/** 一个孤儿角色的完整 L4 往返 */
async function perRoleFlow(page: Page, roleId: string) {
  const { count, comp } = compFor(roleId);
  const idx = comp.indexOf(roleId);
  expect(idx).toBeGreaterThanOrEqual(0);

  // ⭐ 清 localStorage（清的是测试上下文；goto 由 enterViaBuilder 统一做，
  //    此前双 goto 会让第二次 goto 把水合时序打乱——首轮实测）
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

  await enterViaBuilder(page, comp);
  await assignCompReal(page, comp);
  await confirmAndEnterNight(page);

  const snap = await waitForSnapshot(
    page,
    (s) => seatsOf(s).length === count && seatsOf(s).every((x: any) => x.role?.id),
    25_000
  );
  expect(snap, `❌ [${roleId}] 入夜后快照不可读`).not.toBeNull();

  const seats = seatsOf(snap);
  expect(
    seats[idx]?.role?.id,
    `❌ [${roleId}] ${idx + 1} 号座位快照角色不符\n实际 ${JSON.stringify(seats.map((s: any) => s.role?.id))}`
  ).toBe(roleId);
  expect(seats[idx]?.role?.type, `❌ [${roleId}] 阵营与独立真值不符`).toBe(TYPE[roleId]);
  expect(seats.length).toBe(count);
  expect(String(snap?.gamePhase ?? "")).toMatch(/^(firstNight|night|dusk|day)$/);
  expect(Number(snap?.nightCount ?? 0)).toBeGreaterThanOrEqual(1);
}

/** 孤儿角色中文名真值表（与 app/data.ts 一致，供构建器按名定位） */
const NAME: Record<string, string> = {
  astrologer: "星象师", saint_townsfolk: "圣徒", bard: "吟游诗人",
  miner: "矿工", professor_female: "教授（女）", monk_female: "僧侣（女）",
  missionary: "传教士", alchemist: "炼金术士", magician: "魔术师",
  half_ogre: "半兽人", banshee: "报丧女妖", villager: "村夫",
  princess: "公主", priestess: "女祭司", knight: "骑士", steward: "事务官",
  conjurer: "戏法师", pilgrim: "修行者", noble: "贵族", amnesiac: "失忆者",
  engineer: "工程师", fisherman: "渔夫", ranger: "巡山人", atheist: "无神论者",
  cannibal: "食人族",
  qutler: "Q宝", acrobat: "杂技演员", damsel: "落难少女", golem: "魔像",
  puzzlemaster: "解谜大师", zealot: "狂热者", hatter: "帽匠", ogre: "食人魔",
  heretic: "异端分子", hermit: "隐士",
  widow: "寡妇", organ_grinder: "街头风琴手", boffin: "科学怪人",
  fearmonger: "恐惧之灵", wizard: "巫师", xaan: "限", wraith: "亡魂",
  vizier: "维齐尔", boomdandy: "炸弹人", summoner: "召唤师", harpy: "鹰身女妖",
  psychopath: "精神病患者", shaman: "灵言师",
  leech: "痢蛭", hadesia: "哈迪寂亚", riot: "暴乱", lord_of_typhon: "堤丰之首",
  kazali: "卡扎力", lloam: "罗姆", saint_demon: "圣徒", titus: "提图斯",
  leviathan: "利维坦", liz: "利兹",
  // 填充角色
  clockmaker: "钟表匠", dreamer: "造梦师", oracle: "神谕者",
  artist: "艺术家", sage: "贤者", juggler: "杂耍艺人",
  witch: "女巫", no_dashii: "诺-达鲺",
};

// ══════════════════════════════════════════════════════════════════════
test.describe("L4 · 孤儿角色逐角色真实点击流（58 个，自建剧本）", () => {
  test("⓪ 自证：真值表覆盖 58 孤儿（59 - king 铁律）+ 8 填充，阵营划分无遗漏", () => {
    const FILL_ALL = [...FILL_T, FILL_M, FILL_D];
    const orphanIds = ROSTER.filter((r) => !FILL_ALL.includes(r));
    expect(orphanIds.length).toBe(58);
    expect(orphanIds).not.toContain("king");
    expect(
      orphanIds.filter((r) => TYPE[r] === "townsfolk").length
    ).toBe(25); // townsfolk 26 - king
    // 反向对照：默认填充角色必须真的存在且阵营正确（否则 compFor 会静默造错阵容）
    for (const t of FILL_T) {
      expect(TYPE[t]).toBe("townsfolk");
    }
    expect(TYPE[FILL_M]).toBe("minion");
    expect(TYPE[FILL_D]).toBe("demon");
  });

  const chunks: string[][] = [];
  for (let i = 0; i < ROSTER.length; i += 7) {
    chunks.push(ROSTER.slice(i, i + 7));
  }
  chunks.forEach((group, gi) => {
    test(`孤儿-${gi + 1} 真实点击流：${group.join(" / ")}`, async ({ page }) => {
      test.setTimeout(900_000);
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
        "❌ 以下孤儿角色在真实点击流里失败（前几条错误）：\n  " +
          failed.join("\n  ")
      ).toEqual([]);
    });
  });
});

// 防 TS6133（readSnapshot 由未来断言扩展使用）
void readSnapshot;
