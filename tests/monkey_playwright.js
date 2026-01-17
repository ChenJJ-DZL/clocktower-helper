/**
 * 简易"猴子测试"脚本（Playwright）
 * 作用：随机点击页面可交互元素，并检测 UI 死锁、页面崩溃和控制台错误
 *
 * 新增功能：
 * - 监听控制台错误（Console Error），一旦出现立即停止并截图
 * - 监听 React 崩溃页面，检测到错误边界立即停止并截图
 * - 改进卡顿检测：连续 5 秒点击页面元素没有任何反应，视为 UI 无响应，报错退出
 *
 * 运行前置：
 *   npm i -D playwright
 *
 * 运行：
 *   node tests/monkey_playwright.js
 *
 * 默认访问：http://localhost:3000
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 配置
const TARGET_URL = process.env.MONKEY_URL || 'http://localhost:3000';
const MAX_ACTIONS = 300;          // 最大点击次数
const STALL_DETECTION_TIME_MS = 5_000;  // 卡顿检测时间：5秒
const VIEWPORT = { width: 1280, height: 720 };
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

// 确保截图目录存在
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// 全局错误状态
let hasError = false;
let errorMessage = '';
let lastConsoleError = null;

// 获取页面状态指纹：URL + body 文本长度 + 打开弹窗数量
async function getStateFingerprint(page) {
  const url = page.url();
  const { textLength, dialogCount } = await page.evaluate(() => {
    const bodyText = document.body ? document.body.innerText || '' : '';
    const dialogs = document.querySelectorAll('[role="dialog"], .modal, .dialog, .popup');
    return { textLength: bodyText.length, dialogCount: dialogs.length };
  });
  return `${url}|${textLength}|${dialogCount}`;
}

// 获取可点击元素列表
async function getClickableElements(page) {
  const selectors = [
    'button',
    '[role="button"]',
    'a[href]',
    'input[type="button"]',
    'input[type="submit"]',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])'
  ];
  const handles = await page.$$(selectors.join(','));
  const visibles = [];
  for (const h of handles) {
    if (await h.isVisible()) visibles.push(h);
  }
  return visibles;
}

async function randomClick(page) {
  const elements = await getClickableElements(page);
  if (!elements.length) return false;
  const target = elements[Math.floor(Math.random() * elements.length)];
  try {
    await target.click({ timeout: 2000 });
    return true;
  } catch (err) {
    // 点击失败不算错误，可能是元素被遮挡或其他原因
    return false;
  }
}

// 检测 React 崩溃页面
async function checkReactCrash(page) {
  try {
    const bodyText = await page.textContent('body');
    const crashIndicators = [
      /something went wrong/i,
      /error boundary/i,
      /应用崩溃/i,
      /页面出错/i,
      /react error/i,
      /chunk load error/i,
      /failed to fetch/i,
    ];
    
    for (const pattern of crashIndicators) {
      if (pattern.test(bodyText || '')) {
        return true;
      }
    }
    
    // 检查是否有 React 错误边界的典型结构
    const errorBoundary = await page.$('[data-react-error-boundary]');
    if (errorBoundary) {
      return true;
    }
    
    return false;
  } catch (err) {
    // 检查过程中出错，不算崩溃
    return false;
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  
  // 监听控制台错误
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error') {
      const text = msg.text();
      hasError = true;
      errorMessage = `控制台错误: ${text}`;
      lastConsoleError = text;
      console.error(`❌ 检测到控制台错误: ${text}`);
    }
  });
  
  // 监听页面错误
  page.on('pageerror', (error) => {
    hasError = true;
    errorMessage = `页面错误: ${error.message}`;
    console.error(`❌ 检测到页面错误: ${error.message}`);
  });
  
  // 监听请求失败
  page.on('requestfailed', (request) => {
    const url = request.url();
    const failure = request.failure();
    if (failure && failure.errorText && !failure.errorText.includes('net::ERR_ABORTED')) {
      // ERR_ABORTED 通常是正常的（如取消的请求），不视为错误
      hasError = true;
      errorMessage = `请求失败: ${url} - ${failure.errorText}`;
      console.error(`❌ 检测到请求失败: ${url} - ${failure.errorText}`);
    }
  });

  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });

  let lastFingerprint = await getStateFingerprint(page);
  let lastChangeTime = Date.now();
  let lastResponseTime = Date.now();  // 最后有响应的时间（包括点击成功或状态变化）

  for (let i = 0; i < MAX_ACTIONS; i++) {
    // 检查是否有错误发生
    if (hasError) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = path.join(SCREENSHOT_DIR, `monkey-error-${ts}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.error(`\n❌ 检测到错误，测试停止`);
      console.error(`错误信息: ${errorMessage}`);
      console.error(`已截图: ${screenshotPath}`);
      await browser.close();
      process.exit(1);
    }
    
    // 检查 React 崩溃页面
    const isCrashed = await checkReactCrash(page);
    if (isCrashed) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = path.join(SCREENSHOT_DIR, `monkey-react-crash-${ts}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.error(`\n❌ 检测到 React 崩溃页面`);
      console.error(`已截图: ${screenshotPath}`);
      await browser.close();
      process.exit(1);
    }
    
    // 尝试点击
    const clicked = await randomClick(page);
    
    // 如果点击成功，更新最后响应时间
    if (clicked) {
      lastResponseTime = Date.now();
    }
    
    // 轻微等待，让页面有时间响应
    await page.waitForTimeout(80 + Math.random() * 120);

    // 检查状态变化（这表示页面有响应）
    const currentFingerprint = await getStateFingerprint(page);
    if (currentFingerprint !== lastFingerprint) {
      lastFingerprint = currentFingerprint;
      lastChangeTime = Date.now();
      
      // 状态变化意味着有响应，重置最后响应时间
      lastResponseTime = Date.now();
    }
    
    // 检查卡顿：连续 5 秒点击页面元素没有任何反应
    // 如果既没有成功点击，也没有状态变化，说明 UI 无响应
    const timeSinceLastResponse = Date.now() - lastResponseTime;
    if (timeSinceLastResponse >= STALL_DETECTION_TIME_MS) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = path.join(SCREENSHOT_DIR, `monkey-stall-${ts}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.error(`\n❌ UI 无响应：连续 ${STALL_DETECTION_TIME_MS / 1000} 秒点击页面元素没有任何反应`);
      console.error(`最后状态指纹: ${lastFingerprint}`);
      console.error(`当前 URL: ${page.url()}`);
      console.error(`最后响应时间: ${new Date(lastResponseTime).toISOString()}`);
      console.error(`已截图: ${screenshotPath}`);
      await browser.close();
      process.exit(1);
    }
    
    // 定期输出进度
    if ((i + 1) % 50 === 0) {
      console.log(`✅ 已完成 ${i + 1} 次点击，状态正常`);
    }
  }

  console.log(`\n✅ Monkey 测试完成：共执行 ${MAX_ACTIONS} 次点击，未发现错误`);
  await browser.close();
}

main().catch((err) => {
  console.error('Monkey test 出错：', err);
  process.exit(1);
});

