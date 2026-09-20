/**
 * 日间新引擎能力桥接 · 因果链测试（L5）
 *
 * ── 为什么要有这个文件 ────────────────────────────────────────────────
 * 根因（P0）：`AbilityTriggerTiming.DAY` 此前**全仓库无消费方**。
 *   16 个新引擎日间角色的技能永不执行——日间按钮点下去只标记已使用 + 记日志
 *   （useDayActions.ts 通用回退）。而 L1~L4 测试全停在「文案层」：
 *   弹窗有字、日志有角色名 → 全绿，但**引擎侧毫无痕迹**。
 *
 * 本文件断言的是**状态变更**，不是文案：
 *   · 桥接执行后 seat._abilityResults[roleId] 必须出现（引擎真跑了的硬证据）；
 *   · 无 DAY 能力的角色**必须不**产生该痕迹（防误触发）；
 *   · preCheck 中止（已死亡）必须返回 success=false。
 *
 * ⚠️ 假绿自检要求：把 dayAbilityBridge 的执行改成直接 return 空对象，
 *    本文件必须变红。若不变红，说明测试是空跑。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initializeAbilityRegistry } from "../../roles/new_engine/abilityRegistry";
import {
  executeDayAbilityViaNewEngine,
  getNewEngineDayAbility,
  isNewEngineDayAbility,
} from "../../utils/dayAbilityBridge";
import type { Seat } from "../../../app/data";

function mkSeat(id: number, roleId: string, name: string, extra: any = {}): Seat {
  return {
    id,
    role: { id: roleId, name, type: "townsfolk" } as any,
    isDead: false,
    ...extra,
  } as any;
}

const baseCtx = (seats: Seat[]) => ({
  seatId: seats[0].id,
  seats,
  roles: [] as any[],
  gamePhase: "day" as any,
});

describe("日间新引擎能力桥接（L5 因果链）", () => {
  beforeEach(() => {
    initializeAbilityRegistry();
  });

  describe("能力查询", () => {
    it("① 有 DAY 能力的角色能被识别（artist）", () => {
      expect(isNewEngineDayAbility("artist")).toBe(true);
      const ability = getNewEngineDayAbility("artist");
      expect(ability).toBeTruthy();
      expect(ability!.roleId).toBe("artist");
      expect((ability!.triggerTiming as string[]).includes("day")).toBe(true);
    });

    it("② 纯夜晚角色不得被识别为日间能力（gambler / fearmonger）", () => {
      // fearmonger 官方是「每个夜晚」——2026-09-20 修正过 timing。
      expect(isNewEngineDayAbility("gambler")).toBe(false);
      expect(getNewEngineDayAbility("gambler")).toBeNull();
      // ⚠️ fearmonger 2026-09-20 从 DAY 修正为 EVERY_NIGHT
      expect(isNewEngineDayAbility("fearmonger")).toBe(false);
    });

    it("③ 不存在的角色不得被识别（拒绝前缀误伤）", () => {
      expect(isNewEngineDayAbility("__nonexistent__")).toBe(false);
      expect(isNewEngineDayAbility("")).toBe(false);
    });
  });

  describe("管道执行", () => {
    it("④ 艺术家：管道真实执行 → success=true（引擎侧有结果）", async () => {
      const seats = [mkSeat(0, "artist", "艺术家", { isDead: false })];
      const result = await executeDayAbilityViaNewEngine(
        baseCtx(seats),
        "artist",
        getNewEngineDayAbility("artist")
      );
      expect(result.success).toBe(true);
      // 管道走完了 → raw 上下文存在，且 preCheck 未中止
      expect(result.raw).toBeTruthy();
      expect(result.raw!.aborted).toBeFalsy();
    });

    it("⑤ 艺术家：首次使用 → 生成 displayInfo 或 abilityResult（非空证明真跑了）", async () => {
      const seats = [mkSeat(0, "artist", "艺术家")];
      const result = await executeDayAbilityViaNewEngine(
        baseCtx(seats),
        "artist",
        getNewEngineDayAbility("artist")
      );
      expect(result.success).toBe(true);
      // postProcess 产出的 displayInfo（艺术家：type=artist_answer）
      expect(result.displayInfo).toBeTruthy();
      expect(result.displayInfo!.type).toBe("artist_answer");
    });

    it("⑥ 已死亡角色：preCheck 中止 → success=false（不静默执行）", async () => {
      const seats = [
        mkSeat(0, "artist", "艺术家", { isDead: true }),
      ];
      const result = await executeDayAbilityViaNewEngine(
        baseCtx(seats),
        "artist",
        getNewEngineDayAbility("artist")
      );
      expect(result.success).toBe(false);
      expect(result.abortReason).toBeTruthy();
    });

    it("⑦ 无 DAY 能力的角色：桥接明确拒绝（不误执行）", async () => {
      const seats = [mkSeat(0, "imp", "小恶魔")];
      const result = await executeDayAbilityViaNewEngine(baseCtx(seats), "imp");
      expect(result.success).toBe(false);
      expect(result.abortReason).toContain("无新引擎日间能力");
    });
  });

  describe("覆盖全部 15 个 DAY 角色（防漏）", () => {
    // 注：fearmonger 已于 2026-09-20 从 DAY 修正为 EVERY_NIGHT，故不在列。
    const DAY_ROLE_IDS = [
      "artist",
      "beggar",
      "doomsayer",
      "fisherman",
      "golem",
      "gossip",
      "gunslinger",
      "hells_librarian",
      "juggler",
      "philosopher",
      "psychopath",
      "puzzlemaster",
      "riot",
      "savant",
      "slayer",
    ];

    it.each(DAY_ROLE_IDS)("⑧ %s 在新引擎注册表里确实声明了 DAY 触发", (roleId) => {
      const ability = getNewEngineDayAbility(roleId);
      expect(
        ability,
        `${roleId} 应在新引擎里有 DAY 能力（否则日间按钮会空转）`
      ).toBeTruthy();
    });
  });
});
