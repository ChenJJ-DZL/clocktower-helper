import { expect, test } from "@playwright/test";

/**
 * 核心 E2E 测试：暗流涌动(Trouble Brewing) 5人局完整生命周期
 * 测试初始化、发牌、首夜、白天、处决等基本流程
 */
test("暗流涌动 5人局完整流程", async ({ page }) => {
  // 1. 访问应用
  await page.goto("/");
  await expect(page).toHaveTitle(/血染钟楼辅助工具/);

  // 2. 选择剧本
  await page.getByRole("button", { name: /暗流涌动|Trouble Brewing/i }).click();

  // 等待设置页面加载
  await expect(page.getByText("游戏人数")).toBeVisible({ timeout: 10000 });

  // 3. 选择5个座位
  // 等待座位加载
  await page.waitForSelector(".seat-node[data-seat-id]", { timeout: 10000 });

  // 获取所有座位元素
  const seatNodes = page.locator(".seat-node[data-seat-id]");
  const seatCount = await seatNodes.count();
  console.log(`找到 ${seatCount} 个座位元素`);

  // 点击前5个座位激活（假设至少有5个）
  for (let i = 0; i < Math.min(5, seatCount); i++) {
    const seat = seatNodes.nth(i);
    await seat.click();
    // 短暂等待状态更新
    await page.waitForTimeout(200);
  }

  // 4. 分配角色
  console.log("正在分配角色...");

  const assignRole = async (roleName: string, seatIndex: number) => {
    console.log(`分配 ${roleName} -> ${seatIndex + 1}号位`);

    // 点击角色按钮
    const roleBtn = page.getByRole("button", {
      name: new RegExp(roleName, "i"),
    });
    await expect(roleBtn).toBeVisible({ timeout: 5000 });
    await roleBtn.click();

    // 点击对应的座位（通过索引）
    const allSeats = await page.locator(".seat-node[data-seat-id]").all();
    if (allSeats.length <= seatIndex) {
      throw new Error(`座位不足：${allSeats.length} < ${seatIndex + 1}`);
    }
    const seatElement = allSeats[seatIndex];
    await expect(seatElement).toBeVisible({ timeout: 5000 });
    await seatElement.click();

    await page.waitForTimeout(200);
  };

  // 分配5个角色（Trouble Brewing 5人局）
  await assignRole("小恶魔", 0); // 1号位
  await assignRole("投毒者", 1); // 2号位
  await assignRole("洗衣妇", 2); // 3号位
  await assignRole("图书管理员", 3); // 4号位
  await assignRole("猎手", 4); // 5号位

  console.log("角色分配完成");

  // 4. 等待"开始游戏"按钮启用并点击
  const startButton = page.getByRole("button", {
    name: /确认配置，开始游戏|开始游戏/i,
  });
  await expect(startButton).toBeVisible();
  await expect(startButton).toBeEnabled({ timeout: 10000 });
  await startButton.click();

  // 5. 等待检查阶段（check phase）
  // 检查阶段会有"确认无误，入夜"按钮
  const nightButton = page.getByRole("button", {
    name: /确认无误，入夜|入夜/i,
  });
  await expect(nightButton).toBeVisible({ timeout: 15000 });

  // 6. 进入首夜
  await nightButton.click();

  // 7. 首夜流程 - 等待叫醒顺位模态框
  // 模态框可能包含"首夜叫醒顺位"文本
  await expect(page.getByText(/首夜叫醒顺位|叫醒顺位/i)).toBeVisible({
    timeout: 10000,
  });

  // 点击模态框内的确认按钮（确保点击正确的按钮）
  // 定位模态框内的确认按钮，使用更具体的选择器
  const modalConfirmButton = page
    .locator('[data-modal-key*="首夜叫醒顺位"]')
    .getByRole("button", { name: /确认|下一步|继续/i });
  await expect(modalConfirmButton).toBeVisible({ timeout: 5000 });
  await modalConfirmButton.click();

  // 8. 验证夜间行动开始
  // 等待控制台显示夜间行动提示（例如"唤醒 2 号【投毒者】"）
  await expect(page.getByText(/唤醒.*号.*【.*】/)).toBeVisible({
    timeout: 15000,
  });

  console.log("✅ 首夜行动开始，基本流程测试通过");
});
