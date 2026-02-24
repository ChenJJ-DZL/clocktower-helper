// tests/simulation_helpers.ts

import { Page, expect } from "@playwright/test";
import fs from "fs";
import type { Writable } from "stream";

// =============================================
// --- 数据与配置 ---
// =============================================

export const GAME_URL = "http://localhost:3000";
export const REPORT_FILE_PATH = "simulation_report.txt";

// 剧本 11 人局标准阵容预设
export const SCRIPT_11_PLAYER_PRESETS: Record<string, string[]> = {
  trouble_brewing: ['洗衣妇', '图书管理员', '调查员', '厨师', '共情者', '占卜师', '送葬者', '管家', '圣徒', '投毒者', '小恶魔'],
  bad_moon_rising: ['祖母', '水手', '侍女', '驱魔人', '旅店老板', '赌徒', '造谣者', '修补匠', '月之子', '教父', '僵怖'],
  sects_and_violets: ['钟表匠', '筑梦师', '舞蛇人', '数学家', '卖花女孩', '城镇公告员', '神谕者', '畸形秀演员', '心上人', '洗脑师', '方古'],
  midnight_revelry: ['贵族', '气球驾驶员', '失意者', '工程师', '渔夫', '巡山人', '农夫', '管家', '酒鬼', '刺客', '小恶魔'],
};

// 角色及其行动元数据
export const ROLE_ACTIONS: Record<
  string,
  { type: "kill" | "poison" | "info" | "protect"; targetCount: number }
> = {
  // 暗流涌动
  小恶魔: { type: "kill", targetCount: 1 },
  投毒者: { type: "poison", targetCount: 1 },
  僧侣: { type: "protect", targetCount: 1 },
  占卜师: { type: "info", targetCount: 2 },
  送葬者: { type: "info", targetCount: 0 },
  洗衣妇: { type: "info", targetCount: 0 },
  图书管理员: { type: "info", targetCount: 0 },
  调查员: { type: "info", targetCount: 0 },
  厨师: { type: "info", targetCount: 0 },
  共情者: { type: "info", targetCount: 0 },
  管家: { type: "info", targetCount: 1 },
  // 暗月初升
  僵怖: { type: "kill", targetCount: 1 },
  沙巴洛斯: { type: "kill", targetCount: 2 },
  珀: { type: "kill", targetCount: 1 },
  教父: { type: "info", targetCount: 1 },
  驱魔人: { type: "info", targetCount: 1 },
  旅店老板: { type: "protect", targetCount: 2 },
  赌徒: { type: "info", targetCount: 1 },
  侍女: { type: "info", targetCount: 2 },
  水手: { type: "info", targetCount: 1 },
  祖母: { type: "info", targetCount: 0 },
  // 梦陨春宵
  方古: { type: "kill", targetCount: 1 },
  洗脑师: { type: "poison", targetCount: 1 },
  麻脸巫婆: { type: "info", targetCount: 1 },
  筑梦师: { type: "info", targetCount: 1 },
  舞蛇人: { type: "info", targetCount: 1 },
  钟表匠: { type: "info", targetCount: 0 },
  神谕者: { type: "info", targetCount: 0 },
  数学家: { type: "info", targetCount: 0 },
  // 夜半狂欢
  刺客: { type: "kill", targetCount: 1 },
  工程师: { type: "info", targetCount: 1 },
  贵族: { type: "info", targetCount: 0 },
};

// =============================================
// --- 说书人日志记录器 ---
// =============================================

export class StorytellerLogger {
  private logStream: Writable;
  private logs: string[] = [];

  constructor(logFilePath: string) {
    // 'w' flag ensures the file is overwritten on each new run
    this.logStream = fs.createWriteStream(logFilePath, { flags: "w" });
    const startTime = new Date();

    this.writeHeader(`游戏模拟日志报告`);
    this.writeHeader(`测始于: ${startTime.toLocaleString()}`);
    this.writeHeader(`====================================`);
  }

  private writeHeader(line: string) {
    this.logStream.write(`${line}\n`);
    console.log(line);
  }

  log(phase: string, message: string) {
    const time = new Date().toLocaleTimeString();
    const logLine = `[${time}] [${phase}] ${message}`;
    this.logs.push(logLine);
    this.logStream.write(`${logLine}\n`);
    console.log(logLine); // Also log to the live test console
  }

  getLogs() {
    return this.logs;
  }

  close() {
    this.logStream.end();
  }
}

// =============================================
// --- 随机化与通用辅助函数 ---
// =============================================

/**
 * 获取一个随机整数
 */
export function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 从数组中随机获取一个元素
 */
export function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 从数组中随机获取指定数量的不重复元素
 */
export function getRandomElements<T>(arr: T[], count: number): T[] {
  return [...arr].sort(() => 0.5 - Math.random()).slice(0, count);
}

/**
 * 获取当前所有存活玩家的座位索引
 */
export async function getAlivePlayerIndexes(page: Page): Promise<number[]> {
  // Use evaluate for speed and to avoid locator flakes
  return await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.seat-node'));
    return nodes
      .filter(node => !node.textContent?.includes('已死亡'))
      .map(node => {
        const id = node.getAttribute('data-seat-id');
        return id ? parseInt(id) : -1;
      })
      .filter(id => id !== -1);
  });
}


/**
 * 根据阵容推荐，为指定玩家数生成角色列表
 */
export function getRoleListForPlayerCount(playerCount: number, scriptId: string = 'trouble_brewing'): string[] {
  // 优先返回预设的 11 人局阵容
  if (playerCount === 11 && SCRIPT_11_PLAYER_PRESETS[scriptId]) {
    return SCRIPT_11_PLAYER_PRESETS[scriptId];
  }

  // 默认使用暗流涌动的配比逻辑
  const preset = TROUBLE_BREWING_PRESETS[playerCount] || TROUBLE_BREWING_PRESETS[11];

  const allRoles: Record<string, Record<string, string[]>> = {
    trouble_brewing: {
      townsfolk: ['洗衣妇', '图书管理员', '调查员', '厨师', '共情者', '占卜师', '送葬者', '僧侣', '猎手', '士兵', '镇长', '贞洁者'],
      outsider: ['管家', '酒鬼', '圣徒', '陌客'],
      minion: ['投毒者', '间谍', '红唇女郎', '男爵'],
      demon: ['小恶魔']
    },
    bad_moon_rising: {
      townsfolk: ['祖母', '水手', '侍女', '驱魔人', '旅店老板', '赌徒', '造谣者', '侍臣', '教授', '吟游诗人', '茶艺师', '和平主义者', '弄臣'],
      outsider: ['修补匠', '月之子', '莽夫', '疯子'],
      minion: ['教父', '魔鬼代言人', '刺客', '主谋'],
      demon: ['僵怖', '普卡', '沙巴洛斯', '珀']
    },
    sects_and_violets: {
      townsfolk: ['钟表匠', '筑梦师', '舞蛇人', '数学家', '卖花女孩', '城镇公告员', '神谕者', '博学者', '女裁缝', '哲学家', '艺术家', '杂耍艺人', '贤者'],
      outsider: ['畸形秀演员', '心上人', '理发师', '呆瓜'],
      minion: ['镜像双子', '女巫', '洗脑师', '麻脸巫婆'],
      demon: ['方古', '亡骨魔', '诺-达', '涡流']
    }
  };

  const currentRoles = allRoles[scriptId] || allRoles.trouble_brewing;

  // 随机挑选所需数量的角色
  const townsfolk = getRandomElements(currentRoles.townsfolk, preset.townsfolk);
  const outsiders = getRandomElements(currentRoles.outsider, preset.outsider);
  const minions = getRandomElements(currentRoles.minion, preset.minion);
  const demons = getRandomElements(currentRoles.demon, preset.demon);

  return [...townsfolk, ...outsiders, ...minions, ...demons];
}

// 辅助常量：暗流涌动标准人数配比
const TROUBLE_BREWING_PRESETS: Record<number, { townsfolk: number; outsider: number; minion: number; demon: number }> = {
  9: { townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
  10: { townsfolk: 7, outsider: 0, minion: 2, demon: 1 },
  11: { townsfolk: 7, outsider: 1, minion: 2, demon: 1 },
  12: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
  13: { townsfolk: 9, outsider: 0, minion: 3, demon: 1 },
  14: { townsfolk: 9, outsider: 1, minion: 3, demon: 1 },
  15: { townsfolk: 9, outsider: 2, minion: 3, demon: 1 },
};


/**
 * 随机分配角色
 */
export async function assignRandomRoles(page: Page, logger: StorytellerLogger, playerCount: number, scriptId: string = 'trouble_brewing') {
  const rolesToAssign = getRoleListForPlayerCount(playerCount, scriptId);
  logger.log('角色分配', `本次对局人数: ${playerCount}人, 随机阵容: ${rolesToAssign.join(', ')}`);

  const seatIndexes = Array.from({ length: playerCount }, (_, i) => i);
  const shuffledSeatIndexes = getRandomElements(seatIndexes, playerCount);

  for (let i = 0; i < rolesToAssign.length; i++) {
    const roleName = rolesToAssign[i];
    const seatIndex = shuffledSeatIndexes[i];

    await page.getByRole("button", { name: new RegExp(roleName, "i") }).click();
    await page.locator('.seat-wrapper').nth(seatIndex).click();

    logger.log('角色分配', `${roleName} 落座于 ${seatIndex + 1} 号位。`);
    await page.waitForTimeout(50);
  }
}

// =============================================
// --- 日志分析器 ---
// =============================================

export function analyzeLog(logFilePath: string, logger: StorytellerLogger) {
  logger.log("日志分析", "--- 开始对本次对局日志进行规则预检测 ---");
  const logs = fs.readFileSync(logFilePath, "utf-8").split("\n");

  let findings: string[] = [];
  let nightActions: Record<number, { night: number, actor: string, action: string }[]> = {};

  // 规则1：死亡玩家不应在夜晚行动（除非特殊能力）
  const deadPlayerActions = logs.filter(line =>
    line.includes("[夜晚行动]") && line.match(/玩家 \d+ \(已死亡\)/)
  );
  if (deadPlayerActions.length > 0) {
    findings.push(
      `[发现] 检测到已死亡玩家参与了夜晚行动:\n  - ${deadPlayerActions.join("\n  - ")}`
    );
  }

  // 规则2：恶魔在同一夜只能动一次
  logs.forEach((line, index) => {
    if (line.includes('[首夜]') || line.includes('[夜晚')) {
      const nightMatch = line.match(/\[(首夜|夜晚 \d+)/);
      const night = nightMatch ? (nightMatch[1] === '首夜' ? 1 : parseInt(nightMatch[1].replace('夜晚 ', ''))) : -1;

      const actionMatch = line.match(/(\d+号玩家)\(.*?\) (杀死了|投毒了|保护了) (\d+号玩家)/);
      if (night > 0 && actionMatch) {
        const [, actor, role, action, target] = actionMatch;
        if (!nightActions[night]) nightActions[night] = [];
        nightActions[night].push({ night, actor, action: `${action} ${target}` });
      }
    }
  });

  for (const night in nightActions) {
    const demonActions = nightActions[night].filter(a => a.actor.includes('小恶魔'));
    if (demonActions.length > 1) {
      findings.push(`[发现] 在第 ${night} 夜, 恶魔行动了 ${demonActions.length} 次，不符合规则。`);
    }
  }

  // 规则3：白天提名阶段，一个玩家只能被提名一次
  const nominations: Record<string, number> = {};
  logs.forEach(line => {
    if (line.includes('[提名阶段]')) {
      const match = line.match(/提名了 (\d+号玩家)/);
      if (match) {
        const nominee = match[1];
        nominations[nominee] = (nominations[nominee] || 0) + 1;
      }
    }
  });

  for (const nominee in nominations) {
    if (nominations[nominee] > 1) {
      findings.push(`[发现] 在白天, ${nominee} 被提名了 ${nominations[nominee]} 次，不符合规则。`);
    }
  }


  // --- 输出总结 ---
  if (findings.length > 0) {
    logger.log("分析总结", "发现潜在的规则不一致项:");
    findings.forEach(finding => logger.log("分析总结", finding));
  } else {
    logger.log("分析总结", "未在日志中发现明显的规则不一致项。");
  }
  logger.log("日志分析", "--- 预检测结束 ---");
}
