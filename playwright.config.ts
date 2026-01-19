import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 配置文件
 * 用于运行 E2E 测试
 * 
 * 运行测试：
 *   npx playwright test
 *   npx playwright test --ui
 *   npx playwright test tests/e2e_scenario_tb.spec.ts
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts$/,
  
  // 完全并行运行测试
  fullyParallel: true,
  
  // CI 环境下失败时停止
  forbidOnly: !!process.env.CI,
  
  // 重试失败的测试
  retries: process.env.CI ? 2 : 0,
  
  // 工作进程数量
  workers: process.env.CI ? 1 : undefined,
  
  // 报告器
  reporter: [
    ['html'],
    ['list'],
  ],
  
  // 共享设置
  use: {
    // 基础 URL
    baseURL: process.env.E2E_URL || 'http://localhost:3000',
    
    // 收集追踪信息（失败时）
    trace: 'on-first-retry',
    
    // 截图（失败时）
    screenshot: 'only-on-failure',
    
    // 视频（失败时）
    video: 'retain-on-failure',
  },

  // 项目配置
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Web 服务器配置（如果需要自动启动服务器）
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});















