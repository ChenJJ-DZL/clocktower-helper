/**
 * Phase 4 - 实验角色测试 (自定义剧本)
 *
 * 使用"自建剧本"功能创建包含实验角色的自定义剧本，
 * 验证实验角色的白天能力按钮存在且可点击。
 *
 * 流程: 自建剧本 → 选角色 → 保存 → 分配 → 游戏 → 验证
 */
import { expect, test } from "@playwright/test";
import { skipToDay } from "./night_helper";

interface ExpRoleTest {
  roleName: string;
  roleId: string;
  demonName: string;
  /** 额外填充的镇民角色ID */
  extraRoles: string[];
}

const EXP_ROLES: ExpRoleTest[] = [
  { roleName: "渔夫", roleId: "fisherman", demonName: "小恶魔", extraRoles: ["洗衣妇", "厨师", "投毒者"] },
  { roleName: "工程师", roleId: "engineer", demonName: "小恶魔", extraRoles: ["洗衣妇", "厨师", "投毒者"] },
  { roleName: "食人族", roleId: "cannibal", demonName: "小恶魔", extraRoles: ["洗衣妇", "厨师", "投毒者"] },
];

test.describe("Phase 4 - 实验角色 (自定义剧本)", () => {
  for (const role of EXP_ROLES) {
    test(`${role.roleName} - 自定义剧本白天按钮`, async ({ page }) => {
      test.setTimeout(120000);
      page.on("dialog", (d) => d.accept());

      await page.goto("http://localhost:3000");
      await page.waitForLoadState("networkidle");

      // ── 1. 打开"自建剧本" ──
      const buildBtn = page.locator("button:has-text('自建剧本')");
      await expect(buildBtn).toBeVisible({ timeout: 10000 });
      await buildBtn.click();
      await page.waitForTimeout(1000);

      // ── 2. 输入剧本名称 ──
      const nameInput = page.locator("#script-name-input");
      await expect(nameInput).toBeVisible({ timeout: 5000 });
      await nameInput.fill("测试剧本");
      await page.waitForTimeout(500);

      // ── 3. 选择角色（在自建剧本弹窗中点角色名按钮） ──
      const roleNames = [role.roleName, ...role.extraRoles, role.demonName];
      for (const rName of roleNames) {
        const roleBtn = page.locator(`button:has-text("${rName}")`).first();
        if (await roleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          const text = await roleBtn.innerText().catch(() => "");
          // 过滤掉"保存"、"取消"等操作按钮，只点角色名
          if (text === rName || text.startsWith(rName)) {
            await roleBtn.click();
            await page.waitForTimeout(200);
          }
        }
      }

      // ── 4. 保存剧本 ──
      const saveBtn = page.locator("button:has-text('保存'), button:has-text('创建')").first();
      if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(1000);
      }

      // ── 5. 选择自定义剧本 ──
      const customScript = page.locator("text=测试剧本").first();
      await expect(customScript).toBeVisible({ timeout: 5000 });
      await customScript.click();
      await page.waitForTimeout(1500);

      // ── 6. 分配角色 ──
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

      await assign(role.roleName, 0);
      for (let i = 0; i < role.extraRoles.length; i++) {
        await assign(role.extraRoles[i], i + 1);
      }
      await assign(role.demonName, role.extraRoles.length + 1);

      // ── 7. 开始游戏 ──
      await page.getByRole("button", { name: /开始游戏/ }).click();
      await page.waitForTimeout(1500);
      const confirm = page.getByRole("button", { name: /确认无误/ });
      if (await confirm.isVisible({ timeout: 10000 }).catch(() => false)) {
        await confirm.click();
        await page.waitForTimeout(1000);
      }

      // ── 8. 跳过夜间 → 验证白天按钮 ──
      await skipToDay(page);

      // 关闭残留弹窗
      for (let m = 0; m < 5; m++) {
        const modal = page.locator(".fixed.inset-0.z-50, [data-modal-key]").first();
        if (!(await modal.isVisible({ timeout: 100 }).catch(() => false))) break;
        const btn = modal.locator("button:not([disabled])").first();
        if (await btn.isVisible({ timeout: 100 }).catch(() => false)) {
          await btn.click().catch(() => {});
          await page.waitForTimeout(300);
        } else break;
      }

      const dayBtn = page.locator(`button:has-text('${role.roleName}')`);
      await expect(dayBtn.first()).toBeVisible({ timeout: 5000 });
      await dayBtn.first().click();
      await page.waitForTimeout(500);
      console.log(`✅ [${role.roleName}] 自定义剧本测试通过`);
    });
  }
});
