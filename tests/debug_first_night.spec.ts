/**
 * 首夜流程全真调试测试 — 精确版
 * 
 * 完整模拟用户操作：选剧本 → 快速测试 → 核对身份 → 入夜 → 逐步点击确认
 * 在每一步捕获：
 *   - 页面可见文本
 *   - 控制台日志（特别是 [系统]、[continueToNextAction] 等）
 *   - 按钮是否可点击
 *   - 弹窗状态
 */

import { test, expect, Page } from '@playwright/test';

test.describe('首夜流程调试', () => {
  test.setTimeout(120000);

  let consoleLogs: string[] = [];

  async function collectPageState(page: Page, stepName: string): Promise<void> {
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 2000) || 'EMPTY');
    const buttons = await page.evaluate(() => 
      Array.from(document.querySelectorAll('button'))
        .map(b => ({ text: b.textContent?.trim(), disabled: b.disabled, visible: b.offsetParent !== null }))
        .filter(b => b.text && b.visible)
        .slice(0, 20)
    );
    
    // 检查是否有弹窗/overlay
    const hasModal = await page.evaluate(() => {
      const modals = document.querySelectorAll('[class*="modal"], [class*="Modal"], [role="dialog"]');
      return {
        count: modals.length,
        texts: Array.from(modals).map(m => m.textContent?.trim()?.substring(0, 200))
      };
    });

    // 获取关键的游戏状态信息
    const gameState = await page.evaluate(() => {
      // 尝试从 React fiber 或 DOM 中获取一些线索
      const phaseEl = document.querySelector('[class*="phase"], [data-phase]');
      const nightInfoEl = document.querySelector('[class*="wake"], [class*="night-info"]');
      return {
        phaseText: phaseEl?.textContent?.trim() || 'N/A',
        nightInfoText: nightInfoEl?.textContent?.trim()?.substring(0, 500) || 'N/A',
        url: window.location.href,
      };
    });

    console.log(`\n========== ${stepName} ==========`);
    console.log(`[PAGE TEXT]\n${bodyText.substring(0, 1000)}`);
    console.log(`\n[BUTTONS]`);
    buttons.forEach((b, i) => console.log(`  ${i}: "${b.text}" disabled=${b.disabled}`));
    console.log(`\n[MODAL]`, JSON.stringify(hasModal));
    console.log(`\n[GAME STATE]`, JSON.stringify(gameState));
    console.log(`[RECENT LOGS]`, consoleLogs.slice(-30).join('\n'));
    console.log('========================================\n');
  }

  async function clickAndCollect(page: Page, stepName: string, selectorOrFn: string | (() => Promise<void>)): Promise<boolean> {
    await collectPageState(page, `BEFORE_${stepName}`);
    
    try {
      if (typeof selectorOrFn === 'string') {
        // 先等按钮出现并可点击
        const btn = page.locator(selectorOrFn).first();
        await btn.waitFor({ state: 'visible', timeout: 10000 });
        
        // 检查是否 disabled
        const isDisabled = await btn.isDisabled();
        if (isDisabled) {
          console.log(`[WARNING] 按钮 "${selectorOrFn}" 是 DISABLED 状态!`);
          // 尝试强制点击
          await btn.click({ force: true, timeout: 5000 });
        } else {
          await btn.click({ timeout: 10000 });
        }
      } else {
        await selectorOrFn();
      }
      
      // 等待一下让 React 更新
      await page.waitForTimeout(1500);
      
      await collectPageState(page, `AFTER_${stepName}`);
      return true;
    } catch (e: any) {
      console.log(`[ERROR] ${stepName} 失败: ${e.message}`);
      await collectPageState(page, `ERROR_${stepName}`);
      return false;
    }
  }

  test('完整首夜流程 - 暗流涌动', async ({ page }) => {
    // 收集所有控制台日志
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(`[${msg.type()}] ${text}`);
      // 特别关注关键日志
      if (text.includes('continueToNextAction') || text.includes('handleNight') ||
          text.includes('executeViaNewEngine') || text.includes('handlerResult') ||
          text.includes('preCheck') || text.includes('blocked') ||
          text.includes('系统步骤') || text.includes('无 handler') ||
          text.includes('nightInfo') || text.includes('ability') ||
          text.includes('error') || text.includes('Error') ||
          text.includes('stuck') || text.includes('安全网')) {
        console.log(`  ★ ${text}`);
      }
    });
    
    // 收集页面错误
    page.on('pageerror', err => {
      consoleLogs.push(`[PAGE ERROR] ${err.message}`);
      console.log(`  ❌ PAGE ERROR: ${err.message}`);
    });
    
    // 失败的请求
    page.on('requestfailed', req => {
      consoleLogs.push(`[REQ FAILED] ${req.url()} - ${req.failure()?.errorText}`);
    });

    // === Step 1: 打开首页 ===
    console.log('\n\n===== 开始测试 =====\n');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await collectPageState(page, 'STEP1_HOME');
    await page.screenshot({ path: '/workspace/debug_e2e_01_home.png' });

    // === Step 2: 选择暗流涌动剧本 ===
    const scriptBtn = page.locator('text=暗流涌动').first();
    await expect(scriptBtn).toBeVisible({ timeout: 10000 });
    await scriptBtn.click();
    await page.waitForTimeout(1500);
    await collectPageState(page, 'STEP2_SCRIPT_SELECTED');

    // 点击"进入配置"
    const configBtn = page.locator('text=进入配置').first();
    if (await configBtn.count() > 0) {
      await configBtn.click();
      await page.waitForTimeout(1500);
    }
    await collectPageState(page, 'STEP2B_CONFIG');
    await page.screenshot({ path: '/workspace/debug_e2e_02_config.png' });

    // === Step 3: 快速测试 ===
    const quickTestBtn = page.locator('text=快速测试').or(page.locator('button:has-text("快速测试")')).first();
    
    // 尝试多种可能的快速测试按钮文本
    const quickTestFound = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => 
        b.textContent?.includes('快速测试') || 
        b.textContent?.includes('快速开始') ||
        b.textContent?.includes('开始游戏')
      );
      if (btn) { btn.click(); return true; }
      return false;
    });

    if (!quickTestFound) {
      console.log('[WARNING] 未找到快速测试按钮，尝试其他方式...');
      // 可能已经在配置页了
    }

    await page.waitForTimeout(3000);
    await collectPageState(page, 'STEP3_AFTER_QUICK_TEST');
    await page.screenshot({ path: '/workspace/debug_e2e_03_quicktest.png' });

    // === Step 4: 进入核对身份阶段 / 入夜 ===
    // 查找并点击"确认无误，入夜" 或类似的进入夜晚按钮
    const enteredNight = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button:not([disabled])'));
      const btn = buttons.find(b => 
        b.textContent?.includes('入夜') || 
        b.textContent?.includes('开始核对') ||
        b.textContent?.includes('确认无误')
      );
      if (btn) { 
        console.log('[FIND] 找到入夜按钮:', btn.textContent?.trim());
        btn.click(); 
        return true; 
      }
      console.log('[MISSING] 未找到入夜按钮，可用按钮:', buttons.map(b => b.textContent?.trim()));
      return false;
    });

    if (!enteredNight) {
      console.log('[INFO] 尝试查找任何可用的主要操作按钮...');
      await page.screenshot({ path: '/workspace/debug_e2e_3b_nobutton.png' });
    }

    await page.waitForTimeout(3000);
    await collectPageState(page, 'STEP4_TRY_ENTER_NIGHT');
    await page.screenshot({ path: '/workspace/debug_e2e_04_enter_night.png' });

    // 如果在核对身份阶段，等待倒计时或手动推进
    // 核对身份阶段可能有倒计时自动进入首夜
    for (let waitSec = 0; waitSec < 10; waitSec++) {
      const currentPhase = await page.evaluate(() => document.body?.innerText);
      
      // 检查是否已经到了夜晚阶段
      if (currentPhase.includes('首夜') || currentPhase.includes('唤醒') || 
          currentPhase.includes('确认') && currentPhase.includes('下一步') ||
          currentPhase.includes('恶魔') && currentPhase.includes('信息')) {
        console.log(`[INFO] 经过 ${waitSec}s 等待后已进入夜晚阶段`);
        break;
      }
      
      // 尝试找"入夜"按钮再点一次
      if (waitSec === 3 || waitSec === 7) {
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button:not([disabled])'));
          const btn = buttons.find(b => 
            b.textContent?.includes('入夜') || 
            b.textContent?.includes('下一步') ||
            b.textContent?.includes('确认')
          );
          if (btn) { 
            console.log('[RETRY] 重试点击:', btn.textContent?.trim()); 
            btn.click(); 
          }
        });
      }
      
      await page.waitForTimeout(1000);
    }

    await collectPageState(page, 'STEP5_NIGHT_PHASE_CHECK');
    await page.screenshot({ path: '/workspace/debug_e2e_05_night_phase.png' });

    // === Step 5-N: 循环点击"确认&下一步"，直到白天或无法继续 ===
    console.log('\n\n===== 开始夜晚循环点击 =====\n');
    
    let stuckCount = 0;
    const MAX_STUCK = 3; // 连续多次页面无变化则判定为卡住
    let prevText = '';
    
    for (let step = 1; step <= 25; step++) {
      // 尝试找到并点击确认按钮
      const clickResult = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        
        // 优先找"确认 & 下一步"或类似的主按钮
        const confirmBtn = buttons.find(b => {
          const t = b.textContent || '';
          return (t.includes('确认') && t.includes('下一步')) ||
                 t.includes('天亮了') ||
                 t.includes('展开对局记录') ||
                 (t.includes('确认') && !t.includes('取消') && !t.includes('返回'));
        });
        
        if (confirmBtn) {
          const disabled = confirmBtn.disabled;
          const text = confirmBtn.textContent?.trim();
          
          if (disabled) {
            return { success: false, reason: `BUTTON_DISABLED: "${text}"` };
          }
          
          // 检查 visibility
          const rect = confirmBtn.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) {
            return { success: false, reason: `BUTTON_HIDDEN: "${text}"` };
          }
          
          confirmBtn.click();
          return { success: true, clicked: text };
        }
        
        // 列出所有可见按钮供调试
        const visibleButtons = buttons
          .filter(b => {
            const r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          })
          .map(b => b.textContent?.trim())
          .slice(0, 15);
        
        return { success: false, reason: `NO_CONFIRM_BUTTON found. Visible: [${visibleButtons.join(', ')}]` };
      });
      
      if (!clickResult.success) {
        console.log(`\n[NIGHT STEP ${step}] ⚠️ ${clickResult.reason}`);
        stuckCount++;
        
        if (stuckCount >= MAX_STUCK) {
          console.log(`\n[STUCK DETECTED] 连续 ${MAX_STUCK} 次无法点击确认按钮，判定为卡住！`);
          await collectPageState(page, `STUCK_AT_STEP${step}`);
          await page.screenshot({ path: `/workspace/debug_e2e_stuck_step${step}.png` });
          break;
        }
      } else {
        stuckCount = 0;
        console.log(`\n[NIGHT STEP ${step}] ✅ 点击成功: "${clickResult.clicked}"`);
      }
      
      // 等待页面更新
      await page.waitForTimeout(2000);
      
      // 截图和收集状态
      const currentText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
      
      if (step <= 10 || step % 5 === 0 || !clickResult.success) {
        await collectPageState(page, `NIGHT_STEP${step}`);
        await page.screenshot({ path: `/workspace/debug_e2e_night_step${step}.png` });
      }
      
      // 检测是否到达白天
      if (currentText.includes('白天') || currentText.includes('黄昏') || 
          currentText.includes('平安夜') || currentText.includes('死亡报告') ||
          currentText.includes('讨论') || currentText.includes('提名')) {
        console.log(`\n✅ [NIGHT STEP ${step}] 夜晚结束，进入白天阶段！`);
        await collectPageState(page, 'DAY_PHASE_REACHED');
        await page.screenshot({ path: '/workspace/debug_e2e_day_reached.png' });
        break;
      }
      
      // 检测页面是否有变化
      if (currentText === prevText && clickResult.success) {
        console.log(`  [NOTE] 页面文本与上一步相同（可能 UI 未更新）`);
      }
      prevText = currentText;
    }

    // 最终汇总
    console.log('\n\n===== 测试结束 - 最终状态 =====\n');
    await collectPageState(page, 'FINAL_STATE');
    await page.screenshot({ path: '/workspace/debug_e2e_final.png' });
    
    // 输出所有关键控制台日志摘要
    console.log('\n\n===== 关键日志摘要 =====');
    const keyLogs = consoleLogs.filter(l => 
      l.includes('continueToNextAction') ||
      l.includes('handlerResult') ||
      l.includes('executeViaNewEngine') ||
      l.includes('preCheck') ||
      l.includes('blocked') ||
      l.includes('系统步骤') ||
      l.includes('无 handler') ||
      l.includes('nightInfo') ||
      l.includes('安全网') ||
      l.includes('Error') ||
      l.includes('error') ||
      l.includes('stuck')
    );
    keyLogs.forEach(l => console.log(`  ${l}`));
    console.log(`\n总日志条数: ${consoleLogs.length}, 关键日志: ${keyLogs.length}`);
  });
});
