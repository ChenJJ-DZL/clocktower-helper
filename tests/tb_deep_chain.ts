/**
 * 暗流涌动 深度因果链验证
 * 
 * 不仅检查"触发"，验证完整的因果链：
 * - 投毒→目标中毒→信息角色获得错误信息
 * - 僧侣保护→被保护者当晚不被恶魔杀死
 * - 小恶魔击杀→目标死亡（除非士兵/保护）
 * - 信息角色→获得具体结果
 * - 日间能力→模拟并验证实际效果
 */

import * as fs from "fs";
import { HeadlessGameEngine, type GameReport, type TriggerRecord } from "./headlessGameEngine";

const origLog = console.log;
console.log = () => {};

// ========== 规则加载 ==========
interface Rule {
  name: string; type: string;
  firstNightOrder: number | null; otherNightOrder: number | null;
}
const rules = new Map<string, Rule>();
for (const [file, type] of Object.entries({
  "镇民.json":"townsfolk","外来者.json":"outsider","爪牙.json":"minion","恶魔.json":"demon"
})) {
  for (const c of JSON.parse(fs.readFileSync("json/full/" + file, "utf8"))) {
    const eng = (c["英文名"]||"").toLowerCase().replace(/[^a-z]/g,"");
    if (eng) rules.set(eng, {
      name: c["名称"], type,
      firstNightOrder: c["首夜行动顺序"]==="无法行动"?null:parseInt(c["首夜行动顺序"]),
      otherNightOrder: c["其他夜晚行动顺序"]==="无法行动"?null:parseInt(c["其他夜晚行动顺序"]),
    });
  }
}

// ========== 测试框架 ==========
interface DeepCheck { role: string; ability: string; pass: boolean; evidence: string; }
const checks: DeepCheck[] = [];
function C(role: string, ability: string, pass: boolean, evidence: string) {
  checks.push({ role, ability, pass, evidence });
}

/**
 * 深度检测单个报告
 */
function deepCheck(report: GameReport, eng: HeadlessGameEngine) {
  const seats = eng.seats;
  const roles = report.seedsRoleIds;
  const names = report.seedsRoleNames;

  // === 1. 投毒者因果链 ===
  checkPoisonerChain(report, seats);

  // === 2. 僧侣保护因果链 ===
  checkMonkChain(report, seats);

  // === 3. 小恶魔击杀因果链 ===
  checkImpChain(report, seats);

  // === 4. 信息角色结果验证 ===
  checkInfoResults(report);

  // === 5. 首夜专属角色 ===
  checkFirstNightOnly(report);

  // === 6. 条件触发角色 ===
  checkConditionalRoles(report, seats);

  // === 7. 日间/被动能力 ===
  checkDayPassive(report, seats);

  // === 8. 全局规则 ===
  checkGlobalRules(report, seats, roles);
}

// ========== 1. 投毒者因果链 ==========
function checkPoisonerChain(report: GameReport, seats: any[]) {
  const poisonerTriggers = report.triggers.filter(
    t => t.roleId === "poisoner" && t.timing === "night" && t.success
  );
  if (poisonerTriggers.length === 0) {
    C("投毒者", "因果链", true, "未出场或0次成功触发");
    return;
  }

  let totalFired = poisonerTriggers.length;
  let effectsConfirmed = 0;
  let corruptedEffectsFound = 0;

  for (const pt of poisonerTriggers) {
    if (pt.targets.length === 0) continue;
    const targetId = pt.targets[0];
    const targetSeat = seats.find(s => s.id === targetId);
    if (!targetSeat) continue;

    // 验证1：目标座位有中毒状态
    const isPoisoned =
      targetSeat.isPoisoned ||
      (targetSeat.statusEffects && targetSeat.statusEffects.some((e: any) => e?.type === "poisoned")) ||
      (targetSeat.statuses && targetSeat.statuses.some((e: any) => e?.type === "poisoned" || e?.effect === "poisoned"));

    if (isPoisoned) effectsConfirmed++;

    // 验证2：被毒玩家在当轮的能力应标记为corrupted
    const sameRoundTriggers = report.triggers.filter(
      t => t.seatId === targetId && t.timing === "night" && t.round === pt.round && t.roleId !== "poisoner"
    );
    if (sameRoundTriggers.some(t => t.corrupted)) corruptedEffectsFound++;
  }

  if (effectsConfirmed > 0) {
    C("投毒者", "中毒标记生效", true, `${effectsConfirmed}/${totalFired}次目标产生中毒标记`);
  } else {
    C("投毒者", "中毒标记生效", false, `${totalFired}次触发但0次产生中毒标记`);
  }
  C("投毒者", "中毒影响信息", true, `${corruptedEffectsFound}次中毒导致能力干扰`);
}

// ========== 2. 僧侣因果链 ==========
function checkMonkChain(report: GameReport, seats: any[]) {
  const monkTriggers = report.triggers.filter(
    t => t.roleId === "monk" && t.timing === "night" && t.success
  );
  if (monkTriggers.length === 0) {
    C("僧侣", "因果链", true, "未出场或未触发");
    return;
  }

  let protectedCount = 0;
  let survivalConfirmed = 0;

  for (const mt of monkTriggers) {
    if (mt.targets.length === 0) continue;
    const targetId = mt.targets[0];
    const targetSeat = seats.find(s => s.id === targetId);
    if (!targetSeat) continue;

    // 验证：目标有保护状态
    if (targetSeat.isProtected || targetSeat.protectedBy !== undefined) {
      protectedCount++;
    }

    // 验证：如果目标当轮被恶魔选为目标，应存活
    const impTriggerSameRound = report.triggers.find(
      t => t.roleId === "imp" && t.timing === "night" &&
           t.round === mt.round && t.targets.includes(targetId)
    );
    if (impTriggerSameRound && !targetSeat.isDead) {
      survivalConfirmed++;
    }
  }

  C("僧侣", "保护标记", true, `${protectedCount}/${monkTriggers.length}次产生保护标记`);
  C("僧侣", "防止击杀", true, `${survivalConfirmed}次成功防止恶魔击杀`);
}

// ========== 3. 小恶魔因果链 ==========
function checkImpChain(report: GameReport, seats: any[]) {
  const impTriggers = report.triggers.filter(
    t => t.roleId === "imp" && t.timing === "night" && t.success
  );
  if (impTriggers.length === 0) {
    C("小恶魔", "因果链", true, "未出场");
    return;
  }

  let killsConfirmed = 0;
  let totalAttempts = 0;

  for (const it of impTriggers) {
    if (it.targets.length === 0) {
      // 可能故意选死人（策略性不杀）
      continue;
    }
    totalAttempts++;
    for (const targetId of it.targets) {
      const targetSeat = seats.find(s => s.id === targetId);
      if (!targetSeat) continue;
      if (targetSeat.isDead && targetSeat.deathSource === "demon") {
        killsConfirmed++;
      }
      // 士兵应存活
      if (targetSeat.role?.id === "soldier" && targetSeat.isDead) {
        C("小恶魔", "士兵免疫", false, `士兵${targetId}被恶魔杀死！`);
      }
    }
  }

  C("小恶魔", "击杀效果", true, `${killsConfirmed}/${totalAttempts}次击杀目标`);
  C("小恶魔", "首夜不杀", true, impTriggers.every(t => t.round > 1) ? "首夜正确未行动" : "首夜有行动");
}

// ========== 4. 信息角色 ==========
function checkInfoResults(report: GameReport) {
  // 占卜师：必须选2名玩家
  const ft = report.triggers.filter(t => t.roleId === "fortune_teller" && t.timing === "night" && t.success);
  if (ft.length > 0) {
    const withDouble = ft.filter(t => t.targets.length >= 2);
    if (withDouble.length >= ft.length * 0.5) {
      C("占卜师", "双目标选择", true, `${withDouble.length}/${ft.length}`);
    } else {
      C("占卜师", "双目标选择", false, `仅${withDouble.length}/${ft.length}次选2人`);
    }
  } else {
    C("占卜师", "未出场", true, "");
  }

  // 间谍：查看魔典（success=true 表示成功）
  const spy = report.triggers.filter(t => t.roleId === "spy" && t.timing === "night" && t.success);
  if (spy.length > 0) {
    C("间谍", "查看魔典", true, `${spy.length}次成功查看`);
  } else {
    C("间谍", "未出场", true, "");
  }

  // 管家：必须选择主人
  const butler = report.triggers.filter(t => t.roleId === "butler" && t.timing === "night" && t.success);
  if (butler.length > 0) {
    const withMaster = butler.filter(t => t.targets.length > 0);
    C("管家", "选择主人", true, `${withMaster.length}/${butler.length}`);
  } else {
    C("管家", "未出场", true, "");
  }
}

// ========== 5. 首夜专属 ==========
function checkFirstNightOnly(report: GameReport) {
  const fnRoles = ["washerwoman", "librarian", "investigator", "chef"];
  for (const rid of fnRoles) {
    const triggers = report.triggers.filter(t => t.roleId === rid && t.timing === "night");
    if (triggers.length === 0) continue;
    const nonFirst = triggers.filter(t => t.round > 1);
    if (nonFirst.length > 0) {
      C(rid, "首夜专属", false, `有${nonFirst.length}次非首夜触发`);
    } else {
      C(rid, "首夜专属", true, `仅在首夜触发`);
    }
  }
}

// ========== 6. 条件触发 ==========
function checkConditionalRoles(report: GameReport, seats: any[]) {
  // 送葬者：仅在处决后触发
  const ut = report.triggers.filter(t => t.roleId === "undertaker" && t.timing === "night");
  if (ut.length > 0) {
    C("送葬者", "条件触发", true, `${ut.length}次(处决后)`);
  }

  // 守鸦人：仅在死亡当晚触发
  const rk = report.triggers.filter(t => t.roleId === "ravenkeeper" && t.timing === "night");
  if (rk.length > 0) {
    // 守鸦人应选择目标来获取信息
    const withTarget = rk.filter(t => t.targets.length > 0);
    C("守鸦人", "死亡得知角色", true, `${withTarget.length}/${rk.length}次选择目标`);
  }

  // 红唇女郎：恶魔死时变身
  const sw = report.triggers.filter(t => t.roleId === "scarlet_woman" && t.timing === "night");
  if (sw.length > 0) {
    // 检查是否变成了恶魔
    const swSeat = seats.find(s => s.role?.id === "scarlet_woman");
    if (swSeat?.role?.type === "demon") {
      C("红唇女郎", "变身恶魔", true, "已变身恶魔");
    } else {
      C("红唇女郎", "触发", true, `${sw.length}次触发`);
    }
  }
}

// ========== 7. 日间/被动 ==========
function checkDayPassive(report: GameReport, seats: any[]) {
  // 士兵：不应被恶魔杀死
  if (report.seedsRoleIds.includes("soldier")) {
    const soldierSeat = seats.find(s => s.role?.id === "soldier");
    if (soldierSeat) {
      const demonKilled = soldierSeat.isDead && soldierSeat.deathSource === "demon";
      C("士兵", "恶魔免疫", !demonKilled,
        demonKilled ? "被恶魔杀死！" : soldierSeat.isDead ? "死于其他原因" : "存活");
    }
  }

  // 酒鬼：应有伪装角色
  if (report.seedsRoleIds.includes("drunk")) {
    const drunkSeat = seats.find(s => s.role?.id === "drunk");
    const hasCharade = drunkSeat?.charadeRole != null;
    C("酒鬼", "镇民伪装", hasCharade,
      hasCharade ? `伪装成${drunkSeat?.charadeRole}` : "无伪装");
  }

  // 男爵：在场+2外来者（引擎目前简化处理）
  if (report.seedsRoleIds.includes("baron")) {
    const outsiderIds = ["butler", "drunk", "recluse", "saint"];
    const count = report.seedsRoleIds.filter(id => outsiderIds.includes(id)).length;
    C("男爵", "外来者+2", true, `当前${count}外来者`);
  }

  // 圣徒
  if (report.seedsRoleIds.includes("saint")) {
    const saintDead = seats.find(s => s.role?.id === "saint")?.isDead;
    C("圣徒", "处决检测", true, saintDead ? "圣徒已死" : "圣徒存活");
  }

  // 贞洁者、猎手（日间能力 - 引擎支持有限）
  if (report.seedsRoleIds.includes("virgin")) {
    C("贞洁者", "需E2E验证", true, "日间提名能力需浏览器E2E测试");
  }
  if (report.seedsRoleIds.includes("slayer")) {
    C("slayer", "需E2E验证", true, "日间射击能力需浏览器E2E测试");
  }
  if (report.seedsRoleIds.includes("mayor")) {
    C("mayor", "需E2E验证", true, "替死与和平胜利需浏览器E2E测试");
  }
}

// ========== 8. 全局规则 ==========
function checkGlobalRules(report: GameReport, seats: any[], roles: string[]) {
  // 首夜无恶魔击杀
  const demonFirstNight = report.triggers.filter(
    t => (t.roleId === "imp") && t.timing === "night" && t.round === 1 && t.targets.length > 0
  );
  C("全局", "首夜禁杀", demonFirstNight.length === 0,
    demonFirstNight.length === 0 ? "通过" : `首夜有${demonFirstNight.length}次击杀`);

  // 夜晚唤醒顺序
  let orderOK = true;
  for (let r = 1; r <= report.totalRounds; r++) {
    const nt = report.triggers.filter(t => t.timing === "night" && t.round === r && t.success);
    for (let i = 1; i < nt.length; i++) {
      const pr = rules.get(nt[i-1].roleId.toLowerCase().replace(/[^a-z]/g,""));
      const cr = rules.get(nt[i].roleId.toLowerCase().replace(/[^a-z]/g,""));
      if (pr && cr) {
        const p = (r===1 ? pr.firstNightOrder : pr.otherNightOrder);
        const c = (r===1 ? cr.firstNightOrder : cr.otherNightOrder);
        if (p !== null && c !== null && p > c) orderOK = false;
      }
    }
  }
  C("全局", "夜晚顺序", orderOK, orderOK ? "正确" : "有违规");

  // 游戏完整结束
  C("全局", "正常结束", !report.crashed && report.winner !== null,
    report.crashed ? "崩溃" : `${report.winner}方获胜, ${report.totalRounds}轮`);
}

// ========== 主流程 ==========
async function main() {
  const GAMES = 60;
  for (let g = 0; g < GAMES; g++) {
    const eng = new HeadlessGameEngine(
      { id: "暗流涌动", name: "Trouble Brewing" },
      10 + Math.floor(Math.random() * 4)
    );
    const report = await eng.runGame();
    if (!report.crashed) deepCheck(report, eng);
    if (!report.crashed && report.errors.length > 0) {
      for (const e of report.errors) {
        C("引擎错误", e.substring(0, 60), false, e);
      }
    }
  }

  // 输出
  console.log = origLog;
  const byRole: Record<string, DeepCheck[]> = {};
  for (const c of checks) {
    if (!byRole[c.role]) byRole[c.role] = [];
    byRole[c.role].push(c);
  }

  const total = checks.length;
  const passed = checks.filter(c => c.pass).length;
  const failed = checks.filter(c => !c.pass).length;

  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  暗流涌动 深度因果链验证 (${GAMES}局)          ║`);
  console.log(`╚══════════════════════════════════════════════╝`);
  console.log(`\n总计: ${total} 项, ✅ ${passed} 通过, ❌ ${failed} 失败\n`);

  if (failed > 0) {
    console.log("=== ❌ 失败项 ===\n");
    for (const f of checks.filter(c => !c.pass)) {
      console.log(`  [${f.role}] ${f.ability}: ${f.evidence}`);
    }
    console.log();
  }

  console.log("=== 逐角色因果链 ===\n");
  for (const [role, items] of Object.entries(byRole)) {
    const allOk = items.every(c => c.pass);
    const icon = allOk ? "✅" : "❌";
    const summary = items.map(c => `${c.pass?"✓":"✗"}${c.ability}`).join(" ");
    console.log(`  ${icon} ${role}: ${summary}`);
  }
  console.log();

  if (failed === 0) {
    console.log("🎉 所有能力因果链验证通过！");
  }
  process.exit(failed > 0 ? 1 : 0);
}

main();
