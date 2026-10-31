/**
 * 用户实测回归夹具 · 2026-11-01 P0「处决 15号-小精灵 却判善良双子被处决」
 * ======================================================================
 * 用户实测局面（15 人局）：
 *   · 1号(index 0) 图书管理员 —— **真正的善良双子**
 *   · 某座位 evils_twin —— 镜像双子（邪恶）
 *   · 11号(index 10) 小恶魔 —— 存活
 *   · 15号(index 14) 小精灵 —— 第 4 天被处决
 *   引擎旧实现把「被处决的任意镇民/外来者」当成善良双子（启发式兜底），
 *   直接判「善良双子被处决 ⇒ 邪恶胜」。官方判据只认**权威配对证据**。
 *
 * 本文件全部断言都真实经由 `app/gameLogic.ts::checkGameEnd` 与
 * `src/utils/evilTwinHelper.ts` 的两个 resolver，不含自造解释性断言。
 */
import { describe, expect, it } from "vitest";
import { roles } from "../../app/data";
import { checkGameEnd } from "../../app/gameLogic";
import { resolveEvilTwinPairForDisplay } from "../../src/utils/evilTwinHelper";
import {
  findMissingWinEvidence,
  type WinEvidence,
} from "../../src/utils/winConditions/winReasonCodes";

const r = (id: string) => roles.find((x) => x.id === id)!;

/** 造座位；`over` 可覆盖任意字段（含 isGoodTwin 等扩展标记） */
function seat(id: number, roleId: string, over: Record<string, unknown> = {}) {
  return {
    id,
    playerName: `玩家${id + 1}`,
    role: r(roleId),
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    ...over,
  } as any;
}

/** 手工角色（如地精不在 app/data 注册表内时使用） */
function roleSeat(
  id: number,
  role: { id: string; name: string; type: string },
  over: Record<string, unknown> = {}
) {
  return seat(id, "", { role, ...over });
}

const dead = (s: any) => ({ ...s, isDead: true });

/**
 * 用户实测的 15 人棋盘（index 0..14，共 15 座）：
 *   1号 index 0  图书管理员（善良双子候选人）
 *   2号 index 1  镜像双子
 *   11号 index 10 小恶魔（存活）
 *   15号 index 14 小精灵（被处决）
 * 其余为普通镇民/外来者，全部存活。
 */
function board15(): any[] {
  return [
    seat(0, "librarian"), // 1号 真·善良双子
    seat(1, "evil_twin"), // 2号 镜像双子（邪恶）
    seat(2, "washerwoman"),
    seat(3, "chef"),
    seat(4, "fortune_teller"),
    seat(5, "monk"),
    seat(6, "soldier"),
    seat(7, "farmer"),
    seat(8, "savant"),
    seat(9, "butler"),
    seat(10, "imp"), // 11号 小恶魔（存活）
    seat(11, "drunk"),
    seat(12, "recluse"),
    seat(13, "saint"),
    seat(14, "pixie"), // 15号 小精灵（被处决）
  ];
}

describe("🔴 P0 · 处决 15号-小精灵不得判「善良双子被处决」", () => {
  it("① 明确配对（goodId=0/evilId=1）+ 处决 index 14 → 游戏必须继续", () => {
    const seats = board15().map((s) => (s.id === 14 ? dead(s) : s));
    const res = checkGameEnd(seats, "execution", 14, {
      evilTwinPair: { evilId: 1, goodId: 0 },
    });

    expect(res.isGameOver, `引擎误判：${res.winner} / ${res.reason}`).toBe(
      false
    );
    expect(res.winner).toBeNull();
    expect(res.reasonCode).toBeUndefined();
  });

  it("② 无 evilTwinPair、无 isGoodTwin 标记 + 处决 index 14 → 绝不得 GOOD_TWIN_EXECUTED", () => {
    const seats = board15().map((s) => (s.id === 14 ? dead(s) : s));

    // 展示版 resolve（启发式）在这块盘上确实会猜 index 0 —— 证明确实存在
    // 「展示占位」与「判胜」共用同一棋盘的高风险场景；判胜仍必须失败关闭。
    const display = resolveEvilTwinPairForDisplay(seats);
    expect(display.source).toBe("heuristic");
    expect(display.resolved).toBe(false);
    expect(display.goodTwinSeat?.id).toBe(0);
    expect(display.isGoodTwin(14)).toBe(false);

    const res = checkGameEnd(seats, "execution", 14, {});
    expect(res.reasonCode, "无证据时绝不允许用启发式配对判胜").not.toBe(
      "GOOD_TWIN_EXECUTED"
    );
    expect(res.isGameOver, `${res.winner} / ${res.reason}`).toBe(false);
  });

  it("③ 无配对证据 + 处决 index 0（1号图书管理员）→ 同样绝不得 GOOD_TWIN_EXECUTED", () => {
    // 即使被处决者恰好是「启发式会猜的那名镇民」，没有证据也不能判胜。
    const seats = board15().map((s) => (s.id === 0 ? dead(s) : s));
    const res = checkGameEnd(seats, "execution", 0, {});

    expect(res.reasonCode).not.toBe("GOOD_TWIN_EXECUTED");
    expect(res.isGameOver, `${res.winner} / ${res.reason}`).toBe(false);
  });

  it("④ 对照组：处决真正善良双子（明确配对）且邪恶双子存活 → GOOD_TWIN_EXECUTED + Evil", () => {
    const seats = board15().map((s) => (s.id === 0 ? dead(s) : s));
    const res = checkGameEnd(seats, "execution", 0, {
      evilTwinPair: { evilId: 1, goodId: 0 },
    });

    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Evil");
    expect(res.reasonCode).toBe("GOOD_TWIN_EXECUTED");
    expect(res.reason).toContain("善良双子被处决");

    // 证据必须可复核：注册表声明的必填证据齐全 + 座位/来源对得上。
    const ev = res.evidence as WinEvidence;
    expect(findMissingWinEvidence("GOOD_TWIN_EXECUTED", ev)).toEqual([]);
    expect(ev.executedSeatId).toBe(0);
    expect(ev.goodTwinSeatId).toBe(0);
    expect(ev.evilTwinSeatId).toBe(1);
    expect(ev.twinPairSource).toBe("explicit");
  });
});

describe("🔴 P0 附 · 失败关闭（fail-closed）与 droison 口径", () => {
  it("恶魔已死 + 双子配对缺失（unresolved）→ 不得判 Good=DEMON_ALL_DEAD（游戏继续）", () => {
    const seats = board15().map(
      (s) => (s.id === 10 ? dead(s) : s) // 11号小恶魔已死，镜像双子仍存活
    );
    const res = checkGameEnd(seats, "check_phase", null, {});

    expect(
      res.reasonCode,
      "无法证明善良双子已死 ⇒ 善良无法获胜（失败关闭）"
    ).not.toBe("DEMON_ALL_DEAD");
    expect(res.isGameOver, `${res.winner} / ${res.reason}`).toBe(false);
    expect(res.winner).toBeNull();
  });

  it("恶魔已死 + 配对指向仍存活的善良双子 → 同样不得判善良胜", () => {
    const seats = board15().map((s) => (s.id === 10 ? dead(s) : s));
    const res = checkGameEnd(seats, "check_phase", null, {
      evilTwinPair: { evilId: 1, goodId: 0 },
    });
    expect(res.reasonCode).not.toBe("DEMON_ALL_DEAD");
    expect(res.isGameOver).toBe(false);
  });

  it("善良双子是酒鬼（isDrunk=true）被处决 → 仍必须判 Evil（被处决者 droison 不影响该判据）", () => {
    // 1号图书管理员：酒鬼化（永久醉酒）+ 已被处决
    const executed = board15().map((s) =>
      s.id === 0 ? dead({ ...s, isDrunk: true }) : s
    );
    const res = checkGameEnd(executed, "execution", 0, {
      evilTwinPair: { evilId: 1, goodId: 0 },
    });

    expect(res.isGameOver).toBe(true);
    expect(res.winner).toBe("Evil");
    expect(res.reasonCode).toBe("GOOD_TWIN_EXECUTED");
  });

  it.each([
    ["isPoisoned", { isPoisoned: true }],
    ["isDrunk", { isDrunk: true }],
  ])("镜像双子本人 %s → 其能力失效 ⇒ 处决善良双子也不得 GOOD_TWIN_EXECUTED", (_label, flag) => {
    const seats = board15().map((s) => {
      if (s.id === 1) return { ...s, ...flag }; // 镜像双子被毒/醉
      if (s.id === 0) return dead(s); // 善良双子被处决
      return s;
    });
    const res = checkGameEnd(seats, "execution", 0, {
      evilTwinPair: { evilId: 1, goodId: 0 },
    });
    expect(res.reasonCode).not.toBe("GOOD_TWIN_EXECUTED");
    expect(res.isGameOver, `${res.winner} / ${res.reason}`).toBe(false);
  });

  it("无证据但座位上有 isGoodTwin 显式标记 → 属权威证据，可判胜（seatFlag 来源）", () => {
    // 防过度收紧：seatFlag 与 explicit 同为合法证据来源（说书人右键指定）。
    const seats = board15().map((s) => {
      if (s.id === 0) return dead({ ...s, isGoodTwin: true });
      if (s.id === 2) return { ...s, isGoodTwin: false };
      return s;
    });
    const res = checkGameEnd(seats, "execution", 0, {});
    expect(res.reasonCode).toBe("GOOD_TWIN_EXECUTED");
    expect(res.evidence?.twinPairSource).toBe("seatFlag");
    expect(res.evidence?.goodTwinSeatId).toBe(0);
  });
});
