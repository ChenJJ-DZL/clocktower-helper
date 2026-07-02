import { test, expect } from "vitest";
import { registerAllNewEngineAbilities, getRawAbilityMap } from "../src/roles/new_engine/abilityRegistry";
import { executeViaNewEngine } from "../src/hooks/useNightActionHandler";
import type { NightActionHandlerContext } from "../src/hooks/useNightActionHandler";

/**
 * 完整集成测试：模拟 executeViaNewEngine 的预览→确认→状态同步流程
 * 
 * 直接调用 executeViaNewEngine（不经过 React hook），验证：
 * 1. 预览模式创建确认弹窗
 * 2. onConfirm 执行非预览管道
 * 3. 状态正确同步到 React seats
 */
test("投毒者 executeViaNewEngine 预览→确认→状态同步", async () => {
  registerAllNewEngineAbilities();

  // 1. 准备初始座位（模拟 React 状态）
  let seats: any[] = [
    { id: 0, isAlive: true, isDead: false, isPoisoned: false, isDrunk: false, isProtected: false, 
      statusDetails: [], statuses: [], 
      role: { id: "poisoner", name: "投毒者", type: "minion" }, playerName: "投毒者" },
    { id: 1, isAlive: true, isDead: false, isPoisoned: false, isDrunk: false, isProtected: false, 
      statusDetails: [], statuses: [], 
      role: { id: "chef", name: "厨师", type: "townsfolk" }, playerName: "厨师" },
    { id: 2, isAlive: true, isDead: false, isPoisoned: false, isDrunk: false, isProtected: false, 
      statusDetails: [], statuses: [], 
      role: { id: "imp", name: "小恶魔", type: "demon" }, playerName: "小恶魔" },
  ];

  const logs: string[] = [];
  let savedModal: any = null;
  let continuedWithSeats: any[] | undefined = undefined;

  // 2. 构建 context（模拟 handleConfirmActionImpl 传入的参数）
  const baseContext: NightActionHandlerContext = {
    nightInfo: {
      seat: { id: 0, role: { id: "poisoner", name: "投毒者", type: "minion" } },
      effectiveRole: { id: "poisoner", name: "投毒者", type: "minion" },
      targetLimit: { min: 1, max: 1 },
      validTargetIds: [1, 2],
      canSelectSelf: false,
      canSelectDead: false,
      guide: "唤醒投毒者",
    } as any,
    seats,
    selectedTargets: [1],
    gamePhase: "firstNight",
    nightCount: 1,
    roles: [],
    isConfirmed: false,
    vortoxWorld: false,
    getRegistration: () => ({}),
    getMisinformation: {},
    findNearestAliveNeighbor: () => null,
    setSeats: ((fn: any) => { 
      seats = fn(seats); 
    }) as any,
    setSelectedActionTargets: (() => {}) as any,
    addLog: (msg: string) => logs.push(msg),
    continueToNextAction: ((latestSeats?: any[]) => { 
      continuedWithSeats = latestSeats; 
    }) as any,
    setCurrentModal: ((modal: any) => { 
      savedModal = modal; 
    }) as any,
    preview: true,
    markAbilityUsed: (() => {}) as any,
    hasUsedAbility: (() => false) as any,
    reviveSeat: ((s: any) => s) as any,
    insertIntoWakeQueueAfterCurrent: (() => {}) as any,
  };

  // ====== 第一步：预览模式调用 ======
  console.log("=== 步骤1: 预览模式 ===");
  const previewResult = await executeViaNewEngine(baseContext, "poisoner");

  console.log("previewResult:", previewResult);
  console.log("modal type:", savedModal?.type);
  console.log("modal data keys:", Object.keys(savedModal?.data || {}));

  // 验证预览模式结果
  expect(previewResult).toBe(true);
  expect(savedModal).not.toBeNull();
  expect(savedModal.type).toBe("NIGHT_ACTION_CONFIRM");
  expect(typeof savedModal.data.onConfirm).toBe("function");
  expect(typeof savedModal.data.onCancel).toBe("function");

  // 预览模式不应修改 seats
  expect(seats[1].isPoisoned).toBe(false);
  console.log("✅ 预览模式正确");

  // ====== 第二步：模拟用户点击确认 ======
  console.log("\n=== 步骤2: 用户确认 ===");
  await savedModal.data.onConfirm();

  // 等待异步操作完成
  await new Promise(resolve => setTimeout(resolve, 200));

  console.log("seats[0] (投毒者): isPoisoned=", seats[0].isPoisoned);
  console.log("seats[1] (厨师-目标): isPoisoned=", seats[1].isPoisoned, 
    "statusDetails=", JSON.stringify(seats[1].statusDetails),
    "statuses=", JSON.stringify(seats[1].statuses));
  console.log("seats[2] (小恶魔): isPoisoned=", seats[2].isPoisoned);
  console.log("logs:", logs);
  console.log("continuedWithSeats:", continuedWithSeats ? "defined" : "undefined");

  // ====== 第三步：验证状态同步 ======
  // 目标厨师应该被标记为中毒
  expect(seats[1].isPoisoned).toBe(true);
  expect(seats[1].statusDetails).toBeDefined();
  expect(seats[1].statusDetails.length).toBeGreaterThan(0);
  expect(seats[1].statusDetails.some((d: string) => d.includes("中毒"))).toBe(true);
  expect(seats[1].statuses.some((s: any) => s.effect === "Poison")).toBe(true);

  // 投毒者自身不中毒
  expect(seats[0].isPoisoned).toBe(false);

  // 小恶魔不中毒
  expect(seats[2].isPoisoned).toBe(false);

  // 确认 continueToNextAction 被调用
  expect(continuedWithSeats).toBeDefined();

  console.log("✅ 完整集成测试通过！");
});
