/**
 * Wave D1 国风角色定向规则验证（穷奇/饕餮/梼杌/鸩）
 * 运行：cd clocktower-helper && npx tsx gf_verify.ts
 */
import { buildAbilityMap, buildFullNightOrder, ensureAbilityRegistry, simulateNight } from "./src/utils/invariantTesting";

ensureAbilityRegistry();
const abilityMap = buildAbilityMap();
const fullNightOrder = buildFullNightOrder();

function mkSeat(id: number, roleId: string, type: string, o: Record<string, any> = {}) {
  return {
    id, playerName: `P${id + 1}`,
    role: { id: roleId, name: roleId, type },
    isAlive: true, isDead: false, isDrunk: false, isPoisoned: false,
    statusEffects: [] as any[], hasAbilityEvenDead: false, ...o,
  };
}

function snapshot(seats: any[], extra: Record<string, any> = {}) {
  return {
    nightCount: 2, gamePhase: "night", seats, statusEffects: {},
    deadThisNight: [], todayExecutedId: null, lastDuskExecution: null, ...extra,
  };
}

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

async function runNight(snap: any, pickTargets?: (node: any, snapshot: any, ability: any) => number[]) {
  return simulateNight(snap, {
    nightCount: snap.nightCount,
    fullNightOrder, abilityMap, seed: 7,
    pickTargets: pickTargets as any,
  });
}

async function main() {
  console.log("===== 穷奇：活尸机制 =====");
  {
    const seats = [
      mkSeat(0, "qiongqi", "demon"),
      mkSeat(1, "outsider_dummy", "outsider", { isDead: true, isAlive: false, diedAtNight: 1 }),
      mkSeat(2, "investigator", "townsfolk"),
      mkSeat(3, "chef", "townsfolk"),
      mkSeat(4, "washerwoman", "townsfolk"),
    ];
    const snap = snapshot(seats, { outsiderDiedToday: true });
    const r = await runNight(snap, (node: any) => (node.roleId === "qiongqi" ? [2] : []));
    const target = r.finalSnapshot.seats.find((s: any) => s.id === 2);
    const dead = r.finalSnapshot.seats.filter((s: any) => s.isDead).map((s: any) => s.id);
    check("穷奇目标进入活尸（isDead=true）", target?.isDead === true, JSON.stringify({ isDead: target?.isDead, effects: target?.statusEffects }));
    check("活尸带 alive_dead 标记", target?.statusEffects?.some((e: any) => e.type === "alive_dead") === true);
    check("额外一名玩家死亡", dead.length >= 2, `dead=${dead.join(",")}`);
  }
  {
    // 无外来者死亡 → 正常击杀
    const seats = [
      mkSeat(0, "qiongqi", "demon"),
      mkSeat(1, "butler", "outsider"),
      mkSeat(2, "investigator", "townsfolk"),
      mkSeat(3, "chef", "townsfolk"),
      mkSeat(4, "washerwoman", "townsfolk"),
    ];
    const r = await runNight(snapshot(seats), (node: any) => (node.roleId === "qiongqi" ? [2] : []));
    const target = r.finalSnapshot.seats.find((s: any) => s.id === 2);
    check("穷奇正常击杀（无活尸标记）", target?.isDead === true && !target?.statusEffects?.some((e: any) => e.type === "alive_dead"), `effects=${JSON.stringify(target?.statusEffects)}`);
  }

  console.log("===== 饕餮：类型互异判定 =====");
  {
    const seats = [
      mkSeat(0, "taotie", "demon"),
      mkSeat(1, "investigator", "townsfolk"),
      mkSeat(2, "chef", "townsfolk"),
      mkSeat(3, "butler", "outsider"),
      mkSeat(4, "poisoner", "minion"),
    ];
    // 选 2/3/4：三种不同类型（townsfolk/outsider/minion）→ 全死
    const r = await runNight(snapshot(seats), (node: any) => (node.roleId === "taotie" ? [2, 3, 4] : []));
    const deadIds = r.finalSnapshot.seats.filter((s: any) => s.isDead).map((s: any) => s.id).sort();
    check("类型互异→全部死亡", deadIds.join(",") === "2,3,4", `dead=${deadIds}`);
  }
  {
    const seats = [
      mkSeat(0, "taotie", "demon"),
      mkSeat(1, "investigator", "townsfolk"),
      mkSeat(2, "chef", "townsfolk"),
      mkSeat(3, "butler", "outsider"),
      mkSeat(4, "poisoner", "minion"),
    ];
    // 选 1/2：同类型（townsfolk）→ 无人死亡
    const r = await runNight(snapshot(seats), (node: any) => (node.roleId === "taotie" ? [1, 2] : []));
    const deadIds = r.finalSnapshot.seats.filter((s: any) => s.isDead).map((s: any) => s.id);
    check("同类型→无人死亡", deadIds.length === 0, `dead=${deadIds}`);
  }

  console.log("===== 梼杌：替死机制（imp 杀梼杌）=====");
  {
    const seats = [
      mkSeat(0, "imp", "demon"),
      mkSeat(1, "taowu", "demon"),
      mkSeat(2, "poisoner", "minion"),
      mkSeat(3, "chef", "townsfolk"),
      mkSeat(4, "butler", "outsider"),
    ];
    const r = await runNight(snapshot(seats), (node: any) => (node.roleId === "imp" ? [1] : []));
    const taowu = r.finalSnapshot.seats.find((s: any) => s.id === 1);
    const minion = r.finalSnapshot.seats.find((s: any) => s.id === 2);
    check("梼杌被恶魔杀但替死存活", taowu?.isDead === false, `isDead=${taowu?.isDead}`);
    check("爪牙失去能力（lost_ability）", minion?.statusEffects?.some((e: any) => e.type === "lost_ability") === true, `effects=${JSON.stringify(minion?.statusEffects)}`);
  }
  {
    // 无爪牙可替死 → 梼杌死亡
    const seats = [
      mkSeat(0, "imp", "demon"),
      mkSeat(1, "taowu", "demon"),
      mkSeat(2, "chef", "townsfolk"),
      mkSeat(3, "chef", "townsfolk"),
      mkSeat(4, "butler", "outsider"),
    ];
    const r = await runNight(snapshot(seats), (node: any) => (node.roleId === "imp" ? [1] : []));
    const taowu = r.finalSnapshot.seats.find((s: any) => s.id === 1);
    check("无爪牙可替死→梼杌死亡", taowu?.isDead === true, `isDead=${taowu?.isDead}`);
  }

  console.log("===== 鸩：限一次毒杀镇民角色 =====");
  {
    const seats = [
      mkSeat(0, "zhen", "demon"),
      mkSeat(1, "investigator", "townsfolk"),
      mkSeat(2, "chef", "townsfolk"),
      mkSeat(3, "butler", "outsider"),
      mkSeat(4, "poisoner", "minion"),
    ];
    // 鸩选择镇民角色 investigator（在场）
    const snap = snapshot(seats);
    const r = await runNight(snap, (node: any, s: any, ab: any) => (node.roleId === "zhen" ? [] : []));
    // zhen 行动需要 storytellerInput——手动构造
    const ability = abilityMap["zhen_night_ability"];
    const node = r.queue.find((n: any) => n.roleId === "zhen");
    if (node) {
      const zhenAction = r.actions.find((a: any) => a.node.roleId === "zhen");
      // 默认 targetPicker 无 storytellerInput → abort。手动重跑：
    }
  }
  // 手动定向执行鸩（带 storytellerInput）
  {
    const seats = [
      mkSeat(0, "zhen", "demon"),
      mkSeat(1, "investigator", "townsfolk"),
      mkSeat(2, "chef", "townsfolk"),
      mkSeat(3, "butler", "outsider"),
      mkSeat(4, "poisoner", "minion"),
    ];
    const snap: any = snapshot(seats);
    const { runFullAbilityPipeline } = await import("./src/utils/middlewarePipeline");
    const ability = abilityMap["zhen_night_ability"];
    const node: any = { seatId: 0, roleId: "zhen", roleName: "鸩", abilityId: "zhen_night_ability", targetIds: [], meta: {}, priority: 44 };
    const ctx: any = { snapshot: snap, actionNode: node, targetIds: [], storytellerInput: { roleId: "investigator" }, meta: {}, aborted: false };
    const out = await runFullAbilityPipeline(
      { preCheck: ability.preCheck, calculate: ability.calculate, stateUpdate: ability.stateUpdate, postProcess: ability.postProcess },
      ctx
    );
    const victim = out.snapshot.seats.find((s: any) => s.id === 1);
    check("鸩毒杀在场镇民角色（中毒+死亡）", victim?.isDead === true && victim?.statusEffects?.some((e: any) => e.type === "poisoned") === true, `isDead=${victim?.isDead} effects=${JSON.stringify(victim?.statusEffects)}`);

    // 第二次使用 → 限次拦截
    const ctx2: any = { snapshot: out.snapshot, actionNode: node, targetIds: [], storytellerInput: { roleId: "chef" }, meta: {}, aborted: false };
    const out2 = await runFullAbilityPipeline(
      { preCheck: ability.preCheck, calculate: ability.calculate, stateUpdate: ability.stateUpdate, postProcess: ability.postProcess },
      ctx2
    );
    check("鸩第二次使用被限次拦截", out2.aborted === true, `aborted=${out2.aborted} reason=${out2.abortReason}`);

    // 选不在场角色 → 无影响
    const ctx3: any = { snapshot: snap, actionNode: node, targetIds: [], storytellerInput: { roleId: "mayor" }, meta: {}, aborted: false };
    const out3 = await runFullAbilityPipeline(
      { preCheck: ability.preCheck, calculate: ability.calculate, stateUpdate: ability.stateUpdate, postProcess: ability.postProcess },
      ctx3
    );
    const dead3 = out3.snapshot.seats.filter((s: any) => s.isDead);
    check("鸩选不在场角色→无人受影响", dead3.length === 0, `dead=${dead3.length}`);
  }

  console.log(`\n===== 结果: ${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
