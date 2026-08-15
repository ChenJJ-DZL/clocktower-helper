/**
 * I11 效果语义全量扫描：逐角色构造 5 人局跑 2 夜，断言效果落地
 * 运行：cd clocktower-helper && npx tsx scan_i11.ts
 */
import {
  buildAbilityMap,
  buildFullNightOrder,
  ensureAbilityRegistry,
  simulateNight,
  runAllInvariants,
} from "./src/utils/invariantTesting";

ensureAbilityRegistry();
const abilityMap = buildAbilityMap() as any;
const fullNightOrder = buildFullNightOrder();
const abilities = Object.values(abilityMap);

const SUPPORT_POOL = ["imp", "poisoner", "butler", "washerwoman"];
const TYPE_BY_ROLE: Record<string, string> = {
  imp: "demon", poisoner: "minion", butler: "outsider", washerwoman: "townsfolk",
};

function mkSeat(id: number, roleId: string, type: string) {
  return {
    id, playerName: `P${id + 1}`, role: { id: roleId, name: roleId, type },
    isAlive: true, isDead: false, isDrunk: false, isPoisoned: false,
    statusEffects: [] as any[], hasAbilityEvenDead: false,
  };
}

const SPECIAL_INPUT: Record<string, { storytellerInput?: any; snapshot?: any }> = {
  brewer: { storytellerInput: { targetRoleId: "washerwoman", message: "测试" } },
  inspector: { snapshot: { inspectorNomination: { targetId: 1 } } },
  zhen: { storytellerInput: { roleId: "washerwoman" } },
};

async function main() {
  const i11violations: string[] = [];
  for (const ab of abilities as any[]) {
    const roleId = ab.roleId;
    const hasNight = ab.otherNightPriority > 0 || ab.firstNightPriority > 0;
    if (!hasNight) continue;

    const support = SUPPORT_POOL.filter((r) => r !== roleId);
    const type = (ab.triggerTiming ?? []).includes("demon") ? "demon" : "townsfolk";
    const seats = [mkSeat(0, roleId, type), ...support.map((r, i) => mkSeat(i + 1, r, TYPE_BY_ROLE[r] ?? "townsfolk"))];

    for (const night of [1, 2]) {
      const special = SPECIAL_INPUT[roleId] ?? {};
      const snapInput = roleId === "inspector" && night === 1 ? {} : special.snapshot ?? {};
      const snapshot: any = {
        nightCount: night, gamePhase: night === 1 ? "firstNight" : "night",
        seats: seats.map((s) => ({ ...s })), statusEffects: {},
        deadThisNight: [], todayExecutedId: null, lastDuskExecution: null,
        ...snapInput,
      };
      const result = await simulateNight(snapshot, {
        nightCount: night, fullNightOrder, abilityMap, seed: 7,
        storytellerInput: special.storytellerInput,
      });
      const violations = await runAllInvariants(result, abilityMap);
      const i11 = violations.get("I11 效果语义落地") ?? [];
      for (const v of i11) {
        if (v.includes(roleId)) i11violations.push(`[${roleId} 第${night}夜] ${v}`);
      }
    }
  }
  console.log(`I11 扫描完成，违规 ${i11violations.length} 处`);
  for (const v of i11violations) console.log(`  ❌ ${v}`);
  process.exit(i11violations.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
