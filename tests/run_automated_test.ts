#!/usr/bin/env node
// 血染钟楼自动化测试 - 主运行脚本
// 随机选择剧本，随机7-15人开始游戏，模拟完整游戏流程

import fs from "node:fs";
import path from "node:path";
import { roles } from "../app/data";

// --- 配置 ---
const TEST_COUNT = 1; // 第一轮测试运行1次
const MIN_PLAYERS = 7;
const MAX_PLAYERS = 15;

// 剧本列表
const SCRIPTS = [
  { id: "暗流涌动", name: "Trouble Brewing" },
  { id: "黯月初升", name: "Bad Moon Rising" },
  { id: "梦殒春宵", name: "Sects & Violets" },
  { id: "窃窃私语", name: "Whispering" },
  { id: "无名之墓", name: "Unnamed Tomb" },
  { id: "无上愉悦", name: "Supreme Joy" },
  { id: "凶宅魅影", name: "Haunted House" },
  { id: "游园惊梦", name: "Garden Dream" },
];

// --- 工具函数 ---
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- 游戏模拟类（简化版） ---
class GameSimulation {
  private script: any;
  private playerCount: number;
  private seats: any[] = [];
  private logs: string[] = [];
  private currentRound = 0;
  private gameEnded = false;
  private winner: string | null = null;
  private startTime: Date;

  constructor(script: any, playerCount: number) {
    this.script = script;
    this.playerCount = playerCount;
    this.startTime = new Date();
  }

  // 初始化游戏 - 确保有恶魔
  initialize(): void {
    this.log("游戏初始化开始");

    // 过滤可用的角色
    const availableRoles = roles.filter(
      (r) => r.script === this.script.id || !r.script
    );

    if (availableRoles.length < this.playerCount) {
      // 如果剧本角色不足，使用所有角色
      availableRoles.push(...roles);
    }

    // 确保至少有一个恶魔
    const demonRoles = availableRoles.filter((r) => r.type === "demon");
    if (demonRoles.length === 0) {
      // 如果没有恶魔角色，从所有角色中添加
      const allDemons = roles.filter((r) => r.type === "demon");
      demonRoles.push(...allDemons);
    }

    // 随机选择角色，确保包含恶魔
    const selectedRoles: any[] = [];

    // 1. 先选择一个恶魔
    const demon = demonRoles[Math.floor(Math.random() * demonRoles.length)];
    selectedRoles.push(demon);

    // 2. 随机选择其他角色
    const otherRoles = availableRoles.filter((r) => r.id !== demon.id);
    const remainingCount = this.playerCount - 1;

    if (otherRoles.length < remainingCount) {
      // 如果其他角色不足，从所有角色中添加
      otherRoles.push(...roles.filter((r) => r.id !== demon.id));
    }

    const otherSelected = shuffle(otherRoles).slice(0, remainingCount);
    selectedRoles.push(...otherSelected);

    // 3. 随机打乱所有角色（包括恶魔）
    const finalRoles = shuffle(selectedRoles);

    // 创建座位
    this.seats = finalRoles.map((role, index) => ({
      id: index,
      role,
      isDead: false,
      isProtected: false,
      isPoisoned: false,
      isDrunk: false,
    }));

    this.log(
      `游戏初始化完成：剧本=${this.script.name}，玩家=${this.playerCount}人`
    );
    this.log(`角色分配：${this.seats.map((s) => s.role.name).join(", ")}`);

    // 验证阵容
    const demonCount = this.seats.filter((s) => s.role.type === "demon").length;
    if (demonCount === 0) {
      this.log("警告：阵容中没有恶魔！");
    }
  }

  // 运行游戏
  async run(): Promise<void> {
    this.log("=== 游戏开始 ===");

    try {
      while (!this.gameEnded) {
        this.currentRound++;
        this.log(`\n--- 第 ${this.currentRound} 回合 ---`);

        // 白天阶段
        await this.dayPhase();
        if (this.checkGameEnd()) break;

        // 夜晚阶段
        await this.nightPhase();
        if (this.checkGameEnd()) break;

        // 防止异常情况导致无限循环（安全限制）
        if (this.currentRound > 50) {
          this.log("警告：达到安全回合数限制，强制结束游戏");
          this.winner = "evil"; // 默认邪恶胜利
          break;
        }
      }

      this.endGame();
    } catch (error) {
      this.log(`游戏运行出错: ${error}`);
      this.endGame();
    }
  }

  // 白天阶段
  private async dayPhase(): Promise<void> {
    this.log("黎明到来，新的一天开始");

    const alivePlayers = this.seats.filter((s) => !s.isDead);

    // 随机提名
    if (alivePlayers.length >= 2) {
      const nominator =
        alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      let nominee =
        alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

      // 确保不是同一个人
      while (nominee.id === nominator.id && alivePlayers.length > 1) {
        nominee = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      }

      const nominationSuccess = Math.random() > 0.3;
      this.log(
        `玩家 ${nominator.id + 1} (${nominator.role.name}) 提名玩家 ${nominee.id + 1}，${nominationSuccess ? "成功" : "失败"}`
      );

      if (nominationSuccess) {
        // 模拟投票
        const votes = alivePlayers.map(() =>
          Math.random() > 0.5 ? "赞成" : "反对"
        );
        const yesVotes = votes.filter((v) => v === "赞成").length;

        this.log(
          `投票结果：赞成 ${yesVotes} 票，反对 ${votes.length - yesVotes} 票`
        );

        // 如果赞成票超过一半，处决被提名者
        if (yesVotes > votes.length / 2) {
          this.killPlayer(nominee.id, "处决");
          this.log(`玩家 ${nominee.id + 1} (${nominee.role.name}) 被处决`);
        }
      }
    }

    // 随机白天行动
    alivePlayers.forEach((seat) => {
      if (seat.role.dayMeta && Math.random() > 0.7) {
        this.log(`玩家 ${seat.id + 1} (${seat.role.name}) 使用了白天能力`);
      }
    });
  }

  // 夜晚阶段
  private async nightPhase(): Promise<void> {
    this.log("夜幕降临，夜晚行动开始");

    const alivePlayers = this.seats.filter((s) => !s.isDead);

    // 随机夜晚行动（模拟）
    alivePlayers.forEach((seat) => {
      if (seat.role.nightMeta && Math.random() > 0.5) {
        // 随机选择目标
        const possibleTargets = alivePlayers.filter((s) => s.id !== seat.id);
        if (possibleTargets.length > 0) {
          const target =
            possibleTargets[Math.floor(Math.random() * possibleTargets.length)];

          // 根据行动类型模拟效果
          if (
            seat.role.nightMeta.effectType === "kill" &&
            Math.random() > 0.3
          ) {
            this.killPlayer(target.id, "夜晚杀害");
            this.log(
              `玩家 ${target.id + 1} (${target.role.name}) 在夜晚被杀害`
            );
          } else {
            this.log(
              `玩家 ${seat.id + 1} (${seat.role.name}) 对玩家 ${target.id + 1} 使用了夜晚能力`
            );
          }
        }
      }
    });

    // 随机自然死亡
    if (Math.random() > 0.8 && alivePlayers.length > 0) {
      const victim =
        alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      this.killPlayer(victim.id, "自然死亡");
      this.log(`玩家 ${victim.id + 1} (${victim.role.name}) 自然死亡`);
    }
  }

  // 检查游戏是否结束
  private checkGameEnd(): boolean {
    const alivePlayers = this.seats.filter((s) => !s.isDead);

    // 统计各方玩家
    const demons = alivePlayers.filter((s) => s.role.type === "demon");
    const minions = alivePlayers.filter((s) => s.role.type === "minion");
    const townsfolk = alivePlayers.filter((s) => s.role.type === "townsfolk");
    const outsiders = alivePlayers.filter((s) => s.role.type === "outsider");

    const evilPlayers = demons.concat(minions);
    const goodPlayers = townsfolk.concat(outsiders);

    // 1. 恶魔死亡 -> 好人胜利
    if (demons.length === 0) {
      this.winner = "good";
      return true;
    }

    // 2. 所有好人死亡 -> 邪恶阵营胜利
    if (goodPlayers.length === 0) {
      this.winner = "evil";
      return true;
    }

    // 3. 只剩两个玩家且包含恶魔 -> 邪恶阵营胜利（最终三名玩家时恶魔获胜）
    if (alivePlayers.length === 2 && demons.length === 1) {
      this.winner = "evil";
      return true;
    }

    // 4. 只剩三名玩家且恶魔存活 -> 进入最后三名玩家阶段（但游戏还未结束）
    // 游戏继续

    return false;
  }

  // 结束游戏
  private endGame(): void {
    const endTime = new Date();
    const duration = endTime.getTime() - this.startTime.getTime();

    this.gameEnded = true;

    // 如果 winner 未设置，重新检查游戏状态
    if (!this.winner) {
      // 强制检查一次，确保有胜负结果
      if (this.checkGameEnd()) {
        // winner 已在 checkGameEnd 中设置
      } else {
        // 如果仍然没有胜负，根据存活玩家判断
        const alivePlayers = this.seats.filter((s) => !s.isDead);
        const demons = alivePlayers.filter((s) => s.role.type === "demon");

        if (demons.length === 0) {
          this.winner = "good";
        } else {
          this.winner = "evil";
        }
      }
    }

    this.log("\n=== 游戏结束 ===");
    this.log(`胜利方: ${this.winner === "good" ? "好人阵营" : "邪恶阵营"}`);
    this.log(`游戏时长: ${duration}ms`);
    this.log(`总回合数: ${this.currentRound}`);
    this.log(
      `存活玩家: ${this.seats
        .filter((s) => !s.isDead)
        .map((s) => `${s.id + 1}(${s.role.name})`)
        .join(", ")}`
    );
  }

  // 杀死玩家
  private killPlayer(seatId: number, reason: string): void {
    const seatIndex = this.seats.findIndex((s) => s.id === seatId);
    if (seatIndex >= 0) {
      this.seats[seatIndex].isDead = true;
    }
  }

  // 记录日志
  private log(message: string): void {
    const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    this.logs.push(logMessage);
  }

  // 获取报告
  getReport(): any {
    const endTime = new Date();
    const duration = endTime.getTime() - this.startTime.getTime();

    return {
      script: this.script.name,
      playerCount: this.playerCount,
      winner: this.winner,
      rounds: this.currentRound,
      duration: duration,
      // 初始阵容（游戏开始时）
      initialSeats: this.seats.map((s) => ({
        id: s.id,
        role: s.role.name,
        type: s.role.type,
        isDead: false, // 游戏开始时都存活
      })),
      // 最终状态（游戏结束时）
      finalSeats: this.seats.map((s) => ({
        id: s.id,
        role: s.role.name,
        type: s.role.type,
        isDead: s.isDead,
      })),
      logs: this.logs,
    };
  }
}

// --- 测试运行器 ---
async function runAutomatedTest() {
  console.log("🚀 血染钟楼自动化测试开始");
  console.log(`时间: ${new Date().toISOString()}`);
  console.log("=".repeat(50));

  const date = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const reportDir = "游戏测试报告";

  // 确保目录存在
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // 查找下一个轮次号
  let roundNumber = 1;
  let reportPath = "";

  while (true) {
    reportPath = path.join(
      reportDir,
      `游戏测试报告#${date}+${roundNumber}.txt`
    );
    if (!fs.existsSync(reportPath)) {
      break;
    }
    roundNumber++;
  }

  // 开始测试
  const startTime = Date.now();
  const testResults = [];

  for (let i = 0; i < TEST_COUNT; i++) {
    console.log(`\n📋 测试 ${i + 1}/${TEST_COUNT}`);

    // 随机选择剧本
    const script = SCRIPTS[Math.floor(Math.random() * SCRIPTS.length)];
    const playerCount = randomInt(MIN_PLAYERS, MAX_PLAYERS);

    console.log(`剧本: ${script.name} (${script.id})`);
    console.log(`玩家人数: ${playerCount}`);

    try {
      // 创建并运行游戏模拟
      const game = new GameSimulation(script, playerCount);
      game.initialize();
      await game.run();

      const report = game.getReport();
      testResults.push(report);

      console.log(
        `✅ 测试 ${i + 1} 完成 - 胜利方: ${report.winner === "good" ? "好人" : report.winner === "evil" ? "邪恶" : "平局"}`
      );
    } catch (error) {
      console.error(`❌ 测试 ${i + 1} 失败:`, error);
      testResults.push({
        script: script.name,
        playerCount,
        error: error instanceof Error ? error.message : String(error),
        crashed: true,
      });
    }
  }

  const endTime = Date.now();
  const totalDuration = endTime - startTime;

  // 生成报告
  const reportContent = generateReportContent(
    date,
    roundNumber,
    testResults,
    totalDuration
  );

  // 写入文件
  fs.writeFileSync(reportPath, reportContent, "utf-8");

  console.log("\n" + "=".repeat(50));
  console.log("📊 测试完成");
  console.log(`总测试次数: ${TEST_COUNT}`);
  console.log(`成功: ${testResults.filter((r) => !r.error).length}`);
  console.log(`失败: ${testResults.filter((r) => r.error).length}`);
  console.log(`总时长: ${totalDuration}ms`);
  console.log(`报告保存至: ${reportPath}`);
  console.log("🎯 血染钟楼自动化测试结束");
}

// 生成报告内容
function generateReportContent(
  date: string,
  roundNumber: number,
  testResults: any[],
  totalDuration: number
): string {
  let content = "=".repeat(60) + "\n";
  content += "血染钟楼自动化测试报告\n";
  content += `生成时间: ${new Date().toISOString()}\n`;
  content += `报告编号: ${date}+${roundNumber}\n`;
  content += "=".repeat(60) + "\n\n";

  content += `总测试次数: ${testResults.length}\n`;
  content += `总时长: ${totalDuration}ms\n\n`;

  // 汇总统计
  const goodWins = testResults.filter((r) => r.winner === "good").length;
  const evilWins = testResults.filter((r) => r.winner === "evil").length;
  const draws = testResults.filter((r) => r.winner === "draw").length;
  const errors = testResults.filter((r) => r.error).length;

  content += "=== 汇总统计 ===\n";
  content += `好人胜利: ${goodWins} 次\n`;
  content += `邪恶胜利: ${evilWins} 次\n`;
  content += `平局: ${draws} 次\n`;
  content += `错误/崩溃: ${errors} 次\n\n`;

  // 详细测试结果
  content += "=== 详细测试结果 ===\n\n";

  testResults.forEach((result, index) => {
    content += `测试 ${index + 1}:\n`;
    content += `  剧本: ${result.script}\n`;
    content += `  玩家人数: ${result.playerCount}\n`;

    if (result.error) {
      content += "  状态: ❌ 失败\n";
      content += `  错误: ${result.error}\n`;
    } else {
      content += "  状态: ✅ 完成\n";
      content += `  胜利方: ${result.winner === "good" ? "好人阵营" : result.winner === "evil" ? "邪恶阵营" : "平局"}\n`;
      content += `  回合数: ${result.rounds}\n`;
      content += `  时长: ${result.duration}ms\n`;

      // 初始阵容
      content += "  初始阵容:\n";
      result.initialSeats.forEach((seat: any) => {
        content += `    座位 ${seat.id + 1}: ${seat.role} (${seat.type})\n`;
      });

      // 最终状态
      content += "  最终状态:\n";
      result.finalSeats.forEach((seat: any) => {
        const status = seat.isDead ? "💀 死亡" : "❤️ 存活";
        content += `    座位 ${seat.id + 1}: ${seat.role} (${seat.type}) - ${status}\n`;
      });
    }

    content += "\n";
  });

  // 游戏日志
  if (testResults.length > 0 && testResults[0].logs) {
    content += "=== 游戏日志（测试1） ===\n\n";
    testResults[0].logs.forEach((log: string) => {
      content += log + "\n";
    });
  }

  content += "\n" + "=".repeat(60) + "\n";
  content += "报告结束\n";
  content += "=".repeat(60) + "\n";

  return content;
}

// --- 主执行 ---
runAutomatedTest().catch((error) => {
  console.error("❌ 测试运行器崩溃:", error);
  process.exit(1);
});
