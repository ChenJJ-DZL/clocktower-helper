import { describe, it, expect } from "vitest";
import { HeadlessGameEngine, SCRIPTS } from "./headlessGameEngine";

const SIMULATIONS_PER_SCRIPT = 5;
const MIN_PLAYERS = 9;
const MAX_PLAYERS = 12;

describe("Layer 4: 仿真对局层", () => {
  const allReports = [];
  const coverageMap = new Map();
  let totalErrors = 0;
  let totalCrashes = 0;

  for (const script of SCRIPTS) {
    describe(script.name + " (" + script.id + ")", () => {
      for (let g = 0; g < SIMULATIONS_PER_SCRIPT; g++) {
        it("对局 #" + (g + 1), async () => {
          const pc = Math.floor(Math.random() * (MAX_PLAYERS - MIN_PLAYERS + 1)) + MIN_PLAYERS;
          const engine = new HeadlessGameEngine(script, pc);
          const report = await engine.runGame();

          allReports.push(report);
          totalErrors += report.errors.length;
          if (report.crashed) totalCrashes++;

          for (const t of report.triggers) {
            const e = coverageMap.get(t.roleId);
            if (e) { e.triggerCount++; if (t.success) e.successCount++; if (t.corrupted) e.corruptedCount++; if (t.error) e.errorCount++; }
            else { coverageMap.set(t.roleId, { roleId: t.roleId, triggerCount: 1, successCount: t.success ? 1 : 0, corruptedCount: t.corrupted ? 1 : 0, errorCount: t.error ? 1 : 0 }); }
          }

          console.log(
            "[" + script.name + " #" + (g + 1) + "] " +
            pc + "人, " + report.totalRounds + "回合, 触发:" + report.triggers.length +
            ", 胜者:" + report.winner +
            (report.errors.length > 0 ? ", 错误:" + report.errors.length : "") +
            (report.crashed ? ", CRASHED!" : "")
          );

          expect(report.crashed).toBe(false);
        });
      }
    });
  }

  describe("汇总报告", () => {
    it("应生成完整覆盖度报告", () => {
      const triggeredRoles = coverageMap.size;
      const allAssigned = new Set(allReports.flatMap(r => r.seedsRoleIds));
      const totalGames = allReports.length;
      const totalTriggers = allReports.reduce((s, r) => s + r.triggers.length, 0);

      console.log("\n" + "=".repeat(60));
      console.log("LAYER 4 仿真对局汇总");
      console.log("=".repeat(60));
      console.log("总对局: " + totalGames);
      console.log("崩溃: " + totalCrashes);
      console.log("总错误: " + totalErrors);
      console.log("总能力触发: " + totalTriggers);
      console.log("触发角色数: " + triggeredRoles + "/" + allAssigned.size + " (" + ((triggeredRoles / allAssigned.size) * 100).toFixed(1) + "%)");
      console.log("有效角色数(含被动): " + allAssigned.size);

      // 错误
      const errs = allReports.flatMap((r, i) => r.errors.map(e => "  [游戏" + (i + 1) + "] " + e));
      if (errs.length > 0) { console.log("\n--- 错误 ---"); errs.forEach(e => console.log(e)); }

      // 角色覆盖
      console.log("\n--- 角色触发覆盖 ---");
      const sorted = [...coverageMap.entries()].sort((a, b) => b[1].triggerCount - a[1].triggerCount);
      for (const [id, e] of sorted) {
        const rel = e.triggerCount > 0 ? ((e.successCount / e.triggerCount) * 100).toFixed(0) + "%" : "N/A";
        console.log("  " + id.padEnd(20) + " 触发" + e.triggerCount + "次 成功" + e.successCount + " 错误" + e.errorCount + " 可靠" + rel);
      }

      // 未触发角色
      const neverTriggered = [...allAssigned].filter(id => !coverageMap.has(id));
      if (neverTriggered.length > 0) {
        console.log("\n--- 未触发 (" + neverTriggered.length + ") ---");
        // 按类型分类
        const passiveRoles = ["recluse", "drunk", "saint", "tinker", "sweetheart", "politician", "goon", "mutant", "zealot", "plague_doctor"];
        const dayRoles = ["virgin", "slayer", "savant", "artist", "juggler", "sage", "town_crier", "seamstress", "alchemist", "acrobat", "atheist", "banshee", "cannibal", "farmer", "miner"];
        const neverPassive = neverTriggered.filter(r => passiveRoles.includes(r));
        const neverDay = neverTriggered.filter(r => dayRoles.includes(r));
        const neverOther = neverTriggered.filter(r => !passiveRoles.includes(r) && !dayRoles.includes(r));
        if (neverOther.length > 0) { console.log("  可能缺失night能力的: " + neverOther.join(", ")); }
        if (neverPassive.length > 0) { console.log("  被动角色: " + neverPassive.join(", ")); }
        if (neverDay.length > 0) { console.log("  日间角色: " + neverDay.join(", ")); }
      }

      // 对局摘要
      console.log("\n--- 对局摘要 ---");
      const scriptGroups = {};
      for (const r of allReports) {
        if (!scriptGroups[r.script]) scriptGroups[r.script] = { games: 0, triggers: 0, errors: 0 };
        scriptGroups[r.script].games++;
        scriptGroups[r.script].triggers += r.triggers.length;
        scriptGroups[r.script].errors += r.errors.length;
      }
      for (const [s, d] of Object.entries(scriptGroups)) {
        console.log("  " + s + ": " + d.games + "局, " + d.triggers + "触发, " + d.errors + "错误");
      }

      expect(triggeredRoles).toBeGreaterThan(0);
    });
  });
});