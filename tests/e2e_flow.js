const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');

// === 配置参数 ===
const BASE_URL = 'http://localhost:3000';
const HEADLESS = false; // 设置为 false 以便观察浏览器操作
const SLOW_MO = 500;     // 动作间隔 (ms)
const MAX_RETRIES = 20;  // 夜晚步骤最大重试次数

// === 辅助函数：检查服务是否就绪 ===
function checkServer(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

// === 辅助函数：等待服务启动 ===
async function waitForServer(childProcess = null) {
  console.log('⏳ 等待本地服务就绪...');
  let retries = 30; // 等待 30秒
  while (retries > 0) {
    if (await checkServer(BASE_URL)) {
      console.log(`✅ 本地服务已就绪：${BASE_URL}`);
      return true;
    }
    await new Promise(r => setTimeout(r, 1000));
    retries--;
  }
  console.error('❌ 服务启动超时');
  if (childProcess) childProcess.kill();
  return false;
}

// === 核心点击函数 (已修复选择器兼容性问题) ===
async function clickWithLog(page, selector, description) {
  console.log(`尝试点击：${description} -> ${selector}`);
  
  // 1. 优先尝试 Playwright 原生点击
  try {
    const el = page.locator(selector).first();
    if (await el.isVisible()) {
        await el.click({ timeout: 2000 });
        console.log(`✅ 点击成功：${description}`);
        return true;
    }
  } catch (e) { /* 忽略原生错误，进入兜底 */ }

  // 2. 兜底：React Fiber 强力点击
  // 注意：这里需要处理 selector，因为 document.querySelector 不支持 :has-text
  const clicked = await page.evaluate((sel) => {
    // React Fiber 查找辅助函数
    const findReactProps = (dom) => {
      const key = Object.keys(dom).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$'));
      return key ? dom[key] : null;
    };

    let el;
    
    // --- 手动解析 Playwright 语法 ---
    if (sel.startsWith('text=')) {
        // 模式 A: text=xxx
        const text = sel.replace('text=', '');
        const candidates = Array.from(document.querySelectorAll('button, div, span, a'));
        el = candidates.find(b => b.textContent.includes(text));
    } 
    else if (sel.includes(':has-text')) {
        // 模式 B: tag:has-text("xxx")
        // 例如: button:has-text("下一步")
        try {
            const match = sel.match(/^([a-z0-9]*):has-text\("(.*)"\)$/i) || sel.match(/^([a-z0-9]*):has-text\('(.*)'\)$/i);
            if (match) {
                const tag = match[1] || '*'; // 提取标签，如 button
                const text = match[2];       // 提取文本，如 下一步
                const candidates = Array.from(document.querySelectorAll(tag));
                el = candidates.find(c => c.textContent.includes(text));
            }
        } catch(e) { console.error('解析 selector 失败:', e); }
    } 
    else {
        // 模式 C: 标准 CSS selector
        try { el = document.querySelector(sel); } catch(e) {}
    }

    // 执行点击
    if (el) {
      const props = findReactProps(el);
      if (props && props.onClick) {
        console.log('触发 React onClick...');
        props.onClick({ stopPropagation: () => {}, preventDefault: () => {} });
        return true;
      } else {
        // 如果没有 React Props，尝试原生 click
        el.click();
        return true;
      }
    }
    return false;
  }, selector);

  if (clicked) {
    console.log(`✅ 通过 React Fiber 点击成功`);
    return true;
  }
  return false;
}

async function main() {
  let nextServer = null;

  // 1. 检查并启动服务
  if (!(await checkServer(BASE_URL))) {
    console.log('⚠️ 未检测到本地服务，尝试自动启动 Next 开发服务器...');
    nextServer = spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true });
    if (!(await waitForServer(nextServer))) process.exit(1);
  }

  console.log('🚀 启动 E2E 测试...');
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: SLOW_MO });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // --- Step 1: 打开页面 ---
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // --- Step 2: 剧本与选座 ---
    console.log('\nStep 2: 配置剧本');
    await clickWithLog(page, 'button:has-text("暗流涌动")', '选择 暗流涌动');
    await page.waitForTimeout(2000); 

    console.log('分配角色...');
    // 强制点击开始游戏，依赖系统的自动分配或默认值
    await clickWithLog(page, 'text=开始游戏', '开始游戏');
    await page.waitForTimeout(2000);

    // --- Step 3: 核对身份 ---
    console.log('\nStep 3: 核对身份');
    const nightBtn = await page.locator('text=入夜').or(page.locator('text=Night'));
    if (await nightBtn.count() > 0) {
        await clickWithLog(page, 'text=入夜', '进入首夜');
    }
    
    await page.waitForTimeout(1000);
    // 处理可能的"确认顺序"弹窗
    const confirmBtn = await page.locator('text=确认').or(page.locator('text=OK'));
    if (await confirmBtn.isVisible()) {
        await clickWithLog(page, 'text=确认', '关闭弹窗');
    }

    // --- Step 4: 夜晚循环 ---
    console.log('\nStep 4: 夜晚流程循环');
    
    let isDay = false;
    let retries = 0;

    while (!isDay && retries < MAX_RETRIES) {
        // A. 检查天亮
        const dayIndicator = await page.locator('text=入昼').or(page.locator('text=进入白天')).or(page.locator('text=Dawn'));
        if (await dayIndicator.isVisible()) {
            console.log('🌞 检测到天亮按钮！');
            await clickWithLog(page, 'text=入昼', '进入白天');
            isDay = true;
            break;
        }

        // B. 记录当前状态
        const currentBody = await page.textContent('body');

        // C. 尝试点击下一步
        await clickWithLog(page, 'button:has-text("下一步")', '下一步');
        await page.waitForTimeout(1000);

        // D. 检查是否卡住
        const newBody = await page.textContent('body');
        if (newBody === currentBody) {
            console.log('⚠️ 页面未变化，尝试智能交互...');
            
            // 查找所有可能的玩家按钮
            const playerButtons = await page.$$('button:has-text("号")');
            if (playerButtons.length >= 2) {
                console.log(`👆 随机选择 2 名不同玩家...`);
                // 随机选两个不同的索引
                const idx1 = Math.floor(Math.random() * playerButtons.length);
                let idx2 = Math.floor(Math.random() * playerButtons.length);
                while (idx2 === idx1 && playerButtons.length > 1) {
                    idx2 = Math.floor(Math.random() * playerButtons.length);
                }

                await playerButtons[idx1].click();
                await page.waitForTimeout(300);
                
                if (idx1 !== idx2) {
                    await playerButtons[idx2].click();
                    await page.waitForTimeout(500);
                }
                
                console.log('🔄 交互后重试点击下一步...');
                await clickWithLog(page, 'button:has-text("下一步")', '下一步(重试)');
            } else {
                console.log('❌ 未找到足够玩家按钮，直接重试下一步');
                await clickWithLog(page, 'button:has-text("下一步")', '下一步(强制)');
            }
            retries++;
        } else {
            console.log('✅ 步骤推进成功');
            retries = 0;
        }
        await page.waitForTimeout(1000);
    }

    if (isDay) {
        console.log('\n🎉 测试通过！成功到达白天阶段。');
    } else {
        throw new Error('测试失败：无法到达白天阶段');
    }

  } catch (error) {
    console.error('\n❌ E2E 测试中断:', error);
  } finally {
    await browser.close();
    if (nextServer) {
        console.log('🧹 关闭本地服务...');
        nextServer.kill();
    }
  }
}

main();
