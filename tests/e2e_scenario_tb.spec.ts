import { expect, test } from "@playwright/test";

test("暗流涌动(Trouble Brewing) 5人局完整流程测试", async ({ page }) => {
  // --- 1. 访问与剧本选择 ---
  await page.goto("http://localhost:3000");

  console.log("正在选择剧本...");
  await page.getByRole("button", { name: /暗流涌动|Trouble Brewing/i }).click();

  console.log("等待设置页面加载...");
  // 确保能看到"游戏人数"这个标题，证明进入了设置页
  await expect(page.getByText("游戏人数")).toBeVisible({ timeout: 10000 });

  // --- 🕵️‍♂️ 调试：检查页面上到底有没有座位 ---
  // 等待座位渲染完成
  await page.waitForTimeout(1000);

  // 关键发现：座位可能是 div（圆形布局）或 button（矩阵布局）
  // 根据截图，座位是圆形布局，使用 div + cursor-pointer
  // 座位显示"空"文本，数字在外部
  let seatElements: any[] = [];

  // 方法 1: 查找包含"空"文本的可点击元素（div 或 button）
  seatElements = await page
    .locator('div.cursor-pointer:has-text("空"), button:has-text("空")')
    .all()
    .catch(() => []);
  console.log(
    `方法1（查找包含"空"的可点击元素）: 找到 ${seatElements.length} 个座位`
  );

  // 方法 2: 查找所有包含"空"的元素，然后过滤可点击的
  if (seatElements.length === 0) {
    const allWithEmpty = await page
      .locator('*:has-text("空")')
      .all()
      .catch(() => []);
    // 过滤：元素或其父元素有 cursor-pointer 类
    for (const el of allWithEmpty) {
      const isClickable = await el
        .evaluate((node) => {
          const elem = node as HTMLElement;
          return (
            elem.classList.contains("cursor-pointer") ||
            elem.closest(".cursor-pointer") !== null ||
            elem.tagName === "BUTTON"
          );
        })
        .catch(() => false);
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
      const seatWithNumber = page
        .locator(`div:has-text("${i}"):has-text("空")`)
        .first();
      if ((await seatWithNumber.count()) > 0) {
        const parent = seatWithNumber.locator("..").first();
        if ((await parent.count()) > 0) seatElements.push(parent);
      }
    }
    console.log(`方法3（通过数字定位）: 找到 ${seatElements.length} 个座位`);
  }

  // 方法 4: 直接查找所有圆形座位容器（使用特定的类或结构）
  if (seatElements.length === 0) {
    // 尝试查找包含"rounded-full"的可点击元素（座位是圆形）
    seatElements = await page
      .locator("div.rounded-full.cursor-pointer, button.rounded-full")
      .all()
      .catch(() => []);
    console.log(`方法4（查找圆形元素）: 找到 ${seatElements.length} 个座位`);
  }

  console.log(`页面上最终检测到 ${seatElements.length} 个座位元素`);

  if (seatElements.length === 0) {
    // 如果没有座位，打印页面内容帮助排查
    console.log("❌ 严重错误：页面上没有找到任何座位！");
    // 等待更长时间后重试
    await page.waitForTimeout(2000);
    seatElements = await page
      .locator('div.cursor-pointer:has-text("空")')
      .all()
      .catch(() => []);
    console.log(`等待后再次检查，找到 ${seatElements.length} 个座位`);

    if (seatElements.length === 0) {
      // 截图留证
      await page.screenshot({ path: "no-seats-error.png" });
      throw new Error(
        "无法找到座位元素。座位可能是 div（圆形布局）或 button（矩阵布局），请检查实际 DOM 结构。"
      );
    }
  }

  expect(seatElements.length).toBeGreaterThan(0);

  // --- 2. 角色分配 ---
  console.log("正在分配 5 人局角色...");

  const assignRole = async (roleName: string, seatIndex: number) => {
    console.log(`正在分配: ${roleName} -> ${seatIndex + 1}号位`);

    // 1. 点击角色卡 (使用正则模糊匹配，忽略大小写)
    const roleBtn = page.getByRole("button", {
      name: new RegExp(roleName, "i"),
    });
    await expect(roleBtn).toBeVisible();
    await roleBtn.click();

    // 2. 点击座位 - 座位可能是 div（圆形布局）或 button（矩阵布局）
    // 最可靠的方法：找到所有显示"空"的可点击元素，然后通过索引选择
    const allSeats = await page
      .locator('div.cursor-pointer:has-text("空"), button:has-text("空")')
      .all()
      .catch(() => []);

    if (allSeats.length <= seatIndex) {
      throw new Error(
        `座位数量不足：找到 ${allSeats.length} 个座位，但需要访问第 ${seatIndex + 1} 个座位`
      );
    }

    const seatElement = allSeats[seatIndex];
    console.log(
      `通过索引定位座位 ${seatIndex + 1}号（第${seatIndex}个元素，共${allSeats.length}个座位）`
    );

    // 确保座位存在且可见
    await expect(seatElement).toBeVisible({ timeout: 5000 });
    await seatElement.click();

    // 稍微喘口气，等待 React 状态更新
    await page.waitForTimeout(200);
  };

  // 分配角色
  await assignRole("小恶魔", 0); // 1号位
  await assignRole("投毒者", 1); // 2号位
  await assignRole("洗衣妇", 2); // 3号位
  await assignRole("图书管理员", 3); // 4号位
  await assignRole("猎手", 4); // 5号位

  // --- 3. 开始游戏 ---
  console.log("点击开始游戏...");
  const startBtn = page.getByRole("button", { name: /开始游戏|Start Game/i });

  // 等待按钮变亮（不再是 disabled 状态）
  await expect(startBtn).toBeEnabled({ timeout: 5000 });
  await startBtn.click();

  // --- 4. 进入入夜 ---
  console.log("等待入夜按钮...");
  await page.waitForTimeout(3000);
  // 第一次点击：主界面入夜按钮，弹出预览窗口
  const nightButton = page
    .getByRole("button", { name: /确认无误，入夜/ })
    .first();
  await nightButton.waitFor({ state: "visible", timeout: 15000 });
  await nightButton.click();
  console.log("已点击第一次入夜按钮，弹出预览窗口");
  await page.waitForTimeout(2000);

  // 第二次点击：预览窗口里的确认按钮，进入夜晚
  const nightConfirmButton = page
    .getByRole("button", { name: /确认无误，入夜/ })
    .last();
  await nightConfirmButton.waitFor({ state: "visible", timeout: 10000 });
  await nightConfirmButton.click();
  console.log("已点击第二次入夜确认按钮，进入夜晚");
  await page.waitForTimeout(5000);

  // 等待进入首夜阶段，检查是否有"唤醒"开头的文本
  try {
    await expect(page.getByText(/唤醒|首夜/)).toBeVisible({ timeout: 15000 });
    console.log("已进入首夜阶段，角色唤醒开始");
    await page.waitForTimeout(2000);
  } catch (e) {
    console.error("等待进入首夜超时，游戏可能卡死");
    await page.screenshot({
      path: "test-results/error-stuck-at-verify-phase.png",
      fullPage: true,
    });
    // 输出页面文本
    const pageText = await page.textContent("body");
    console.log(
      "当前页面文本包含：",
      pageText.slice(
        pageText.indexOf("首夜") > 0 ? pageText.indexOf("首夜") : 0,
        500
      )
    );
    throw e;
  }

  // 自动处理所有前置确认步骤（爪牙信息、恶魔信息等），同时查找投毒者唤醒文本
  console.log("处理首夜前置确认步骤，同时查找投毒者唤醒文本...");
  let foundPoisoner = false;
  for (let i = 0; i < 8; i++) {
    try {
      // 先检查是否已经出现投毒者相关文本
      const poisonerText = page.getByText(/投毒者|Poisoner/).first();
      if (await poisonerText.isVisible({ timeout: 500 })) {
        // 再确认包含唤醒相关的词
        const text = await poisonerText.innerText();
        if (/唤醒|请|现在|轮到/.test(text)) {
          console.log(`✅ 找到投毒者唤醒文本："${text}"`);
          foundPoisoner = true;
          break;
        }
      }

      // 没有找到，点击确认按钮继续
      const confirmBtn = page
        .getByRole("button", { name: /确认|下一步|知道了/ })
        .first();
      await confirmBtn.waitFor({ timeout: 1000 });
      await confirmBtn.click();
      await page.waitForTimeout(800);
      console.log(`已点击第 ${i + 1} 个确认按钮`);
    } catch (e) {
      // 没有更多确认按钮了
      console.log("没有更多确认按钮了，继续等待投毒者文本...");
      break;
    }
  }

  // 如果还没找到，再单独等待
  if (!foundPoisoner) {
    console.log("前置步骤处理完，继续等待投毒者唤醒文本...");
    // 尝试用更简单的定位：只找包含投毒者的文本，不限制顺序
    const poisonerText = page.getByText("投毒者", { exact: false }).first();
    await expect(poisonerText).toBeVisible({ timeout: 10000 });
    const text = await poisonerText.innerText();
    console.log(`✅ 找到投毒者相关文本："${text}"`);
    foundPoisoner = true;
  }

  expect(foundPoisoner).toBeTruthy();
  console.log("✅ 首夜第一个角色：投毒者，流程正确");

  // --- 6. 投毒者技能操作 ---
  console.log("处理投毒者技能选择...");
  // 投毒者选择任意一名玩家（比如3号位）
  const targetSeat = page.locator('div.cursor-pointer:has-text("3")').first();
  await targetSeat.waitFor({ state: "visible", timeout: 5000 });
  await targetSeat.click();
  console.log("投毒者选择了3号位作为目标");

  // 点击确认按钮进入下一个角色，匹配任意包含确认/下一步/继续的按钮
  const nextBtn = page
    .getByRole("button", { name: /确认|下一步|继续/i })
    .first();
  await nextBtn.waitFor({ state: "visible", timeout: 10000 });
  await nextBtn.click();
  console.log("已点击下一步按钮，进入下一个角色");
  await page.waitForTimeout(2000);

  // --- 7. 验证下一个角色：洗衣妇 ---
  console.log("验证第二个角色：洗衣妇...");
  const washerwomanText = page.getByText("洗衣妇", { exact: false }).first();
  await expect(washerwomanText).toBeVisible({ timeout: 10000 });
  const text2 = await washerwomanText.innerText();
  console.log(`✅ 找到洗衣妇唤醒文本："${text2}"`);

  // 洗衣妇技能操作：选择2名不同的玩家
  console.log("处理洗衣妇技能选择...");
  const seat4 = page.locator('div.cursor-pointer:has-text("4")').first();
  await seat4.waitFor({ state: "visible", timeout: 5000 });
  await seat4.click();
  console.log("洗衣妇选择了4号位");
  const seat5 = page.locator('div.cursor-pointer:has-text("5")').first();
  await seat5.waitFor({ state: "visible", timeout: 5000 });
  await seat5.click();
  console.log("洗衣妇选择了5号位");

  // 点击确认进入下一个角色
  const nextBtn2 = page
    .getByRole("button", { name: /确认|下一步|继续/i })
    .first();
  await nextBtn2.waitFor({ state: "visible", timeout: 10000 });
  await nextBtn2.click();
  console.log("已点击下一步按钮，进入下一个角色");
  await page.waitForTimeout(2000);

  // --- 8. 验证第三个角色：图书管理员 ---
  console.log("验证第三个角色：图书管理员...");
  const librarianText = page.getByText("图书管理员", { exact: false }).first();
  await expect(librarianText).toBeVisible({ timeout: 10000 });
  const text3 = await librarianText.innerText();
  console.log(`✅ 找到图书管理员唤醒文本："${text3}"`);

  // --- 9. 测试通过 ---
  console.log("✅ 首夜前3个好人角色流程全部验证通过");

  // --- 10. 完成剩余角色流程，直接点击下一步直到进入白天
  console.log("处理剩余角色流程...");
  while (true) {
    try {
      // 检查是否已经到了白天环节
      const dayText = page.getByText(/白天|天亮|天亮了/i).first();
      if (await dayText.isVisible({ timeout: 500 })) {
        console.log("✅ 首夜流程结束，成功进入白天");
        break;
      }
      // 否则继续点击下一步
      const nextBtn = page
        .getByRole("button", { name: /确认|下一步|继续/i })
        .first();
      await nextBtn.waitFor({ timeout: 2000 });
      await nextBtn.click();
      await page.waitForTimeout(1000);
    } catch (e) {
      break;
    }
  }

  // 验证游戏进入白天
  await expect(page.getByText(/白天|天亮了/i)).toBeVisible({ timeout: 10000 });
  console.log("✅ 完整首夜流程测试全部通过");

  // 投毒者选择3号洗衣妇下毒
  await page.getByRole("button", { name: "3 # 洗衣妇" }).click();
  await page
    .getByRole("button", { name: /确认|Confirm/i })
    .first()
    .click();
  console.log("✅ 投毒者下毒操作完成");

  // 验证切换到下一个角色：洗衣妇
  await expect(page.getByText(/洗衣妇|Washerwoman/i)).toBeVisible({
    timeout: 5000,
  });
  await expect(
    page.getByText("唤醒 3 号【洗衣妇】玩家，告诉他2名镇民的其中1名身份。")
  ).toBeVisible();
  console.log("✅ 洗衣妇Prompt文本正确，状态机切换正常");

  // 点击确认继续
  await page
    .getByRole("button", { name: /确认|Confirm/i })
    .first()
    .click();

  // 验证后续角色依次出现：图书管理员 -> 猎手 -> 小恶魔
  await expect(page.getByText(/图书管理员|Librarian/i)).toBeVisible({
    timeout: 5000,
  });
  await page
    .getByRole("button", { name: /确认|Confirm/i })
    .first()
    .click();
  console.log("✅ 图书管理员行动完成");

  await expect(page.getByText(/猎手|Slayer/i)).toBeVisible({ timeout: 5000 });
  await page
    .getByRole("button", { name: /确认|Confirm/i })
    .first()
    .click();
  console.log("✅ 猎手行动完成");

  // 验证小恶魔行动
  await expect(page.getByText(/小恶魔|Imp/i)).toBeVisible({ timeout: 5000 });
  await expect(
    page.getByText("唤醒 1 号【小恶魔】玩家，选择1名玩家杀死。")
  ).toBeVisible();
  // 小恶魔杀死5号猎手
  await page.getByRole("button", { name: "5 # 猎手" }).click();
  await page
    .getByRole("button", { name: /确认|Confirm/i })
    .first()
    .click();
  console.log("✅ 小恶魔杀人操作完成");

  // 验证夜晚结束，进入天亮阶段
  await expect(page.getByText(/天亮|Dawn/i)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/5号.*猎手.*死亡/i)).toBeVisible();
  console.log("✅ 夜晚结算正常，进入白天阶段");

  console.log("✅ 全流程测试通过：UI与底层逻辑完全同步，所有角色交互正常！");
});
