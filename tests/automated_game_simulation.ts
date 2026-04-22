// 血染钟楼自动化测试程序
// 随机选择剧本，随机7-15人开始游戏，模拟完整游戏流程
// 记录测试报告到根目录下的《游戏测试报告#日期+轮次》

import fs from "node:fs";
import path from "node:path";
import { type GamePhase, type Role, roles, type Seat } from "../app/data";
import { isEvil } from "../src/utils/gameRules";
import { calculateNightInfo } from "../src/utils/nightLogic";
import { generateNightActionQueue } from "../src/utils/nightQueueGenerator";

// --- 常量定义 ---
const SCRIPTS = [
  { id: "暗流涌动", name: "Trouble Brewing", file: "暗流涌动.json" },
  { id: "黯月初升", name: "Bad Moon Rising", file: "黯月初升.json" },
  { id: "梦殒春宵", name: "Sects & Violets", file: "梦殒春宵.json" },
  { id: "窃窃私语", name: "Whispering", file: "窃窃私语.json" },
  { id: "无名之墓", name: "Unnamed Tomb", file: "无名之墓.json" },
  { id: "无上愉悦", name: "Supreme Joy", file: "无上愉悦.json" },
  { id: "凶宅魅影", name: "Haunted House", file: "凶宅魅影.json" },
  { id: "游园惊梦", name: "Garden Dream", file: "游园惊梦.json" },
];

const MIN_PLAYERS = 7;
const MAX_PLAYERS = 15;
const MAX_ROUNDS = 20; // 防止无限循环

// --- 类型定义 ---
interface TestReport {
  testId: string;
  startTime: string;
  script: string;
  playerCount: number;
  seats: SeatInfo[];
  rounds: RoundLog[];
  winner: string | null;
  endTime: string;
  duration: number;
  errors: string[];
  crashLog?: string;
}

interface SeatInfo {
  seatId: number;
  roleId: string;
  roleName: string;
  roleType: string;
  isEvil: boolean;
  isAlive: boolean;
}

interface RoundLog {
  round: number;
  phase: GamePhase;
  actions: ActionLog[];
  deaths: number[];
  nominations: NominationLog[];
  votes: VoteLog[];
  messages: MessageLog[];
}

interface ActionLog {
  seatId: number;
  roleId: string;
  action: string;
  targetSeats?: number[];
  result?: string;
}

interface NominationLog {
  nominator: number;
  nominee: number;
  success: boolean;
}

interface VoteLog {
  voter: number;
  nominee: number;
  vote: "yes" | "no";
}

interface MessageLog {
  type: "info" | "warning" | "error" | "game";
  content: string;
}

// --- 工具函数 ---
const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const randomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const getRandomScript = () => {
  return SCRIPTS[Math.floor(Math.random() * SCRIPTS.length)];
};

const filterRolesByScript = (scriptId: string, type: string): Role[] => {
  return roles.filter(
    (r: Role) => (r.script === scriptId || !r.script) && r.type === type
  );
};

// --- 模拟游戏类 ---
class AutomatedGameSimulation {
  private scriptId: string;
  private scriptName: string;
  private playerCount: number;
  private seats: Seat[] = [];
  private report: TestReport;
  private currentRound = 0;
  private gameEnded = false;
  private winner: string | null = null;
  private errors: string[] = [];
  private startTime: Date;

  constructor(scriptId: string, scriptName: string, playerCount: number) {
    this.scriptId = scriptId;
    this.scriptName = scriptName;
    this.playerCount = playerCount;
    this.startTime = new Date();

    this.report = {
      testId: `test_${Date.now()}`,
      startTime: this.startTime.toISOString(),
      script: scriptName,
      playerCount,
      seats: [],
      rounds: [],
      winner: null,
      endTime: "",
      duration: 0,
      errors: [],
    };
  }

  // 初始化游戏
  initialize(): void {
    try {
      // 随机分配角色
      this.assignRandomRoles();

      // 初始化座位信息
      this.report.seats = this.seats.map((seat, index) => ({
        seatId: index,
        roleId: seat.role?.id || "unknown",
        roleName: seat.role?.name || "未知",
        roleType: seat.role?.type || "unknown",
        isEvil: isEvil(seat.role),
        isAlive: true,
      }));

      this.logMessage(
        "info",
        `游戏初始化完成：剧本=${this.scriptName}，玩家=${this.playerCount}人`
      );
    } catch (error) {
      this.handleError(`初始化失败: ${error}`);
    }
  }

  // 分配随机角色
  private assignRandomRoles(): void {
    // 根据剧本和玩家数量分配角色类型
    // 简化版本：随机选择角色，不严格遵循角色类型分布
    const availableRoles = roles.filter(
      (r) => r.script === this.scriptId || !r.script
    );

    if (availableRoles.length < this.playerCount) {
      // 如果剧本角色不足，使用所有角色
      availableRoles.push(...roles);
    }

    const shuffledRoles = shuffle(availableRoles).slice(0, this.playerCount);

    this.seats = Array.from({ length: this.playerCount }, (_, i) => ({
      id: i,
      role: shuffledRoles[i],
      isDead: false,
      isGhost: false,
      isProtected: false,
      isPoisoned: false,
      isDrunk: false,
      nominationDisabled: false,
      voteWeight: 1,
      notes: [],
    }));
  }

  // 运行完整游戏
  async runGame(): Promise<void> {
    try {
      this.logMessage("game", "=== 游戏开始 ===");

      // 游戏主循环
      while (!this.gameEnded && this.currentRound < MAX_ROUNDS) {
        this.currentRound++;
        this.logMessage("game", `\n--- 第 ${this.currentRound} 回合 ---`);

        // 白天阶段
        await this.simulateDayPhase();

        // 检查游戏是否结束
        if (this.checkGameEnd()) break;

        // 夜晚阶段
        await this.simulateNightPhase();

        // 检查游戏是否结束
        if (this.checkGameEnd()) break;

        // 防止无限循环
        if (this.currentRound >= MAX_ROUNDS) {
          this.logMessage(
            "warning",
            `达到最大回合数 ${MAX_ROUNDS}，强制结束游戏`
          );
          this.winner = "draw";
          break;
        }
      }

      this.endGame();
    } catch (error) {
      this.handleError(`游戏运行出错: ${error}`);
      this.endGame();
    }
  }

  // 模拟白天阶段
  private async simulateDayPhase(): Promise<void> {
    const roundLog: RoundLog = {
      round: this.currentRound,
      phase: "day",
      actions: [],
      deaths: [],
      nominations: [],
      votes: [],
      messages: [],
    };

    // 记录黎明报告
    this.logMessage("game", "黎明到来，新的一天开始");

    // 随机提名
    const alivePlayers = this.getAliveSeats();
    if (alivePlayers.length >= 2) {
      // 随机选择提名者和被提名者
      const nominator =
        alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      let nominee =
        alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

      // 确保不是同一个人
      while (nominee.id === nominator.id && alivePlayers.length > 1) {
        nominee = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      }

      const nomination: NominationLog = {
        nominator: nominator.id,
        nominee: nominee.id,
        success: Math.random() > 0.3, // 70%成功率
      };

      roundLog.nominations.push(nomination);
      this.logMessage(
        "game",
        `玩家 ${nominator.id + 1} 提名玩家 ${nominee.id + 1}，${nomination.success ? "成功" : "失败"}`
      );

      // 模拟投票
      if (nomination.success) {
        const votes: VoteLog[] = [];
        alivePlayers.forEach((voter) => {
          const vote: "yes" | "no" = Math.random() > 0.5 ? "yes" : "no";
          votes.push({
            voter: voter.id,
            nominee: nominee.id,
            vote,
          });
        });

        roundLog.votes = votes;

        // 计算投票结果
        const yesVotes = votes.filter((v) => v.vote === "yes").length;
        const noVotes = votes.filter((v) => v.vote === "no").length;

        this.logMessage(
          "game",
          `投票结果：赞成 ${yesVotes} 票，反对 ${noVotes} 票`
        );

        // 如果赞成票超过一半，执行被提名者
        if (yesVotes > noVotes) {
          this.killPlayer(nominee.id, { executed: true });
          roundLog.deaths.push(nominee.id);
          this.logMessage("game", `玩家 ${nominee.id + 1} 被处决`);
        }
      }
    }

    // 随机白天行动
    alivePlayers.forEach((seat) => {
      if (seat.role?.dayMeta && Math.random() > 0.7) {
        // 30%概率使用白天能力
        const action: ActionLog = {
          seatId: seat.id,
          roleId: seat.role.id,
          action: seat.role.dayMeta.abilityName || "白天能力",
          result: "执行成功",
        };
        roundLog.actions.push(action);
        this.logMessage(
          "game",
          `玩家 ${seat.id + 1} (${seat.role.name}) 使用了白天能力`
        );
      }
    });

    this.report.rounds.push(roundLog);
  }

  // 模拟夜晚阶段
  private async simulateNightPhase(): Promise<void> {
    const roundLog: RoundLog = {
      round: this.currentRound,
      phase: "night",
      actions: [],
      deaths: [],
      nominations: [],
      votes: [],
      messages: [],
    };

    this.logMessage("game", "夜幕降临，夜晚行动开始");

    // 生成夜晚行动队列
    const nightInfo = calculateNightInfo(this.seats, this.currentRound === 1);
    const nightQueue = generateNightActionQueue(this.seats, nightInfo);

    // 随机执行夜晚行动
    nightQueue.forEach((actionItem) => {
      const seat = this.seats.find((s) => s.id === actionItem.seatId);
      if (!seat || seat.isDead) return;

      // 随机决定是否执行行动（模拟玩家选择）
      if (Math.random() > 0.5) {
        // 随机选择目标（如果有）
        let targetSeats: number[] = [];
        if (
          actionItem.targetType === "single" &&
          this.getAliveSeats().length > 1
        ) {
          const possibleTargets = this.getAliveSeats().filter(
            (s) => s.id !== seat.id
          );
          if (possibleTargets.length > 0) {
            const target =
              possibleTargets[
                Math.floor(Math.random() * possibleTargets.length)
              ];
            targetSeats = [target.id];

            // 根据行动类型模拟效果
            if (actionItem.effectType === "kill") {
              // 随机决定是否成功
              if (Math.random() > 0.3) {
                // 70%成功率
                this.killPlayer(target.id, { nightKill: true });
                roundLog.deaths.push(target.id);
                this.logMessage("game", `玩家 ${target.id + 1} 在夜晚被杀害`);
              }
            }
          }
        }

        const action: ActionLog = {
          seatId: seat.id,
          roleId: seat.role?.id || "unknown",
          action: actionItem.abilityName || "夜晚能力",
          targetSeats,
          result:
            targetSeats.length > 0
              ? `目标玩家 ${targetSeats.map((t) => t + 1).join(", ")}`
              : "无目标",
        };
        roundLog.actions.push(action);
        this.logMessage(
          "game",
          `玩家 ${seat.id + 1} (${seat.role?.name}) 使用了夜晚能力`
        );
      }
    });

    // 随机自然死亡（模拟其他死亡原因）
    if (Math.random() > 0.8) {
      // 20%概率有自然死亡
      const alivePlayers = this.getAliveSeats();
      if (alivePlayers.length > 0) {
        const victim =
          alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        this.killPlayer(victim.id, { natural: true });
        roundLog.deaths.push(victim.id);
        this.logMessage("game", `玩家 ${victim.id + 1} 在夜晚自然死亡`);
      }
    }

    this.report.rounds.push(roundLog);
  }

  // 检查游戏是否结束
  private checkGameEnd(): boolean {
    const alivePlayers = this.getAliveSeats();
    const evilPlayers = alivePlayers.filter((s) => isEvil(s.role));
    const goodPlayers = alivePlayers.filter((s) => !isEvil(s.role));

    // 恶魔死亡 -> 好人胜利
    const demonAlive = evilPlayers.some((s) => s.role?.type === "demon");
    if (!demonAlive) {
      this.winner = "good";
      this.logMessage("game", "恶魔已死亡，好人阵营胜利！");
      return true;
    }

    // 好人数量不足 -> 邪恶阵营胜利
    if (goodPlayers.length === 0) {
      this.winner = "evil";
      this.logMessage("game", "所有好人已死亡，邪恶阵营胜利！");
      return true;
    }

    // 只剩两个玩家且包含恶魔 -> 邪恶阵营胜利
    if (alivePlayers.length === 2 && evilPlayers.length === 1) {
      this.winner = "evil";
      this.logMessage("game", "只剩两名玩家且包含恶魔，邪恶阵营胜利！");
      return true;
    }

    return false;
  }

  // 结束游戏
  private endGame(): void {
    const endTime = new Date();
    const duration = endTime.getTime() - this.startTime.getTime();

    this.report.endTime = endTime.toISOString();
    this.report.duration = duration;
    this.report.winner = this.winner;
    this.gameEnded = true;

    this.logMessage("game", "=== 游戏结束 ===");
    this.logMessage(
      "game",
      `胜利方: ${this.winner === "good" ? "好人阵营" : this.winner === "evil" ? "邪恶阵营" : "平局"}`
    );
    this.logMessage("game", `游戏时长: ${duration}ms`);
    this.logMessage("game", `总回合数: ${this.currentRound}`);
  }

  // 获取存活座位
  private getAliveSeats(): Seat[] {
    return this.seats.filter((s) => !s.isDead);
  }

  // 杀死玩家
  private killPlayer(seatId: number, _options: any = {}): void {
    const seatIndex = this.seats.findIndex((s) => s.id === seatId);
    if (seatIndex >= 0) {
      this.seats[seatIndex] = { ...this.seats[seatIndex], isDead: true };
    }
  }

  // 记录消息
  private logMessage(
    type: "info" | "warning" | "error" | "game",
    content: string
  ): void {
    console.log(`[${type.toUpperCase()}] ${content}`);

    const lastRound = this.report.rounds[this.report.rounds.length - 1];
    if (lastRound) {
      lastRound.messages.push({ type, content });
    }
  }

  // 处理错误
  private handleError(error: string): void {
    this.errors.push(error);
    this.logMessage("error", error);
  }

  // 获取测试报告
  getReport(): TestReport {
    return this.report;
  }

  // 保存测试报告到文件
  saveReport(): string {
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

    // 生成报告内容
    const reportContent = this.generateReportText();

    // 写入文件
    fs.writeFileSync(reportPath, reportContent, "utf-8");

    return reportPath;
  }

  // 生成报告文本
  private generateReportText(): string {
    const report = this.report;
    let content = `${"=".repeat(60)}\n`;
    content += "血染钟楼自动化测试报告\n";
    content += `生成时间: ${new Date().toISOString()}\n`;
    content += `测试ID: ${report.testId}\n`;
    content += `剧本: ${report.script}\n`;
    content += `玩家人数: ${report.playerCount}\n`;
    content += `游戏时长: ${report.duration}ms\n`;
    content += `胜利方: ${report.winner === "good" ? "好人阵营" : report.winner === "evil" ? "邪恶阵营" : "平局"}\n`;
    content += `${"=".repeat(60)}\n\n`;

    // 角色分配
    content += "=== 角色分配 ===\n";
    report.seats.forEach((seat) => {
      content += `座位 ${seat.seatId + 1}: ${seat.roleName} (${seat.roleType}) ${seat.isEvil ? "👿" : "😇"} ${seat.isAlive ? "❤️" : "💀"}\n`;
    });

    content += "\n=== 游戏过程 ===\n";
    report.rounds.forEach((round) => {
      content += `\n第 ${round.round} 回合 - ${round.phase === "day" ? "白天" : "夜晚"}\n`;

      if (round.nominations.length > 0) {
        round.nominations.forEach((nom) => {
          content += `  提名: 玩家 ${nom.nominator + 1} → 玩家 ${nom.nominee + 1} ${nom.success ? "✓" : "✗"}\n`;
        });
      }

      if (round.actions.length > 0) {
        round.actions.forEach((action) => {
          content += `  行动: 玩家 ${action.seatId + 1} (${action.roleId}) ${action.action}`;
          if (action.targetSeats && action.targetSeats.length > 0) {
            content += ` → 玩家 ${action.targetSeats.map((t) => t + 1).join(", ")}`;
          }
          if (action.result) content += ` - ${action.result}`;
          content += "\n";
        });
      }

      if (round.deaths.length > 0) {
        content += `  死亡: 玩家 ${round.deaths.map((d) => d + 1).join(", ")}\n`;
      }
    });

    content += "\n=== 错误日志 ===\n";
    if (report.errors.length === 0) {
      content += "无错误\n";
    } else {
      report.errors.forEach((error) => {
        content += `❌ ${error}\n`;
      });
    }

    content += `\n${"=".repeat(60)}\n`;
    content += "报告结束\n";
    content += `${"=".repeat(60)}\n`;

    return content;
  }
}

// 导出类
export { AutomatedGameSimulation };
