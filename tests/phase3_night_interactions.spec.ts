/**
 * Phase 3 - 夜间交互批量测试
 *
 * 覆盖需要在夜间交互的角色:
 *   S&V: 舞蛇人(选人交换角色), 女裁缝(选2人查阵营)
 *   TB: 占卜师(选2人查恶魔)
 */
import { expect, test } from "@playwright/test";

interface NightRoleTest {
  roleName: string;
  script: string;
  demon: string;
  townsfolk: string[];
  minion: string;
  /** 需要选几个目标 */
  targets: number;
  /** 是否需要在选目标后额外交互(选角色等) */
  hasExtraStep: boolean;
  /** 角色ID用于检测 */
  roleId: string;
}

const NIGHT_ROLES: NightRoleTest[] = [
  {
    roleName: "占卜师",
    script: "暗流涌动",
    demon: "小恶魔",
    townsfolk: ["洗衣妇", "厨师"],
    minion: "投毒者",
    targets: 2,
    hasExtraStep: false,
    roleId: "fortune_teller",
  },
  {
    roleName: "女裁缝",
    script: "梦殒春宵",
    demon: "涡流",
    townsfolk: ["筑梦师", "数学家"],
    minion: "麻脸巫婆",
    targets: 2,
    hasExtraStep: false,
    roleId: "seamstress",
  },
  {
    roleName: "舞蛇人",
    script: "梦殒春宵",
    demon: "涡流",
    townsfolk: ["筑梦师", "数学家"],
    minion: "麻脸巫婆",
    targets: 1,
    hasExtraStep: false,
    roleId: "snake_charmer",
  },
];

/** 通用夜间跳过+特定角色交互 */
async function handleNightWithRole(
  page: any,
  roleName: string,
  targets: number,
  hasExtraStep: boolean
): Promise<boolean> {
  let handled = false;

  for (let i = 0; i < 30; i++) {
    // 白天检测
    if (
      await page
        .locator("button:has-text('进入黄昏处决阶段')")
        .isVisible({ timeout: 300 })
        .catch(() => false)
    ) {
      return handled;
    }

    // 报告/天亮
    const report = page.locator("h2:has-text('夜晚报告'), text=昨晚");
    if (
      await report
        .first()
        .isVisible({ timeout: 200 })
        .catch(() => false)
    ) {
      await page
        .getByRole("button", { name: "确认" })
        .click()
        .catch(() => {});
      await page.waitForTimeout(800);
      continue;
    }
    const dawn = page.getByRole("button", { name: /开始白天|天亮了/ });
    if (await dawn.isVisible({ timeout: 200 }).catch(() => false)) {
      await dawn.click();
      await page.waitForTimeout(1500);
      continue;
    }

    // 检测目标角色行动
    const isTargetRole = await page
      .locator(`text=${roleName}`)
      .first()
      .isVisible({ timeout: 200 })
      .catch(() => false);

    if (isTargetRole && !handled) {
      // 选目标：从第2个开始(跳过已激活的占卜师自己)
      for (let t = 0; t < targets; t++) {
        const btn = page.locator("button:has-text('#')").nth(t + 1);
        if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await btn.click();
          await page.waitForTimeout(300);
        }
      }

      // 额外步骤(筑梦师/舞蛇人等选角色)
      if (hasExtraStep) {
        await page.waitForTimeout(500);
        const choice = page
          .locator("button:not([disabled]):not(:has-text('#'))")
          .first();
        if (await choice.isVisible({ timeout: 2000 }).catch(() => false)) {
          await choice.click();
          await page.waitForTimeout(300);
        }
      }

      // 确认
      const nextBtn = page
        .locator("button")
        .filter({ hasText: /确认.*下一步/ })
        .first();
      if (await nextBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(400);
      }

      handled = true;
      continue;
    }

    // 普通跳过
    const nextBtn = page
      .locator("button")
      .filter({ hasText: /确认.*下一步|下一步|确认/ })
      .first();
    if (await nextBtn.isVisible({ timeout: 200 }).catch(() => false)) {
      if (await nextBtn.isEnabled().catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(400);
        continue;
      }
      const hashBtn = page.locator("button:has-text('#')").first();
      if (await hashBtn.isVisible({ timeout: 200 }).catch(() => false)) {
        await hashBtn.click();
        await page.waitForTimeout(300);
        continue;
      }
    }
    await page.waitForTimeout(500);
  }
  return handled;
}

test.describe("Phase 3 - 夜间交互", () => {
  for (const role of NIGHT_ROLES) {
    test(`${role.roleName} - 夜间选目标确认 (${role.script})`, async ({
      page,
    }) => {
      test.setTimeout(120000);
      page.on("dialog", (d) => d.accept());

      await page.goto("http://localhost:3000");
      await page.waitForLoadState("networkidle");
      await page.locator(`text=${role.script}`).first().click();
      await page.waitForTimeout(1500);
      await expect(page.getByText("游戏人数")).toBeVisible({ timeout: 10000 });
      await page.waitForSelector(".seat-node[data-seat-id]", {
        timeout: 10000,
      });

      const seats = page.locator(".seat-node[data-seat-id]");
      const assign = async (name: string, idx: number) => {
        const btn = page.getByRole("button", { name: new RegExp(name, "i") });
        await expect(btn).toBeVisible({ timeout: 5000 });
        await btn.click();
        await page.waitForTimeout(300);
        const all = await seats.all();
        if (all.length <= idx) return;
        await all[idx].click();
        await page.waitForTimeout(300);
      };

      await assign(role.roleName, 0);
      await assign(role.townsfolk[0], 1);
      await assign(role.townsfolk[1], 2);
      await assign(role.minion, 3);
      await assign(role.demon, 4);

      await page.getByRole("button", { name: /开始游戏/ }).click();
      await page.waitForTimeout(1500);
      const confirm = page.getByRole("button", { name: /确认无误/ });
      if (await confirm.isVisible({ timeout: 10000 }).catch(() => false)) {
        await confirm.click();
        await page.waitForTimeout(1000);
      }

      const handled = await handleNightWithRole(
        page,
        role.roleName,
        role.targets,
        role.hasExtraStep
      );
      expect(handled).toBeTruthy();
      console.log(`✅ [${role.roleName}] 夜间交互测试通过`);
    });
  }
});
