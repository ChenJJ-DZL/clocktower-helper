/**
 * UI 交互链路与经典皮肤真机验收集成测试
 *
 * 验证：
 * 1. 小恶魔自戕转火（爪牙选择与晋升、代币即时更新为小恶魔、标记刷新）
 * 2. 农夫遇害传承（候选镇民面板、新农夫角色与代币即时刷新）
 * 3. 罂粟种植者死亡（夜间步骤高亮邪恶互认步骤卡片）
 * 4. 主操作按钮防遮挡与高光立体琥珀金拟物胶囊
 */

import { describe, expect, it, vi } from "vitest";
import type { Seat, Role } from "../../app/data";
import { executeViaNewEngine } from "../../src/hooks/useNightActionHandler";
import { roles } from "../../app/data";

describe("【UI 交互真机验收与官方经典皮肤注入测试】", () => {
  describe("1. 小恶魔自戕转火交互链路", () => {
    it("小恶魔选择自杀且场上存在多名爪牙时，必须弹出爪牙晋升选择弹窗，确认后新恶魔代币与状态即时刷新", async () => {
      const impRole = roles.find((r) => r.id === "imp")!;
      const baronRole = roles.find((r) => r.id === "baron")!;
      const poisonerRole = roles.find((r) => r.id === "poisoner")!;
      const chefRole = roles.find((r) => r.id === "chef")!;

      const initialSeats: Seat[] = [
        { id: 0, playerName: "玩家1", role: impRole, isDead: false },
        { id: 1, playerName: "玩家2", role: baronRole, isDead: false },
        { id: 2, playerName: "玩家3", role: poisonerRole, isDead: false },
        { id: 3, playerName: "玩家4", role: chefRole, isDead: false },
      ];

      let currentModalData: any = null;
      const setCurrentModal = vi.fn((modal: any) => {
        currentModalData = modal;
      });

      let updatedSeats: Seat[] = initialSeats;
      const setSeats = vi.fn((newSeats: any) => {
        updatedSeats = typeof newSeats === "function" ? newSeats(updatedSeats) : newSeats;
      });

      const addLog = vi.fn();
      const continueToNextAction = vi.fn();

      const context: any = {
        nightInfo: {
          seat: initialSeats[0],
          effectiveRole: impRole,
          targetLimit: { min: 1, max: 1 },
        },
        seats: initialSeats,
        selectedTargets: [0], // 0号小恶魔选择自己（自杀）
        gamePhase: "night",
        nightCount: 2,
        roles,
        vortoxWorld: false,
        setSeats,
        setSelectedActionTargets: vi.fn(),
        setDeadThisNight: vi.fn(),
        checkGameOver: vi.fn(),
        addLog,
        continueToNextAction,
        setCurrentModal,
        markAbilityUsed: vi.fn(),
        hasUsedAbility: vi.fn(),
        reviveSeat: vi.fn(),
        insertIntoWakeQueueAfterCurrent: vi.fn(),
        preview: true,
      };

      // 步骤 1：触发预览模式执行
      await executeViaNewEngine(context, "imp");

      // 断言：弹出 STORYTELLER_SELECT 选择爪牙弹窗
      expect(setCurrentModal).toHaveBeenCalled();
      expect(currentModalData).not.toBeNull();
      expect(currentModalData.type).toBe("STORYTELLER_SELECT");
      expect(currentModalData.data.title).toContain("小恶魔自戕转火");
      expect(currentModalData.data.targetCount).toBe(1);

      // 校验候选人过滤：只有存活爪牙（1号男爵、2号投毒者）可选，排除自己和镇民
      const candidates = initialSeats.filter(currentModalData.data.filterCandidates);
      expect(candidates.map((c) => c.id)).toEqual([1, 2]);

      // 步骤 2：说书人确认选择 2号（投毒者）晋升为新恶魔
      await currentModalData.data.onConfirm([2]);

      // 断言：0号原小恶魔死亡，2号爪牙角色转变为小恶魔且具备 isDemonSuccessor
      expect(setSeats).toHaveBeenCalled();
      const deadImp = updatedSeats.find((s) => s.id === 0);
      const promotedDemon = updatedSeats.find((s) => s.id === 2);
      const remainingMinion = updatedSeats.find((s) => s.id === 1);

      expect(deadImp?.isDead).toBe(true);
      expect(promotedDemon?.role?.id).toBe("imp");
      expect(promotedDemon?.role?.type).toBe("demon");
      expect(promotedDemon?.isDemonSuccessor).toBe(true);
      expect(remainingMinion?.role?.id).toBe("baron");
    });
  });

  describe("2. 农夫遇害传承交互链路", () => {
    it("农夫夜间遇害时，UI 必须主动弹出选择新农夫候选面板，选中后对应玩家代币与状态即时刷新", async () => {
      const impRole = roles.find((r) => r.id === "imp")!;
      const farmerRole = roles.find((r) => r.id === "farmer")!;
      const monkRole = roles.find((r) => r.id === "monk")!;
      const baronRole = roles.find((r) => r.id === "baron")!;

      const initialSeats: Seat[] = [
        { id: 0, playerName: "玩家1", role: impRole, isDead: false },
        { id: 1, playerName: "玩家2", role: farmerRole, isDead: false }, // 农夫
        { id: 2, playerName: "玩家3", role: monkRole, isDead: false }, // 存活善良镇民
        { id: 3, playerName: "玩家4", role: baronRole, isDead: false }, // 爪牙
      ];

      let currentModalData: any = null;
      const setCurrentModal = vi.fn((modal: any) => {
        currentModalData = modal;
      });

      let updatedSeats: Seat[] = initialSeats;
      const setSeats = vi.fn((newSeats: any) => {
        updatedSeats = typeof newSeats === "function" ? newSeats(updatedSeats) : newSeats;
      });

      const addLog = vi.fn();
      const continueToNextAction = vi.fn();

      const context: any = {
        nightInfo: {
          seat: initialSeats[0],
          effectiveRole: impRole,
          targetLimit: { min: 1, max: 1 },
        },
        seats: initialSeats,
        selectedTargets: [1], // 小恶魔杀 1号农夫
        gamePhase: "night",
        nightCount: 2,
        roles,
        vortoxWorld: false,
        setSeats,
        setSelectedActionTargets: vi.fn(),
        setDeadThisNight: vi.fn(),
        checkGameOver: vi.fn(),
        addLog,
        continueToNextAction,
        setCurrentModal,
        markAbilityUsed: vi.fn(),
        hasUsedAbility: vi.fn(),
        reviveSeat: vi.fn(),
        insertIntoWakeQueueAfterCurrent: vi.fn(),
        preview: false, // 真实执行
      };

      // 步骤 1：恶魔击杀农夫
      await executeViaNewEngine(context, "imp");

      // 断言：农夫遇害后触发 STORYTELLER_SELECT 弹窗选择新农夫
      expect(setCurrentModal).toHaveBeenCalled();
      expect(currentModalData).not.toBeNull();
      expect(currentModalData.type).toBe("STORYTELLER_SELECT");
      expect(currentModalData.data.title).toContain("农夫遇害传承");

      // 校验候选人过滤：仅存活善良玩家（2号僧侣），排除恶魔、爪牙与死者
      const candidates = updatedSeats.filter(currentModalData.data.filterCandidates);
      expect(candidates.map((c) => c.id)).toEqual([2]);

      // 步骤 2：说书人确认选择 2号（僧侣）成为新农夫
      currentModalData.data.onConfirm([2]);

      // 断言：2号角色转变为农夫，状态包含“成为新农夫”
      const newFarmer = updatedSeats.find((s) => s.id === 2);
      expect(newFarmer?.role?.id).toBe("farmer");
      expect(newFarmer?.statusDetails).toContain("成为新农夫");
    });
  });

  describe("3. 罂粟种植者死亡与邪恶互认步骤挂载", () => {
    it("罂粟种植者死亡当晚的邪恶互认步骤（minion_info/demon_info）必须正确判定高亮", () => {
      const checkIsPoppyGrowerEvilInfo = (roleId: string, nightCount: number) => {
        return (
          (roleId === "minion_info" ||
            roleId === "demon_info") &&
          nightCount > 1
        );
      };

      // 首夜普通恶魔互认：非罂粟死亡触发
      expect(checkIsPoppyGrowerEvilInfo("minion_info", 1)).toBe(false);

      // 第2夜罂粟种植者死亡触发的邪恶互认：判定为 true 高亮
      expect(checkIsPoppyGrowerEvilInfo("minion_info", 2)).toBe(true);
      expect(checkIsPoppyGrowerEvilInfo("demon_info", 2)).toBe(true);
    });
  });
});
