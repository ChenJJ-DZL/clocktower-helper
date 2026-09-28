import { describe, expect, it } from "vitest";
import { seat } from "../../roles/__tests__/_tbHarness";
import { CERENOVUS_NOTICE_STEP_ID } from "../cerenovusNotice";
import { calculateNightInfoViaNewEngine } from "../nightInfoAdapter";

/**
 * 🧠 洗脑师「结算后**立即**插入唤醒节点」· 护栏（2026-09-24）
 * ============================================================================
 * ⚠️⚠️ 本缺陷已被用户**两次**实测报告（2026-09-21 首修 → 实现丢失 → 2026-09-24 复报）：
 *   洗脑师结算分支只打 `cerenovusNoticeNight` 标记、从不把目标插进唤醒队列
 *   ⇒ 无夜间技能的目标（镇长/农夫/罂粟种植者…）永远不会被唤醒
 *   ⇒ 玩家收不到「你需要疯狂证明自己是【X】」。
 *
 * 分工：
 *   · `cerenovus_notice_step.test.ts` 钉 **adapter 侧**（合成节点产出）；
 *   · 本文件钉 **入队动作本身**（源码级）+ **显式告知节点**（行为级）。
 *
 * 四个参数各司其职，缺一即回归：
 *   ① `force: true`              —— 目标可能毫无夜间技能，必须绕过准入闸门
 *   ② `position: "next"`         —— 官方要求**当场**告知（镜像双子告知同样紧随其后）
 *   ③ `stepOverride: CERENOVUS_NOTICE_STEP_ID`
 *                                —— 队列只存座位 id；不登记系统步骤的话，
 *                                  有夜间技能的座位会按真实角色再弹一次技能页
 *   ④ `reinsertIfProcessed: true` —— 洗脑师夜序晚于多数镇民，目标往往已行动过；
 *                                    仍在剩余队列里的目标照旧去重（合并告知）
 */

const HANDLER_SRC = require("fs").readFileSync(
  require("path").resolve(__dirname, "../../hooks/useNightActionHandler.ts"),
  "utf-8"
) as string;

const CONTROLLER_SRC = require("fs").readFileSync(
  require("path").resolve(__dirname, "../../hooks/useGameController.ts"),
  "utf-8"
) as string;

describe("洗脑师结算 → 立即插入唤醒节点（源码级护栏）", () => {
  it("① 洗脑师桥接分支必须调用 insertIntoWakeQueueAfterCurrent（不得只打标记不入队）", () => {
    const marker = "insertIntoWakeQueueAfterCurrent?.(cerenovusRes.targetId";
    expect(
      HANDLER_SRC.includes(marker),
      "❌ 洗脑师结算后没有把被洗脑者插入唤醒队列 —— " +
        "这就是用户两次报告的「缺少唤醒被洗脑者的环节」" +
        "（无夜间技能的目标永远不会被唤醒，告知信息丢失）"
    ).toBe(true);
  });

  it("② 入队调用四参缺一不可（force / position / stepOverride / reinsertIfProcessed）", () => {
    const at = HANDLER_SRC.indexOf(
      "insertIntoWakeQueueAfterCurrent?.(cerenovusRes.targetId"
    );
    expect(at).toBeGreaterThan(-1);
    const win = HANDLER_SRC.slice(at, at + 700);
    expect(
      win.includes("force: true"),
      "缺 force ⇒ 纯被动目标被准入闸门拒绝"
    ).toBe(true);
    expect(
      win.includes('position: "next"'),
      "缺 position:next ⇒ 告知落到队尾，违背「洗脑后立即唤醒」"
    ).toBe(true);
    expect(
      win.includes("stepOverride: CERENOVUS_NOTICE_STEP_ID"),
      "缺 stepOverride ⇒ 有夜间技能的座位会按真实角色再弹一次技能页而非告知页"
    ).toBe(true);
    expect(
      win.includes("reinsertIfProcessed: true"),
      "缺 reinsertIfProcessed ⇒ 已行动过的目标（洗脑师夜序靠后）无法重插 ⇒ 告知丢失"
    ).toBe(true);
  });

  it("③ insertIntoWakeQueueAfterCurrent 必须实现 position:next 且同步修正 systemStepRoleIds", () => {
    expect(CONTROLLER_SRC.includes('opts?.position === "next"')).toBe(true);
    // stepMap 修正：key = 队列 index ⇒ 插入点之后既有映射必须右移，否则系统步骤串节点
    expect(
      CONTROLLER_SRC.includes("systemStepRoleIdsRef.current.forEach"),
      "position:next 插入后必须右移 systemStepRoleIds 的既有映射（key=队列index）"
    ).toBe(true);
  });
});

describe("显式告知节点（stepOverride）⇒ adapter 恒返回告知信息（行为级护栏）", () => {
  /** 「有夜间行动」样本：厨师（首夜会唤醒数恶魔对数） */
  const ACTIVE = "chef";

  it("④ 有夜间技能的座位 + 显式 stepOverride ⇒ 也必须返回告知节点（不得顶成技能页）", () => {
    const seats = [
      seat(0, ACTIVE, {
        cerenovusNoticeNight: 1,
        cerenovusMadnessRole: "士兵",
      } as any),
      seat(1, "soldier"),
      seat(2, "imp"),
    ];
    const info = calculateNightInfoViaNewEngine(
      null,
      seats,
      0,
      "night",
      null,
      1,
      CERENOVUS_NOTICE_STEP_ID
    );
    const notice = (info as any)?.cerenovusNotice;
    expect(
      notice,
      "❌ 显式告知节点被解析成了该座位的技能页 ⇒ 玩家看到重复的技能结果" +
        "而收不到「你需要疯狂证明自己是【X】」"
    ).toBeTruthy();
    expect(notice?.roleName).toBe("士兵");
  });

  it("⑤ 无 stepOverride 的同座位 ⇒ 仍返回技能信息（合并告知路径不受影响）", () => {
    const seats = [
      seat(0, ACTIVE, {
        cerenovusNoticeNight: 1,
        cerenovusMadnessRole: "士兵",
      } as any),
      seat(1, "soldier"),
      seat(2, "imp"),
    ];
    const info = calculateNightInfoViaNewEngine(
      null,
      seats,
      0,
      "night",
      null,
      1
    );
    expect(
      (info as any)?.cerenovusNotice,
      "❌ 无 stepOverride 的普通步骤不该变成告知节点（会顶掉技能结果）"
    ).toBeFalsy();
  });
});
