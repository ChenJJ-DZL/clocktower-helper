import { describe, expect, it } from "vitest";

describe("SpyGrimoireModal 日志过滤规则测试", () => {
  const validInGamePhases = new Set([
    "firstNight",
    "day",
    "dusk",
    "night",
    "dawnReport",
    "gameOver",
  ]);

  function filterSpyLogs(
    logs: Array<{ message: string; phase?: string; day?: number }>
  ) {
    return logs.filter((log) => {
      if (!log || typeof log.message !== "string") return false;
      const msg = log.message;

      // 1. 过滤系统调试与热重载信息
      if (
        msg.startsWith("[系统]") ||
        msg.startsWith("[能力执行]") ||
        msg.startsWith("[handleDrunkCharadeSelect]") ||
        msg.startsWith("[Fast Refresh]")
      ) {
        return false;
      }

      // 2. 过滤非游戏内阶段（setup, check, scriptSelection 等入夜前阶段）
      if (!log.phase || !validInGamePhases.has(log.phase)) {
        return false;
      }

      // 3. 过滤游戏开始前的准备信息与换座位记录（只记录游戏进入首夜后的情况）
      if (
        msg.includes("互换了座位") ||
        msg.includes("交换了座位") ||
        msg.includes("换了座位") ||
        msg.includes("配置角色") ||
        msg.includes("发牌") ||
        msg.includes("准备阶段")
      ) {
        return false;
      }

      return true;
    });
  }

  it("入夜前的换座位信息与准备信息必须被过滤，不展示在间谍魔典中", () => {
    const rawLogs = [
      {
        message: "🔀 3号 (送葬者) 与 9号 (守鸦人) 互换了座位",
        phase: "check",
        day: 0,
      },
      {
        message: "发牌完成：共分配15名玩家",
        phase: "setup",
        day: 0,
      },
      {
        message: "[系统] 初始化新游戏",
        phase: "setup",
        day: 0,
      },
      {
        message: "【首夜】1号(洗衣妇)得知 3号 和 5号 中有一名【厨师】",
        phase: "firstNight",
        day: 0,
      },
      {
        message: "【首夜】6号(厨师)得知邪恶邻座对数为 0",
        phase: "firstNight",
        day: 0,
      },
      {
        message: "【第1天】2号 提名 8号 开启处决投票",
        phase: "day",
        day: 1,
      },
      {
        message: "【第2夜】15号(小恶魔)击杀了 1号",
        phase: "night",
        day: 1,
      },
    ];

    const result = filterSpyLogs(rawLogs);

    expect(result).toHaveLength(4);
    expect(result.map((r) => r.message)).toEqual([
      "【首夜】1号(洗衣妇)得知 3号 和 5号 中有一名【厨师】",
      "【首夜】6号(厨师)得知邪恶邻座对数为 0",
      "【第1天】2号 提名 8号 开启处决投票",
      "【第2夜】15号(小恶魔)击杀了 1号",
    ]);

    // 确保绝对不包含换座位信息
    const hasSeatSwap = result.some((r) => r.message.includes("互换了座位"));
    expect(hasSeatSwap).toBe(false);
  });

  it("智能角色拓扑关联：即便日志中仅有角色名（如厨师/共情者），也能精准关联到对应座位号", () => {
    const mockSeats = [
      { id: 0, role: { id: "washerwoman", name: "洗衣妇" } },
      { id: 5, role: { id: "chef", name: "厨师" } },
      { id: 13, role: { id: "empath", name: "共情者" } },
    ];

    const logText = "厨师获得信息：场上有 0 对相邻的邪恶玩家（共 15 个座位）";
    const involvedSeats = new Set<number>();

    // 1. 显式座位提取
    const seatMatches = logText.matchAll(/(\d+)\s*号/g);
    for (const m of seatMatches) {
      const seatNum = parseInt(m[1], 10);
      if (
        !Number.isNaN(seatNum) &&
        seatNum >= 1 &&
        seatNum <= mockSeats.length
      ) {
        involvedSeats.add(seatNum - 1);
      }
    }

    // 2. 角色拓扑关联
    mockSeats.forEach((s) => {
      const rName = s.role?.name;
      if (rName && logText.includes(rName)) {
        involvedSeats.add(s.id);
      }
    });

    // 验证：6号厨师（id: 5）必须被成功关联
    expect(involvedSeats.has(5)).toBe(true);
    expect(involvedSeats.has(0)).toBe(false);
    expect(involvedSeats.has(13)).toBe(false);
  });
});
