import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E 配置 —— 血染钟楼说书人助手
 *
 * 目的：补上「**真实浏览器点击流**」验证层。
 * 此前的 UI 验证是 jsdom 组件渲染级（断言 DOM 文案），
 * 本层在**真实 Chromium** 里跑完整交互：落座 → 入夜 → 夜晚 → 黎明 → 白天。
 *
 * ⚠️ 端口选择：**固定用 3100，不用 3000**。
 *   本机常驻多个残留 dev server 占着 3000/3001/3002（自动化轮次遗留，且
 *   权限不足杀不掉），3000 上返回的可能是**另一个 App**（实测 404），
 *   会导致 E2E 点到完全无关的页面。改用冷门端口彻底避开。
 *
 * ⚠️ 本机环境注意（来自项目记忆）：
 *   · 系统 http_proxy 会拦 localhost → dev server 需 unset 代理
 *   · dev server 需 `NODE_OPTIONS=""`
 *
 * ⚠️ vitest 侧已在 `vitest.config.ts` 排除 `**\/e2e/**`，避免误扫本目录。
 */
export default defineConfig({
  testDir: "./e2e",
  /**
   * ✅ 2026-10-23：`*.wip.spec.ts` 排除机制**已退役**（不再有 testIgnore）。
   *
   * 最后一个 WIP —— `e2e/wip/day_cycle.wip.spec.ts` —— 已转正并迁到
   * `e2e/poppyganda/day_cycle.spec.ts`：罂粟花开「夜 → 白天 → 黄昏」完整点击流，
   * 实测纳入默认套件（单次约 2 分钟，含 `retries: 1` 抗跑批抖动）。
   *
   * 🔴 将来再出现未稳定用例，**不要**重建 wip 目录 / 环境变量开关：
   *   直接 `test.fixme(true, "判据指向 <符号>：<原因>")`，
   *   由 `src/utils/__tests__/e2e_skip_ratchet.test.ts` 冻结数量（只许减不许增）。
   *   理由：wip 目录会让人误以为"永远不进套件"，而 fixme 是显式欠账、有护栏。
   */
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  /**
   * 重试 1 次：跨日驱动链路（day_cycle）在**整套并行/连续跑**时偶发抖动
   * （单跑稳定通过），加一次重试消除跑批抖动。
   */
  retries: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    launchOptions: {
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  /**
   * ⚠️ 刻意**不使用 `webServer`**。
   *   本机实测：Playwright 托管 dev server 会导致进程**无法退出**
   *   （挂死 3 分 45 秒以上，超时参数也不生效）。
   *   约定：由外部先起好 dev server（`PORT=3100 npx next dev -p 3100`），
   *   Playwright 只负责连上去跑。
   */
});
