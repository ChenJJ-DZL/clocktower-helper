import { describe, expect, it } from "vitest";
import { board, runRole } from "../_tbHarness";
import { shabalothAbility } from "../../new_engine/shabaloth.ability";

/**
 * 沙巴洛斯 · 反刍契约（修复「零传入点」后的回归护栏）
 *
 * 官方【沙巴洛斯】：「每个夜晚*，你要选择两名玩家：他们死亡。
 *   你**上个夜晚选择过且当前死亡的玩家之一可能会被你反刍**。」
 *
 * 🔴 2026-10-23 修复前：`regurgitatedSeatId` 全仓**没有任何写入方**
 *   （`grep -rn regurgitatedSeatId src/ app/` 只命中本文件两处读取）
 *   ⇒ 反刍分支是死代码，官方这条规则永远不可能发生。
 *
 * 修法：说书人未显式指定时，从本次选择里**确定性推导** ——
 *   若某个被选目标「当前已死」且正是上一夜被沙巴洛斯选过的人，就当作反刍目标。
 *   （对已死玩家再点一次本来就不产生击杀，唯一有意义的解释就是反刍。）
 */

const after = (res: any, id: number): any =>
  (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);

describe("沙巴洛斯 · 反刍（regurgitate）", () => {
  it("① 主路径：选中「上一夜被选过且已死」的玩家 ⇒ 该玩家复活", async () => {
    const seats = board(["shabaloth", "chambermaid", "gossip", "grandmother", "tinker"]);
    // 1 号上一夜被沙巴洛斯杀死
    seats[1].isDead = true;
    seats[1].diedAtNight = 1;
    seats[1].deathSource = "shabaloth_kill";

    const res = await runRole(shabalothAbility, seats, 0, {
      night: 2,
      targets: [1, 2],
      snapshot: {
        // 上一夜的记账（`stateUpdate` 结尾写的就是这个结构）
        lastKill: { demonId: 0, targetId: 1, demonRole: "shabaloth", killed: true },
      },
    });

    const revived = after(res, 1);
    expect(revived?.isDead, "官方：上一夜选过且当前死亡者可以被反刍 ⇒ 必须复活").toBe(false);
    expect(revived?.revivedAtNight, "复活必须记在当夜（黎明播报用）").toBe(2);
    expect(revived?.deathSource, "复活必须清掉旧的致死来源").toBeUndefined();
    // 同夜的另一名目标仍然正常死亡
    expect(after(res, 2)?.isDead, "另一名目标应正常死亡").toBe(true);
  });

  it("② 反证：上一夜没选过该玩家 ⇒ 不得复活（只对已死玩家无效点击）", async () => {
    const seats = board(["shabaloth", "chambermaid", "gossip", "grandmother", "tinker"]);
    seats[1].isDead = true;
    seats[1].diedAtNight = 1;
    seats[1].deathSource = "imp_kill";

    const res = await runRole(shabalothAbility, seats, 0, {
      night: 2,
      targets: [1, 2],
      snapshot: {
        // 上一夜沙巴洛斯选的是 3 号，不是 1 号
        lastKill: { demonId: 0, targetId: 3, demonRole: "shabaloth", killed: true },
      },
    });

    expect(
      after(res, 1)?.isDead,
      "❌ 上一夜没选过的死者不得被反刍（否则等于凭空复活）"
    ).toBe(true);
    expect(after(res, 1)?.revivedAtNight).toBeUndefined();
  });

  it("③ 说书人显式指定时优先于推导（不走 fallback）", async () => {
    const seats = board(["shabaloth", "chambermaid", "gossip", "grandmother", "tinker"]);
    seats[1].isDead = true;
    seats[1].diedAtNight = 1;
    seats[3].isDead = true;
    seats[3].diedAtNight = 1;

    const res = await runRole(shabalothAbility, seats, 0, {
      night: 2,
      targets: [1, 2],
      storytellerInput: { regurgitatedSeatId: 3 },
      snapshot: {
        lastKill: { demonId: 0, targetId: 1, demonRole: "shabaloth", killed: true },
      },
    });

    expect(after(res, 3)?.isDead, "显式指定的 4 号必须复活").toBe(false);
    expect(
      after(res, 1)?.isDead,
      "显式指定优先 ⇒ 推导出来的 2 号不再被反刍，仍是死亡状态"
    ).toBe(true);
  });
});
