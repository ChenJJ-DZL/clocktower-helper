import { expect, test } from "@playwright/test";

test.describe("高级游戏模拟器", () => {
  test("随机化对局测试", async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("http://localhost:3000");
    await page.waitForLoadState("load");
    await page.waitForTimeout(10000);
    page.on("dialog", async (d) => {
      await d.accept();
    });

    // 1. 点击暗流涌动 → 快速测试
    await page.getByRole("button", { name: /暗流涌动/ }).click();
    await page.waitForTimeout(3000);
    await page.getByRole("button", { name: /快速测试/ }).click();
    await page.waitForTimeout(5000);

    // 2. 酒鬼身份设置
    const drunkBtn = page.getByRole("button", { name: /设置酒鬼身份/ });
    const drunkVisible = await drunkBtn.isVisible().catch(() => false);
    if (drunkVisible) {
      await page.evaluate(() => {
        const btns = document.querySelectorAll("button");
        for (let i = 0; i < btns.length; i++) {
          if ((btns[i].textContent || "").includes("设置酒鬼身份")) {
            btns[i].click();
            return;
          }
        }
      });
      await page.waitForTimeout(1500);
      await page.evaluate(() => {
        const overlay = document.querySelector('[class*="fixed"]');
        if (!overlay) return;
        const b2 = overlay.querySelectorAll("button");
        for (let i = 0; i < b2.length; i++) {
          const t = (b2[i].textContent || "").trim();
          if (t && t !== "✕" && !t.includes("确认选择")) {
            b2[i].click();
            return;
          }
        }
      });
      await page.waitForTimeout(800);
      await page.evaluate(() => {
        const overlay = document.querySelector('[class*="fixed"]');
        if (!overlay) return;
        const b3 = overlay.querySelectorAll("button");
        for (let i = 0; i < b3.length; i++) {
          if (
            (b3[i].textContent || "").includes("确认选择") &&
            !b3[i].disabled
          ) {
            b3[i].click();
            return;
          }
        }
      });
      await page.waitForTimeout(1500);
    }

    // 3. 入夜
    await page.evaluate(() => {
      const btns = document.querySelectorAll("button");
      for (let i = 0; i < btns.length; i++) {
        if ((btns[i].textContent || "").includes("入夜") && !btns[i].disabled) {
          btns[i].click();
          return;
        }
      }
    });
    await page.waitForTimeout(3000);

    // 4. 处理夜行动（最多10次）
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(3000);
      // 弹窗
      const m = page.locator("[data-modal-key]");
      if (
        await m
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await m.getByRole("button").first().click();
        continue;
      }
      // 确认按钮
      const c = page.getByRole("button", { name: /确认|下一步/ });
      if (
        (await c.isVisible().catch(() => false)) &&
        (await c.isEnabled().catch(() => false))
      ) {
        await c.click();
        continue;
      }
      // 目标选择
      const seats = page.locator('[class*="cursor-pointer"]');
      if ((await seats.count().catch(() => 0)) > 0) {
        const idx = Math.floor(
          Math.random() * (await seats.count().catch(() => 0))
        );
        await seats.nth(idx).click();
        await page.waitForTimeout(2000);
        if (!(await c.isEnabled().catch(() => false))) {
          const idx2 = (idx + 1) % (await seats.count().catch(() => 0));
          await seats
            .nth(idx2)
            .click()
            .catch(() => {});
          await page.waitForTimeout(2000);
        }
        if (await c.isEnabled().catch(() => false)) await c.click();
      } else break;
    }

    // 5. 天亮 → 黄昏
    await page.evaluate(() => {
      const btns = document.querySelectorAll("button");
      for (let i = 0; i < btns.length; i++) {
        if (
          (btns[i].textContent || "").trim() === "确认" &&
          !btns[i].disabled
        ) {
          btns[i].click();
          return;
        }
      }
    });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const btns = document.querySelectorAll("button");
      for (let i = 0; i < btns.length; i++) {
        if ((btns[i].textContent || "").includes("黄昏") && !btns[i].disabled) {
          btns[i].click();
          return;
        }
      }
    });
    await page.waitForTimeout(1500);

    // 6. 验证到达处决阶段（入夜按钮出现）
    const hasNight = await page.evaluate(() => {
      const btns = document.querySelectorAll("button");
      for (let i = 0; i < btns.length; i++) {
        if ((btns[i].textContent || "").includes("入夜") && !btns[i].disabled)
          return true;
      }
      return false;
    });
    expect(hasNight).toBeTruthy();
  });
});
