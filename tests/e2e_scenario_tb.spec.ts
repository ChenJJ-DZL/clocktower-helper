import { test, expect } from '@playwright/test';

test('暗流涌动(Trouble Brewing) 5人局完整流程测试', async ({ page }) => {
  // --- 1. 访问与剧本选择 ---
  await page.goto('http://localhost:3000');

  console.log('正在选择剧本...');
  await page.getByRole('button', { name: /暗流涌动|Trouble Brewing/i }).click();

  console.log('等待设置页面加载...');
  // 确保能看到"游戏人数"这个标题，证明进入了设置页
  await expect(page.getByText('游戏人数')).toBeVisible({ timeout: 10000 });

  // --- 🕵️‍♂️ 调试：检查页面上到底有没有座位 ---
  // 等待座位渲染完成
  await page.waitForTimeout(1000);

  // 关键发现：座位可能是 div（圆形布局）或 button（矩阵布局）
  // 根据截图，座位是圆形布局，使用 div + cursor-pointer
  // 座位显示"空"文本，数字在外部
  let seatElements: any[] = [];

  // 方法 1: 查找包含"空"文本的可点击元素（div 或 button）
  seatElements = await page.locator('div.cursor-pointer:has-text("空"), button:has-text("空")').all().catch(() => []);
  console.log(`方法1（查找包含"空"的可点击元素）: 找到 ${seatElements.length} 个座位`);

  // 方法 2: 查找所有包含"空"的元素，然后过滤可点击的
  if (seatElements.length === 0) {
    const allWithEmpty = await page.locator('*:has-text("空")').all().catch(() => []);
    // 过滤：元素或其父元素有 cursor-pointer 类
    for (const el of allWithEmpty) {
      const isClickable = await el.evaluate((node) => {
        const elem = node as HTMLElement;
        return elem.classList.contains('cursor-pointer') ||
          elem.closest('.cursor-pointer') !== null ||
          elem.tagName === 'BUTTON';
      }).catch(() => false);
      if (isClickable) {
        seatElements.push(el);
      }
    }
    console.log(`方法2（过滤可点击元素）: 找到 ${seatElements.length} 个座位`);
  }

  // 方法 3: 通过座位数字定位（数字在 div 中，座位本身是父元素）
  if (seatElements.length === 0) {
    // 查找包含数字 1-15 的圆形元素
    for (let i = 1; i <= 15; i++) {
      const seatWithNumber = page.locator(`div:has-text("${i}"):has-text("空")`).first();
      if ((await seatWithNumber.count()) > 0) {
        const parent = seatWithNumber.locator('..').first();
        if ((await parent.count()) > 0) seatElements.push(parent);
      }
    }
    console.log(`方法3（通过数字定位）: 找到 ${seatElements.length} 个座位`);
  }

  // 方法 4: 直接查找所有圆形座位容器（使用特定的类或结构）
  if (seatElements.length === 0) {
    // 尝试查找包含"rounded-full"的可点击元素（座位是圆形）
    seatElements = await page.locator('div.rounded-full.cursor-pointer, button.rounded-full').all().catch(() => []);
    console.log(`方法4（查找圆形元素）: 找到 ${seatElements.length} 个座位`);
  }

  console.log(`页面上最终检测到 ${seatElements.length} 个座位元素`);

  if (seatElements.length === 0) {
    // 如果没有座位，打印页面内容帮助排查
    console.log('❌ 严重错误：页面上没有找到任何座位！');
    // 等待更长时间后重试
    await page.waitForTimeout(2000);
    seatElements = await page.locator('div.cursor-pointer:has-text("空")').all().catch(() => []);
    console.log(`等待后再次检查，找到 ${seatElements.length} 个座位`);

    if (seatElements.length === 0) {
      // 截图留证
      await page.screenshot({ path: 'no-seats-error.png' });
      throw new Error('无法找到座位元素。座位可能是 div（圆形布局）或 button（矩阵布局），请检查实际 DOM 结构。');
    }
  }

  expect(seatElements.length).toBeGreaterThan(0);

  // --- 2. 角色分配 ---
  console.log('正在分配 5 人局角色...');

  const assignRole = async (roleName: string, seatIndex: number) => {
    console.log(`正在分配: ${roleName} -> ${seatIndex + 1}号位`);

    // 1. 点击角色卡 (使用正则模糊匹配，忽略大小写)
    const roleBtn = page.getByRole('button', { name: new RegExp(roleName, 'i') });
    await expect(roleBtn).toBeVisible();
    await roleBtn.click();

    // 2. 点击座位 - 座位可能是 div（圆形布局）或 button（矩阵布局）
    // 最可靠的方法：找到所有显示"空"的可点击元素，然后通过索引选择
    const allSeats = await page.locator('div.cursor-pointer:has-text("空"), button:has-text("空")').all().catch(() => []);

    if (allSeats.length <= seatIndex) {
      throw new Error(`座位数量不足：找到 ${allSeats.length} 个座位，但需要访问第 ${seatIndex + 1} 个座位`);
    }

    const seatElement = allSeats[seatIndex];
    console.log(`通过索引定位座位 ${seatIndex + 1}号（第${seatIndex}个元素，共${allSeats.length}个座位）`);

    // 确保座位存在且可见
    await expect(seatElement).toBeVisible({ timeout: 5000 });
    await seatElement.click();

    // 稍微喘口气，等待 React 状态更新
    await page.waitForTimeout(200);
  };

  // 分配角色
  await assignRole('小恶魔', 0);       // 1号位
  await assignRole('投毒者', 1);       // 2号位
  await assignRole('洗衣妇', 2);       // 3号位
  await assignRole('图书管理员', 3);    // 4号位
  await assignRole('猎手', 4);         // 5号位 (修正：根据数据应该是"猎手"不是"杀手")

  // --- 3. 开始游戏 ---
  console.log('点击开始游戏...');
  const startBtn = page.getByRole('button', { name: /开始游戏|Start Game/i });

  // 等待按钮变亮（不再是 disabled 状态）
  await expect(startBtn).toBeEnabled({ timeout: 5000 });
  await startBtn.click();

  // --- 4. 进入入夜 ---
  console.log('等待入夜按钮...');
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /入夜|Night/i }).click();

  // --- 5. 验证控制台交互 ---
  console.log('检查控制台...');

  // 验证确认按钮是否出现
  const confirmBtn = page.getByRole('button', { name: /确认|Confirm/i }).first();
  await expect(confirmBtn).toBeVisible({ timeout: 10000 });

  console.log('✅ 测试通过：成功分配角色并进入夜晚，控制台响应正常！');
});
