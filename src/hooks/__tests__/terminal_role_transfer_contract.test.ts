/**
 * 「角色身份转移 ⇒ 终局判据必须跟上」契约护栏（2026-10-21 · seed 94013）
 * ======================================================================
 * 🔴 真实缺陷（梦殒春宵 5 人局 seed=94013，E2E 实测）
 * ----------------------------------------------------------------------
 *   第 4 夜，方古（恶魔）杀死外来者呆瓜 ⇒ **方古跳变**：
 *     · 呆瓜（座位 4）**变成方古**（恶魔身份发生转移）；
 *     · 原方古（座位 5）**死亡**。
 *   ⇒ 场上仍有恶魔（座位 4），且存活仅 2 人 ⇒ 官方「邪恶胜」。
 *   但实测**跑满 12 个昼夜仍未终局**（`gameover=false`，相位停在「第 13 夜」）。
 *
 *   缺陷链（浏览器日志实测）：
 *     ① `checkGameOver` **已经**判出胜利（相位置 `gameOver`、胜利弹窗弹出）；
 *     ② 紧接着的「夜晚结束」把相位改回 `dawnReport`，并用「平安夜」弹窗
 *        **顶掉胜利弹窗** ⇒ **终局被抹掉**；
 *     ③ `victoryRef` 已置位 ⇒ 后续所有终局兜底判据（存活阈值等）全被
 *        `victoryRef.current` 门禁挡掉 ⇒ 永远补不回来。
 *     ④ 持久化快照只在「进行中」落盘 ⇒ 快照停在跳变**之前**（该座位仍是
 *        外来者）⇒ 任何按快照复核「官方四条」的判据都会读出
 *        「恶魔已死 ⇒ 善良胜」，与真实胜方**相反**。
 *
 * ✅ 本文件钉死三件事
 *   ① **判据层**（行为断言）：终局判据必须按座位的**当前角色**算 ——
 *      恶魔身份转移后，原恶魔的死亡**不等于**恶魔全灭。
 *   ② **推进层**（源码契约）：胜负判出后，夜晚**不得**再推进/切相位
 *      （否则终局被覆盖）。
 *   ③ **持久化层**（源码契约）：终局快照必须落盘，否则「终局那一刻才发生的
 *      角色身份变化」永远存不下来。
 *
 * ── 为什么②③用「源码扫描」而不是行为断言 ──────────────────────────────
 *   行为断言需要把 `useGameController`（巨型 hook）整体渲染起来，成本极高且
 *   脆弱；这里要防的退化形态只有一种 —— **有人把守卫/落盘删掉**。
 *   源码级配对检是本项目既有惯例（见 `kill_player_gameover_contract.test.ts`）。
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { checkGameEnd } from "../../../app/gameLogic";

const FILE = "src/hooks/useGameController.ts";
const DISPATCHER_FILE = "src/hooks/useLogicDispatcher.ts";

/** 剥块注释与行注释（纯字符串方法，无反斜杠 —— 本仓库位于中文目录，Windows 下反斜杠易坏） */
function strip(src: string): string {
  let out = src;
  for (;;) {
    const a = out.indexOf("/*");
    if (a < 0) break;
    const b = out.indexOf("*/", a + 2);
    if (b < 0) break;
    out = out.slice(0, a) + " " + out.slice(b + 2);
  }
  return out
    .split("\n")
    .map((l) => {
      const i = l.indexOf("//");
      return i >= 0 ? l.slice(0, i) : l;
    })
    .join("\n");
}

/**
 * 方古跳变**之后**的棋盘（seed=94013 第 4 夜结束时的真实局面）：
 *   座位 1 洗脑师（爪牙）存活 / 座位 2 贤者 死 / 座位 3 杂耍艺人 死
 *   座位 4 **呆瓜 → 方古**（恶魔身份转移，存活）
 *   座位 5 原方古 **死**
 */
const boardAfterJump = () => [
  { id: 0, role: { id: "cerenovus", type: "minion" }, isDead: false },
  { id: 1, role: { id: "sage", type: "townsfolk" }, isDead: true },
  { id: 2, role: { id: "juggler", type: "townsfolk" }, isDead: true },
  {
    id: 3,
    role: { id: "fang_gu", name: "方古", type: "demon" },
    isDead: false,
    isEvilConverted: true,
  },
  { id: 4, role: { id: "fang_gu", name: "方古", type: "demon" }, isDead: true },
];

describe("🏁 角色身份转移（方古跳变）⇒ 终局判据必须跟上", () => {
  it("① 恶魔身份转移后，原恶魔的死亡**不等于**恶魔全灭 ⇒ 不得判善良胜", () => {
    const res = checkGameEnd(
      boardAfterJump() as any,
      "night_death",
      null,
      {} as any
    );
    expect(res.isGameOver, "跳变后恶魔仍在场且存活仅 2 人，必须终局").toBe(true);
    expect(
      res.winner,
      "❌ 恶魔身份已转移到新座位 ⇒ 场上仍有恶魔 ⇒ 不能判「恶魔已被彻底消灭（善良胜）」"
    ).toBe("Evil");
  });

  it("② 反向对照：身份**未**转移（座位仍是外来者）⇒ 恶魔全灭 ⇒ 善良胜", () => {
    // 这一条锁住「判据读的是座位的**当前角色**」：
    //   同一盘棋，只把 4 号的角色从「方古(恶魔)」换回「呆瓜(外来者)」，
    //   胜方必须**翻转**。若两条结论相同 ⇒ 判据根本没在读恶魔身份
    //   （正是 seed 94013 快照停在跳变前 ⇒ 复核出相反胜方的形态）。
    const stale = boardAfterJump().map((s) =>
      s.id === 3
        ? { ...s, role: { id: "klutz", name: "呆瓜", type: "outsider" }, isEvilConverted: false }
        : s
    );
    const res = checkGameEnd(stale as any, "night_death", null, {} as any);
    expect(res.winner).toBe("Good");
  });

  it("③ 两个恶魔都死 ⇒ 善良胜（官方：Good wins if the Demon dies）", () => {
    const bothDead = boardAfterJump().map((s) =>
      s.id === 3 ? { ...s, isDead: true } : s
    );
    const res = checkGameEnd(bothDead as any, "night_death", null, {} as any);
    expect(res.winner).toBe("Good");
  });

  it("④ 终局相位不可被「夜晚结束」覆盖：`continueToNextAction` 必须受 `victoryRef` 门禁（源码级）", () => {
    const src = strip(readFileSync(FILE, "utf8"));
    const start = src.indexOf("const continueToNextAction = useCallback(");
    expect(
      start,
      "❌ 找不到 `const continueToNextAction = useCallback(` —— 文件结构变了，请更新本护栏"
    ).toBeGreaterThan(-1);
    const rest = src.slice(start);
    const next = rest.indexOf("\n  const ", 10);
    const body = next > 0 ? rest.slice(0, next) : rest;

    expect(
      body.includes("victoryRef.current"),
      "❌ `continueToNextAction` 不再检查 `victoryRef` ⇒ 胜负判出后夜晚仍会推进，" +
        "「夜晚结束」把相位改回 dawnReport 并用「平安夜」弹窗顶掉胜利弹窗 ⇒ " +
        "**终局被抹掉**（seed 94013 实测：跑到第 13 夜仍未终局）"
    ).toBe(true);

    // 守卫必须在推进**之前**（顺序错 ⇒ 守卫形同虚设）
    const iGuard = body.indexOf("victoryRef.current");
    const iAdvance = body.indexOf("rawContinueToNextAction(");
    expect(iAdvance, "❌ 找不到 `rawContinueToNextAction(` —— 文件结构变了").toBeGreaterThan(-1);
    expect(
      iGuard,
      "❌ `victoryRef` 守卫出现在推进**之后** ⇒ 终局照样被覆盖"
    ).toBeLessThan(iAdvance);
  });

  it("⑤ 终局快照必须落盘：保存 effect 必须覆盖 `gameOver`（源码级）", () => {
    const src = strip(readFileSync(FILE, "utf8"));
    const start = src.indexOf("const inProgressPhases = [");
    expect(
      start,
      "❌ 找不到快照保存 effect 的 `const inProgressPhases = [` —— 文件结构变了"
    ).toBeGreaterThan(-1);
    const rest = src.slice(start);
    const next = rest.indexOf("\n  const ", 10);
    const body = next > 0 ? rest.slice(0, next) : rest;

    expect(
      body.includes('"gameOver"'),
      "❌ 快照保存 effect 不覆盖 `gameOver` ⇒ 终局那一刻才发生的**角色身份变化**" +
        "（方古跳变）永远存不下来 ⇒ 快照停在跳变前 ⇒ 按快照复核官方四条会得出相反胜方"
    ).toBe(true);
    expect(
      body.includes("saveCurrentSnapshot("),
      "❌ 快照保存 effect 不再调用 `saveCurrentSnapshot(` —— 文件结构变了"
    ).toBe(true);
  });

  it("⑥ 「终局 ⇒ `victoryRef` 必置位」：镇长宣告胜利路径也必须置位（源码级）", () => {
    const src = strip(readFileSync(DISPATCHER_FILE, "utf8"));
    const start = src.indexOf("const declareMayorImmediateWin = useCallback(");
    expect(
      start,
      "❌ 找不到 `const declareMayorImmediateWin = useCallback(` —— 文件结构变了"
    ).toBeGreaterThan(-1);
    const rest = src.slice(start);
    const next = rest.indexOf("\n  const ", 10);
    const body = next > 0 ? rest.slice(0, next) : rest;

    expect(
      body.includes("victoryRef.current"),
      "❌ 镇长宣告胜利不置位 `victoryRef` ⇒ 「本局已终局」的权威标记缺失 ⇒ " +
        "推进夜序与终局兜底判据的幂等门禁失效（终局可被覆盖 / 可被重复判定）"
    ).toBe(true);
  });

  it("⑦ 负向对照（防扫描器恒绿）：替身文本必须全部判据落空", () => {
    const stubGuard =
      "const continueToNextAction = useCallback((latestSeats) => { rawContinueToNextAction(latestSeats); }, []);";
    expect(stubGuard.includes("victoryRef.current")).toBe(false);

    const stubSnapshot =
      'const inProgressPhases = ["night"]; if (inProgressPhases.includes(gamePhase)) { saveCurrentSnapshot(snapshot); }';
    expect(stubSnapshot.includes('"gameOver"')).toBe(false);

    const stubMayor =
      "const declareMayorImmediateWin = useCallback(() => { setWinResult('good'); setGamePhase('gameOver'); }, []);";
    expect(stubMayor.includes("victoryRef.current")).toBe(false);

    // 顺序判据的负向对照：**错序**样本必须被判为「不在之前」
    const badOrder =
      "rawContinueToNextAction(latestSeats); if (victoryRef.current) return;";
    expect(
      badOrder.indexOf("victoryRef.current") <
        badOrder.indexOf("rawContinueToNextAction("),
      "负向对照：错序样本应判为「不在之前」"
    ).toBe(false);
  });
});
