import { describe, expect, it } from "vitest";
import { impAbility } from "../new_engine/imp.ability";
import { generateDynamicNightQueue } from "../../utils/dynamicQueueGenerator";
import { ENGINE_CONFIG } from "../../hooks/useNightEngine";
import type { Seat } from "../../../app/data";

describe("小恶魔 targetConfig 与 杂耍艺人第3夜不唤醒 规则验证", () => {
  it("小恶魔 targetConfig 必须要求 min: 1, max: 1，允许选自己与死者，禁止默认 0 人空选", () => {
    const tc = impAbility.targetConfig;
    expect(tc.min).toBe(1);
    expect(tc.max).toBe(1);
    expect(tc.allowSelf).toBe(true);
    expect(tc.allowDead).toBe(true);
  });

  describe("杂耍艺人夜间队列门控", () => {
    const makeSeat = (id: number, roleId: string, roleName: string, extra: Partial<Seat> = {}): Seat =>
      ({
        id,
        playerName: `${id + 1}号`,
        role: { id: roleId, name: roleName, type: "townsfolk", script: "haunted_manor" } as any,
        charadeRole: null,
        isDead: false,
        isDrunk: false,
        isPoisoned: false,
        ...extra,
      }) as unknown as Seat;

    it("杂耍艺人首夜绝不入队", () => {
      const seats = [
        makeSeat(0, "juggler", "杂耍艺人", { hasUsedDayAbility: true }),
        makeSeat(1, "imp", "小恶魔"),
      ];
      const snapshot: any = { nightCount: 1, seats };
      const queue = generateDynamicNightQueue(ENGINE_CONFIG.fullNightOrder, snapshot, { isFirstNight: true });
      expect(queue.some((node) => node.roleId === "juggler")).toBe(false);
    });

    it("杂耍艺人在第1天猜测后，第2夜（次夜）正常入队结算", () => {
      const seats = [
        makeSeat(0, "juggler", "杂耍艺人", { hasUsedDayAbility: true }),
        makeSeat(1, "imp", "小恶魔"),
      ];
      const snapshot: any = { nightCount: 2, seats };
      const queue = generateDynamicNightQueue(ENGINE_CONFIG.fullNightOrder, snapshot, { isFirstNight: false });
      expect(queue.some((node) => node.roleId === "juggler")).toBe(true);
    });

    it("杂耍艺人在第3夜绝不入队（即使用过白天技能）", () => {
      const seats = [
        makeSeat(0, "juggler", "杂耍艺人", { hasUsedDayAbility: true }),
        makeSeat(1, "imp", "小恶魔"),
      ];
      const snapshot: any = { nightCount: 3, seats };
      const queue = generateDynamicNightQueue(ENGINE_CONFIG.fullNightOrder, snapshot, { isFirstNight: false });
      expect(queue.some((node) => node.roleId === "juggler")).toBe(false);
    });

    it("杂耍艺人若已结算（jugglerNightSettled / statusDetails 已用），第2夜也不再入队", () => {
      const seats = [
        makeSeat(0, "juggler", "杂耍艺人", {
          hasUsedDayAbility: true,
          jugglerNightSettled: true,
        } as any),
        makeSeat(1, "imp", "小恶魔"),
      ];
      const snapshot: any = { nightCount: 2, seats };
      const queue = generateDynamicNightQueue(ENGINE_CONFIG.fullNightOrder, snapshot, { isFirstNight: false });
      expect(queue.some((node) => node.roleId === "juggler")).toBe(false);
    });

    it("杂耍艺人首日未猜测（hasUsedDayAbility 为 false），第2夜和第3夜都不入队", () => {
      const seats = [
        makeSeat(0, "juggler", "杂耍艺人", { hasUsedDayAbility: false }),
        makeSeat(1, "imp", "小恶魔"),
      ];
      const snapNight2: any = { nightCount: 2, seats };
      const queue2 = generateDynamicNightQueue(ENGINE_CONFIG.fullNightOrder, snapNight2, { isFirstNight: false });
      expect(queue2.some((node) => node.roleId === "juggler")).toBe(false);

      const snapNight3: any = { nightCount: 3, seats };
      const queue3 = generateDynamicNightQueue(ENGINE_CONFIG.fullNightOrder, snapNight3, { isFirstNight: false });
      expect(queue3.some((node) => node.roleId === "juggler")).toBe(false);
    });
  });
});
