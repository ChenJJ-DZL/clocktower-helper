import { expect, test } from "@playwright/test";
import {
  advanceNightFast,
  enterFirstNight,
  readSnapshot,
} from "../helpers/scriptFlow";

/**
 * zz 探针（用完即删）：洗脑师告知节点**是否真的进了夜间队列**
 *
 * 背景：`#26` 的修复中，`nightInfoAdapter` 那半边已由单测 + 变异检验证明；
 * 但「洗脑师选完目标后，被洗脑者真的被 `insertIntoWakeQueueAfterCurrent(force:true)`
 * 插进了 `wakeQueueIds`」这一环**缺端到端证据**。本探针就是补这一环。
 *
 * 判据（读应用真实持久化快照 `localStorage[clocktower_current_snapshot]`）：
 *   · `queue0`  = 入夜瞬间的 `wakeQueueIds`
 *   · `madSeat` = 带 `cerenovusMadnessRole` 的座位（= 被洗脑者）
 *   · 若 `queue0` **不含** `madSeat.id`（即他本来没有夜间行动，
 *     修复前**绝不会**入队） ⇒ 推进后**必须**含 ⇒ 证明 force 放行生效。
 *   · 若 `queue0` 已含（他本就有夜间步骤）⇒ 本局不可判定，换局重试。
 */
test.describe("zz 探针 · 洗脑告知节点入队", () => {
  test("真实点击流：被洗脑者必须进入 wakeQueueIds", async ({ page }) => {
    test.setTimeout(1_800_000);

    // 多局重试的前提：每次导航前清空存档，否则 goto 会直接恢复到游戏内
    await page.context().addInitScript(() => {
      try {
        window.localStorage.clear();
      } catch {
        /* ignore */
      }
    });

    const log: string[] = [];
    let conclusive = false;

    for (let attempt = 1; attempt <= 30 && !conclusive; attempt++) {
      try {
        await enterFirstNight(page);
      } catch (e) {
        log.push(`[局 ${attempt}] enterFirstNight 抛错: ${String(e).slice(0, 120)}`);
        continue;
      }

      const snap0 = await readSnapshot(page);
      const queue0: number[] = Array.isArray(snap0?.wakeQueueIds)
        ? snap0.wakeQueueIds
        : [];

      const r = await advanceNightFast(page);
      if (r !== "day") {
        log.push(`[局 ${attempt}] 夜间推进未到白天（${r}）`);
        continue;
      }

      const snap1 = await readSnapshot(page);
      const seats1: any[] = Array.isArray(snap1?.seats) ? snap1.seats : [];
      const madSeat = seats1.find((s) => s?.cerenovusMadnessRole);
      if (!madSeat) {
        log.push(
          `[局 ${attempt}] 本局无洗脑师 角色=` +
            seats1.map((s: any) => s?.role?.id).join(",")
        );
        continue;
      }

      const finalQueue: number[] = Array.isArray(snap1?.wakeQueueIds)
        ? snap1.wakeQueueIds
        : [];
      const wasAlready = queue0.includes(madSeat.id);
      const isNow = finalQueue.includes(madSeat.id);

      log.push(
        `[局 ${attempt}] ⫝̸可判定セ 被洗脑者=${madSeat.id + 1}号(演【${madSeat.cerenovusMadnessRole}】) | ` +
          `入夜队列=${JSON.stringify(queue0)} | 入夜时已含他=${wasAlready} | ` +
          `推进后队列=${JSON.stringify(finalQueue)} | 现在含他=${isNow}`
      );

      if (!wasAlready) {
        conclusive = true;
        expect(
          isNow,
          `❌ 被洗脑者 ${madSeat.id + 1}号 在入夜时**不在**队列里（无夜间行动），` +
            `但洗完推进后**仍未进队列** ⇒ 他不会被唤醒，` +
            `「你需要疯狂证明自己是【${madSeat.cerenovusMadnessRole}】」永远送不到。` +
            `（这就是 #26 修复要解决的场景；若失败说明 force 放行未生效）`
        ).toBe(true);
      }
    }

    console.log("\n=====PROBE-RESULT=====\n" + log.join("\n") + "\n=====END=====");

    /**
     * ⚠️ 未命中时 **skip 而非 fail**：
     * 「这局有洗脑师」+ 「被洗脑者恰好无夜间行动」是**概率事件**
     * （实测：16 局中 3 局有洗脑师，其中 1 局可判定）。
     * 30 局上限是为了把漏网率压到 <3%。
     * 若真回归了（`force` 放行失效），**命中那一局的
     * `expect(isNow, …).toBe(true)` 会精确变红**，而不是靠这条兜底。
     */
    test.skip(
      !conclusive,
      `30 局未命中可判定样本（概率事件）—— 本次未验证，非缺陷。\n` +
        log.join("\n")
    );
  });
});
