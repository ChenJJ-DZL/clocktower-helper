import { describe, expect, it } from "vitest";
import { calculateNightInfoViaNewEngine } from "../nightInfoAdapter";

/**
 * ⭐ 回归防线（2026-09-21 P0 修复）
 * ------------------------------------------------------------------
 * 用户实测控制台报：
 *   `[系统] ❌ 能力执行异常: Cannot read properties of undefined (reading 'id')`
 *   `[系统] 步骤 unknown 无 handler 实现，自动推进`
 * 出现在 `systemRoleId = evil_converted_notice`（赏金猎人阵营告知）与
 * `good_twin_info`（善良双子告知）两步 —— **信息弹窗完全没弹，被静默跳过**。
 *
 * 根因链：
 *   1. `nightInfoAdapter.generateSystemInfoViaAdapter()` 的这两个 early-return
 *      **没有填 `effectiveRole`**（对照主 return 是填了的）；
 *   2. 下游 `useNightActionHandler.ts:2039`
 *      `const roleId = nightInfo.effectiveRole.id;` —— **裸读、无可选链** ⇒ 抛异常；
 *   3. `abilityExecutor.ts:260` 的 try/catch 吞掉异常 ⇒
 *      `report.handlerResult = false` ⇒ `useGameController` 打印
 *      「步骤 unknown 无 handler 实现，自动推进」⇒ **该步骤的信息永久丢失**。
 *
 * ⚠️ 本文件是「防假绿」证据：把 `effectiveRole` 从 early-return 里删掉，
 *    下面两条断言**必须变红**。
 */

function mkSeat(
  id: number,
  roleId: string,
  name: string,
  type: string = "townsfolk"
) {
  return { id, role: { id: roleId, name, type }, isDead: false } as any;
}

const SEATS = [
  mkSeat(0, "washerwoman", "洗衣妇"),
  mkSeat(1, "evil_twin", "镜像双子", "minion"),
  mkSeat(2, "soldier", "士兵"),
];

describe("系统步骤 NightInfoResult 必须自带 effectiveRole（跨剧本护栏）", () => {
  it("evil_converted_notice（赏金猎人阵营告知）必须带 effectiveRole.id", () => {
    const info = calculateNightInfoViaNewEngine(
      null,
      SEATS,
      2,
      "firstNight",
      null,
      1,
      "evil_converted_notice"
    );

    expect(
      info,
      "❌ 阵营告知步骤返回 null —— 该步骤的信息无法展示"
    ).not.toBeNull();

    expect(
      (info as any)?.effectiveRole?.id,
      "❌ 缺 effectiveRole ⇒ useNightActionHandler:2039 裸读 .id 抛异常 ⇒ " +
        "异常被 abilityExecutor 吞掉 ⇒ 弹窗静默丢失（「步骤 unknown 无 handler」）"
    ).toBe("evil_converted_notice");
  });

  it("good_twin_info（善良双子告知）必须带 effectiveRole.id", () => {
    const info = calculateNightInfoViaNewEngine(
      null,
      SEATS,
      2,
      "firstNight",
      null,
      1,
      "good_twin_info"
    );

    expect(info, "❌ 双子告知步骤返回 null").not.toBeNull();

    expect(
      (info as any)?.effectiveRole?.id,
      "❌ 缺 effectiveRole ⇒ 同 2039 行的裸读缺陷，双子告知弹窗静默丢失"
    ).toBe("good_twin_info");
  });

  it("两个系统步骤的 effectiveRole 必须可安全解引用（模拟下游 `.id` 裸读）", () => {
    for (const stepId of [
      "evil_converted_notice",
      "good_twin_info",
      "demon_info",
      "minion_info",
    ]) {
      const info = calculateNightInfoViaNewEngine(
        null,
        SEATS,
        2,
        "firstNight",
        null,
        1,
        stepId
      );
      expect(info, `${stepId} 不应返回 null`).not.toBeNull();

      // 直接复刻 useNightActionHandler:2039 的写法 —— 不抛错才算修好
      let crashed = false;
      let resolved: string | undefined;
      try {
        resolved = (info as any).effectiveRole.id;
      } catch {
        crashed = true;
      }
      expect(
        crashed,
        `❌ ${stepId} 的 nightInfo 在裸读 .id 时抛异常 —— 这正是生产事故的现场`
      ).toBe(false);
      expect(resolved, `${stepId} 的 effectiveRole.id 必须等于该步骤 id`).toBe(
        stepId
      );
    }
  });
});
