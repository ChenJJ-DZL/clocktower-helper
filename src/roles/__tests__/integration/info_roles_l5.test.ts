import { describe, expect, it } from "vitest";
import { board, runRole } from "../_tbHarness";
import { empathAbility } from "../../new_engine/empath.ability";
import { fortuneTellerAbility } from "../../new_engine/fortune_teller.ability";
import { oracleAbility } from "../../new_engine/oracle.ability";
import { undertakerAbility } from "../../new_engine/undertaker.ability";

/**
 * L5 · 信息类角色因果链（2026-09-21）
 * ------------------------------------------------------------------
 * 补的是覆盖审计里 **L5 为 0** 的信息类角色（暗流涌动 8 个缺口中的核心 4 个）。
 *
 * 🔒 判据设计（为什么用「差分」而不是硬编码期望值）：
 *   信息类角色的「效果」是**产出信息**而非改状态，所以断言的锚点必须是
 *   **信息本身的事实正确性**。但硬编码「期望 1 个邪恶邻居」会依赖我对
 *   「邻座是否环形」这类边缘规则的理解 —— 一旦理解错，测试就假红。
 *   ⇒ 改用**差分**：保持角色不变、只**改变场上配置**，
 *     断言「结果**确实随配置改变**」+「类型正确」。
 *     环境变了结果不变 ⇒ 说明它根本没读场上信息（恒返回默认值）⇒ 测得出。
 *
 * ⚠️ 陷阱提醒（本项目已有记录）：`empath.abilityResult` 是**裸 number**，
 *   `0` 是合法值 ⇒ **绝不能用 `toBeTruthy()`**（会把合法的 0 误判为「没落库」）。
 */

function toNum(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

describe("L5 · 信息类角色（差分判据）", () => {
  it("① 共情者(empath)：结果必须是 number，且随「邻座邪恶数」变化而变化", async () => {
    // A：empath 的两侧邻居均为善良（imp 放在隔一位）
    const A = board(["empath", "chambermaid", "imp", "gossip", "tinker"]);
    // B：empath 的紧邻出现爪牙（把 imp 挪到邻座）
    const B = board(["empath", "imp", "chambermaid", "gossip", "tinker"]);

    const ra = await runRole(empathAbility, A, 0, { night: 2, phase: "night" });
    const rb = await runRole(empathAbility, B, 0, { night: 2, phase: "night" });

    const na = toNum(ra?.meta?.abilityResult);
    const nb = toNum(rb?.meta?.abilityResult);

    expect(
      na,
      `❌ 共情者结果不是 number（实际 ${JSON.stringify(ra?.meta?.abilityResult)}）—— ` +
        `说书人在 UI 上看不到有效信息`
    ).not.toBeNull();
    expect(
      nb,
      `❌ 共情者结果不是 number（配置 B，实际 ${JSON.stringify(rb?.meta?.abilityResult)}）`
    ).not.toBeNull();

    expect(
      na !== nb,
      `❌ 两种**邻座邪恶数不同**的配置下，共情者给出完全相同的数字（A=${na} B=${nb}）` +
        `—— 说明它没有真正读取邻座的阵营 ⇒ 信息是假的`
    ).toBe(true);
  });

  it("② 占卜师(fortune_teller)：结果必须是 boolean，且随「目标是否含恶魔」变化", async () => {
    // A：所选两名目标里**没有**恶魔
    const A = board(["fortune_teller", "chambermaid", "gossip", "imp", "tinker"]);
    // B：所选两名目标里**有**恶魔（id=3）
    const B = board(["fortune_teller", "chambermaid", "gossip", "imp", "tinker"]);

    const ra = await runRole(fortuneTellerAbility, A, 0, {
      night: 2,
      phase: "night",
      targets: [1, 2],
    });
    const rb = await runRole(fortuneTellerAbility, B, 0, {
      night: 2,
      phase: "night",
      targets: [1, 3],
    });

    const va = ra?.meta?.abilityResult;
    const vb = rb?.meta?.abilityResult;

    expect(
      typeof va,
      `❌ 占卜师结果不是 boolean（实际 ${JSON.stringify(va)}）`
    ).toBe("boolean");
    expect(
      typeof vb,
      `❌ 占卜师结果不是 boolean（实际 ${JSON.stringify(vb)}）`
    ).toBe("boolean");

    expect(
      va !== vb,
      `❌ 「目标无恶魔」与「目标含恶魔」两种情况给出相同结果（都是 ${va}）` +
        `—— 占卜师没在读目标阵营（或干扰项逻辑把结果恒定了）`
    ).toBe(true);
  });

  it("③ 神谕者(oracle)：得知「死亡玩家中属于邪恶阵营的人数」，必须随该数量变化", async () => {
    /**
     * ⚠️ 语义澄清（写测试时走了一遍弯路，先记录）：
     *   `officialRoleDocs.json` · **神谕者** 原文：
     *     「每个夜晚*，你会得知**有多少名死亡的玩家是邪恶的**。」
     *   ⇒ 统计口径是「**死亡的邪恶玩家数**」（`deadEvilCount`），**不是死亡总数**。
     *   ⚠️ 首版让一个**善良**角色（gossip）死亡，断言「结果应当变化」⇒ **假红**；
     *     实现（`oracle.ability.ts:87` → `countDeadEvilPlayers`）完全正确。
     *   ⇒ 本用例改为让**邪恶**角色（imp）死亡，这才是该角色真正响应的变量。
     */
    const A = board(["oracle", "chambermaid", "imp", "tinker", "grandmother"]);
    const B = board(["oracle", "chambermaid", "imp", "tinker", "grandmother"]);
    // B：让**邪恶**角色（imp，id=2）死亡 ⇒ deadEvilCount 应从 0 变为 1
    (B[2] as any).isDead = true;

    const ra = await runRole(oracleAbility, A, 0, {
      night: 2,
      phase: "night",
      targets: [1, 2, 3],
    });
    const rb = await runRole(oracleAbility, B, 0, {
      night: 2,
      phase: "night",
      targets: [1, 2, 3],
    });

    const va: any = ra?.meta?.abilityResult;
    const vb: any = rb?.meta?.abilityResult;

    expect(
      va !== undefined && va !== null,
      `❌ 神谕者选完目标却没有产出任何结果（aborted=${ra?.aborted} ` +
        `reason=${ra?.abortReason ?? "无"}）`
    ).toBe(true);

    // 结果形态：{ deadEvilCount, finalCount }（finalCount 受干扰项影响）
    expect(
      typeof va?.deadEvilCount,
      `❌ 结果里缺少 deadEvilCount（实际 ${JSON.stringify(va)}）`
    ).toBe("number");

    expect(
      va.deadEvilCount !== vb.deadEvilCount,
      `❌ 让一名**邪恶**玩家死亡后，deadEvilCount 没有变化（A=${va.deadEvilCount} ` +
        `B=${vb.deadEvilCount}）—— 说明它没有真正统计「死亡的邪恶玩家」` +
        `（官方：神谕者得知有多少名死亡的玩家是邪恶的）`
    ).toBe(true);

    expect(
      vb.deadEvilCount,
      `❌ 一名邪恶玩家已死亡时，deadEvilCount 应为 1（实际 ${vb.deadEvilCount}）`
    ).toBe(1);
  });

  it("④ 送葬者(undertaker)：结果必须带上「今日被处决者」的真实身份信息", async () => {
    const seats = board(["undertaker", "chambermaid", "gossip", "tinker", "grandmother"]);
    // 官方：送葬者得知今日被处决玩家的角色 ⇒ 必须先有「处决记录」
    const res = await runRole(undertakerAbility, seats, 0, {
      night: 2,
      phase: "night",
      snapshot: {
        executedToday: 2,
        todayExecutedId: 2,
        lastExecutedPlayerId: 2,
      },
    });

    const r: any = res?.meta?.abilityResult;

    expect(
      r,
      `❌ 送葬者在「今日有人被处决」的前提下没有产出结果 ` +
        `（aborted=${res?.aborted} reason=${res?.abortReason ?? "无"}）`
    ).toBeTruthy();

    // 结果必须能表达「被处决者的角色」——至少要有 roleName 或等价字段
    const hasIdentity =
      typeof r === "object" &&
      (typeof r.roleName === "string" ||
        typeof r.role === "string" ||
        typeof r.executedRoleName === "string");

    expect(
      hasIdentity,
      `❌ 送葬者结果里没有「被处决者角色名」（实际字段：${JSON.stringify(r)}）` +
        `—— 玩家拿不到信息`
    ).toBe(true);
  });
});
