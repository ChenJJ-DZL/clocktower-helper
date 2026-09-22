import { beforeEach, describe, expect, it } from "vitest";
import { board, runRole } from "../_tbHarness";
import { clockmakerAbility } from "../../new_engine/clockmaker.ability";
import { mathematicianAbility } from "../../new_engine/mathematician.ability";
import { flowergirlAbility } from "../../new_engine/flowergirl.ability";
import { seamstressAbility } from "../../new_engine/seamstress.ability";
import { artistAbility } from "../../new_engine/artist.ability";
import { sageAbility } from "../../new_engine/sage.ability";
import { snakeCharmerAbility } from "../../new_engine/snake_charmer.ability";
import { balloonistAbility } from "../../new_engine/balloonist.ability";
import { choirBoyAbility } from "../../new_engine/choir_boy.ability";
import { sweetheartAbility } from "../../new_engine/sweetheart.ability";
import { klutzAbility } from "../../new_engine/klutz.ability";

import { resetLimitedAbilityUses } from "../../../utils/LimitedAbilityManager";
/**
 * L5 · 信息类角色因果链（第二批 · 梦殒春宵 / 游园惊梦 / 凶宅魅影，2026-09-21）
 * ------------------------------------------------------------------
 * 覆盖 11 个 L5 为 0 的信息类角色：
 *   clockmaker / mathematician / flowergirl / seamstress / artist / sage /
 *   snake_charmer / balloonist / choir_boy / sweetheart / klutz
 *
 * 🔒 判据设计（与 info_roles_l5.test.ts 同源）：
 *   信息类角色的「效果」是**产出信息**，所以断言分两段：
 *     ① **形态**：`meta.abilityResult` 的类型必须正确
 *        （裸 number / boolean / object 三种，见每个用例的形态断言）
 *     ② **差分**：保持角色不变，**只改变场上配置或说书人输入**，
 *        断言「结果跟着变」。环境变了结果不变 ⇒ 它没在读场上信息 ⇒ 测得出。
 *   ⚠️ 全程**不硬编码期望值为具体数字**（那会依赖我对环形距离/统计口径的理解，
 *     一旦理解错就是假红）。唯一写死的期望值都是**布局直接决定的事实**
 *     （如「选了 imp 所在座位 ⇒ 结果必须包含该座位 id」）。
 *
 * ⚠️ 裸 number 陷阱：`clockmaker` 的 `abilityResult` 是**裸 number**，
 *   `0` 是合法值 ⇒ **绝不能用 `toBeTruthy()`**（会把合法的 0 误判为「没落库」）。
 *
 * ⚠️ 前提显式传：`runRole` 默认 snapshot **只有** nightCount/gamePhase/seats/
 *   statusEffects/statusEffectMap/isVortoxWorld/reminders/log。
 *   `mathematician` 读 `snapshot.abnormalAbilityCount`、
 *   `flowergirl` 读 `snapshot.demonVotedToday`、
 *   `choir_boy` 读 `snapshot.isKingKilledByDemon` —— **必须显式传**，
 *   否则角色静默走默认值（测试绿但没测到目标分支）。
 *
 * 🔒 靶子安全：本文件只用 `chambermaid`/`gossip`/`grandmother`/`tinker` 当普通配角，
 *   绝不用 sailor/fool/tea_lady/pacifist/innkeeper/goon/moonchild（免疫/免死会污染结论）。
 */

/** 取结果 ctx 里某座位的最新状态 */
function seatAfter(res: any, id: number): any {
  return (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);
}

/** 断言结果形态为 number（含 0） */
function expectNumber(v: unknown, msg: string): number {
  expect(typeof v, msg).toBe("number");
  return v as number;
}

/**
 * ⚠️ 2026-09-21 补：限次能力的 `instanceUses` / `globalUses` 是**模块级单例**、
 *   会**跨用例累积**。用例 A 用过之后，用例 B 会被 `preCheck` 拒绝
 *   （表现为 `abilityResult === undefined`）。
 *
 *   ⚠️ 此前不暴露：P0-A 修复前 `initializeLimitedAbilityManager()` 生产零调用
 *   ⇒ `definitions` 为空 ⇒ 校验恒真且**不记账** ⇒ 用例之间无污染。
 *   修好 P0-A（模块级自初始化）后，记账才真正生效 ⇒ 必须在每个用例前重置。
 *
 *   ⚠️ 必须用**无参**调用清空全部 ——
 *   `resetLimitedAbilityUses(seatId, abilityId)` 只删 `instanceUses`、
 *   **不删 `globalUses`**，对 `global: true` 的能力（如女裁缝）重置无效。
 */
beforeEach(() => {
  resetLimitedAbilityUses();
});

describe("L5 · 信息类角色（第二批 · 差分判据）", () => {
  it("① 钟表匠(clockmaker)：结果必须是**裸 number**，且随「恶魔↔爪牙环形距离」变化", async () => {
    // A：imp(id1) 与 poisoner(id2) 相邻 ⇒ 环形距离 1
    const A = board(["clockmaker", "imp", "poisoner", "chambermaid", "tinker"]);
    // B：poisoner 挪到 id4 ⇒ 环形距离 2
    const B = board(["clockmaker", "imp", "chambermaid", "tinker", "poisoner"]);

    const ra = await runRole(clockmakerAbility, A, 0, {
      night: 1,
      phase: "firstNight",
    });
    const rb = await runRole(clockmakerAbility, B, 0, {
      night: 1,
      phase: "firstNight",
    });

    const na = expectNumber(
      ra?.meta?.abilityResult,
      `❌ 钟表匠结果不是 number（实际 ${JSON.stringify(ra?.meta?.abilityResult)}）` +
        `—— 说书人拿不到可读的距离数字`
    );
    const nb = expectNumber(
      rb?.meta?.abilityResult,
      `❌ 钟表匠结果不是 number（配置 B，实际 ${JSON.stringify(rb?.meta?.abilityResult)}）`
    );

    expect(
      na !== nb,
      `❌ 两种「恶魔↔爪牙距离不同」的配置给出相同数字（A=${na} B=${nb}）` +
        `—— 说明它没在真正计算环形距离（官方：邻座距离为 1）`
    ).toBe(true);
  });

  it("② 数学家(mathematician)：结果必须是对象且含 number 字段，且随异常次数变化", async () => {
    const layout = ["mathematician", "chambermaid", "gossip", "tinker", "grandmother"];

    const ra = await runRole(mathematicianAbility, board(layout), 0, {
      night: 2,
      phase: "night",
      snapshot: { abnormalAbilityCount: 0 },
    });
    const rb = await runRole(mathematicianAbility, board(layout), 0, {
      night: 2,
      phase: "night",
      snapshot: { abnormalAbilityCount: 3 },
    });

    const va: any = ra?.meta?.abilityResult;
    const vb: any = rb?.meta?.abilityResult;

    expect(
      va && typeof va === "object",
      `❌ 数学家结果不是对象（实际 ${JSON.stringify(va)}）`
    ).toBe(true);
    expect(
      typeof va?.abnormalCount,
      `❌ 结果里缺少 number 型的 abnormalCount（实际 ${JSON.stringify(va)}）`
    ).toBe("number");

    expect(
      va.abnormalCount !== vb.abnormalCount,
      `❌ 传入的异常次数从 0 改成 3，数学家给出的数字却没变（A=${va.abnormalCount} ` +
        `B=${vb.abnormalCount}）—— 说明它没在读 snapshot.abnormalAbilityCount`
    ).toBe(true);

    // 0 是合法值 ⇒ 只校验形态，绝不用 toBeTruthy
    expect(
      va.abnormalCount,
      `❌ 异常次数为 0 时，数学家应如实告知 0（实际 ${va.abnormalCount}）`
    ).toBe(0);
  });

  it("③ 卖花女孩(flowergirl)：hasVoted 必须是 boolean，随「恶魔今日是否投票」变化（涡流再反相）", async () => {
    const base = ["flowergirl", "chambermaid", "gossip", "tinker", "grandmother"];
    // 对照组：涡流在场 ⇒ 官方规则：信息反转
    const vortoxWorld = ["flowergirl", "chambermaid", "gossip", "tinker", "vortox"];

    const noVote = await runRole(flowergirlAbility, board(base), 0, {
      night: 2,
      phase: "night",
      snapshot: { demonVotedToday: false },
    });
    const didVote = await runRole(flowergirlAbility, board(base), 0, {
      night: 2,
      phase: "night",
      snapshot: { demonVotedToday: true },
    });
    const vortoxNoVote = await runRole(flowergirlAbility, board(vortoxWorld), 0, {
      night: 2,
      phase: "night",
      snapshot: { demonVotedToday: false },
    });

    const a = noVote?.meta?.abilityResult as any;
    const b = didVote?.meta?.abilityResult as any;
    const c = vortoxNoVote?.meta?.abilityResult as any;

    expect(typeof a?.hasVoted, `❌ hasVoted 不是 boolean（实际 ${JSON.stringify(a)}）`).toBe(
      "boolean"
    );

    expect(
      a.hasVoted !== b.hasVoted,
      `❌ 「恶魔没投票」与「恶魔投了票」给出相同结论（都是 ${a.hasVoted}）` +
        `—— 卖花女孩没在读 snapshot.demonVotedToday`
    ).toBe(true);

    expect(
      c.hasVoted !== a.hasVoted,
      `❌ 涡流在场时信息没有反转（普通局=${a.hasVoted}，涡流局=${c.hasVoted}）` +
        `—— 官方：涡流世界中镇民获得错误信息`
    ).toBe(true);
  });

  it("④ 女裁缝(seamstress)：sameAlignment 必须是 boolean，且随「两名目标阵营是否相同」变化", async () => {
    // imp 坐在 id4 ⇒ 可作「邪恶」目标；chambermaid(id1)/gossip(id2) 均为善良
    const layout = ["seamstress", "chambermaid", "gossip", "tinker", "imp"];

    // A：两名目标都是善良 ⇒ 同阵营
    const ra = await runRole(seamstressAbility, board(layout), 0, {
      night: 2,
      phase: "night",
      targets: [1, 2],
    });
    // ⚠️ 同一 it 内的第二次限次能力调用前必须手动重置（beforeEach 不在 it 内部跑）
    resetLimitedAbilityUses();
    // B：一名善良 + 一名恶魔 ⇒ 不同阵营
    const rb = await runRole(seamstressAbility, board(layout), 0, {
      night: 2,
      phase: "night",
      targets: [1, 4],
    });

    const va: any = ra?.meta?.abilityResult;
    const vb: any = rb?.meta?.abilityResult;

    expect(
      va && typeof va === "object",
      `❌ 女裁缝没产出结果（aborted=${ra?.aborted} reason=${ra?.abortReason ?? "无"}）`
    ).toBe(true);
    expect(
      typeof va?.sameAlignment,
      `❌ 结果里缺少 boolean 型的 sameAlignment（实际 ${JSON.stringify(va)}）`
    ).toBe("boolean");

    expect(
      va.sameAlignment !== vb.sameAlignment,
      `❌ 换掉其中一名目标（善良↔恶魔）后结论却没变（A=${va.sameAlignment} ` +
        `B=${vb.sameAlignment}）—— 说明它没在判定目标的真实阵营`
    ).toBe(true);

    // 锚在「布局直接决定的事实」：结果必须回指所选的这两名目标
    expect(
      va.targetId1 === 1 && va.targetId2 === 2,
      `❌ 结果里记录的目标与传入的 [1,2] 不一致（实际 ${va.targetId1},${va.targetId2}）` +
        `—— UI 会把信息挂到错误座位上`
    ).toBe(true);
  });

  it("⑤ 艺术家(artist)：能力结果是「问题+答案」对象，答案必须随说书人输入变化", async () => {
    const layout = ["artist", "chambermaid", "gossip", "tinker", "grandmother"];

    const ra = await runRole(artistAbility, board(layout), 0, {
      night: 2,
      phase: "day",
      storytellerInput: { question: "魔王是男的吗？", answer: "是" },
    });
    // ⚠️ 同上：艺术家「每局限一次」，第二次调用前必须重置
    resetLimitedAbilityUses();
    const rb = await runRole(artistAbility, board(layout), 0, {
      night: 2,
      phase: "day",
      storytellerInput: { question: "魔王是男的吗？", answer: "否" },
    });

    const va: any = ra?.meta?.abilityResult;
    const vb: any = rb?.meta?.abilityResult;

    expect(
      typeof va?.question === "string" && "answer" in (va ?? {}),
      `❌ 艺术家结果里没有「问题/答案」字段（实际 ${JSON.stringify(va)}）` +
        `—— 玩家看不到自己问了什么、得到了什么`
    ).toBe(true);

    expect(
      va.answer === "是",
      `❌ 问题原样回显失败（实际 answer=${JSON.stringify(va.answer)}）`
    ).toBe(true);
    expect(
      va.answer !== vb.answer,
      `❌ 说书人把答案从「是」改成「否」，结果却没跟着变（都=${JSON.stringify(va.answer)}）` +
        `—— 艺术家没在透传说书人的回答`
    ).toBe(true);
  });

  it("⑥ 哲人(sage)：被恶魔杀时结果须为对象并含 2 名目标，且随「恶魔坐在哪」变化", async () => {
    const A = board(["sage", "imp", "chambermaid", "gossip", "tinker"]);
    const B = board(["sage", "chambermaid", "gossip", "imp", "tinker"]);

    const ra = await runRole(sageAbility, A, 0, {
      night: 2,
      phase: "night",
      storytellerInput: { killedByDemon: true },
    });
    const rb = await runRole(sageAbility, B, 0, {
      night: 2,
      phase: "night",
      storytellerInput: { killedByDemon: true },
    });
    // 负向对照：不是被恶魔杀死 ⇒ 官方「死于处决不会获取信息」
    const rc = await runRole(sageAbility, board(A.map((s) => s.role?.id ?? "chambermaid")), 0, {
      night: 2,
      phase: "night",
      storytellerInput: { killedByDemon: false },
    });

    const va: any = ra?.meta?.abilityResult;
    const vb: any = rb?.meta?.abilityResult;
    const vc: any = rc?.meta?.abilityResult;

    expect(
      Array.isArray(va?.targetIds),
      `❌ 哲人结果里没有 targetIds 数组（实际 ${JSON.stringify(va)}）`
    ).toBe(true);

    expect(
      va.found === true,
      `❌ 被恶魔杀死时 found 应为 true（实际 found=${va.found}）`
    ).toBe(true);
    expect(
      vc.found === false && Array.isArray(vc.targetIds) && vc.targetIds.length === 0,
      `❌ 非「被恶魔杀死」时不应给出线索（实际 ${JSON.stringify(vc)}）` +
        `—— 官方：贤者死于处决时不会获取信息`
    ).toBe(true);

    // 锚在布局事实：给出的两名玩家里必须包含真正的恶魔座位
    expect(
      va.targetIds.includes(1),
      `❌ 恶魔坐在 2 号位（id=1），哲人给出的名单却没包含它（实际 ${JSON.stringify(va.targetIds)}）` +
        `—— 官方：其中一名是杀死你的那个恶魔`
    ).toBe(true);
    expect(
      vb.targetIds.includes(3) && !vb.targetIds.includes(1),
      `❌ 恶魔换到 4 号位（id=3）后，哲人的名单没有跟着换（实际 ${JSON.stringify(vb.targetIds)}）` +
        `—— 说明它没在读场上恶魔的位置`
    ).toBe(true);
  });

  it("⑦ 舞蛇人(snake_charmer)：未选中恶魔无事发生；选中恶魔必须交换角色并使其中毒", async () => {
    const layout = ["snake_charmer", "chambermaid", "gossip", "imp", "tinker"];

    const miss = await runRole(snakeCharmerAbility, board(layout), 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    const hit = await runRole(snakeCharmerAbility, board(layout), 0, {
      night: 2,
      phase: "night",
      targets: [3],
    });

    const vm: any = miss?.meta?.abilityResult;
    const vh: any = hit?.meta?.abilityResult;

    expect(
      vm?.isDemon === false && vh?.isDemon === true,
      `❌ 「选中普通玩家」与「选中恶魔」的判定相同（miss.isDemon=${vm?.isDemon} ` +
        `hit.isDemon=${vh?.isDemon}）—— 说明它没在识别恶魔`
    ).toBe(true);

    // 命中：必须真的交换角色 + 让原恶魔中毒
    const selfAfter = seatAfter(hit, 0);
    const demonAfter = seatAfter(hit, 3);
    expect(
      selfAfter?.role?.id === "imp",
      `❌ 舞蛇人选中恶魔后未交换角色（自己仍是 ${selfAfter?.role?.id}）` +
        `—— 官方：你和他交换角色和阵营`
    ).toBe(true);
    expect(
      demonAfter?.isPoisoned === true ||
        (demonAfter?.statusEffects ?? []).some((e: any) => e.type === "poisoned"),
      `❌ 原恶魔没有被标记中毒（isPoisoned=${demonAfter?.isPoisoned}）` +
        `—— 官方：然后他中毒`
    ).toBe(true);
    expect(
      demonAfter?.role?.id === "snake_charmer",
      `❌ 原恶魔未变成舞蛇人（实际 ${demonAfter?.role?.id}）`
    ).toBe(true);

    // 未命中：场上一切照旧（防止「不管选谁都交换」）
    const missSelf = seatAfter(miss, 0);
    const missTarget = seatAfter(miss, 1);
    expect(
      missSelf?.role?.id === "snake_charmer" && missTarget?.role?.id === "chambermaid",
      `❌ 未选中恶魔时不应有任何交换（self=${missSelf?.role?.id} ` +
        `target=${missTarget?.role?.id}）—— 官方：如果那名玩家不是恶魔，无事发生`
    ).toBe(true);
  });

  it("⑧ 气球驾驶员(balloonist)：结果必须指向真实座位，且随「上夜类型记录/说书人指定」变化", async () => {
    const layout = ["balloonist", "chambermaid", "gossip", "imp", "tinker"];

    // A：无选取人输入、无上夜记录 ⇒ 默认取存活池首位（id0 自己）
    const ra = await runRole(balloonistAbility, board(layout), 0, {
      night: 2,
      phase: "night",
    });
    // B：上夜得知过「镇民」⇒ 候选必须排除镇民 ⇒ 落到首个非镇民（imp, id3）
    const rb = await runRole(balloonistAbility, board(layout), 0, {
      night: 2,
      phase: "night",
      snapshot: { _abilityResults: { balloonist_1: { roleType: "townsfolk" } } },
    });
    // C：说书人显式指定 id4（修补匠/外来者）
    const rc = await runRole(balloonistAbility, board(layout), 0, {
      night: 2,
      phase: "night",
      storytellerInput: { selectedSeatId: 4 },
    });

    const va: any = ra?.meta?.abilityResult;
    const vb: any = rb?.meta?.abilityResult;
    const vc: any = rc?.meta?.abilityResult;

    expect(
      typeof va?.targetId,
      `❌ 气球驾驶员没产出 targetId（实际 ${JSON.stringify(va)}）`
    ).toBe("number");

    expect(
      va.targetId !== vb.targetId,
      `❌ 引入「上夜已得知镇民」的记录后，指向的玩家没变（A=${va.targetId} B=${vb.targetId}）` +
        `—— 官方：必须得知与上个夜晚类型不同的玩家`
    ).toBe(true);
    expect(
      vb.targetRoleType !== "townsfolk",
      `❌ 上夜得知过「镇民」后仍指向镇民（targetRoleType=${vb.targetRoleType}）`
    ).toBe(true);

    expect(
      vc.targetId === 4,
      `❌ 说书人指定 id=4，结果却指向 ${vc.targetId}`
    ).toBe(true);
    // 锚在布局事实：type 必须与该座位真实角色类型一致
    expect(
      vc.targetRoleType === "outsider",
      `❌ 4 号位是修补匠（outsider），类型却报 ${vc.targetRoleType} —— 信息与场上不符`
    ).toBe(true);
  });

  it("⑨ 唱诗男孩(choir_boy)：国王被恶魔杀死才唤醒，且指出的恶魔座随场上恶魔位置变化", async () => {
    const A = board(["choir_boy", "king", "imp", "chambermaid", "gossip"]);
    const B = board(["choir_boy", "king", "chambermaid", "gossip", "imp"]);

    const ra = await runRole(choirBoyAbility, A, 0, {
      night: 2,
      phase: "night",
      snapshot: { isKingKilledByDemon: true },
    });
    const rb = await runRole(choirBoyAbility, B, 0, {
      night: 2,
      phase: "night",
      snapshot: { isKingKilledByDemon: true },
    });
    // 负向对照：国王未被恶魔杀死 ⇒ 不唤醒
    const rc = await runRole(choirBoyAbility, board(A.map((s) => s.role?.id ?? "gossip")), 0, {
      night: 2,
      phase: "night",
      snapshot: { isKingKilledByDemon: false },
    });

    const va: any = ra?.meta?.abilityResult;
    const vb: any = rb?.meta?.abilityResult;

    expect(
      va && typeof va === "object" && typeof va.demonSeatId === "number",
      `❌ 唱诗男孩没产出 demonSeatId（aborted=${ra?.aborted} ` +
        `reason=${ra?.abortReason ?? "无"}，结果=${JSON.stringify(va)}）`
    ).toBe(true);

    expect(
      ra?.aborted === false && rc?.aborted === true,
      `❌ 「国王被恶魔杀死」与「国王没被恶魔杀死」都走了同一条路` +
        `（前者 aborted=${ra?.aborted}，后者 aborted=${rc?.aborted}）` +
        `—— 官方：恶魔未杀死国王时唱诗男孩不会得知恶魔是谁`
    ).toBe(true);

    expect(
      va.demonSeatId === 2 && vb.demonSeatId === 4,
      `❌ 指出的恶魔座与场上不符（A 期望 id2 实得 ${va.demonSeatId}；` +
        `B 期望 id4 实得 ${vb.demonSeatId}）`
    ).toBe(true);
    expect(
      va.demonRoleName,
      `❌ 结果里没有恶魔角色名（实际 ${JSON.stringify(va)}）—— 说书人无法向玩家指认`
    ).toBeTruthy();
  });

  it("⑩ 心上人(sweetheart)：死亡后必须让说书人选定的那名玩家真的醉酒", async () => {
    const layout = ["sweetheart", "chambermaid", "gossip", "tinker", "grandmother"];

    const ra = await runRole(sweetheartAbility, board(layout), 0, {
      night: 2,
      phase: "night",
      storytellerInput: { drunkTarget: 2 },
    });
    const rb = await runRole(sweetheartAbility, board(layout), 0, {
      night: 2,
      phase: "night",
      storytellerInput: { drunkTarget: 3 },
    });

    const va: any = ra?.meta?.abilityResult;
    const vb: any = rb?.meta?.abilityResult;

    expect(
      va?.causesDrunk === true,
      `❌ 心上人死亡后没有标记「使他人醉酒」（实际 ${JSON.stringify(va)}）`
    ).toBe(true);
    expect(
      va.drunkTarget !== vb.drunkTarget,
      `❌ 换一名醉酒目标后结果没变（A=${va.drunkTarget} B=${vb.drunkTarget}）`
    ).toBe(true);

    // 状态真的落库：指定座位必须 isDrunk=true 且带 sweetheart 来源的中毒标记
    const targetA = seatAfter(ra, 2);
    const targetB = seatAfter(rb, 3);
    const untouched = seatAfter(ra, 3);
    expect(
      targetA?.isDrunk === true &&
        (targetA?.statusEffects ?? []).some(
          (e: any) => e.type === "drunk" && e.source === "sweetheart"
        ),
      `❌ 被选中的 3 号玩家没有真正进入醉酒状态（isDrunk=${targetA?.isDrunk}）` +
        `—— 官方：一名玩家会在剩余的游戏时间里醉酒`
    ).toBe(true);
    expect(
      targetB?.isDrunk === true && !untouched?.isDrunk,
      `❌ 醉酒被挂到了错误座位（B 指定 id3，其 isDrunk=${targetB?.isDrunk}；` +
        `对照组 id3 在 A 局 isDrunk=${untouched?.isDrunk}）`
    ).toBe(true);
  });

  it("⑪ 笨蛋(klutz)：仅在本人已死时触发；选中邪恶玩家 ⇒ 善良阵营立即落败", async () => {
    const layout = ["klutz", "chambermaid", "imp", "gossip", "tinker"];

    const deadBoard = () => {
      const seats = board(layout);
      seats[0].isDead = true; // 官方：当你得知你死亡时，你要公开选择一名存活玩家
      return seats;
    };

    // A：选中善良玩家（chambermaid, id1）⇒ 无事发生
    const ra = await runRole(klutzAbility, deadBoard(), 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    // B：选中邪恶玩家（imp, id2）⇒ 立即落败
    const rb = await runRole(klutzAbility, deadBoard(), 0, {
      night: 2,
      phase: "night",
      targets: [2],
    });
    // 负向对照：还没死 ⇒ 不触发
    const rc = await runRole(klutzAbility, board(layout), 0, {
      night: 2,
      phase: "night",
      targets: [2],
    });

    const va: any = ra?.meta?.abilityResult;
    const vb: any = rb?.meta?.abilityResult;

    expect(
      typeof va?.evilWins,
      `❌ 笨蛋结果里缺少 boolean 型的 evilWins（实际 ${JSON.stringify(va)}）`
    ).toBe("boolean");
    expect(
      ra?.aborted === false && rc?.aborted === true,
      `❌ 「已死亡的笨蛋」与「尚未死亡的笨蛋」走了同一条路` +
        `（前者 aborted=${ra?.aborted}，后者 aborted=${rc?.aborted}）`
    ).toBe(true);

    expect(
      va.evilWins === false && vb.evilWins === true,
      `❌ 选人阵营判定错误（选善良=${va.evilWins}，选邪恶=${vb.evilWins}）` +
        `—— 官方：选中邪恶玩家则你的阵营落败`
    ).toBe(true);

    // 状态真的落库：落败必须写入终局标记
    expect(
      rb?.snapshot?.gameOver === true && rb?.snapshot?.winner === "evil",
      `❌ 选中邪恶玩家后没有把终局写进快照` +
        `（gameOver=${rb?.snapshot?.gameOver} winner=${rb?.snapshot?.winner}）`
    ).toBe(true);
    expect(
      ra?.snapshot?.gameOver !== true &&
        ra?.snapshot?.klutzTriggered === true,
      `❌ 选中善良玩家不应结束游戏，但必须标记「笨蛋已触发」` +
        `（gameOver=${ra?.snapshot?.gameOver} klutzTriggered=${ra?.snapshot?.klutzTriggered}）`
    ).toBe(true);
  });
});
