/**
 * Wave D2 国风角色（7 个）wiki 官方规则定向验证
 * 运行：cd clocktower-helper && npx tsx gf_verify_d2.ts
 */
import {
  buildAbilityMap,
  buildFullNightOrder,
  ensureAbilityRegistry,
  simulateNight,
} from "./src/utils/invariantTesting";
import { shouldMorticianTransform, transformMorticianToDemon, countAliveNonTraveler } from "./src/utils/morticianTransform";
import { applyActorVictoryFlip, hasActorInGame, actorSetupRoles } from "./src/utils/actorVictory";
import type { IRoleAbility } from "./src/roles/core/roleAbility.types";

ensureAbilityRegistry();
const abilityMap = buildAbilityMap();
const fullNightOrder = buildFullNightOrder();

function mkSeat(id: number, roleId: string, type: string, extra: any = {}) {
  return {
    id,
    playerName: `P${id + 1}`,
    role: { id: roleId, name: roleId, type },
    isAlive: true, isDead: false, isDrunk: false, isPoisoned: false,
    statusEffects: [] as any[],
    hasAbilityEvenDead: false,
    ...extra,
  };
}

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail ?? ""}`); }
}

async function runNight(
  seats: any[],
  night: number,
  extraSnapshot: any = {},
  storytellerInput?: any,
  pickTargets?: (node: any, snap: any) => number[]
) {
  const snapshot: any = {
    nightCount: night,
    gamePhase: night === 1 ? "firstNight" : "night",
    seats: seats.map((s) => ({ ...s })),
    statusEffects: {},
    deadThisNight: [],
    todayExecutedId: null,
    lastDuskExecution: null,
    ...extraSnapshot,
  };
  return simulateNight(snapshot, {
    nightCount: night,
    fullNightOrder,
    abilityMap,
    seed: 7,
    storytellerInput,
    pickTargets: pickTargets as any,
  });
}

async function main() {
  console.log("========== Wave D2 国风角色规则验证 ==========");

  // ── 1. 知府（Prefect）──
  console.log("\n── 知府 ──");
  {
    // A: 当晚有爪牙死亡 → 得知"是"
    const seats = [
      mkSeat(0, "prefect", "townsfolk"),
      mkSeat(1, "imp", "demon"),
      mkSeat(2, "poisoner", "minion", { isAlive: false, isDead: true, diedAtNight: 2 }),
      mkSeat(3, "butler", "outsider"),
      mkSeat(4, "washerwoman", "townsfolk"),
    ];
    const r = await runNight(seats, 2);
    const action = r.actions.find((a) => a.node.roleId === "prefect");
    check("A: 当晚有爪牙死亡 → 得知'是'", action?.context.meta?.abilityResult?.hasNonTownsfolkDeath === true);
    check("A2: 结算弹窗为'是'", action?.context.meta?.displayInfo?.message === "是");

    // B: 当晚无死亡 → 得知"否"（仍被唤醒）
    const seatsB = seats.map((s) => ({ ...s, isAlive: true, isDead: false, diedAtNight: undefined }));
    const rB = await runNight(seatsB, 2);
    const actionB = rB.actions.find((a) => a.node.roleId === "prefect");
    check("B: 无死亡 → 得知'否'且仍被唤醒", !!actionB && !actionB.aborted && actionB.context.meta?.abilityResult?.hasNonTownsfolkDeath === false);
  }

  // ── 2. 酿酒师（Brewer）──
  console.log("\n── 酿酒师 ──");
  {
    // A: 设置 brewerEffect → 目标角色信息被替换
    const seats = [
      mkSeat(0, "brewer", "townsfolk"),
      mkSeat(1, "imp", "demon"),
      mkSeat(2, "poisoner", "minion"),
      mkSeat(3, "butler", "outsider"),
      mkSeat(4, "washerwoman", "townsfolk"),
    ];
    const r = await runNight(seats, 2, {}, { targetRoleId: "washerwoman", message: "酿酒师的假信息" });
    const brewerAction = r.actions.find((a) => a.node.roleId === "brewer");
    check("A: 酿酒师设置成功", !!brewerAction && !brewerAction.aborted && brewerAction.context.snapshot?.brewerEffect?.roleId === "washerwoman");
    check("A2: 结算产物含目标角色与信息", brewerAction?.context.meta?.displayInfo?.targetRoleId === "washerwoman");

    // B: 全局钩子 applyBrewerEffect——占卜师（每晚行动）结算时信息被替换
    const seatsB = [
      mkSeat(0, "fortune_teller", "townsfolk"),
      mkSeat(1, "imp", "demon"),
      mkSeat(2, "poisoner", "minion"),
      mkSeat(3, "butler", "outsider"),
      mkSeat(4, "monk", "townsfolk"),
    ];
    const rB = await runNight(seatsB, 2, { brewerEffect: { roleId: "fortune_teller", message: "替换后的信息" } });
    const ww = rB.actions.find((a) => a.node.roleId === "fortune_teller");
    check("B: 目标角色信息被替换", ww?.context.meta?.brewerOverride === "替换后的信息");
    check("B2: brewerEffect 已被消耗", rB.finalSnapshot.brewerEffect === undefined);
  }

  // ── 3. 提刑官（Inspector）──
  console.log("\n── 提刑官 ──");
  {
    // A: 首次提名恶魔 → 角色被伪装成善良
    const seats = [
      mkSeat(0, "inspector", "townsfolk"),
      mkSeat(1, "imp", "demon"),
      mkSeat(2, "poisoner", "minion"),
      mkSeat(3, "butler", "outsider"),
      mkSeat(4, "washerwoman", "townsfolk"),
    ];
    const r = await runNight(seats, 2, { inspectorNomination: { targetId: 1 } });
    const act = r.actions.find((a) => a.node.roleId === "inspector");
    const res = act?.context.meta?.abilityResult;
    check("A: 恶魔被当作善良角色", !!act && !act.aborted && res?.isDemon === true && res?.revealedRoleId !== "imp");
    check("A2: 结算后失去能力", act?.context.snapshot?.inspectorUsed === true);

    // B: 未提名 → 不唤醒
    const rB = await runNight(seats, 2, {});
    const actB = rB.actions.find((a) => a.node.roleId === "inspector");
    check("B: 未提名当晚不唤醒", actB?.aborted === true && !!actB?.abortReason?.includes("未发起提名"));
  }

  // ── 4. 引路人（Guide）──
  console.log("\n── 引路人 ──");
  {
    // A: 所选玩家被邪恶能力命中 → 得知"是"
    const seats = [
      mkSeat(0, "guide", "townsfolk"),
      mkSeat(1, "imp", "demon"),
      mkSeat(2, "poisoner", "minion"),
      mkSeat(3, "butler", "outsider"),
      mkSeat(4, "monk", "townsfolk"),
    ];
    const r = await runNight(seats, 2, { nightEvilTargets: [1, 3] }, undefined,
      (node, snap) => (node.roleId === "guide" ? [1, 4] : undefined) as any);
    const act = r.actions.find((a) => a.node.roleId === "guide");
    check("A: 选中的 1 号被恶魔选为目标 → '是'", act?.context.meta?.abilityResult?.isYes === true);

    // B: 所选玩家未被命中 → "否"
    const rB = await runNight(seats, 2, { nightEvilTargets: [2] }, undefined,
      (node) => (node.roleId === "guide" ? [4] : undefined) as any);
    const actB = rB.actions.find((a) => a.node.roleId === "guide");
    check("B: 选中的 4 号未被命中 → '否'", actB?.context.meta?.abilityResult?.isYes === false);
  }

  // ── 5. 掮客（Broker）──
  console.log("\n── 掮客 ──");
  {
    // A: 两目标同阵营 → 重定向生效（恶魔选 1 号实际结算 2 号）
    const seats = [
      mkSeat(0, "broker", "townsfolk"),
      mkSeat(1, "imp", "demon"),
      mkSeat(2, "poisoner", "minion"),
      mkSeat(3, "butler", "outsider"),
      mkSeat(4, "washerwoman", "townsfolk"),
    ];
    // broker 选 3、4（都是善良）；恶魔选 4 → 重定向到 3
    const r = await runNight(seats, 2, {}, undefined,
      (node) => {
        if (node.roleId === "broker") return [3, 4];
        if (node.roleId === "imp") return [4];
        return undefined as any;
      }) as any;
    const brokerAct = r.actions.find((a: any) => a.node.roleId === "broker");
    const impAct = r.actions.find((a: any) => a.node.roleId === "imp");
    check("A: 掮客识别同阵营", brokerAct?.context.meta?.abilityResult?.swapActive === true);
    // 重定向生效：imp 执行内部（calculate 后）目标变为 3
    check("A2: 恶魔目标被重定向 4→3", impAct?.context.meta?.abilityResult?.targetId === 3);
  }

  // ── 6. 入殓师（Mortician）──
  console.log("\n── 入殓师 ──");
  {
    // A: 提名恶魔处决死，存活≥4 → 转化
    const seatsA = [
      mkSeat(0, "mortician", "townsfolk"),
      mkSeat(1, "imp", "demon", { isDead: true }),
      mkSeat(2, "poisoner", "minion"),
      mkSeat(3, "butler", "outsider"),
      mkSeat(4, "washerwoman", "townsfolk"),
      mkSeat(5, "monk", "townsfolk"),
    ];
    const rA = shouldMorticianTransform(seatsA, 1, 0);
    check("A: 存活(旅行者除外)≥4 → 转化", rA.transformed === true, rA.reason);
    const afterA = transformMorticianToDemon(seatsA, 0, "imp");
    check("A2: 入殓师变为恶魔", afterA.find((s) => s.id === 0)?.role?.id === "imp" && afterA.find((s) => s.id === 0)?.role?.type === "demon");

    // B: 存活<4 → 失去能力不转化
    const seatsB = [
      mkSeat(0, "mortician", "townsfolk"),
      mkSeat(1, "imp", "demon", { isDead: true }),
      mkSeat(2, "poisoner", "minion"),
      mkSeat(3, "butler", "outsider"),
      mkSeat(4, "washerwoman", "townsfolk", { isDead: true }),
    ];
    const rB = shouldMorticianTransform(seatsB, 1, 0);
    check("B: 存活(旅行者除外)=3 <4 → 不转化", rB.transformed === false && rB.reason.includes("失去能力"), rB.reason);

    // C: 被处决者非恶魔 → 不转化
    const seatsC = [
      mkSeat(0, "mortician", "townsfolk"),
      mkSeat(1, "washerwoman", "townsfolk", { isDead: true }),
      mkSeat(2, "poisoner", "minion"),
      mkSeat(3, "butler", "outsider"),
      mkSeat(4, "monk", "townsfolk"),
      mkSeat(5, "soldier", "townsfolk"),
    ];
    const rC = shouldMorticianTransform(seatsC, 1, 0);
    check("C: 非恶魔被处决不转化", rC.transformed === false && rC.reason.includes("不是恶魔"));

    // D: 旅行者不计入存活数
    const seatsD = [
      mkSeat(0, "mortician", "townsfolk"),
      mkSeat(1, "imp", "demon", { isDead: true }),
      mkSeat(2, "traveler1", "traveler"),
      mkSeat(3, "traveler2", "traveler"),
      mkSeat(4, "traveler3", "traveler"),
    ];
    check("D: 旅行者除外存活数=1", countAliveNonTraveler(seatsD) === 1);
  }

  // ── 7. 戏子（Actor）──
  console.log("\n── 戏子 ──");
  {
    // A: 首夜互认信息
    const seats = [
      mkSeat(0, "actor", "townsfolk"),
      mkSeat(1, "imp", "demon"),
      mkSeat(2, "poisoner", "minion"),
      mkSeat(3, "butler", "outsider"),
      mkSeat(4, "washerwoman", "townsfolk"),
    ];
    const r = await runNight(seats, 1);
    const act = r.actions.find((a) => a.node.roleId === "actor");
    const res = act?.context.meta?.abilityResult;
    check("A: 首夜戏子互认（列出戏子与邪恶玩家）", !!act && !act.aborted && Array.isArray(res?.actors) && Array.isArray(res?.evilPlayers));
    check("A2: 邪恶玩家含 1、2 号", res?.evilPlayers?.includes(1) === true && res?.evilPlayers?.includes(2) === true);

    // B: 判胜对调
    check("B: 有戏子 → 善良胜对调为邪恶胜", applyActorVictoryFlip("good", seats) === "evil");
    check("B2: 无戏子 → 不调换", applyActorVictoryFlip("good", seats.map((s) => ({ ...s, role: { ...s.role, id: "imp" } }))) === "good");

    // C: 初始设置替换（0 号已是戏子 + 3、4 号善良变戏子 = 3 个）
    const afterSetup = actorSetupRoles(seats);
    check("C: 所有善良玩家变戏子", afterSetup.filter((s) => s.role?.id === "actor").length === 3);
    check("C2: 恶魔保持身份", afterSetup.find((s) => s.id === 1)?.role?.id === "imp");
  }

  console.log(`\n========== 结果: ${pass} 通过 / ${fail} 失败 ==========`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
