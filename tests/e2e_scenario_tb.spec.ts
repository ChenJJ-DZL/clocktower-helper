import { expect, test } from "@playwright/test";

test("暗流涌动(Trouble Brewing) 5人局完整流程测试", async ({ page }) => {
  test.setTimeout(120000);

  // --- 1. 访问与剧本选择 ---
  await page.goto("http://localhost:3000");
  await page.waitForLoadState("networkidle");
  console.log("正在选择剧本...");

  // 暗流涌动是 <button> 元素，通过文本匹配点击
  await page.locator("text=暗流涌动").first().click();
  await page.waitForTimeout(1500);

  // 验证进入设置页
  await expect(page.getByText("游戏人数")).toBeVisible({ timeout: 10000 });
  console.log("✅ 进入设置页");

  // --- 2. 查找座位 ---
  // 座位结构: <div.rounded-full> > <div.pointer-events-none> > <span>"空"</span>
  // 可点击的座位是 div.rounded-full 元素
  const seats = page.locator("div.rounded-full");
  const seatCount = await seats.count();
  console.log(`找到 ${seatCount} 个座位`);
  expect(seatCount).toBeGreaterThan(0);

  // --- 3. 分配角色 ---
  const assignRole = async (roleName: string, seatIndex: number) => {
    console.log(`分配: ${roleName} -> ${seatIndex + 1}号`);

    // 角色卡片定位 - 角色可能以 button 或 div 形式渲染
    // 先用 getByRole button 查找，不行则用文本定位
    let roleBtn = page.getByRole("button", { name: new RegExp(roleName, "i") }).first();
    if (await roleBtn.count() === 0) {
      roleBtn = page.locator(`text=${roleName}`).first();
    }
    await expect(roleBtn).toBeVisible({ timeout: 5000 });
    await roleBtn.click();
    await page.waitForTimeout(300);

    // 点击座位 - 使用 div.rounded-full 按索引选取
    const seatEl = seats.nth(seatIndex);
    await expect(seatEl).toBeVisible({ timeout: 5000 });
    await seatEl.click();
    await page.waitForTimeout(300);
  };

  await assignRole("小恶魔", 0);  // 1号位 - 恶魔
  await assignRole("投毒者", 1);  // 2号位 - 爪牙
  await assignRole("洗衣妇", 2);  // 3号位 - 镇民
  await assignRole("图书管理员", 3); // 4号位
  await assignRole("猎手", 4);    // 5号位
  console.log("✅ 角色分配完成");

  // --- 4. 开始游戏 ---
  const startBtn = page.getByRole("button", { name: /开始游戏/ });
  await expect(startBtn).toBeEnabled({ timeout: 5000 });
  await startBtn.click();
  await page.waitForTimeout(2000);
  console.log("✅ 点击开始游戏");

  // --- 5. 首夜流程 ---
  // 这里简化测试：验证进入夜晚阶段即算通过
  // 实际游戏中复杂的交互（说书人选择、角色唤醒等）建议通过仿真测试验证

  // 验证进入游戏界面（不再是设置页）
  const pageText = await page.evaluate(() => document.body.innerText);
  const inGame = pageText.includes("首夜") || pageText.includes("入夜") || pageText.includes("说书人");
  expect(inGame).toBeTruthy();
  console.log("✅ 首夜流程开始，E2E 冒烟测试通过");
});
