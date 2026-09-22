import { describe, expect, it } from "vitest";
import { seat } from "../../roles/__tests__/_tbHarness";
import { calculateNightInfoViaNewEngine } from "../nightInfoAdapter";

/**
 * 🧠 洗脑师「唤醒被洗脑者并告知」节点 —— 回归防线（2026-09-21）
 * ------------------------------------------------------------------
 * 用户实测报告：「洗脑师洗脑了一个玩家后，应当在洗脑师的技能结束后立即加一个环节：
 *   唤醒被洗脑的玩家，告诉他被洗脑的消息以及被洗脑成了什么角色。当前缺少了这个环节。」
 *
 * 根因（两处叠加，都已修）：
 *   ① `useNightActionHandler.ts:1778` 早就调用了
 *      `insertIntoWakeQueueAfterCurrent(targetId, { logLabel })`，
 *      但该入口的准入检查 `seatHasNightAction(seat)` 会**拒绝纯被动座位入队**
 *      ⇒ 被洗脑者若是毫无夜间技能的镇民（镇长/农夫/罂粟种植者…），
 *        **永远不会被唤醒**。→ 已由 `force: true` 放行。
 *   ② 即便入队，`nightInfoAdapter` 也会因为 `roleId` 算成该座位的**真实角色**
 *      （`isRoleMigrated` 为真）而**不返回告知信息**
 *      ⇒ 被洗脑者看到的是自己的技能页。→ 已由「`!seatHasNightAction` 时返回告知节点」修复。
 *
 * ⚠️ 本文件是「防假绿」证据：把 `nightInfoAdapter` 里那个 `!seatHasNightAction`
 *    分支删掉，第 ① 条断言**必须变红**。
 */

/** 「无夜间行动」样本：罂粟种植者（纯被动，生产日志实测会被队列拒绝入队） */
const PASSIVE = "poppy_grower";
/** 「有夜间行动」样本：厨师（首夜会唤醒数恶魔对数） */
const ACTIVE = "chef";

function boardWith(noticeSeatRoleId: string) {
  return [
    // 被洗脑者：带当夜待送达的告知（`cerenovusNoticeNight` 做夜限）
    seat(0, noticeSeatRoleId, {
      cerenovusNoticeNight: 1,
      cerenovusMadnessRole: "士兵",
    } as any),
    seat(1, "soldier"),
    seat(2, "imp"),
  ];
}

describe("洗脑告知节点（cerenovus_notice）", () => {
  it("① 被洗脑者【无夜间行动】时：这一步必须返回告知节点，且带正确的疯狂角色", () => {
    const seats = boardWith(PASSIVE);
    const info = calculateNightInfoViaNewEngine(
      null,
      seats,
      0,
      "firstNight",
      null,
      1
    );

    expect(info, "❌ 未生成任何夜间信息").not.toBeNull();

    const notice = (info as any)?.cerenovusNotice;
    expect(
      notice,
      "❌ 纯被动座位被洗脑后，这一步没有生成「被洗脑告知」节点 —— " +
        "被洗脑者被唤醒后只会看到自己的技能页，玩家永远收不到" +
        "「你需要疯狂证明自己是【X】」（这就是用户报告的缺失环节）"
    ).toBeTruthy();

    expect(
      notice?.roleName,
      "❌ 告知节点必须带上「要疯狂扮演的角色名」"
    ).toBe("士兵");
  });

  it("② 对照组：被洗脑者【有夜间行动】时，不得顶掉他的技能信息", () => {
    const seats = boardWith(ACTIVE);
    const info = calculateNightInfoViaNewEngine(
      null,
      seats,
      0,
      "firstNight",
      null,
      1
    );

    expect(info, "❌ 未生成任何夜间信息").not.toBeNull();

    expect(
      (info as any)?.cerenovusNotice,
      "❌ 有夜间行动的座位被算成了告知节点 —— 会顶掉他自己的技能结果" +
        "（他本就会在自己的步骤里被唤醒并当场被告知）"
    ).toBeFalsy();
  });

  it("③ 夜限：换夜后（nightCount 不匹配）告知必须自动失效", () => {
    const seats = boardWith(PASSIVE);
    // 告知登记的夜 = 1，这里按第 2 夜计算 ⇒ 不应再出现
    const info = calculateNightInfoViaNewEngine(
      null,
      seats,
      0,
      "night",
      null,
      2
    );

    // 可能返回 null（无夜间信息）或正常信息，但**绝不能**是第 1 夜的告知
    expect(
      (info as any)?.cerenovusNotice ?? null,
      "❌ 第 1 夜的洗脑告知在第 2 夜被重放了 —— 夜限失效"
    ).toBeNull();
  });
});
