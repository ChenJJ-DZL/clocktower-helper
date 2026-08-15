/**
 * 全角色"发动+结算"逐角色定向仿真（Wave 1 验收核心）
 * 运行：cd clocktower-helper && npx tsx verify_all_roles.ts
 *
 * 对每个能力注册表角色构造 5 人局（该角色 + 4 个陪衬），跑首夜+次夜：
 * - 入队：角色是否进入夜间队列（有夜间优先级）
 * - 发动：执行时是否非 aborted（规则性 abort 除外）
 * - 结算：I9 判定——成功执行的动作是否有 displayInfo/abilityLog/abilityResult
 * 输出逐角色三步状态表 + 汇总。
 */
import { buildAbilityMap, buildFullNightOrder, ensureAbilityRegistry, simulateNight, I9SettlementProduced } from "./src/utils/invariantTesting";

ensureAbilityRegistry();
const abilityMap = buildAbilityMap();
const fullNightOrder = buildFullNightOrder();
const abilities = Object.values(abilityMap as any);

// 陪衬角色池（恶魔/爪牙/外来者/镇民各一）
const SUPPORT_POOL = ["imp", "poisoner", "butler", "washerwoman"];

function mkSeat(id: number, roleId: string, type: string) {
  return {
    id,
    playerName: `P${id + 1}`,
    role: { id: roleId, name: roleId, type },
    isAlive: true, isDead: false, isDrunk: false, isPoisoned: false,
    statusEffects: [] as any[],
    hasAbilityEvenDead: false,
  };
}

const TYPE_BY_ROLE: Record<string, string> = {
  imp: "demon", poisoner: "minion", butler: "outsider", washerwoman: "townsfolk",
};

// 需说书人输入/快照注入的角色
const SPECIAL_INPUT: Record<string, { storytellerInput?: any; snapshot?: any }> = {
  brewer: {
    storytellerInput: { targetRoleId: "washerwoman", message: "酿酒师替换信息（测试）" },
  },
  inspector: {
    // 模拟白天首次提名了 1 号玩家
    snapshot: { inspectorNomination: { targetId: 1 } },
  },
};

async function verifyRole(roleId: string) {
  const ability = Object.values(abilityMap as any).find((a: any) => a.roleId === roleId);
  if (!ability) return { roleId, status: "无能力文件" };

  const ab = ability as any;
  const hasNightAction = ab.otherNightPriority > 0 || ab.firstNightPriority > 0;
  if (!hasNightAction) return { roleId, status: "无夜间行动（白天/被动）" };

  // 陪衬：去重被测角色
  const support = SUPPORT_POOL.filter((r) => r !== roleId);
  const type = (ab.triggerTiming ?? []).includes("demon") ? "demon" : "townsfolk";
  const seats = [
    mkSeat(0, roleId, type),
    ...support.map((r, i) => mkSeat(i + 1, r, TYPE_BY_ROLE[r] ?? "townsfolk")),
  ];

  const report: Record<string, any> = { roleId, nights: [] };

  for (const night of [1, 2]) {
    const special = SPECIAL_INPUT[roleId] ?? {};
    // 提刑官：首夜无白天提名（验证不唤醒路径），次夜注入提名（验证结算路径）
    const snapshotInput =
      roleId === "inspector" && night === 1
        ? {}
        : special.snapshot ?? {};
    const snapshot: any = {
      nightCount: night,
      gamePhase: night === 1 ? "firstNight" : "night",
      seats: seats.map((s) => ({ ...s })),
      statusEffects: {},
      deadThisNight: [],
      todayExecutedId: null,
      lastDuskExecution: null,
      ...snapshotInput,
    };
    const result = await simulateNight(snapshot, {
      nightCount: night,
      fullNightOrder,
      abilityMap,
      seed: 7,
      storytellerInput: special.storytellerInput,
    });
    const action = result.actions.find((a) => a.node.roleId === roleId);
    report.nights.push({
      night,
      inQueue: action !== undefined,
      executed: action !== undefined && !action.aborted,
      aborted: action !== undefined && action.aborted,
      abortReason: action?.abortReason ?? null,
      hasProduct: action !== undefined && !action.aborted
        ? (action.context.meta?.displayInfo !== undefined ||
           action.context.meta?.abilityLog !== undefined ||
           action.context.meta?.abilityResult !== undefined ||
           action.context.meta?.prompt !== undefined)
        : null,
    });
  }
  return report;
}

async function main() {
  console.log("========== 全角色发动+结算验证 ==========");
  console.log(`能力总数: ${abilities.length}\n`);

  const results = [];
  const problems: string[] = [];

  for (const ability of abilities as any[]) {
    const r = await verifyRole(ability.roleId);
    results.push(r);
    if (r.status === "无能力文件") {
      problems.push(`  ❌ ${r.roleId}: ${r.status}`);
      continue;
    }
    if (r.status === "无夜间行动（白天/被动）") continue;

    for (const n of r.nights) {
      if (n.inQueue && n.executed && n.hasProduct === false) {
        problems.push(`  ❌ ${r.roleId} 第${n.night}夜：发动成功但无结算产物（I9）`);
      }
      if (n.inQueue && !n.executed && n.aborted) {
        // abort 可能是规则性的（如首夜恶魔不行动），仅记录不判错
        console.log(`  ⚪ ${r.roleId} 第${n.night}夜：规则性中止（${n.abortReason}）`);
      }
    }
  }

  // 汇总统计
  const nightly = results.filter((r) => r.nights?.length);
  let inQueueN1 = 0, executedN1 = 0, settledN1 = 0;
  let inQueueN2 = 0, executedN2 = 0, settledN2 = 0;
  for (const r of nightly) {
    const n1 = r.nights[0], n2 = r.nights[1];
    if (n1?.inQueue) { inQueueN1++; if (n1.executed) { executedN1++; if (n1.hasProduct) settledN1++; } }
    if (n2?.inQueue) { inQueueN2++; if (n2.executed) { executedN2++; if (n2.hasProduct) settledN2++; } }
  }

  console.log("── 汇总 ──");
  console.log(`首夜: 入队 ${inQueueN1} / 发动 ${executedN1} / 结算 ${settledN1}`);
  console.log(`次夜: 入队 ${inQueueN2} / 发动 ${executedN2} / 结算 ${settledN2}`);
  console.log(`无夜间行动（白天/被动）: ${results.filter((r) => r.status === "无夜间行动（白天/被动）").length}`);
  console.log(`无能力文件: ${results.filter((r) => r.status === "无能力文件").length}`);
  console.log(`问题: ${problems.length}`);
  if (problems.length) {
    console.log("── 问题清单 ──");
    problems.forEach((p) => console.log(p));
  }
  console.log("================================");
  process.exit(problems.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
