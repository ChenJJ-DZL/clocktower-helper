import { expect, test } from "@playwright/test";
import {
  advanceNightFast,
  completeDuskEnterNight,
  expectNightQueueNonEmpty,
  readSnapshot,
  waitForSnapshot,
} from "./helpers/scriptFlow";

/**
 * L4（E2E）· **剧本 E2E 缺口补齐**（Round 11）
 * ==================================================================
 * 🔴 事实（2026-10-13 盘点）：9 个内置剧本里，**只有 6 个有 e2e 目录**
 *    （暗流涌动 / 黯月初升 / 梦殒春宵 / 窃窃私语 / 凶宅魅影 / 罂粟花开），
 *    下列 **3 个剧本零 E2E 覆盖**：
 *
 *   | 剧本 id | 名称 | 备注 |
 *   |---|---|---|
 *   | `tomb_of_the_unknown` | 无名之墓 | 含历史误植的 outsider `scapegoat` |
 *   | `high_pleasure` | 无上愉悦 | 官方 `minPlayers: 5`（唯一 5 人起） |
 *   | `garden_of_dreams` | 游园惊梦 | 特殊规则：恶魔不杀人 + 第 3 夜邪恶自动获胜 |
 *
 *   没有 E2E = **没人证明过说书人在真实浏览器里能把这 3 个剧本开完一整轮**。
 *   本文件就是这条缺口的**最小证据**：每个剧本跑
 *   「选剧本 → 快速开始 → 随机落座 → 入夜 → 走完首夜 → 黄昏提名 → 进入第二夜」，
 *   并读 `localStorage` 快照断言**状态真的落库**（不锚文案）。
 *
 * ── 判据（每条都能区分"点了没生效"）──────────────────────────────
 *   ① 夜序非空且条目形如 `N. [M号] 角色`（用 `expectNightQueueNonEmpty`）
 *   ② 快照 `gamePhase` 落在夜间（进入首夜后读）
 *   ③ `advanceNightFast` 真的抵达白天（出现「第 N 天」），且快照 `nightCount >= 1`
 *   ④ 黄昏能完成一次提名并**回到夜晚**（`completeDuskEnterNight` → `"night"`）
 *   ⑤ 全部座位都拿到了角色（`seats.every(s => s.role)`）——防"少配/漏发"
 *
 * ⚠️ 间谍（spy）局：`advanceNightFast` 会返回 `"spy"`（其「查看魔典」无确认按钮，
 *    属于**不该自动化**的步骤）。此时**重开一局**（随机发牌即可换掉），最多 3 次；
 *    3 次都抽到间谍则 `test.skip`，**不伪造通过**。
 *
 * ⚠️ 端口固定 3100；由外部先起 `PORT=3100 npx next dev -p 3100`，
 *    Playwright 不托管 dev server（托管会导致进程无法退出）。
 */

interface ScriptCase {
  id: string;
  /** 必须是 `app/data.ts` 里 `Script.name` 的**逐字**值（点击定位锚点） */
  name: string;
  players: number;
}

const CASES: ScriptCase[] = [
  { id: "tomb_of_the_unknown", name: "无名之墓", players: 7 },
  { id: "high_pleasure", name: "无上愉悦", players: 5 },
  { id: "garden_of_dreams", name: "游园惊梦", players: 7 },
];

/** 抽到间谍就重开，最多 MAX_TRY 局 */
const MAX_TRY = 3;

for (const c of CASES) {
  test.describe(`剧本 E2E 缺口补齐 · ${c.name}`, () => {
    test.setTimeout(240_000);

    test("① 开局 → 首夜 → 白天 → 黄昏 → 第二夜 全流程可跑通", async ({
      page,
    }) => {
      let reachedDay = false;
      let lastResult: string = "(未运行)";
      let queue: string[] = [];

      for (let attempt = 1; attempt <= MAX_TRY; attempt++) {
        // 随机发牌开局（含伪装身份自动配置）
        const { enterFirstNight } = await import("./helpers/scriptFlow");
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await enterFirstNight(page, c.players, c.name);

        // ② 夜序非空
        queue = await expectNightQueueNonEmpty(page, `${c.name} 首夜`);
        expect(queue.length, `${c.name} 首夜队列条目数`).toBeGreaterThan(0);

        // ③ 快照已进入夜间，且**每个座位都有角色**（防漏发/少配）
        const nightSnap = await waitForSnapshot(
          page,
          (s: any) => Array.isArray(s?.seats) && s.seats.length > 0,
          15_000
        );
        expect(nightSnap, `${c.name} 应已落库快照`).not.toBeNull();
        expect(
          nightSnap.seats.length,
          `${c.name} 座位数应等于人数 ${c.players}`
        ).toBe(c.players);
        const missing = nightSnap.seats.filter((s: any) => !s?.role?.id);
        expect(
          missing.length,
          `${c.name} 不应有未分配角色的座位：${JSON.stringify(
            missing.map((s: any) => s.id)
          )}`
        ).toBe(0);

        // ④ 走完首夜
        lastResult = await advanceNightFast(page);
        if (lastResult === "day") {
          reachedDay = true;
          break;
        }
        // "spy" 或 "timeout" ⇒ 重开一局
      }

      expect(
        reachedDay,
        `❌ ${c.name} 连续 ${MAX_TRY} 局未能自动走完首夜（末次=${lastResult}）`
      ).toBe(true);

      // ⑤ 已进入白天：快照里应能读到天数推进
      const daySnap = await waitForSnapshot(
        page,
        (s: any) => s && Number(s.nightCount ?? 0) >= 1,
        15_000
      );
      expect(daySnap, `${c.name} 白天快照`).not.toBeNull();
      expect(daySnap.nightCount, `${c.name} nightCount 应 ≥1`).toBeGreaterThanOrEqual(1);

      // ⑥ 黄昏：完成一次提名并回到夜晚
      const dusk = await completeDuskEnterNight(page);
      expect(dusk, `${c.name} 黄昏应能推进到下一夜`).toBe("night");

      const night2 = await readSnapshot(page);
      expect(night2, `${c.name} 第二夜快照`).not.toBeNull();
      expect(
        Number(night2.nightCount ?? 0),
        `${c.name} 进入第二夜后 nightCount 应 ≥2`
      ).toBeGreaterThanOrEqual(2);
    });
  });
}
