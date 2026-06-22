import { describe, it, expect } from "vitest";
import { HeadlessGameEngine, SCRIPTS } from "./headlessGameEngine";

const GAMES_PER_SCRIPT = 15;
const MIN_PLAYERS = 9;
const MAX_PLAYERS = 13;

describe("Layer 4: 全剧本批量仿真", () => {
  it("批量运行 " + (SCRIPTS.length * GAMES_PER_SCRIPT) + " 场对局并生成覆盖度报告", async () => {
    const allReports = [];
    const coverageMap = new Map();
    let totalErrors = 0;
    let totalCrashes = 0;

    for (const script of SCRIPTS) {
      for (let g = 0; g < GAMES_PER_SCRIPT; g++) {
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
      }
      console.log("  " + script.name + " x" + GAMES_PER_SCRIPT + " 完成");
    }

    // ========== 生成汇总报告 ==========
    const totalGames = allReports.length;
    const totalTriggers = allReports.reduce((s, r) => s + r.triggers.length, 0);
    const allAssigned = new Set(allReports.flatMap(r => r.seedsRoleIds));
    const triggeredRoles = coverageMap.size;
    const crashCount = allReports.filter(r => r.crashed).length;

    // 输出所有游戏日志（简略版）
    console.log("\n" + "=".repeat(70));
    console.log("LAYER 4 全剧本批量仿真报告");
    console.log("=".repeat(70));
    console.log("剧本数: " + SCRIPTS.length + "  每剧本局数: " + GAMES_PER_SCRIPT);
    console.log("对局总数: " + totalGames);
    console.log("崩溃: " + crashCount);
    console.log("错误总数: " + totalErrors);
    console.log("能力触发总数: " + totalTriggers);
    console.log("触发角色: " + triggeredRoles + "/" + allAssigned.size + " (" + ((triggeredRoles / allAssigned.size) * 100).toFixed(1) + "%)");

    // 按剧本统计
    console.log("\n--- 剧本统计 ---");
    const scriptStats = {};
    for (const r of allReports) {
      if (!scriptStats[r.script]) scriptStats[r.script] = { games: 0, triggers: 0, errors: 0, crashes: 0 };
      scriptStats[r.script].games++;
      scriptStats[r.script].triggers += r.triggers.length;
      scriptStats[r.script].errors += r.errors.length;
      if (r.crashed) scriptStats[r.script].crashes++;
    }
    for (const [s, d] of Object.entries(scriptStats)) {
      console.log("  " + s.padEnd(22) + " " + d.games + "局 触发:" + d.triggers + " 错误:" + d.errors + (d.crashes > 0 ? " 崩溃:" + d.crashes : ""));
    }

    // 错误详情
    const allErrorDetails = allReports.flatMap((r, i) => r.errors.map(e => "  [游戏" + (i + 1) + "/" + r.script + "] " + e));
    if (allErrorDetails.length > 0) {
      console.log("\n--- 错误详情 ---");
      // 去重并统计
      const errorCounts = {};
      for (const e of allErrorDetails) {
        if (!errorCounts[e]) errorCounts[e] = 0;
        errorCounts[e]++;
      }
      for (const [e, c] of Object.entries(errorCounts)) {
        console.log("  [" + c + "x] " + e);
      }
    }

    // 角色级别覆盖
    console.log("\n--- 角色触发详情 (仅列出有问题的) ---");
    const reliabilityIssues = [];
    const passiveOrDay = ["drunk", "saint", "recluse", "mutant", "virgin", "slayer", "artist", "savant"];

    for (const [id, e] of [...coverageMap.entries()].sort((a, b) => {
      const rateA = a[1].triggerCount > 0 ? a[1].successCount / a[1].triggerCount : 0;
      const rateB = b[1].triggerCount > 0 ? b[1].successCount / b[1].triggerCount : 0;
      return rateA - rateB;
    })) {
      const rate = e.triggerCount > 0 ? ((e.successCount / e.triggerCount) * 100).toFixed(0) + "%" : "N/A";
      if (e.successCount < e.triggerCount || e.errorCount > 0) {
        reliabilityIssues.push({ id, triggerCount: e.triggerCount, successCount: e.successCount, errorCount: e.errorCount, rate });
        console.log("  " + id.padEnd(20) + " " + e.triggerCount + "次 成功" + e.successCount + " 错误" + e.errorCount + " 可靠" + rate);
      }
    }

    // 未触发角色
    const neverTriggered = [...allAssigned].filter(id => !coverageMap.has(id));
    if (neverTriggered.length > 0) {
      const maybeNight = neverTriggered.filter(id => !passiveOrDay.includes(id));
      const knownPassive = neverTriggered.filter(id => passiveOrDay.includes(id));
      console.log("\n--- 未触发角色 (" + neverTriggered.length + "个) ---");
      if (maybeNight.length > 0) console.log("  可能需要night能力排查: " + maybeNight.join(", "));
      if (knownPassive.length > 0) console.log("  被动/日间角色(预期): " + knownPassive.join(", "));
    }

    // 崩溃详情
    const crashes = allReports.filter(r => r.crashed);
    if (crashes.length > 0) {
      console.log("\n--- 崩溃详情 ---");
      for (const c of crashes) {
        console.log("  [游戏] " + c.script + " " + c.playerCount + "人局: " + (c.crashMessage || "unknown"));
      }
    }

    // ========== 断言 ==========
    expect(totalGames).toBe(75);
    expect(crashCount).toBe(0);
    expect(totalErrors).toBeLessThan(100); // 允许少量已知错误
    expect(triggeredRoles).toBeGreaterThan(65); // 至少覆盖50+角色
  }, 600000); // 10分钟超时
});