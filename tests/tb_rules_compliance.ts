/**
 * 暗流涌动 规则合规性自动测试
 *
 * 基于 json/full/ 中的官方规则数据，运行随机游戏并验证：
 * 1. 夜晚唤醒顺序是否符合官方规则
 * 2. 首夜/其他夜唤醒是否正确
 * 3. 核心能力行为是否符合规则描述
 * 4. 关键规则约束是否被遵守
 */

import * as fs from "fs";
import * as path from "path";
import {
  type GameReport,
  HeadlessGameEngine,
  type TriggerRecord,
} from "./headlessGameEngine";

// ============================================================
// 1. 加载 JSON 规则
// ============================================================

interface JsonRoleRule {
  name: string;
  engName: string;
  type: string;
  ability: string;
  operation: string;
  firstNightOrder: number | null;
  otherNightOrder: number | null;
  ruleDetails: string;
}

function loadJsonRules(): Map<string, JsonRoleRule> {
  const rules = new Map<string, JsonRoleRule>();
  const typeFiles = ["镇民.json", "外来者.json", "爪牙.json", "恶魔.json"];

  for (const file of typeFiles) {
    const data = JSON.parse(
      fs.readFileSync(path.join("json", "full", file), "utf8")
    );
    for (const c of data) {
      const eng = (c["英文名"] || "").toLowerCase().replace(/[^a-z]/g, "");
      if (!eng) continue;
      rules.set(eng, {
        name: c["名称"],
        engName: c["英文名"] || "",
        type: c["类型"] || file.replace(".json", ""),
        ability: (c.content?.["角色能力"] || "").trim(),
        operation: (c.content?.["运作方式"] || "").trim(),
        firstNightOrder:
          c["首夜行动顺序"] === "无法行动"
            ? null
            : parseInt(c["首夜行动顺序"], 10),
        otherNightOrder:
          c["其他夜晚行动顺序"] === "无法行动"
            ? null
            : parseInt(c["其他夜晚行动顺序"], 10),
        ruleDetails: (c.content?.["规则细节"] || "").trim(),
      });
    }
  }
  return rules;
}

// ============================================================
// 2. 合规检查项
// ============================================================

interface Violation {
  gameIndex: number;
  category:
    | "night_order"
    | "first_night_only"
    | "other_night_only"
    | "no_night_action"
    | "ability_behavior"
    | "game_flow";
  roleId: string;
  roleName: string;
  round: number;
  detail: string;
  expected: string;
  actual: string;
}

class RuleComplianceChecker {
  private rules: Map<string, JsonRoleRule>;
  violations: Violation[] = [];

  constructor(rules: Map<string, JsonRoleRule>) {
    this.rules = rules;
  }

  /**
   * 检查整个游戏报告的合规性
   */
  checkGame(report: GameReport, gameIndex: number): void {
    this.checkNightOrderCompliance(report, gameIndex);
    this.checkNightActionEligibility(report, gameIndex);
    this.checkAbilityBehavior(report, gameIndex);
    this.checkGameFlow(report, gameIndex);
  }

  /**
   * 检查夜晚唤醒顺序
   * - 所有在夜晚行动的角色必须按官方顺序出现
   */
  private checkNightOrderCompliance(
    report: GameReport,
    gameIndex: number
  ): void {
    // 收集每个夜晚的触发记录，按round分组
    const nightTriggers = new Map<number, TriggerRecord[]>();
    for (const t of report.triggers) {
      if (t.timing !== "night") continue;
      if (!nightTriggers.has(t.round)) nightTriggers.set(t.round, []);
      nightTriggers.get(t.round)!.push(t);
    }

    for (const [round, triggers] of nightTriggers) {
      const isFirst = round === 1;

      // 检查排序：后面触发的优先级应 >= 前面的
      for (let i = 1; i < triggers.length; i++) {
        const prev = triggers[i - 1];
        const curr = triggers[i];

        const prevRule = this.findRule(prev.roleId);
        const currRule = this.findRule(curr.roleId);

        if (prevRule && currRule) {
          const prevOrder = isFirst
            ? prevRule.firstNightOrder
            : prevRule.otherNightOrder;
          const currOrder = isFirst
            ? currRule.firstNightOrder
            : currRule.otherNightOrder;

          if (
            prevOrder !== null &&
            currOrder !== null &&
            prevOrder > currOrder
          ) {
            this.violations.push({
              gameIndex,
              category: "night_order",
              roleId: prev.roleId + " -> " + curr.roleId,
              roleName: prev.roleName + " -> " + curr.roleName,
              round,
              detail: "夜晚唤醒顺序错误",
              expected: `${prevRule.name} (#${prevOrder}) 早于 ${currRule.name} (#${currOrder})`,
              actual: `${prev.roleName} 晚于 ${curr.roleName} 被唤醒`,
            });
          }
        }
      }
    }
  }

  /**
   * 检查首夜/其他夜唤醒资格
   * - 仅首夜角色不能在非首夜被唤醒
   * - 仅其他夜角色不能在首夜被唤醒
   * - 无夜晚行动角色永远不应被唤醒
   */
  private checkNightActionEligibility(
    report: GameReport,
    gameIndex: number
  ): void {
    const triggeredByRound = new Map<string, Set<number>>();

    for (const t of report.triggers) {
      if (t.timing !== "night") continue;
      const key = t.roleId;
      if (!triggeredByRound.has(key)) triggeredByRound.set(key, new Set());
      triggeredByRound.get(key)!.add(t.round);
    }

    for (const [roleId, rounds] of triggeredByRound) {
      const rule = this.findRule(roleId);
      if (!rule) continue;

      const onlyFirstNight =
        rule.firstNightOrder !== null && rule.otherNightOrder === null;
      const onlyOtherNight =
        rule.firstNightOrder === null && rule.otherNightOrder !== null;
      const noNightAction =
        rule.firstNightOrder === null && rule.otherNightOrder === null;

      for (const round of rounds) {
        const isFirst = round === 1;

        if (onlyFirstNight && !isFirst) {
          this.violations.push({
            gameIndex,
            category: "first_night_only",
            roleId,
            roleName: rule.name,
            round,
            detail: `仅首夜角色在第${round}轮(非首夜)被唤醒`,
            expected: "仅首夜唤醒",
            actual: `第${round}轮被唤醒`,
          });
        }

        if (onlyOtherNight && isFirst) {
          this.violations.push({
            gameIndex,
            category: "other_night_only",
            roleId,
            roleName: rule.name,
            round,
            detail: "仅其他夜角色在首夜被唤醒",
            expected: "首夜不唤醒",
            actual: "首夜被唤醒",
          });
        }

        if (noNightAction) {
          this.violations.push({
            gameIndex,
            category: "no_night_action",
            roleId,
            roleName: rule.name,
            round,
            detail: "无夜晚行动角色在夜晚被唤醒",
            expected: "永远不唤醒",
            actual: `第${round}轮被唤醒`,
          });
        }
      }
    }

    // 反向检查：仅首夜角色是否在首夜被正确地唤醒了？
    for (const t of report.triggers) {
      if (t.timing !== "night") continue;
      const rule = this.findRule(t.roleId);
      if (!rule) continue;

      // 记录所有首夜应唤醒但未唤醒的角色
      // (这需要在所有触发的角色之外进行额外检查)
    }
  }

  /**
   * 检查关键能力行为
   */
  private checkAbilityBehavior(report: GameReport, gameIndex: number): void {
    // 检查小恶魔首夜是否没有杀人
    const impKills = report.triggers.filter(
      (t) => t.roleId === "imp" && t.timing === "night" && t.round === 1
    );
    if (impKills.length > 0) {
      this.violations.push({
        gameIndex,
        category: "ability_behavior",
        roleId: "imp",
        roleName: "小恶魔",
        round: 1,
        detail: "小恶魔在首夜执行了能力（应该首夜不行动）",
        expected: "首夜恶魔不杀人",
        actual: "小恶魔在首夜被唤醒",
      });
    }

    // 检查洗衣妇仅在首夜被唤醒
    const washerwomanTriggers = report.triggers.filter(
      (t) => t.roleId === "washerwoman" && t.timing === "night"
    );
    for (const t of washerwomanTriggers) {
      if (t.round !== 1) {
        this.violations.push({
          gameIndex,
          category: "ability_behavior",
          roleId: "washerwoman",
          roleName: "洗衣妇",
          round: t.round,
          detail: "洗衣妇在非首夜被唤醒",
          expected: "仅首夜唤醒一次",
          actual: `第${t.round}轮被唤醒`,
        });
      }
    }

    // 检查僧侣不应在首夜被唤醒（僧侣仅其他夜行动）
    const monkFirstNight = report.triggers.filter(
      (t) => t.roleId === "monk" && t.timing === "night" && t.round === 1
    );
    if (monkFirstNight.length > 0) {
      this.violations.push({
        gameIndex,
        category: "ability_behavior",
        roleId: "monk",
        roleName: "僧侣",
        round: 1,
        detail: "僧侣在首夜被唤醒（应仅其他夜行动）",
        expected: "首夜不唤醒",
        actual: "首夜被唤醒",
      });
    }

    // 检查守鸦人仅在死亡当晚被唤醒（不是每晚）
    const ravenkeeperTriggers = report.triggers.filter(
      (t) => t.roleId === "ravenkeeper" && t.timing === "night"
    );
    // 守鸦人应只在死亡当晚触发，所以触发次数应 <= 1
    if (ravenkeeperTriggers.length > 1) {
      this.violations.push({
        gameIndex,
        category: "ability_behavior",
        roleId: "ravenkeeper",
        roleName: "守鸦人",
        round: ravenkeeperTriggers[1].round,
        detail: `守鸦人被唤醒${ravenkeeperTriggers.length}次（应仅在死亡当晚唤醒一次）`,
        expected: "仅在死亡当晚唤醒",
        actual: `被唤醒${ravenkeeperTriggers.length}次`,
      });
    }
  }

  /**
   * 检查游戏流程合规性
   */
  private checkGameFlow(report: GameReport, gameIndex: number): void {
    // 检查男爵是否被计算（可以检查外来者数量）
    // 检查酒鬼是否被正确伪装
    // 检查游戏是否正常结束

    if (report.crashed) {
      this.violations.push({
        gameIndex,
        category: "game_flow",
        roleId: "system",
        roleName: "系统",
        round: 0,
        detail: "游戏崩溃",
        expected: "正常完成",
        actual: report.crashMessage || "未知错误",
      });
    }

    if (report.errors.length > 0) {
      for (const err of report.errors) {
        this.violations.push({
          gameIndex,
          category: "game_flow",
          roleId: "system",
          roleName: "系统",
          round: 0,
          detail: "游戏错误",
          expected: "无错误",
          actual: err,
        });
      }
    }
  }

  /**
   * 根据 roleId 查找规则
   */
  private findRule(roleId: string): JsonRoleRule | undefined {
    const key = roleId.toLowerCase().replace(/[^a-z]/g, "");
    return this.rules.get(key) || this.rules.get(roleId);
  }

  /**
   * 生成汇总报告
   */
  summarize(): string {
    if (this.violations.length === 0) return "✅ 所有检查通过，未发现违规！";

    const byCategory = new Map<string, Violation[]>();
    for (const v of this.violations) {
      const cat = v.category;
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(v);
    }

    let report = `\n=== 合规检查报告 (共${this.violations.length}项违规) ===\n\n`;

    for (const [cat, violations] of byCategory) {
      const catName: Record<string, string> = {
        night_order: "夜晚唤醒顺序",
        first_night_only: "仅首夜角色",
        other_night_only: "仅其他夜角色",
        no_night_action: "无夜晚行动角色",
        ability_behavior: "能力行为",
        game_flow: "游戏流程",
      };
      report += `## ${catName[cat] || cat} (${violations.length}项)\n`;

      // 去重：按 detail 分组
      const grouped = new Map<string, Violation[]>();
      for (const v of violations) {
        const key = `${v.roleId}:${v.detail}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(v);
      }

      for (const [key, group] of grouped) {
        const first = group[0];
        report += `  ❌ ${first.roleName}(${first.roleId}): ${first.detail}\n`;
        if (group.length > 1) report += `     (共出现${group.length}次)\n`;
        report += `     期望: ${first.expected}\n`;
        report += `     实际: ${first.actual}\n`;
      }
      report += "\n";
    }

    return report;
  }
}

// ============================================================
// 3. 主测试入口
// ============================================================

async function main() {
  const GAME_COUNT = 3;
  const PLAYER_COUNT = 10;

  // 抑制引擎注册日志
  const origLog = console.log;
  console.log = () => {};

  console.log = origLog;
  console.log("\n🔍 暗流涌动 规则合规性测试");
  console.log(`   游戏数量: ${GAME_COUNT}, 玩家数量: ${PLAYER_COUNT}\n`);

  console.log = () => {}; // 再次抑制

  const rules = loadJsonRules();
  console.log = origLog;
  console.log(`   已加载 ${rules.size} 个角色规则\n`);

  const checker = new RuleComplianceChecker(rules);
  let successCount = 0;
  let crashCount = 0;

  for (let i = 0; i < GAME_COUNT; i++) {
    const engine = new HeadlessGameEngine(
      { id: "暗流涌动", name: "Trouble Brewing" },
      PLAYER_COUNT
    );
    const report = await engine.runGame();

    if (report.crashed) {
      crashCount++;
    } else {
      successCount++;
    }

    checker.checkGame(report, i);

    // 进度显示
    if ((i + 1) % 5 === 0) {
      console.log(
        `   进度: ${i + 1}/${GAME_COUNT} (已完成${successCount}, 崩溃${crashCount})`
      );
    }
  }

  console.log(
    `\n   完成: ${successCount}/${GAME_COUNT} 成功, ${crashCount} 崩溃`
  );
  console.log(checker.summarize());
}

main().catch((e) => {
  console.error("测试失败:", e);
  process.exit(1);
});
