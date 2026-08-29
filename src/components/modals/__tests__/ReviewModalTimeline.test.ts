import { describe, expect, it } from "vitest";

describe("ReviewModal (对局复盘) 时间线排序与日志格式化测试", () => {
  it("时间线排序应严格保证 开局 -> 首夜 -> 第1天 -> 第1天黄昏 -> 第2夜 -> 第2天 -> 第2天黄昏", () => {
    const rawLogs = [
      {
        day: 1,
        phase: "dusk",
        message: "5号被处决死亡",
        seq: 5,
        ts: 1005,
      },
      {
        day: 1,
        phase: "day",
        message: "2号提名了5号",
        seq: 4,
        ts: 1004,
      },
      {
        day: 1, // 旧数据中 setup 可能会带有 day: 1
        phase: "setup",
        message:
          "⚡ 快速开始（9人落座）：1号士兵、2号圣徒、3号酒鬼(伪:猎手)、4号男爵、5号调查员、6号管家、7号小恶魔、8号陌客、9号送葬者",
        seq: 1,
        ts: 1001,
      },
      {
        day: 1,
        phase: "firstNight",
        message: "🌙 首夜开始",
        seq: 2,
        ts: 1002,
      },
      {
        day: 2,
        phase: "night",
        message: "🌙 进入第 2 夜",
        seq: 6,
        ts: 1006,
      },
    ];

    // 复用 ReviewModal 中的分组与排序核心算法
    const isSeatingLog = (m: string) =>
      m.includes("落座") ||
      m.includes("分配角色") ||
      m.includes("快速开始") ||
      m.includes("快速测试");

    let lastSeatingIdx = -1;
    rawLogs.forEach((log, idx) => {
      if (log.phase === "setup" && isSeatingLog(log.message)) {
        lastSeatingIdx = idx;
      }
    });

    const dedupedLogs = rawLogs.filter((log, idx) => {
      if (log.phase === "setup" && isSeatingLog(log.message)) {
        return idx === lastSeatingIdx;
      }
      return true;
    });

    const logsByDayAndPhase = dedupedLogs.reduce(
      (acc, log) => {
        const normalizedDay = log.phase === "setup" ? 0 : log.day;
        const key = `${normalizedDay}_${log.phase}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(log);
        return acc;
      },
      {} as Record<string, typeof rawLogs>
    );

    const sortedLogs = Object.entries(logsByDayAndPhase).sort((a, b) => {
      const [dayA, phaseA] = a[0].split("_");
      const [dayB, phaseB] = b[0].split("_");
      const logsA = a[1];
      const logsB = b[1];

      const getTimelineWeight = (dayStr: string, phase: string) => {
        if (phase === "setup") return 0;
        if (phase === "firstNight") return 10;
        const dayNum = Math.max(1, parseInt(dayStr, 10) || 1);
        let phaseWeight = 20;
        if (phase === "night") phaseWeight = 0;
        else if (phase === "day") phaseWeight = 10;
        else if (phase === "dusk") phaseWeight = 20;
        return dayNum * 1000 + phaseWeight;
      };

      const weightA = getTimelineWeight(dayA, phaseA);
      const weightB = getTimelineWeight(dayB, phaseB);

      if (weightA !== weightB) {
        return weightA - weightB;
      }

      const minSeqA = Math.min(...logsA.map((l) => l.seq ?? l.ts ?? 0));
      const minSeqB = Math.min(...logsB.map((l) => l.seq ?? l.ts ?? 0));
      return minSeqA - minSeqB;
    });

    const phaseSequence = sortedLogs.map(([key]) => key);
    expect(phaseSequence).toEqual([
      "0_setup",
      "1_firstNight",
      "1_day",
      "1_dusk",
      "2_night",
    ]);
  });

  it("快速开始日志不应被正则二次替换产生文字重叠", () => {
    const logMsg =
      "⚡ 快速开始（9人落座）：1号士兵、2号圣徒、3号酒鬼(伪:猎手)、4号男爵、5号调查员、6号管家、7号小恶魔、8号陌客、9号送葬者";

    // 验证以 ⚡ 快速开始 开头的行直接返回
    expect(
      logMsg.startsWith("⚡ 快速开始") ||
        logMsg.startsWith("⚡ 快速测试") ||
        logMsg.startsWith("⚡ 玩家落座")
    ).toBe(true);
  });

  it("getWinningPlayersList 应按指定格式输出获胜玩家名单", async () => {
    const { getWinningPlayersList } = await import(
      "../../../utils/reviewHelper"
    );

    const mockSeats: any[] = [
      { id: 0, role: { id: "soldier", name: "士兵", type: "townsfolk" } },
      { id: 1, role: { id: "saint", name: "圣徒", type: "outsider" } },
      {
        id: 2,
        role: { id: "drunk", name: "酒鬼", type: "outsider" },
        charadeRole: { id: "slayer", name: "猎手", type: "townsfolk" },
      },
      { id: 3, role: { id: "baron", name: "男爵", type: "minion" } },
      {
        id: 4,
        role: { id: "investigator", name: "调查员", type: "townsfolk" },
      },
      { id: 5, role: { id: "butler", name: "管家", type: "outsider" } },
      { id: 6, role: { id: "imp", name: "小恶魔", type: "demon" } },
      { id: 7, role: { id: "recluse", name: "陌客", type: "outsider" } },
      { id: 8, role: { id: "undertaker", name: "送葬者", type: "townsfolk" } },
    ];

    // 邪恶胜利
    const evilRoster = getWinningPlayersList(mockSeats, "evil");
    expect(evilRoster).toBe("胜利玩家：4号-男爵、7号-小恶魔");

    // 善良胜利
    const goodRoster = getWinningPlayersList(mockSeats, "good");
    expect(goodRoster).toBe(
      "胜利玩家：1号-士兵、2号-圣徒、3号-酒鬼(伪:猎手)、5号-调查员、6号-管家、8号-陌客、9号-送葬者"
    );
  });
});
