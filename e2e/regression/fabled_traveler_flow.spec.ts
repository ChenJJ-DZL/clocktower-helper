import { expect, test, type Page } from "@playwright/test";
import {
  enterScriptConfig,
  readSnapshot,
  resolveCharades,
  waitForSnapshot,
} from "../helpers/scriptFlow";

const FABLED_SEAT = 'button[title="选择传奇角色（落座确认后锁定）"]';
const FABLED_SEAT_LOCKED = 'button[title*="已锁定"]';
const EMPTY_TRAVELER_SEAT = 'button[title="空旅行者座位（点击指定旅行者）"]';
const MODAL = '[role="dialog"][aria-modal="true"]';

/** setup 阶段：落座 + 选传奇角色 + 选旅行者（全部 DOM 断言，严禁读快照） */
async function selectFabledAndTraveler(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await enterScriptConfig(page, "暗流涌动", 7);
  await resolveCharades(page);

  // —— 说书人座位：选 1 个传奇角色 ——
  await page.locator(FABLED_SEAT).click();
  const modal = page.locator(MODAL);
  await expect(modal).toBeVisible({ timeout: 20_000 });
  await modal.locator("button").filter({ hasText: "圣洁之魂" }).first().click();
  await expect(modal).toBeHidden({ timeout: 20_000 });
  await expect(page.locator(FABLED_SEAT)).toContainText("（1/1）");
  await expect(page.locator(FABLED_SEAT)).toContainText("圣洁之魂");

  // —— 旅行者：展开 4 座 → 第 3 座指定角色 ——
  await page.locator("button").filter({ hasText: "旅行者（0/4）" }).first().click();
  await expect(page.locator(EMPTY_TRAVELER_SEAT)).toHaveCount(4);
  await page.locator(EMPTY_TRAVELER_SEAT).nth(2).click();
  await expect(modal).toContainText("为座位 3 选择旅行者");
  await modal
    .locator("button.w-full")
    .filter({ hasNotText: "清空该座位" })
    .first()
    .click();
  await expect(modal).toBeHidden({ timeout: 20_000 });
  await expect(page.locator(EMPTY_TRAVELER_SEAT)).toHaveCount(3);
}

/** 从 setup 推进到首夜（此时快照才开始落盘）；已进 check 阶段则跳过分发按钮 */
async function enterFirstNightHere(page: Page) {
  const enterNight = page
    .locator("button")
    .filter({ hasText: /确认无误[\s\S]*入夜/ })
    .first();
  const already = await enterNight
    .isVisible()
    .then(() => true)
    .catch(() => false);
  if (!already) {
    await page.getByText("分发&核对身份").first().click();
  }
  await expect(enterNight).toBeVisible({ timeout: 20_000 });
  await enterNight.click();
  await expect(page.getByText("夜晚行动顺序").first()).toBeVisible({
    timeout: 20_000,
  });
}

test("落座阶段：说书人座位与旅行者按钮真实可见（未白屏）", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (err) => errors.push(err));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await enterScriptConfig(page, "暗流涌动", 7);
  const seat = page.locator(FABLED_SEAT);
  await expect(seat).toBeVisible({ timeout: 20_000 });
  await expect(seat).toBeEnabled();
  await expect(seat).toContainText("说书人 · 传奇角色（0/1）");
  await expect(
    page.locator("button").filter({ hasText: "旅行者（0/4）" }).first()
  ).toBeVisible();
  expect(errors).toHaveLength(0);
});

test("选 1 个传奇角色 → 座位显示 1/1 且上限为 1", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await enterScriptConfig(page, "暗流涌动", 7);
  await resolveCharades(page);
  await page.locator(FABLED_SEAT).click();
  const modal = page.locator(MODAL);
  await expect(modal).toBeVisible({ timeout: 20_000 });
  await expect(modal).toContainText("选择传奇角色（上限 1 个）");
  await modal.locator("button").filter({ hasText: "圣洁之魂" }).first().click();
  await expect(modal).toBeHidden({ timeout: 20_000 });
  await expect(page.locator(FABLED_SEAT)).toContainText("（1/1）");
  await expect(page.locator(FABLED_SEAT)).toContainText("圣洁之魂");
  await page.locator(FABLED_SEAT).click();
  await expect(modal).toBeVisible({ timeout: 20_000 });
  await expect(modal).toContainText("移除传奇角色");
  await modal.locator("button").filter({ hasText: "移除传奇角色" }).first().click();
  await expect(modal).toBeHidden({ timeout: 20_000 });
  await expect(page.locator(FABLED_SEAT)).toContainText("（0/1）");
  await expect(page.locator(FABLED_SEAT)).toContainText("未选择");
});

test("选旅行者到「座位 3」→ 位置化不串位", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await enterScriptConfig(page, "暗流涌动", 7);
  await resolveCharades(page);
  await page.locator("button").filter({ hasText: "旅行者（0/4）" }).first().click();
  await expect(page.locator(EMPTY_TRAVELER_SEAT)).toHaveCount(4);
  await page.locator(EMPTY_TRAVELER_SEAT).nth(2).click();
  const modal = page.locator(MODAL);
  await expect(modal).toBeVisible({ timeout: 20_000 });
  await expect(modal).toContainText("为座位 3 选择旅行者");
  await modal
    .locator("button.w-full")
    .filter({ hasNotText: "清空该座位" })
    .first()
    .click();
  await expect(modal).toBeHidden({ timeout: 20_000 });
  await expect(page.locator(EMPTY_TRAVELER_SEAT)).toHaveCount(3);
  const titles = await page
    .locator(EMPTY_TRAVELER_SEAT)
    .evaluateAll((els) => els.map((e) => e.getAttribute("title") ?? ""));
  expect(titles.filter((t) => t.includes("旅行者："))).toHaveLength(0);
});

test("端到端：落座确认锁定 → 入夜落库 → 刷新仍在", async ({ page }) => {
  await selectFabledAndTraveler(page);

  await page.getByText("分发&核对身份").first().click();
  const locked = page.locator(FABLED_SEAT_LOCKED);
  await expect(locked).toBeVisible({ timeout: 20_000 });
  await expect(locked).toBeDisabled();
  await locked.click({ force: true });
  await expect(page.locator("body")).not.toContainText("选择传奇角色（上限 1 个）");

  await enterFirstNightHere(page);

  const snap: any = await waitForSnapshot(
    page,
    (s: any) => s?.activeFabled?.[0]?.id === "spirit_of_ivory" && !!s?.travelers?.[2],
    20_000
  );
  expect(snap, "入夜后必须写入快照").toBeTruthy();
  expect(snap.activeFabled).toHaveLength(1);
  expect(snap.activeFabled[0].id).toBe("spirit_of_ivory");
  expect(snap.travelers[2].type).toBe("traveler");
  expect(snap.travelers[0]).toBeNull();
  expect(snap.travelers[1]).toBeNull();
  expect(snap.travelers[3]).toBeNull();
  expect(snap.travelers.filter(Boolean)).toHaveLength(1);
  expect(snap.seats.length).toBe(7);

  await page.reload({ waitUntil: "domcontentloaded" });
  const after: any = await readSnapshot(page);
  expect(after.activeFabled[0].id).toBe("spirit_of_ivory");
  expect(after.travelers[2].type).toBe("traveler");
});
