import { describe, expect, it } from "vitest";
import { getInitialState } from "../../contexts/GameContext";
import { createSnapshotFromState } from "../persistence";

/**
 * 📋 快照必须携带操作记录（gameLogs）—— 2026-09-24 用户实测回归防线
 * ============================================================================
 * 现场：对局进行中浏览器刷新（dev 重启 / 意外关闭）→ 从 localStorage 自动存档
 * 恢复对局 ⇒ 座位、阶段、胜负全都在，**复盘"操作记录"却只剩恢复之后新产生的
 * 几条**（用户截图：只有「第1天黄昏：2号被处决」+ 终局，开局落座/首夜/白天全丢）。
 *
 * 根因：`createSnapshotFromState` 不含 `gameLogs` ⇒ `handleContinueGame` 恢复时
 * 拿不到历史日志。本文件钉死三环：
 *   ① 快照生成含 gameLogs（原样保真）；
 *   ② 旧状态形态（无 gameLogs 字段）不崩、退化为空数组；
 *   ③ 继续对局恢复路径必须写回 gameLogs（源码级）。
 * 落座起点的日志本身由 `useGameFlow::proceedToCheckPhase` 的「🎬 开局落座」写入。
 */

describe("快照携带操作记录（gameLogs）", () => {
  it("① createSnapshotFromState 必须包含 gameLogs 且原样保真", () => {
    const logs = [
      {
        day: 0,
        phase: "setup",
        message: "🎬 开局落座完成：7 人局，剧本【暗流涌动】",
        seq: 1,
        ts: 1000,
      },
      { day: 1, phase: "firstNight", message: "🌙 进入首夜", seq: 2, ts: 2000 },
      {
        day: 1,
        phase: "dusk",
        message: "⚖️ 【2号-罂粟种植者】被处决死亡",
        seq: 3,
        ts: 3000,
      },
    ];
    const snap = createSnapshotFromState({
      ...getInitialState(),
      gameLogs: logs,
    } as any);
    expect((snap as any).gameLogs).toEqual(logs);
  });

  it("② 旧状态形态（无 gameLogs 字段）不得崩，退化为空数组", () => {
    const snap = createSnapshotFromState({ ...getInitialState() } as any);
    expect(Array.isArray((snap as any).gameLogs)).toBe(true);
    expect((snap as any).gameLogs).toEqual([]);
  });

  it("③⭐ 源码级护栏：继续对局的恢复必须写回 gameLogs", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../hooks/useGameController.ts"),
      "utf-8"
    ) as string;
    // 定位 handleContinueGame 的 updates 收尾段（最后一个字段的写入处）
    const anchor = src.indexOf(
      "lastExecutedPlayerId: snap.lastExecutedPlayerId ?? null,"
    );
    expect(
      anchor,
      "❌ 未找到 handleContinueGame 的 updates 段（锚点变了）"
    ).toBeGreaterThan(-1);
    const win = src.slice(anchor, anchor + 400);
    expect(
      win.includes("gameLogs"),
      "❌ handleContinueGame 恢复时没有写回 gameLogs —— " +
        "继续对局后复盘将没有任何操作记录（2026-09-24 用户实测缺陷）"
    ).toBe(true);
  });

  it("④⭐ 源码级护栏：开局咽喉必须写入「落座完成」日志（复盘从落座开始）", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../hooks/useGameFlow.ts"),
      "utf-8"
    ) as string;
    const at = src.indexOf("const proceedToCheckPhase = useCallback(");
    expect(at, "❌ 未找到 proceedToCheckPhase").toBeGreaterThan(-1);
    // 取函数体窗口（到下一个 useCallback 之前）
    const end = src.indexOf("useCallback", at + 100);
    const body = src.slice(at, end > 0 ? end : at + 20000);
    expect(
      body.includes("开局落座完成"),
      "❌ 开局流程没有写「开局落座完成」日志 —— 复盘无法从落座开始还原"
    ).toBe(true);
    expect(
      body.includes("【落座】"),
      "❌ 开局流程没有逐座写落座记录 —— 复盘缺少每个座位的角色分发详情"
    ).toBe(true);
  });
});
