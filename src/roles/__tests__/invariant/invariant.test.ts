/**
 * L3.5 不变式测试（vitest）
 *
 * 定位：介于 L3（已知 bug 回归仿真）与 L4（全真 UI）之间——
 * 不测"具体场景是否对"，而测"任何情况下都必须成立"的规则。
 * 设计目标：主动抓未知 bug（状态不落地/跨层断裂/优先级错配/信息干扰缺失）。
 *
 * 运行：cd clocktower-helper && npx vitest run src/roles/__tests__/invariant
 */
import { describe, expect, it } from "vitest";
import {
  buildAbilityMap,
  buildFullNightOrder,
  I1DeathMarkersConsistent,
  I2QueueLegality,
  I4PoisonedInfoCorrupted,
  I5TargetLegality,
  I6PriorityMatchesOfficialOrder,
  I7NightDeathHasSource,
  I10GlobalRulesConsistent,
  I11EffectSemanticsApplied,
  runAllInvariants,
  runInvariantSuite,
  simulateNight,
  TROUBLE_BREWING_ROLES,
} from "../../../utils/invariantTesting";
import { collectGlobalRules } from "../../../utils/globalRuleEngine";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../../../");

function mkSeat(
  id: number,
  roleId: string,
  type: string,
  overrides: Record<string, any> = {}
) {
  return {
    id,
    playerName: `P${id + 1}`,
    role: { id: roleId, name: roleId, type },
    isAlive: true,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    hasAbilityEvenDead: false,
    ...overrides,
  };
}

/** 构造 5 人标准局：恶魔(imp) + 爪牙(poisoner) + 外来者(butler) + 2 镇民 */
function buildTbSnapshot(nightCount = 2) {
  return {
    nightCount,
    gamePhase: nightCount === 1 ? "firstNight" : "night",
    seats: [
      mkSeat(0, "imp", "demon"),
      mkSeat(1, "poisoner", "minion"),
      mkSeat(2, "butler", "outsider"),
      mkSeat(3, "investigator", "townsfolk"),
      mkSeat(4, "washerwoman", "townsfolk"),
    ],
    statusEffects: {},
    deadThisNight: [] as number[],
    todayExecutedId: null,
    lastDuskExecution: null,
  };
}

describe("L3.5 不变式测试", () => {
  it("I1+I7：恶魔击杀后死亡标记必须落地（复现历史 P0：只设 isAlive 不设 isDead）", async () => {
    const fullNightOrder = buildFullNightOrder();
    const abilityMap = buildAbilityMap();
    const snapshot = buildTbSnapshot(2);

    const result = await simulateNight(snapshot, {
      nightCount: 2,
      fullNightOrder,
      abilityMap,
      seed: 7,
    });

    // 恶魔（imp）必须执行了击杀动作
    const impAction = result.actions.find((a: any) => a.node.roleId === "imp");
    expect(impAction, "imp 应进入夜间队列执行击杀").toBeDefined();

    // 击杀后目标必须死亡且标记完整
    const violations = [
      ...(await Promise.resolve(I1DeathMarkersConsistent(result, abilityMap))),
      ...(await Promise.resolve(I7NightDeathHasSource(result, abilityMap))),
    ];
    expect(violations).toEqual([]);
  });

  it("I2：死亡角色不得入队 / 能力必须已注册", async () => {
    const fullNightOrder = buildFullNightOrder();
    const abilityMap = buildAbilityMap();
    const snapshot = buildTbSnapshot(2);
    // 预置一名死者（非 spy）
    snapshot.seats[2] = mkSeat(2, "butler", "outsider", {
      isAlive: false,
      isDead: true,
    });

    const result = await simulateNight(snapshot, {
      nightCount: 2,
      fullNightOrder,
      abilityMap,
      seed: 7,
    });
    const violations = await Promise.resolve(
      I2QueueLegality(result, abilityMap)
    );
    expect(violations).toEqual([]);
  });

  it("I4：中毒的信息角色结果必须标记受干扰", async () => {
    const fullNightOrder = buildFullNightOrder();
    const abilityMap = buildAbilityMap();
    // 首夜：调查员被投毒
    const snapshot = buildTbSnapshot(1);
    snapshot.seats[3] = mkSeat(3, "investigator", "townsfolk", {
      isPoisoned: true,
      statusEffects: [{ type: "poisoned", sourceSeatId: 1, source: "poisoner" }],
    });

    const result = await simulateNight(snapshot, {
      nightCount: 1,
      fullNightOrder,
      abilityMap,
      seed: 7,
    });
    const violations = await Promise.resolve(
      I4PoisonedInfoCorrupted(result, abilityMap)
    );
    expect(violations).toEqual([]);
  });

  it("I5：目标选择必须符合 targetConfig（allowSelf/allowDead/min）", async () => {
    const fullNightOrder = buildFullNightOrder();
    const abilityMap = buildAbilityMap();
    const snapshot = buildTbSnapshot(2);
    // 构造一个"说书人选自己"的恶意目标选择器，验证 I5 能抓到
    const result = await simulateNight(snapshot, {
      nightCount: 2,
      fullNightOrder,
      abilityMap,
      seed: 7,
      pickTargets: (node: any) => [node.seatId], // 总是选自己（违反 allowSelf=false）
    });
    const violations = await Promise.resolve(
      I5TargetLegality(result, abilityMap)
    );
    expect(violations.length).toBeGreaterThan(0); // 必须抓到违规
  });

  it("I6：能力优先级必须与官方夜晚顺序 JSON 一致（按文档执行）", async () => {
    const abilityMap = buildAbilityMap();
    const violations = await Promise.resolve(
      I6PriorityMatchesOfficialOrder(
        {
          initialSnapshot: buildTbSnapshot(1),
          finalSnapshot: buildTbSnapshot(1),
          queue: [],
          actions: [],
          nightCount: 1,
          isFirstNight: true,
        } as any,
        abilityMap
      )
    );
    expect(violations).toEqual([]);
  });

  it("随机对局套件：N 夜全部不变式通过（固定种子可复现）", async () => {
    const report = await runInvariantSuite({
      randomGameConfig: {
        playerCount: 7,
        nights: 2,
        seed: 20260814,
        poisonPerNight: 1,
        drunkPerNight: 1,
        rolePool: TROUBLE_BREWING_ROLES,
      },
    });
    expect(report.passed).toBe(true);
    expect(report.nights.length).toBe(2);
  });

  it("故障注入有效性：违反不变式时套件必须失败（证明测试能主动抓 bug）", async () => {
    const fullNightOrder = buildFullNightOrder();
    const abilityMap = buildAbilityMap();
    const snapshot = buildTbSnapshot(2);

    const result = await simulateNight(snapshot, {
      nightCount: 2,
      fullNightOrder,
      abilityMap,
      seed: 7,
      // 故障注入：模拟"死亡记录与状态脱节"（历史 P0 变体）——
      // 只写 diedAtNight/killedBy（报告用字段），但 isDead/isAlive 不落地。
      // settleDawn 不结算 diedAtNight/killedBy，I1 必须抓到该脱节。
      onAction: (action: any) => {
        if (action.node.roleId === "imp" && action.targetIds[0] != null) {
          action.snapshot.seats = action.snapshot.seats.map((s: any) =>
            s.id === action.targetIds[0]
              ? {
                  ...s,
                  isAlive: true,
                  isDead: false,
                  markedForDeath: false,
                  diedAtNight: action.snapshot.nightCount,
                  killedBy: "imp",
                }
              : s
          );
        }
      },
    });

    const violations = await runAllInvariants(result, abilityMap);
    const i1 = violations.get("I1 死亡标记一致性") ?? [];
    expect(i1.length).toBeGreaterThan(0); // I1 必须抓到"记录了死亡但 isDead=false"
  });

  it("I10 全局规则声明自洽：类型/阶段合法、id 唯一、声明者存在", async () => {
    const abilityMap = buildAbilityMap();
    const result = await simulateNight(buildTbSnapshot(2), {
      nightCount: 2,
      fullNightOrder: buildFullNightOrder(),
      abilityMap,
      seed: 7,
    });
    const violations = await I10GlobalRulesConsistent(result, abilityMap);
    expect(violations).toEqual([]);
  });

  it("I10 规则注册表：三种全局机制类型均已声明（掮客/酿酒师/引路人）", () => {
    const rules = collectGlobalRules();
    const types = new Set(rules.map((r) => r.type));
    expect(types.has("target_redirect")).toBe(true); // 掮客
    expect(types.has("info_override")).toBe(true); // 酿酒师
    expect(types.has("target_collect")).toBe(true); // 引路人
    expect(rules.length).toBeGreaterThanOrEqual(3);
  });

  it("I11 效果语义：声明 kill 的能力执行后必须有死亡落地（击杀正常）", async () => {
    const fullNightOrder = buildFullNightOrder();
    const abilityMap = buildAbilityMap();
    const snapshot = buildTbSnapshot(2);
    const result = await simulateNight(snapshot, {
      nightCount: 2,
      fullNightOrder,
      abilityMap,
      seed: 7,
      pickTargets: (node: any) =>
        node.roleId === "imp" ? [2] : (undefined as any),
    });
    const violations = await I11EffectSemanticsApplied(result, abilityMap);
    expect(violations).toEqual([]); // imp 击杀落地 → 无违规
  });

  it("I11 效果语义：空转能力必被抓（故障注入：声明 kill 但不落地）", async () => {
    const fullNightOrder = buildFullNightOrder();
    const abilityMap = buildAbilityMap();
    const snapshot = buildTbSnapshot(2);
    // 故障注入：把 imp 的语义声明为 kill，但执行时完全不动快照（模拟原舞蛇人空转）
    const tampered = { ...abilityMap };
    const result = await simulateNight(snapshot, {
      nightCount: 2,
      fullNightOrder,
      abilityMap,
      seed: 7,
      pickTargets: (node: any) =>
        node.roleId === "imp" ? [2] : (undefined as any),
      onAction: (action: any) => {
        if (action.node.roleId === "imp") {
          // 篡改执行后快照：撤销死亡标记 → 效果未落地
          action.snapshot.seats = action.snapshot.seats.map((s: any) =>
            s.id === action.targetIds[0]
              ? { ...s, markedForDeath: false, diedAtNight: undefined }
              : s
          );
        }
      },
    });
    const violations = await I11EffectSemanticsApplied(result, abilityMap);
    expect(violations.some((v) => v.includes("imp"))).toBe(true); // 空转必被抓
  });

  // 🔧 I12 跨角色状态时序架构自检（W8.14.12）：防止未来重构删掉统一机制
  describe("I12 状态实时同步架构自检", () => {
    it("I12 useGameController 定义 commitSeats 且同步镜像 seatsRef（改状态→ref 立即更新）", () => {
      const src = fs.readFileSync(
        path.join(ROOT, "src", "hooks", "useGameController.ts"),
        "utf8"
      );
      // ① seatsRef 同步镜像（渲染期 + commitSeats 双路）
      expect(src).toContain("const seatsRef = useRef<Seat[]>(seats);");
      expect(src).toContain("seatsRef.current = seats;");
      // ② commitSeats 定义：函数式/值兼容，以 seatsRef.current 为 prev
      expect(src).toContain("const commitSeats = useCallback(");
      expect(src).toContain("seatsRef.current = resolved;");
      // ③ 所有 handler 拿到的是 commitSeats（对象属性 setSeats: commitSeats）
      const handlerProps = (src.match(/setSeats: commitSeats,/g) || []).length;
      expect(handlerProps).toBeGreaterThanOrEqual(4);
    });

    it("I12 useNightSnapshot 接收 externalLatestSeatsRef 且无参推进优先读共享 ref", () => {
      const src = fs.readFileSync(
        path.join(ROOT, "src", "hooks", "useNightSnapshot.ts"),
        "utf8"
      );
      expect(src).toContain(
        "externalLatestSeatsRef?: React.MutableRefObject<Seat[]>"
      );
      // 无参 continueToNextAction 的 updateSnapshot 调用优先用外部 ref
      expect(src).toContain("externalLatestSeatsRef?.current");
      // 调用方（useGameController）确实传入 seatsRef
      const gc = fs.readFileSync(
        path.join(ROOT, "src", "hooks", "useGameController.ts"),
        "utf8"
      );
      expect(gc).toContain("seatsRef");
    });

    it("I12 纯语义：commitSeats 的 updater 以最新 ref 为 prev（函数式更新不 stale）", () => {
      // 模拟 commitSeats 的核心语义：函数式 updater 收到的 prev 必须是最新 ref
      let seatsRefCurrent: any[] = [{ id: 0, isPoisoned: false }];
      const commitSeats = (next: any) => {
        const resolved =
          typeof next === "function" ? next(seatsRefCurrent) : next;
        seatsRefCurrent = resolved;
        return resolved;
      };
      // 第一步：投毒者下毒（函数式更新）
      commitSeats((prev: any[]) =>
        prev.map((s) =>
          s.id === 0
            ? { ...s, isPoisoned: true, statusEffects: [{ type: "poisoned" }] }
            : s
        )
      );
      expect(seatsRefCurrent[0].isPoisoned).toBe(true);
      // 第二步：后续角色 guide 生成读 ref（模拟无参 continueToNextAction）
      const guideSeats = seatsRefCurrent;
      const isDisabled = guideSeats.some(
        (s) =>
          s.id === 0 &&
          (s.isPoisoned ||
            (s.statusEffects || []).some((e: any) => e.type === "poisoned"))
      );
      expect(isDisabled).toBe(true); // 后续角色必须感知到中毒
    });
  });
});
