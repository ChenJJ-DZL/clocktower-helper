/**
 * 🪒 理发师「死亡 ⇒ 交换」通路的契约测试
 * ==================================================================
 * 官方原文（`src/data/officialRoleDocs.json` · 理发师）：
 *   「如果你死亡，在当晚，说书人可以选择两名玩家：他们交换角色。」
 *
 * 🔴 2026-10-22 修复的两处缺陷（本文件锁住，防止再退化）：
 *   ① `app/gameLogic.ts` 的判据写成 `target.role?.id === "barber_mr"` ——
 *      **全仓不存在这个角色 id**（真实 id = `barber`，见 `src/roles/outsider/barber.ts`）
 *      ⇒ 交换窗**从不弹出**。
 *   ② 判据只写在 `KILL_PLAYER`（夜杀）分支，`EXECUTE_PLAYER`（处决）分支没有
 *      ⇒ 官方「如果你死亡」是**不分死因**的，被缩成了「只在夜杀时」。
 *
 * 为什么用单测而不是 E2E：凶宅魅影的两个场次都有畸形秀演员（白天门禁），
 * 且 15 人局的投票驱动在 E2E 里拿不到 `executed=true`（实测 `executedSeat=null`）。
 * 判据本身是纯函数级的，直接对 `processGameEvent` 断言更可靠。
 */
import { describe, expect, it } from "vitest";
import { processGameEvent, type GameAction } from "../../../app/gameLogic";

/** 造一个最小可用座位表（0 号是理发师） */
function board(barberId = 0): any[] {
  const mk = (id: number, roleId: string, type: string) => ({
    id,
    role: { id: roleId, type, name: roleId },
    isDead: false,
    statusDetails: [],
    statusEffects: [],
  });
  return [
    mk(barberId, "barber", "outsider"),
    mk(1, "soldier", "townsfolk"),
    mk(2, "chef", "townsfolk"),
  ];
}

describe("🪒 理发师：死亡 ⇒ BARBER_SWAP_NEEDED", () => {
  it("① 夜杀（KILL_PLAYER）⇒ 必须给出交换提示", () => {
    const seats = board();
    const action = {
      type: "KILL_PLAYER",
      targetId: 0,
      source: "demon",
    } as unknown as GameAction;
    const res = processGameEvent(seats as any, "night" as any, action);
    expect(res.nextActionHint, "夜杀理发师必须弹交换窗").toBe(
      "BARBER_SWAP_NEEDED"
    );
  });

  it("② 处决（EXECUTE_PLAYER）⇒ 同样必须给出交换提示（死因不限）", () => {
    const seats = board();
    const action = {
      type: "EXECUTE_PLAYER",
      targetId: 0,
    } as unknown as GameAction;
    const res = processGameEvent(seats as any, "day" as any, action);
    expect(res.nextActionHint, "处决理发师必须弹交换窗").toBe(
      "BARBER_SWAP_NEEDED"
    );
  });

  it("③ 反证：死的是别人 ⇒ 不得给出理发师交换提示", () => {
    for (const action of [
      { type: "KILL_PLAYER", targetId: 1, source: "demon" },
      { type: "EXECUTE_PLAYER", targetId: 1 },
    ] as unknown as GameAction[]) {
      const res = processGameEvent(board() as any, "night" as any, action);
      expect(
        res.nextActionHint,
        `死的是 2 号（非理发师）却给了理发师交换提示（action=${action.type}）`
      ).not.toBe("BARBER_SWAP_NEEDED");
    }
  });
});
