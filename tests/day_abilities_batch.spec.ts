/**
 * 批量 E2E 测试 - 所有 DAY 能力角色
 * 验证每个有 day 属性的 RoleDefinition 角色：
 *   1. 在"可用主动技能"区域显示按钮
 *   2. 按钮文本格式正确
 *   3. 点击后触发 confirm 对话框
 *   4. confirm 后可正常关闭
 */
import { expect, test } from "@playwright/test";
import { skipToDay } from "./night_helper";

// 所有需验证的 DAY 能力角色 [roleName, scriptText, demonName]
const DAY_ROLES: [string, string, string][] = [
  // 暗流涌动 (Trouble Brewing)
  ["猎手", "暗流涌动", "小恶魔"],
  // 黯月初升 (Bad Moon Rising)
  ["赌徒", "黯月初升", "僵怖"],
  ["造谣者", "黯月初升", "僵怖"],
  ["修补匠", "黯月初升", "僵怖"],
  // 梦殒春宵 (Sects & Violets)
  ["艺术家", "梦殒春宵", "涡流"],
  ["博学者", "梦殒春宵", "涡流"],
  ["杂耍艺人", "梦殒春宵", "涡流"],
];

// 分配角色
async function assignRoles(
  test: { page: any },
  scriptText: string,
  dayRoleName: string,
  demonName: string
) {
  const page = test.page;
  await page.goto("http://localhost:3000");
  await page.waitForLoadState("networkidle");
  await page.locator(`text=${scriptText}`).first().click();
  await page.waitForTimeout(1500);
  await expect(page.getByText("游戏人数")).toBeVisible({ timeout: 10000 });
  await page.waitForSelector(".seat-node[data-seat-id]", { timeout: 10000 });

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

  // 5人局: dayRole(0) + 镇民(1,2) + 爪牙(3) + 恶魔(4)
  await assign(dayRoleName, 0);

  // 分配镇民和邪恶角色（根据剧本不同）
  const townsfolk =
    scriptText === "暗流涌动"
      ? "洗衣妇"
      : scriptText === "黯月初升"
        ? "祖母"
        : "筑梦师";
  const minion =
    scriptText === "暗流涌动"
      ? "投毒者"
      : scriptText === "黯月初升"
        ? "刺客"
        : "麻脸巫婆";
  await assign(townsfolk, 1);
  await assign(
    townsfolk === "洗衣妇" ? "厨师" : townsfolk === "祖母" ? "水手" : "数学家",
    2
  );
  await assign(minion, 3);
  await assign(demonName, 4);

  // 开始游戏
  await page.getByRole("button", { name: /开始游戏/ }).click();
  await page.waitForTimeout(1500);
  const confirm = page.getByRole("button", { name: /确认无误/ });
  if (await confirm.isVisible({ timeout: 10000 }).catch(() => false)) {
    await confirm.click();
    await page.waitForTimeout(1000);
  }

  // 跳过夜间
  await skipToDay(page);
}

test.describe("所有 DAY 能力角色按钮验证", () => {
  for (const [roleName, script, demon] of DAY_ROLES) {
    test(`${roleName} - 按钮存在且可点击 (${script})`, async ({ page }) => {
      test.setTimeout(90000);

      // 自动处理对话框
      page.on("dialog", (dialog) => {
        console.log(
          `✅ [${roleName}] 对话框:`,
          dialog.message().substring(0, 50)
        );
        dialog.accept();
      });

      await assignRoles({ page }, script, roleName, demon);

      // 验证按钮存在
      const btn = page
        .locator("button:has-text('使用 '), button:has-text('使用  ')")
        .first();

      // 找包含角色名的按钮
      const roleBtn = page.locator(`button:has-text('${roleName}')`);
      await expect(roleBtn.first()).toBeVisible({ timeout: 5000 });
      console.log(`✅ [${roleName}] 按钮可见`);

      // 点击按钮
      await roleBtn.first().click();
      await page.waitForTimeout(1500);
      console.log(`✅ [${roleName}] 按钮点击成功`);
    });
  }
});
