/**
 * 发牌专用随机源（2026-10-20）。
 *
 * ## 为什么不能直接用全局 `Math.random`
 *
 * 发牌（随机落座 + 阵容抽取）此前直接调用 `Math.random`，但同一页面里还有
 * 大量**与发牌无关**的 `Math.random()` 调用，例如：
 *   · `GameModals.tsx`   `id: \`auto-${Date.now()}-${Math.random()...}\``
 *   · `GlobalNavBar.tsx` `id: \`snap_${Date.now()}_${Math.random()...}\``
 *   · `ReminderTokenPanel.tsx` 提醒标记 id
 * 这些调用的**次数取决于渲染批次**（异步 state 更新、弹窗开关次数）。
 * 后果实测：E2E 里同一个 `SEED=999` 跑两次，一次小恶魔局、一次军团×7 局——
 * 发牌消耗到的随机序列位置不同，**回归完全不成立**。
 *
 * 早期尝试「把全局 `Math.random` 换成 LCG」也失败：确实替换成功了
 * （E2E 里 `String(Math.random)` 已验证），但渲染路径的随机调用依旧在
 * 抢同一个序列，发牌结果照样漂移。
 *
 * ## 做法
 *
 * 发牌走独立入口 `nextDealRandom()`：
 *   · 生产：未注入时**等价于 `Math.random()`**，行为完全不变；
 *   · 测试：`window.__CT_DEAL_SEED__` 存在时启用 LCG，且该序列**只被发牌消耗**，
 *     与渲染路径彻底隔离 ⇒ 同 seed 必得同阵容。
 *
 * 注入口通过 Playwright 的 `page.addInitScript` 在导航前写入，见
 * `e2e/helpers/scriptFlow.ts::enterFirstNight`。
 */

/** 注入的发牌随机源（null = 使用全局 Math.random，即生产默认行为） */
let injected: (() => number) | null = null;

/** 与 E2E 驱动器同款的 32 位 LCG，保证「页面内发牌」与「驱动器点击」可对齐 */
function makeLcg(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** 显式设置/清除发牌随机源（单测可直接用） */
export function setDealRng(fn: (() => number) | null): void {
  injected = fn;
}

/** 取一个发牌用随机数：(0,1) 均匀分布，语义与 `Math.random()` 一致 */
export function nextDealRandom(): number {
  return injected ? injected() : Math.random();
}

// 浏览器侧注入口：模块首次加载时读取 `window.__CT_DEAL_SEED__`。
// SSR 阶段 `window` 不存在 ⇒ 跳过，生产构建里这就是一次无害的判断。
if (typeof window !== "undefined") {
  const seed = (window as unknown as { __CT_DEAL_SEED__?: number })
    .__CT_DEAL_SEED__;
  if (typeof seed === "number" && Number.isFinite(seed)) {
    injected = makeLcg(seed);
  }
}
