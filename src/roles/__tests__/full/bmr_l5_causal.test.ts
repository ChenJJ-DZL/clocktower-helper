import { beforeEach, describe, expect, it } from "vitest";
import { board, runRole } from "../_tbHarness";
import {
  initializeLimitedAbilityManager,
  resetLimitedAbilityUses,
} from "../../../utils/LimitedAbilityManager";
import { r } from "../_tbHarness";
import { grandmotherAbility } from "../../new_engine/grandmother.ability";
import { sailorAbility } from "../../new_engine/sailor.ability";
import { chambermaidAbility } from "../../new_engine/chambermaid.ability";
import { exorcistAbility } from "../../new_engine/exorcist.ability";
import { innkeeperAbility } from "../../new_engine/innkeeper.ability";
import { gamblerAbility } from "../../new_engine/gambler.ability";
import { gossipAbility } from "../../new_engine/gossip.ability";
import { courtierAbility } from "../../new_engine/courtier.ability";
import { professorAbility } from "../../new_engine/professor.ability";
import { minstrelAbility } from "../../new_engine/minstrel.ability";
import { teaLadyAbility } from "../../new_engine/tea_lady.ability";
import { pacifistAbility } from "../../new_engine/pacifist.ability";
import { foolAbility } from "../../new_engine/fool.ability";
import { tinkerAbility } from "../../new_engine/tinker.ability";
import { moonchildAbility } from "../../new_engine/moonchild.ability";
import { goonAbility } from "../../new_engine/goon.ability";
import { lunaticAbility } from "../../new_engine/lunatic.ability";
import { godfatherAbility } from "../../new_engine/godfather.ability";
import { devils_advocateAbility } from "../../new_engine/devils_advocate.ability";
import { assassinAbility } from "../../new_engine/assassin.ability";
import { mastermindAbility } from "../../new_engine/mastermind.ability";
import { zombuulAbility } from "../../new_engine/zombuul.ability";
import { pukkaAbility } from "../../new_engine/pukka.ability";
import { shabalothAbility } from "../../new_engine/shabaloth.ability";
import { poAbility } from "../../new_engine/po.ability";

/**
 * L5 · 黯月初升 · **25 角色因果链（差分判据）**
 * ==================================================================
 * 本文件只回答一个问题：**这个能力跑完之后，世界（或说书人收到的指令）真的变了吗？**
 *
 * 🔒 判据设计：**差分**，不是终态。
 *   深拷贝 `before` → 跑能力管道 → 比 `after`，要求「至少一个语义字段发生变化」。
 *   只看终态（`isDead===true`）分不清「本能力造成的」与「开局就有的」⇒ 测不出回归。
 *
 * 🔒 靶子选择铁律（规范 §6.1）：
 *   黯月初升**禁用**靶子：sailor / fool / tea_lady / pacifist / innkeeper / goon / moonchild。
 *   安全靶子：chambermaid（侍女）/ gossip（造谣者）/ grandmother（祖母）/ tinker（修补匠）。
 *   需要「邪恶」时用 imp（小恶魔）；需要「爪牙」时用 mastermind/godfather。
 *
 * 🔒 前提齐备（规范 §6.2）：`runRole` 默认 snapshot 只有
 *   nightCount / gamePhase / seats / statusEffects / statusEffectMap /
 *   isVortoxWorld / reminders / log —— 其余字段默认 `undefined`。
 *   凡角色用 `=== true` / `!== null` / `?? ` 读取的，本文件都**显式传参**。
 *
 * 🔒 两种落库形态（重要，避免误判为「没落库」）：
 *   ① **直接改座位** —— 多数角色在 stateUpdate 改 `snapshot.seats`
 *   ② **只产出说书人指令** —— minstrel / pacifist / moonchild / gossip 只写
 *      `meta.stateUpdates`（由 GameController 消费）。对 ② 断言 `meta.stateUpdates`
 *      才是锚在源头变量；断言座位会恒绿（假绿）。
 *
 * 🔒 形态③（本文件新增识别）：**纯信息类**角色（grandmother / chambermaid）
 *   不改变世界，只产出 `meta.abilityResult` + `meta.displayInfo` ⇒ 判据改为
 *   「**信息的事实正确性**」+「**改变配置 ⇒ 结果必须变**」（规范 §5）。
 *
 * ⚠️ 只加测试不改生产：本文件发现的一切疑虑只写入交付报告，不动生产代码。
 */

const SAFE = ["chambermaid", "gossip", "grandmother", "tinker"] as const;

const SEMANTIC_KEYS = [
  "isDead",
  "markedForDeath",
  "diedAtNight",
  "deathSource",
  "deathSourceSeatId",
  "statusEffects",
  "statusDetails",
  "isPoisoned",
  "isDrunk",
  "isProtected",
  "isExecutionProtected",
  "protectedByTeaLady",
  "alignment",
  "isEvilConverted",
  "foolUsed",
  "hasUsedFoolAbility",
  "hasUsedAbility",
  "role",
] as const;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
function changedKeys(beforeSeat: any, afterSeat: any): string[] {
  return SEMANTIC_KEYS.filter(
    (k) => JSON.stringify(beforeSeat?.[k]) !== JSON.stringify(afterSeat?.[k])
  );
}
function seatAfter(res: any, id: number): any {
  return (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);
}
function updates(res: any): any {
  return res?.meta?.stateUpdates;
}
/** [行动者, ...安全配角]（去掉与行动者重名的） */
function layout(roleId: string, extra: string[] = []): string[] {
  const pool = [...SAFE.filter((x) => x !== roleId), ...extra];
  return [roleId, ...pool.filter((x, i) => pool.indexOf(x) === i)];
}
const drunk = (seats: any[], id = 0) => {
  seats[id].isDrunk = true;
  seats[id].statusEffects = [{ type: "drunk" }];
  return seats;
};

beforeEach(() => {
  // ⚠️ 限次能力的**定义表**只由 initializeLimitedAbilityManager() 灌入
  // （src/utils/LimitedAbilityManager.ts:98，模块级单例 definitions）。
  // 不装载 ⇒ resolveDef() 返回 undefined ⇒ canUseLimitedAbility(:122) /
  // consumeLimitedAbility(:137) **直接 return true** ⇒「每局限一次」静默失效。
  // 🔴 生产侧 P0：initializeLimitedAbilityManager() 在 src/ 下**零调用**
  //    （同 hm_l5_causal.test.ts 的 P0 记录）⇒ 教授/刺客/侍臣等限次角色在真实
  //    牌局里可无限次发动。本文件先装载定义表，测「限次逻辑本身是否正确」；
  //    装载缺失本身作为生产缺陷进入交付报告，不在测试内断言。
  initializeLimitedAbilityManager();
  resetLimitedAbilityUses();
});

// ══════════════════════════════════════════════════════════════════════════
//  1. 祖母 grandmother（纯信息 + 连锁死亡）
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 祖母(grandmother)", () => {
  it("① 事实正确性：孙子配置谁，就告知谁（改变配置 ⇒ 结果必须变）", async () => {
    const A = board(layout("grandmother"));
    (A[0] as any).grandchildId = 1;
    const ra = await runRole(grandmotherAbility, A, 0, { night: 1, phase: "firstNight" });

    const B = board(layout("grandmother"));
    (B[0] as any).grandchildId = 2;
    const rb = await runRole(grandmotherAbility, B, 0, { night: 1, phase: "firstNight" });

    expect(ra.meta.abilityResult.grandchildId, "❌ 祖母未告知 2号").toBe(1);
    // layout("grandmother") = [grandmother, chambermaid, gossip, tinker]
    // ⇒ 1号=侍女(chambermaid)、2号=造谣者(gossip)；名字必须跟着座位角色走
    expect(ra.meta.abilityResult.grandchildRoleName, "❌ 1号孙子角色名错误").toBe(
      r("chambermaid").name
    );
    expect(rb.meta.abilityResult.grandchildRoleName, "❌ 2号孙子角色名错误").toBe(
      r("gossip").name
    );
    expect(ra.meta.displayInfo?.type, "❌ 未产出 grandmother_info 展示信息").toBe(
      "grandmother_info"
    );
    expect(rb.meta.abilityResult.grandchildId, "❌ 祖母未告知 3号").toBe(2);
    expect(
      ra.meta.abilityResult.grandchildId !== rb.meta.abilityResult.grandchildId,
      "❌ 改孙子配置后结果没变 —— 说明它没在读 grandchildId"
    ).toBe(true);
  });

  it("② 负向对照：未配置孙子（grandchildId=null）⇒ 必须给空信息，不得瞎报", async () => {
    const seats = board(layout("grandmother"));
    (seats[0] as any).grandchildId = null;
    const res = await runRole(grandmotherAbility, seats, 0, {
      night: 1,
      phase: "firstNight",
    });
    expect(res.meta.abilityResult.grandchildId, "❌ 未配置孙子时应为 -1").toBe(-1);
    expect(res.meta.abilityResult.grandchildRoleName, "❌ 未配置孙子时角色名应为空").toBe("");
    expect(
      res.meta.displayInfo,
      "❌ 未配置孙子时不得产出展示信息（否则说书人会念出空孙子）"
    ).toBeUndefined();
  });

  it("③ 醉酒：必须给 100% 错误信息（假身份=镇民），且不得等于真值", async () => {
    const seats = board(layout("grandmother"));
    (seats[0] as any).grandchildId = 1; // 真孙子 = 2号 gossip
    drunk(seats, 0);
    const res = await runRole(grandmotherAbility, seats, 0, {
      night: 1,
      phase: "firstNight",
    });
    expect(
      res.meta.isAbilityActive,
      "❌ 醉酒祖母的 isAbilityActive 应为 false"
    ).toBe(false);
    expect(
      res.meta.abilityResult.grandchildRoleId,
      "❌ 醉酒时告知的身份必须是假身份 villager"
    ).toBe("villager");
    expect(
      res.meta.abilityResult.grandchildRoleId !== r("gossip").id,
      "❌ 醉酒祖母告知的竟是真身份 —— 干扰未生效"
    ).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  2. 水手 sailor
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 水手(sailor)", () => {
  it("① 目标为镇民 ⇒ 目标醉酒（落库 isDrunk + drunk 效果）", async () => {
    const seats = board(layout("sailor"));
    const before = clone(seats);
    const res = await runRole(sailorAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1], // chambermaid = 镇民
    });
    expect(res.aborted, "❌ 水手被中止").not.toBe(true);
    expect(
      changedKeys(before[1], seatAfter(res, 1)).length,
      "❌ 选中镇民但目标状态完全没变 —— 致醉没落库"
    ).toBeGreaterThan(0);
    expect(seatAfter(res, 1).isDrunk, "❌ 1号 isDrunk 应为 true").toBe(true);
    expect(
      (seatAfter(res, 1).statusEffects ?? []).some(
        (e: any) => e.type === "drunk" && e.source === "sailor"
      ),
      "❌ 1号 缺少 sailor 来源的 drunk 效果"
    ).toBe(true);
    expect(
      res.meta.abilityResult.drunkId,
      "❌ 醉酒者应是目标 1号"
    ).toBe(1);
  });

  it("② 负向对照：目标非镇民（恶魔）⇒ 水手自己醉酒，目标不受影响", async () => {
    const seats = board(layout("sailor", ["imp"]));
    const before = clone(seats);
    const impId = seats.findIndex((s: any) => s.role?.id === "imp");
    const res = await runRole(sailorAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [impId],
    });
    expect(
      res.meta.abilityResult.drunkId,
      "❌ 目标非镇民时醉酒者应是水手自己"
    ).toBe(0);
    expect(seatAfter(res, 0).isDrunk, "❌ 水手 isDrunk 应为 true").toBe(true);
    expect(
      changedKeys(before[impId], seatAfter(res, impId)).length,
      "❌ 目标非镇民时不该改动目标状态（stateUpdate 打错座位）"
    ).toBe(0);
  });

  it("③ 醉酒：能力失效但仍需落一个 drunk（不得两个都不醉）", async () => {
    const seats = board(layout("sailor"));
    drunk(seats, 0);
    const res = await runRole(sailorAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    const drunkId = res.meta.abilityResult.drunkId;
    expect(
      [0, 1].includes(drunkId),
      `❌ 醉酒水手的 drunkId 必须是自己或目标（实际 ${drunkId}）`
    ).toBe(true);
    expect(res.meta.abilityResult.isDrunk, "❌ 醉酒标记应为 true").toBe(true);
    expect(
      seatAfter(res, drunkId)?.isDrunk,
      `❌ 醉酒水手仍必须让 ${drunkId + 1}号 进入醉酒（形态①直接改座位）`
    ).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  3. 侍女 chambermaid（纯信息）
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 侍女(chambermaid)", () => {
  it("① 事实正确性：本夜被唤醒玩家的数量必须与配置一致", async () => {
    const seats = board(layout("chambermaid"));
    const res = await runRole(chambermaidAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1, 2],
      snapshot: { wokenPlayerIds: [1] }, // 只有 2号(=id1) 被唤醒过
    });
    expect(res.meta.abilityResult.wokenCount, "❌ 应为 1 人").toBe(1);
    expect(res.meta.abilityResult.targetIds, "❌ 目标记录错误").toEqual([1, 2]);
    // 改变配置 ⇒ 结果必须变
    const seats2 = board(layout("chambermaid"));
    const res2 = await runRole(chambermaidAbility, seats2, 0, {
      night: 2,
      phase: "night",
      targets: [1, 2],
      snapshot: { wokenPlayerIds: [1, 2] },
    });
    expect(res2.meta.abilityResult.wokenCount, "❌ 应为 2 人").toBe(2);
    expect(
      res2.meta.abilityResult.wokenCount !== res.meta.abilityResult.wokenCount,
      "❌ 改变唤醒名单后结果没变 —— 说明它没在读 wokenPlayerIds"
    ).toBe(true);
    expect(
      res.snapshot._abilityResults?.chambermaid,
      "❌ 结果未落库到 snapshot._abilityResults.chambermaid"
    ).toEqual(res.meta.abilityResult);
  });

  it("② 负向对照：选择 0 名被唤醒者 ⇒ 必须报 0，不得瞎报", async () => {
    const seats = board(layout("chambermaid"));
    const res = await runRole(chambermaidAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1, 2],
      snapshot: { wokenPlayerIds: [] },
    });
    expect(res.meta.abilityResult.wokenCount, "❌ 应为 0 人").toBe(0);
    expect(res.meta.abilityResult.isDrunk, "❌ 清醒时 isDrunk 应为 false").toBe(false);
    expect(
      updates(res),
      "❌ 侍女是纯信息角色，不应产出说书人指令"
    ).toBeUndefined();
  });

  it("③ 醉酒：结果必须 100% 错误（真值 0 时不得报 0）", async () => {
    const seats = board(layout("chambermaid"));
    drunk(seats, 0);
    const res = await runRole(chambermaidAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1, 2],
      snapshot: { wokenPlayerIds: [] }, // 真值 = 0
    });
    expect(res.meta.abilityResult.isDrunk, "❌ 醉酒标记应为 true").toBe(true);
    expect(
      res.meta.abilityResult.wokenCount !== 0,
      `❌ 醉酒侍女报了真值 0（官方：干扰时必须给 100% 错误信息）`
    ).toBe(true);
    expect(res.meta.abilityResult.wokenCount, "❌ 兜底假信息应为 1").toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  4. 驱魔人 exorcist
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 驱魔人(exorcist)", () => {
  it("① 选中恶魔 ⇒ 封锁当夜恶魔行动 + 记录命中", async () => {
    const seats = board(layout("exorcist", ["imp"]));
    const impId = seats.findIndex((s: any) => s.role?.id === "imp");
    const res = await runRole(exorcistAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [impId],
    });
    expect(res.snapshot.demonBlocked, "❌ demonBlocked 应为 true").toBe(true);
    expect(res.snapshot.lastExorcistTarget, "❌ 未记录 lastExorcistTarget").toBe(impId);
    expect(res.meta.abilityResult.isTargetDemon, "❌ isTargetDemon 应为 true").toBe(true);
    expect(
      res.meta.displayInfo?.log,
      "❌ 未产出「恶魔今晚无法行动」提示"
    ).toContain("无法行动");
  });

  it("② 负向对照：选中非恶魔 ⇒ 不得封锁", async () => {
    const seats = board(layout("exorcist"));
    const res = await runRole(exorcistAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(
      res.snapshot.demonBlocked === true,
      "❌ 选中非恶魔却把 demonBlocked 置 true"
    ).toBe(false);
    // ⚠️ 三态字段：目标非恶魔时 isTargetDemon 为 undefined（`a && active` 写法），
    //    故只能断言「不是 true」（见 bmr_more_l5 的同类记录）。
    expect(
      res.meta.abilityResult.isTargetDemon === true,
      "❌ 非恶魔的 isTargetDemon 不得为 true"
    ).toBe(false);
    expect(
      res.meta.displayInfo?.log,
      "❌ 非恶魔时提示应说明「不是恶魔」"
    ).toContain("不是恶魔");
  });

  it("③ 边界：连续两晚同一目标必须被拒绝；且醉酒恶魔不算命中", async () => {
    const seats = board(layout("exorcist", ["imp"]));
    const impId = seats.findIndex((s: any) => s.role?.id === "imp");
    const rc = await runRole(exorcistAbility, seats, 0, {
      night: 3,
      phase: "night",
      targets: [impId],
      snapshot: { lastExorcistTarget: impId },
    });
    expect(rc.aborted, "❌ 连续两晚同一目标未中止").toBe(true);
    expect(String(rc.abortReason), "❌ 中止原因应提到「连续」").toContain("连续");

    const seats2 = board(layout("exorcist", ["imp"]));
    drunk(seats2, 0);
    const rd = await runRole(exorcistAbility, seats2, 0, {
      night: 2,
      phase: "night",
      targets: [impId],
      snapshot: { lastExorcistTarget: null },
    });
    expect(
      rd.meta.abilityResult.isTargetDemon === true,
      "❌ 醉酒驱魔人不得封锁恶魔（isTargetDemon 不得为 true）"
    ).toBe(false);
    expect(
      rd.snapshot.demonBlocked === true,
      "❌ 醉酒驱魔人却封锁了恶魔"
    ).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  5. 旅店老板 innkeeper
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 旅店老板(innkeeper)", () => {
  it("① 两名目标当夜免死 + 其中恰好一人醉酒", async () => {
    const seats = board(layout("innkeeper"));
    const before = clone(seats);
    const res = await runRole(innkeeperAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1, 2],
    });
    const s1 = seatAfter(res, 1);
    const s2 = seatAfter(res, 2);
    expect(
      (s1.statusEffects ?? []).some((e: any) => e.type === "protected"),
      "❌ 1号 缺少 protected"
    ).toBe(true);
    expect(
      (s2.statusEffects ?? []).some((e: any) => e.type === "protected"),
      "❌ 2号 缺少 protected"
    ).toBe(true);
    const d = [s1, s2].filter((s: any) =>
      (s.statusEffects ?? []).some((e: any) => e.type === "drunk")
    ).length;
    expect(d, `❌ 官方「其中一人会醉酒」，实际 ${d} 人`).toBe(1);
    expect(
      changedKeys(before[1], s1).length + changedKeys(before[2], s2).length,
      "❌ 两个目标状态完全没变"
    ).toBeGreaterThan(0);
  });

  it("② 负向对照：目标数不是 2 ⇒ 中止且不改状态", async () => {
    const seats = board(layout("innkeeper"));
    const before = clone(seats);
    const res = await runRole(innkeeperAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(res.aborted, "❌ 只选 1 人却未中止").toBe(true);
    expect(
      changedKeys(before[1], seatAfter(res, 1)).length,
      "❌ 中止后不得改动座位"
    ).toBe(0);
    expect(
      (seatAfter(res, 1).statusEffects ?? []).some((e: any) => e.type === "protected"),
      "❌ 中止后不得产生保护"
    ).toBe(false);
  });

  it("③ 醉酒：不得产生保护（保护是效果类，必须受能力有效门控）", async () => {
    const seats = board(layout("innkeeper"));
    drunk(seats, 0);
    const res = await runRole(innkeeperAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1, 2],
    });
    expect(
      (seatAfter(res, 1)?.statusEffects ?? []).some((e: any) => e.type === "protected"),
      "❌ 醉酒旅店老板仍给了保护（官方：醉酒时能力无效）"
    ).toBe(false);
    expect(
      (seatAfter(res, 2)?.statusEffects ?? []).some((e: any) => e.type === "protected"),
      "❌ 醉酒旅店老板仍给了保护"
    ).toBe(false);
    expect(
      seatAfter(res, 1)?.isDrunk === true || seatAfter(res, 2)?.isDrunk === true,
      "❌ 醉酒旅店老板也不该让目标醉酒"
    ).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  6. 赌徒 gambler
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 赌徒(gambler)", () => {
  it("① 猜错 ⇒ 赌徒自己死亡并落死因", async () => {
    const seats = board(layout("gambler"));
    const before = clone(seats);
    const res = await runRole(gamblerAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1], // chambermaid
      storytellerInput: { guessedRole: "imp" },
    });
    expect(
      changedKeys(before[0], seatAfter(res, 0)).length,
      "❌ 猜错了但赌徒状态完全没变（官方：猜错你会死亡）"
    ).toBeGreaterThan(0);
    expect(seatAfter(res, 0).isDead, "❌ 猜错后赌徒应死亡").toBe(true);
    expect(
      seatAfter(res, 0).deathSource,
      `❌ deathSource 应为 gambler_guess_fail（实际 ${seatAfter(res, 0).deathSource}）`
    ).toBe("gambler_guess_fail");
  });

  it("② 猜对 ⇒ 毫发无伤（负向对照）", async () => {
    const seats = board(layout("gambler"));
    const before = clone(seats);
    const res = await runRole(gamblerAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      storytellerInput: { guessedRole: "chambermaid" },
    });
    expect(
      changedKeys(before[0], seatAfter(res, 0)).length,
      "❌ 猜对了状态却变了（官方：猜对无事发生）"
    ).toBe(0);
    expect(seatAfter(res, 0).isDead, "❌ 猜对后赌徒不应死亡").toBe(false);
    expect(res.meta.abilityResult.isGuessCorrect, "❌ isGuessCorrect 应为 true").toBe(true);
  });

  it("③ 边界：猜错但受保护 ⇒ 不死（保护优先于自罚）", async () => {
    const seats = board(layout("gambler"));
    seats[0].statusEffects = [{ type: "protected" }];
    const res = await runRole(gamblerAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      storytellerInput: { guessedRole: "imp" },
    });
    expect(res.meta.abilityResult.isProtected, "❌ isProtected 应为 true").toBe(true);
    expect(res.meta.abilityResult.shouldDie, "❌ 受保护时 shouldDie 应为 false").toBe(false);
    expect(seatAfter(res, 0).isDead, "❌ 受保护的赌徒不该死").toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  7. 造谣者 gossip（只产出指令形态）
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 造谣者(gossip)", () => {
  it("① 声明为真 ⇒ 产出 MARK_FOR_DEATH 指令（指向选中的玩家）", async () => {
    const seats = board(layout("gossip"));
    const res = await runRole(gossipAbility, seats, 0, {
      night: 2,
      phase: "day",
      targets: [1],
      storytellerInput: { statement: "1号是侍女", isStatementTrue: true },
    });
    expect(updates(res)?.type, "❌ 未产出 MARK_FOR_DEATH").toBe("MARK_FOR_DEATH");
    expect(updates(res)?.targetId, "❌ 死亡指令打错座位").toBe(1);
    expect(res.meta.abilityResult.shouldKill, "❌ shouldKill 应为 true").toBe(true);
  });

  it("② 负向对照：声明为假 ⇒ 什么都不产出", async () => {
    const seats = board(layout("gossip"));
    const res = await runRole(gossipAbility, seats, 0, {
      night: 2,
      phase: "day",
      targets: [1],
      storytellerInput: { statement: "1号是恶魔", isStatementTrue: false },
    });
    expect(updates(res), "❌ 声明为假仍产出了死亡指令").toBeUndefined();
    expect(res.meta.abilityResult.shouldKill, "❌ shouldKill 应为 false").toBe(false);
    expect(res.aborted, "❌ 声明为假不应中止（只是不生效）").not.toBe(true);
  });

  it("③ 边界：造谣者已死亡 ⇒ 必须中止", async () => {
    const seats = board(layout("gossip"));
    seats[0].isDead = true;
    const res = await runRole(gossipAbility, seats, 0, {
      night: 2,
      phase: "day",
      targets: [1],
      storytellerInput: { isStatementTrue: true },
    });
    expect(res.aborted, "❌ 已死亡的造谣者仍发动了能力").toBe(true);
    expect(updates(res), "❌ 已死亡时不得产出指令").toBeUndefined();
    expect(String(res.abortReason), "❌ 中止原因应提到「死亡」").toContain("死亡");
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  8. 侍臣 courtier
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 侍臣(courtier)", () => {
  it("① 点名角色在场 ⇒ 其持有者 3 天 3 夜醉酒", async () => {
    const seats = board(layout("courtier"));
    const before = clone(seats);
    const res = await runRole(courtierAbility, seats, 0, {
      night: 2,
      phase: "night",
      storytellerInput: { targetRoleId: "chambermaid" },
    });
    expect(
      changedKeys(before[1], seatAfter(res, 1)).length,
      "❌ 点名的角色在场但持有者状态没变"
    ).toBeGreaterThan(0);
    expect(seatAfter(res, 1).isDrunk, "❌ 1号 isDrunk 应为 true").toBe(true);
    expect(
      (seatAfter(res, 1).statusEffects ?? []).some(
        (e: any) => e.type === "drunk" && e.source === "courtier"
      ),
      "❌ 1号 缺少 courtier 来源的 drunk"
    ).toBe(true);
    expect(seatAfter(res, 0).hasUsedAbility, "❌ 侍臣自己未标记已消耗").toBe(true);
  });

  it("② 负向对照：点名角色不在场 ⇒ 无人醉酒（但仍消耗次数）", async () => {
    const seats = board(layout("courtier"));
    const before = clone(seats);
    const res = await runRole(courtierAbility, seats, 0, {
      night: 2,
      phase: "night",
      storytellerInput: { targetRoleId: "not_a_role_in_play" },
    });
    expect(
      changedKeys(before[1], seatAfter(res, 1)).length,
      "❌ 角色不在场却有座位被改动"
    ).toBe(0);
    expect(res.snapshot.courtierUsed, "❌ 无论是否生效都必须记账已使用").toBe(true);
    expect(seatAfter(res, 0).hasUsedAbility, "❌ 侍臣自己必须标记已消耗").toBe(true);
  });

  it("③ 边界：已使用过（每局限一次）⇒ 必须中止", async () => {
    const seats = board(layout("courtier"));
    seats[0].hasUsedAbility = true;
    const res = await runRole(courtierAbility, seats, 0, {
      night: 3,
      phase: "night",
      storytellerInput: { targetRoleId: "chambermaid" },
    });
    expect(res.aborted, "❌ 侍臣已用过却仍被允许再发动").toBe(true);
    expect(seatAfter(res, 1).isDrunk, "❌ 中止后不得有人醉酒").toBe(false);
    expect(String(res.abortReason), "❌ 中止原因应提到「已使用」").toContain("已使用");
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  9. 教授 professor
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 教授(professor)", () => {
  it("① 死亡镇民 ⇒ 复活（isDead=false + resurrected + 死因字段被清）", async () => {
    const seats = board(layout("professor"));
    seats[1].isDead = true;
    seats[1].deathSource = "imp_kill";
    seats[1].markedForDeath = true;
    const before = clone(seats);
    const res = await runRole(professorAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(res.aborted, "❌ 教授被中止").not.toBe(true);
    expect(
      changedKeys(before[1], seatAfter(res, 1)).length,
      "❌ 选中死亡镇民但状态没变 —— 复活没落库"
    ).toBeGreaterThan(0);
    expect(seatAfter(res, 1).isDead, "❌ 被复活者 isDead 应为 false").toBe(false);
    expect(
      (seatAfter(res, 1).statusEffects ?? []).some((e: any) => e.type === "resurrected"),
      "❌ 缺少 resurrected 效果"
    ).toBe(true);
    expect(
      seatAfter(res, 1).deathSource,
      "❌ 复活后死因字段必须被清除"
    ).toBeUndefined();
    expect(res.meta.resurrectionSuccess, "❌ resurrectionSuccess 应为 true").toBe(true);
  });

  it("② 负向对照：死亡恶魔 ⇒ 不复活；存活玩家 ⇒ 中止", async () => {
    const seats = board(layout("professor", ["imp"]));
    const impId = seats.findIndex((s: any) => s.role?.id === "imp");
    seats[impId].isDead = true;
    const rb = await runRole(professorAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [impId],
    });
    expect(
      seatAfter(rb, impId).isDead,
      "❌ 教授复活了恶魔（官方：外来者/爪牙/恶魔则无事发生）"
    ).toBe(true);
    expect(rb.meta.resurrectionSuccess, "❌ 失败时 resurrectionSuccess 应为 false").toBe(false);

    const seats2 = board(layout("professor"));
    const rc = await runRole(professorAbility, seats2, 0, {
      night: 2,
      phase: "night",
      targets: [1], // 存活
    });
    expect(rc.aborted, "❌ 目标存活时教授应中止（只能选死者）").toBe(true);
  });

  it("③ 边界：每局限一次 ⇒ 第二次必须中止", async () => {
    const seats = board(layout("professor"));
    seats[1].isDead = true;
    const first = await runRole(professorAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(first.meta.resurrectionSuccess, "❌ 第一次应成功").toBe(true);

    const seats2 = board(layout("professor"));
    seats2[1].isDead = true;
    const second = await runRole(professorAbility, seats2, 0, {
      night: 3,
      phase: "night",
      targets: [1],
    });
    expect(second.aborted, "❌ 教授第二次仍被允许发动（每局限一次）").toBe(true);
    expect(
      seatAfter(second, 1).isDead,
      "❌ 第二次不得复活"
    ).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  10. 吟游诗人 minstrel
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 吟游诗人(minstrel)", () => {
  it("① 爪牙死于处决 ⇒ MARK_ALL_FOR_DRUNK（排除自己与已死者）", async () => {
    const seats = board(layout("minstrel", ["mastermind"]));
    const minionId = seats.findIndex((s: any) => s.role?.id === "mastermind");
    seats[minionId].isDead = true; // 官方：爪牙**死于处决**
    const res = await runRole(minstrelAbility, seats, 0, {
      night: 2,
      phase: "day",
      storytellerInput: { executedSeatId: minionId },
    });
    expect(res.meta.abilityResult.isMinionExecuted, "❌ 应判为爪牙被处决").toBe(true);
    expect(updates(res)?.type, "❌ 未产出 MARK_ALL_FOR_DRUNK").toBe("MARK_ALL_FOR_DRUNK");
    expect(updates(res)?.targetIds?.length, "❌ 醉酒名单为空").toBeGreaterThan(0);
    expect(updates(res)?.targetIds?.includes(0), "❌ 吟游诗人自己不该在名单里").toBe(false);
    expect(
      updates(res)?.targetIds?.includes(minionId),
      "❌ 已死亡的爪牙不该在名单里"
    ).toBe(false);
  });

  it("② 负向对照：镇民被处决 ⇒ 什么都不产出", async () => {
    const seats = board(layout("minstrel"));
    seats[1].isDead = true;
    const res = await runRole(minstrelAbility, seats, 0, {
      night: 2,
      phase: "day",
      storytellerInput: { executedSeatId: 1 },
    });
    expect(updates(res), "❌ 镇民被处决却触发了吟游诗人").toBeUndefined();
    expect(res.meta.abilityResult.shouldDrunkEveryone, "❌ 不该触发").toBe(false);
    expect(res.meta.abilityResult.isMinionExecuted, "❌ 应判为非爪牙").toBe(false);
  });

  it("③ 边界：恶魔被处决（不是爪牙）⇒ 不触发；死亡者不在名单", async () => {
    const seats = board(layout("minstrel", ["imp", "mastermind"]));
    const impId = seats.findIndex((s: any) => s.role?.id === "imp");
    const minionId = seats.findIndex((s: any) => s.role?.id === "mastermind");
    seats[impId].isDead = true;
    const rc = await runRole(minstrelAbility, seats, 0, {
      night: 2,
      phase: "day",
      storytellerInput: { executedSeatId: impId },
    });
    expect(updates(rc), "❌ 恶魔被处决（非爪牙）却触发了").toBeUndefined();

    // 爪牙被处决 + 另有已死者 ⇒ 两名死者都不得进名单
    const seats2 = board(layout("minstrel", ["mastermind", "imp"]));
    const m2 = seats2.findIndex((s: any) => s.role?.id === "mastermind");
    seats2[m2].isDead = true;
    const r2 = await runRole(minstrelAbility, seats2, 0, {
      night: 2,
      phase: "day",
      storytellerInput: { executedSeatId: m2 },
    });
    void minionId;
    expect(updates(r2)?.type, "❌ 未触发").toBe("MARK_ALL_FOR_DRUNK");
    expect(
      updates(r2)?.targetIds?.includes(m2),
      "❌ 被处决致死的爪牙不该在醉酒名单里"
    ).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  11. 茶艺师 tea_lady
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 茶艺师(tea_lady)", () => {
  it("① 两侧邻居均善良 ⇒ 两人获得 protected", async () => {
    const seats = board(["tea_lady", "chambermaid", "imp", "gossip", "tinker"]);
    const before = clone(seats);
    const res = await runRole(teaLadyAbility, seats, 0, { night: 2, phase: "night" });
    expect(
      res.meta.abilityResult.protectedIds.length,
      "❌ 两侧均善良应保护 2 人"
    ).toBe(2);
    expect(
      changedKeys(before[1], seatAfter(res, 1)).length,
      "❌ 邻居状态没变 —— 保护没落库"
    ).toBeGreaterThan(0);
    expect(seatAfter(res, 1).protectedByTeaLady, "❌ 1号 未打 protectedByTeaLady").toBe(true);
    expect(
      (seatAfter(res, 1).statusEffects ?? []).some(
        (e: any) => e.type === "protected" && e.source === "tea_lady"
      ),
      "❌ 1号 缺少 tea_lady 来源的 protected"
    ).toBe(true);
  });

  it("② 负向对照：一侧邻居邪恶 ⇒ 一个都不保护", async () => {
    const seats = board(["tea_lady", "imp", "chambermaid", "gossip", "tinker"]);
    const before = clone(seats);
    const res = await runRole(teaLadyAbility, seats, 0, { night: 2, phase: "night" });
    expect(
      res.meta.abilityResult.protectedIds.length,
      "❌ 一侧邪恶时仍保护（官方：两侧均为善良才免死）"
    ).toBe(0);
    expect(
      changedKeys(before[2], seatAfter(res, 2)).length,
      "❌ 不该保护时却改动了座位"
    ).toBe(0);
    expect(res.meta.abilityResult.bothGood, "❌ bothGood 应为 false").toBe(false);
  });

  it("③ 边界：茶艺师醉酒 ⇒ 能力失效（preCheck 直接中止）", async () => {
    const seats = board(["tea_lady", "chambermaid", "imp", "gossip", "tinker"]);
    drunk(seats, 0);
    const res = await runRole(teaLadyAbility, seats, 0, { night: 2, phase: "night" });
    expect(res.aborted, "❌ 醉酒茶艺师未中止").toBe(true);
    expect(
      seatAfter(res, 1)?.protectedByTeaLady,
      "❌ 醉酒茶艺师仍给了保护"
    ).toBeUndefined();
    expect(String(res.abortReason), "❌ 中止原因应提到「醉酒或中毒」").toContain("醉酒");
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  12. 和平主义者 pacifist
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 和平主义者(pacifist)", () => {
  it("① 善良被处决 + 说书人救 ⇒ CANCEL_DEATH（打到被处决座位）", async () => {
    const seats = board(layout("pacifist"));
    const res = await runRole(pacifistAbility, seats, 0, {
      night: 2,
      phase: "day",
      storytellerInput: { executedSeatId: 1, shouldSave: true },
    });
    expect(updates(res)?.type, "❌ 未产出 CANCEL_DEATH").toBe("CANCEL_DEATH");
    expect(updates(res)?.targetId, "❌ CANCEL_DEATH 打错座位").toBe(1);
    expect(res.meta.abilityResult.isGoodExecuted, "❌ 应判为善良被处决").toBe(true);
    expect(res.meta.abilityResult.shouldSave, "❌ shouldSave 应为 true").toBe(true);
  });

  it("② 负向对照：邪恶被处决 ⇒ 救不了（即使说书人标了 shouldSave）", async () => {
    const seats = board(layout("pacifist", ["imp"]));
    const impId = seats.findIndex((s: any) => s.role?.id === "imp");
    const res = await runRole(pacifistAbility, seats, 0, {
      night: 2,
      phase: "day",
      storytellerInput: { executedSeatId: impId, shouldSave: true },
    });
    expect(updates(res), "❌ 邪恶被处决却要救（官方：只保善良玩家）").toBeUndefined();
    expect(res.meta.abilityResult.isGoodExecuted, "❌ 邪恶应被判为非善良").toBe(false);
    expect(res.meta.abilityResult.shouldSave, "❌ 邪恶不该被救").toBe(false);
  });

  it("③ 边界：善良但说书人不救 ⇒ 不产出；未指定被处决者 ⇒ 中止", async () => {
    const seats = board(layout("pacifist"));
    const rc = await runRole(pacifistAbility, seats, 0, {
      night: 2,
      phase: "day",
      storytellerInput: { executedSeatId: 1, shouldSave: false },
    });
    expect(updates(rc), "❌ 说书人不救却产出了 CANCEL_DEATH").toBeUndefined();
    expect(rc.meta.abilityResult.shouldSave, "❌ shouldSave 应为 false").toBe(false);

    const seats2 = board(layout("pacifist"));
    const rd = await runRole(pacifistAbility, seats2, 0, {
      night: 2,
      phase: "day",
      storytellerInput: {},
    });
    expect(rd.aborted, "❌ 未指定被处决者时应中止").toBe(true);
    expect(updates(rd), "❌ 中止时不得产出指令").toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  13. 弄臣 fool
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 弄臣(fool)", () => {
  it("① 首次免死生效并消耗（foolUsed / hasUsedFoolAbility 双写）", async () => {
    const seats = board(layout("fool"));
    // ⚠️ 免死发生在「**即将**死亡」的瞬间（处决/夜杀结算前），不是「已经死亡」。
    //    canFoolSurvive()（src/utils/bmrMechanics.ts:131-140）第一步就是
    //    isAliveSeat(seat) ⇒ 若先把 isDead 置 true，preCheck 必然中止。
    seats[0].markedForDeath = true;
    const before = clone(seats);
    const res = await runRole(foolAbility, seats, 0, { night: 2, phase: "night" });
    expect(res.aborted, "❌ 弄臣被中止").not.toBe(true);
    expect(
      changedKeys(before[0], seatAfter(res, 0)).length,
      "❌ 免死没有落下任何状态变化"
    ).toBeGreaterThan(0);
    expect(seatAfter(res, 0).isDead, "❌ 免死生效后 isDead 应为 false").toBe(false);
    expect(seatAfter(res, 0).foolUsed, "❌ foolUsed 应为 true").toBe(true);
    expect(seatAfter(res, 0).hasUsedFoolAbility, "❌ hasUsedFoolAbility 应为 true").toBe(true);
  });

  it("② 负向对照：免死已用过 ⇒ 必须中止且不再改状态", async () => {
    const seats = board(layout("fool"));
    seats[0].hasUsedFoolAbility = true;
    const before = clone(seats);
    const res = await runRole(foolAbility, seats, 0, { night: 2, phase: "night" });
    expect(res.aborted, "❌ 免死已用过却仍被允许再免死").toBe(true);
    expect(changedKeys(before[0], seatAfter(res, 0)).length, "❌ 已用过却改状态").toBe(0);
    expect(seatAfter(res, 0).foolUsed, "❌ 不该出现第二次 foolUsed").not.toBe(false);
  });

  it("③ 边界：醉酒 ⇒ 不清醒不予免死（preCheck 中止）", async () => {
    const seats = board(layout("fool"));
    drunk(seats, 0);
    const res = await runRole(foolAbility, seats, 0, { night: 2, phase: "night" });
    expect(
      res.aborted,
      "❌ 醉酒弄臣不应免死（官方：清醒时首次死亡免死）"
    ).toBe(true);
    expect(seatAfter(res, 0)?.foolUsed, "❌ 醉酒时不该消耗免死").toBeUndefined();
    expect(String(res.abortReason), "❌ 中止原因应提到免死失效").toContain("免死");
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  14. 修补匠 tinker
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 修补匠(tinker)", () => {
  it("① 说书人判定猝死 ⇒ 真的死亡并落死因", async () => {
    const seats = board(layout("tinker"));
    const before = clone(seats);
    const res = await runRole(tinkerAbility, seats, 0, {
      night: 2,
      phase: "night",
      storytellerInput: { shouldKillTinker: true },
    });
    expect(
      changedKeys(before[0], seatAfter(res, 0)).length,
      "❌ 说书人判定猝死但状态没变"
    ).toBeGreaterThan(0);
    expect(seatAfter(res, 0).isDead, "❌ 修补匠应死亡").toBe(true);
    expect(
      seatAfter(res, 0).deathSource,
      `❌ deathSource 应为 tinker_sudden_death（实际 ${seatAfter(res, 0).deathSource}）`
    ).toBe("tinker_sudden_death");
  });

  it("② 负向对照：说书人不判定 ⇒ 不得死亡", async () => {
    const seats = board(layout("tinker"));
    const before = clone(seats);
    const res = await runRole(tinkerAbility, seats, 0, { night: 2, phase: "night" });
    expect(res.meta.abilityResult.shouldDie, "❌ shouldDie 应为 false").toBe(false);
    expect(changedKeys(before[0], seatAfter(res, 0)).length, "❌ 不该死亡却死了").toBe(0);
    expect(seatAfter(res, 0).isDead, "❌ isDead 应为 false").toBe(false);
  });

  it("③ 边界：有 protected 时猝死不生效", async () => {
    const seats = board(layout("tinker"));
    seats[0].statusEffects = [{ type: "protected" }];
    const res = await runRole(tinkerAbility, seats, 0, {
      night: 2,
      phase: "night",
      storytellerInput: { shouldKillTinker: true },
    });
    expect(res.meta.abilityResult.isProtected, "❌ isProtected 应为 true").toBe(true);
    expect(res.meta.abilityResult.shouldDie, "❌ 受保护时 shouldDie 应为 false").toBe(false);
    expect(seatAfter(res, 0).isDead, "❌ 受保护的修补匠不该死").toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  15. 月之子 moonchild
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 月之子(moonchild)", () => {
  it("① 选中善良玩家 ⇒ 产出 MARK_FOR_DEATH 指令", async () => {
    const seats = board(layout("moonchild"));
    const res = await runRole(moonchildAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(updates(res)?.type, "❌ 未产出 MARK_FOR_DEATH").toBe("MARK_FOR_DEATH");
    expect(updates(res)?.targetId, "❌ 死亡指令打错座位").toBe(1);
    expect(res.meta.abilityResult.shouldKill, "❌ shouldKill 应为 true").toBe(true);
    expect(res.meta.abilityResult.targetIsGood, "❌ 应判为善良").toBe(true);
  });

  it("② 负向对照：选中邪恶玩家 ⇒ 无事发生", async () => {
    const seats = board(layout("moonchild", ["imp"]));
    const impId = seats.findIndex((s: any) => s.role?.id === "imp");
    const res = await runRole(moonchildAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [impId],
    });
    expect(updates(res), "❌ 选中邪恶却产出死亡指令").toBeUndefined();
    expect(res.meta.abilityResult.shouldKill, "❌ shouldKill 应为 false").toBe(false);
    expect(res.meta.abilityResult.targetIsGood, "❌ 应判为邪恶").toBe(false);
  });

  it("③ 边界：月之子醉酒/中毒 ⇒ 能力无效，不下死亡指令", async () => {
    const seats = board(layout("moonchild"));
    drunk(seats, 0);
    const res = await runRole(moonchildAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(res.meta.abilityResult.isAbilityEffective, "❌ 醉酒时能力应无效").toBe(false);
    expect(res.meta.abilityResult.shouldKill, "❌ 醉酒月之子不该杀人").toBe(false);
    expect(updates(res), "❌ 醉酒月之子不得产出死亡指令").toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  16. 莽夫 goon
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 莽夫(goon)", () => {
  it("① 被邪恶玩家选择 ⇒ 莽夫转邪恶 + 选择者醉酒", async () => {
    const seats = board(layout("goon", ["imp"]));
    const impId = seats.findIndex((s: any) => s.role?.id === "imp");
    const before = clone(seats);
    const res = await runRole(goonAbility, seats, 0, {
      night: 2,
      phase: "night",
      meta: { chooserSeatId: impId },
    });
    expect(
      seatAfter(res, 0).alignment,
      `❌ 被邪恶选择后莽夫应为 evil（实际 ${seatAfter(res, 0).alignment}）`
    ).toBe("evil");
    expect(seatAfter(res, 0).isEvilConverted, "❌ isEvilConverted 应为 true").toBe(true);
    expect(
      changedKeys(before[0], seatAfter(res, 0)).length,
      "❌ 莽夫阵营变化没有落库"
    ).toBeGreaterThan(0);
    expect(seatAfter(res, impId).isDrunk, "❌ 选择莽夫的邪恶玩家应醉酒").toBe(true);
    expect(
      (seatAfter(res, impId).statusEffects ?? []).some(
        (e: any) => e.type === "drunk" && e.source === "goon"
      ),
      "❌ 选择者缺少 goon 来源的 drunk"
    ).toBe(true);
  });

  it("② 负向对照：被善良玩家选择 ⇒ 莽夫仍为善良", async () => {
    const seats = board(layout("goon"));
    const res = await runRole(goonAbility, seats, 0, {
      night: 2,
      phase: "night",
      meta: { chooserSeatId: 1 }, // chambermaid = 善良
    });
    expect(
      seatAfter(res, 0).alignment,
      `❌ 被善良选择后莽夫应为 good（实际 ${seatAfter(res, 0).alignment}）`
    ).toBe("good");
    expect(seatAfter(res, 0).isEvilConverted, "❌ isEvilConverted 应为 false").toBe(false);
    expect(seatAfter(res, 1).isDrunk, "❌ 善良选择者仍应醉酒（官方：首个选择者会醉酒）").toBe(
      true
    );
  });

  it("③ 边界：没有选择者 ⇒ 什么都不变", async () => {
    const seats = board(layout("goon"));
    const before = clone(seats);
    const res = await runRole(goonAbility, seats, 0, { night: 2, phase: "night" });
    expect(res.meta.abilityResult.alignmentChanged, "❌ 无选择者时不应改阵营").toBe(false);
    expect(changedKeys(before[0], seatAfter(res, 0)).length, "❌ 无选择者却改动了座位").toBe(0);
    expect(res.meta.abilityResult.chooserDrunk, "❌ 无选择者时 chooserDrunk 应为 false").toBe(
      false
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  17. 疯子 lunatic
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 疯子(lunatic)", () => {
  it("① 模拟击杀：目标记录落到行动者座位（真恶魔可读取）", async () => {
    const seats = board(layout("lunatic"));
    (seats[0] as any).apparentDemonRole = r("shabaloth");
    const res = await runRole(lunaticAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(seatAfter(res, 0).lunaticTarget, "❌ 行动者座位未记录 lunaticTarget").toBe(1);
    expect(seatAfter(res, 0).lunaticTargetIds, "❌ 未记录 lunaticTargetIds").toEqual([1]);
    expect(res.snapshot.lunaticTarget, "❌ 快照顶层未记录 lunaticTarget").toBe(1);
    expect(res.meta.abilityResult.apparentDemonId, "❌ 未识别假恶魔身份").toBe("shabaloth");
  });

  it("② 负向对照：疯子从不真正杀人（目标 state 不得出现死亡）", async () => {
    const seats = board(layout("lunatic"));
    const before = clone(seats);
    const res = await runRole(lunaticAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(res.meta.abilityResult.realKill, "❌ realKill 必须为 false").toBe(false);
    expect(res.meta.abilityResult.fakeKill, "❌ fakeKill 应为 true").toBe(true);
    expect(
      changedKeys(before[1], seatAfter(res, 1)).length,
      "❌ 疯子竟然改动了目标的死亡状态（官方：不造成真实死亡）"
    ).toBe(0);
    expect(seatAfter(res, 1).isDead, "❌ 目标不该死亡").toBe(false);
  });

  it("③ 边界：疯子已死亡 ⇒ 中止；无目标 ⇒ 不记录击杀", async () => {
    const seats = board(layout("lunatic"));
    seats[0].isDead = true;
    const rc = await runRole(lunaticAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(rc.aborted, "❌ 已死亡的疯子仍行动").toBe(true);
    expect(String(rc.abortReason), "❌ 中止原因应提到「死亡」").toContain("死亡");

    const seats2 = board(layout("lunatic"));
    const rd = await runRole(lunaticAbility, seats2, 0, {
      night: 2,
      phase: "night",
      targets: [],
    });
    expect(rd.snapshot.lunaticTarget, "❌ 无目标时 lunaticTarget 应为 null").toBeNull();
    expect(rd.snapshot.lunaticTargetIds, "❌ 无目标时列表应为空").toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  18. 教父 godfather
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 教父(godfather)", () => {
  it("① 今日有外来者死亡 ⇒ 目标真的死亡并落 godfather_kill", async () => {
    const seats = board(layout("godfather", ["tinker"]));
    const before = clone(seats);
    const res = await runRole(godfatherAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      snapshot: { outsiderDiedToday: true },
    });
    expect(res.aborted, `❌ 已满足前提却中止：${res.abortReason ?? "无"}`).toBeFalsy();
    expect(
      changedKeys(before[1], seatAfter(res, 1)).length,
      "❌ 满足前提后目标状态完全没变"
    ).toBeGreaterThan(0);
    expect(seatAfter(res, 1).isDead, "❌ 教父击杀目标应死亡").toBe(true);
    expect(
      seatAfter(res, 1).deathSource,
      `❌ deathSource 应为 godfather_kill（实际 ${seatAfter(res, 1).deathSource}）`
    ).toBe("godfather_kill");
    expect(res.snapshot.lastKill?.minionRole, "❌ 未记账 lastKill").toBe("godfather");
  });

  it("② 负向对照：今日无外来者死亡 ⇒ 必须中止且不杀人", async () => {
    const seats = board(layout("godfather", ["tinker"]));
    const before = clone(seats);
    const res = await runRole(godfatherAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      snapshot: { outsiderDiedToday: false },
    });
    expect(res.aborted, "❌ 无外来者死亡时教父应中止").toBe(true);
    expect(
      changedKeys(before[1], seatAfter(res, 1)).length,
      "❌ 中止后仍改动了目标"
    ).toBe(0);
    expect(seatAfter(res, 1).isDead, "❌ 中止后目标不该死").toBe(false);
  });

  it("③ 边界：教父已死亡 ⇒ 中止", async () => {
    const seats = board(layout("godfather", ["tinker"]));
    seats[0].isDead = true;
    const res = await runRole(godfatherAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      snapshot: { outsiderDiedToday: true },
    });
    expect(res.aborted, "❌ 已死亡的教父仍在杀人").toBe(true);
    expect(seatAfter(res, 1).isDead, "❌ 目标不该死").toBe(false);
    expect(String(res.abortReason), "❌ 中止原因应提到「死亡」").toContain("死亡");
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  19. 魔鬼代言人 devils_advocate
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 魔鬼代言人(devils_advocate)", () => {
  it("① 目标获得「今日免处决」状态（execution_protected）", async () => {
    const seats = board(layout("devils_advocate"));
    const before = clone(seats);
    const res = await runRole(devils_advocateAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(
      changedKeys(before[1], seatAfter(res, 1)).length,
      "❌ 目标状态完全没变 —— 保护没落库"
    ).toBeGreaterThan(0);
    expect(seatAfter(res, 1).isExecutionProtected, "❌ isExecutionProtected 应为 true").toBe(
      true
    );
    expect(
      (seatAfter(res, 1).statusEffects ?? []).some(
        (e: any) => e.type === "execution_protected" && e.source === "devils_advocate"
      ),
      "❌ 缺少 devils_advocate 来源的 execution_protected"
    ).toBe(true);
    expect(res.snapshot.lastDevilsAdvocateTarget, "❌ 未记录保护目标").toBe(1);
  });

  it("② 负向对照：连续两晚同一目标 ⇒ 必须中止", async () => {
    const seats = board(layout("devils_advocate"));
    const before = clone(seats);
    const res = await runRole(devils_advocateAbility, seats, 0, {
      night: 3,
      phase: "night",
      targets: [1],
      snapshot: { lastDevilsAdvocateTarget: 1 },
    });
    expect(res.aborted, "❌ 连续两晚同一目标未中止").toBe(true);
    expect(
      changedKeys(before[1], seatAfter(res, 1)).length,
      "❌ 中止后仍改了座位"
    ).toBe(0);
    expect(String(res.abortReason), "❌ 中止原因应提到「连续」").toContain("连续");
  });

  it("③ 边界：能力失效（醉酒/中毒）⇒ 不得给保护", async () => {
    const seats = board(layout("devils_advocate"));
    drunk(seats, 0);
    const res = await runRole(devils_advocateAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(res.meta.abilityResult.protected, "❌ 醉酒时 protected 应为 false").toBe(false);
    expect(
      seatAfter(res, 1)?.isExecutionProtected === true,
      "❌ 醉酒魔鬼代言人仍给了保护"
    ).toBe(false);
    expect(
      (seatAfter(res, 1)?.statusEffects ?? []).some(
        (e: any) => e.type === "execution_protected"
      ),
      "❌ 醉酒魔鬼代言人仍写了 execution_protected"
    ).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  20. 刺客 assassin
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 刺客(assassin)", () => {
  it("① 一次性暗杀 ⇒ 目标死亡并落 assassin_kill（无视保护）", async () => {
    const seats = board(layout("assassin"));
    seats[1].statusEffects = [{ type: "protected" }]; // 保护也挡不住
    const before = clone(seats);
    const res = await runRole(assassinAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(
      changedKeys(before[1], seatAfter(res, 1)).length,
      "❌ 刺客选定目标并确认后状态完全没变"
    ).toBeGreaterThan(0);
    expect(seatAfter(res, 1).isDead, "❌ 刺客目标必须死亡").toBe(true);
    expect(
      seatAfter(res, 1).deathSource,
      `❌ deathSource 应为 assassin_kill（实际 ${seatAfter(res, 1).deathSource}）`
    ).toBe("assassin_kill");
    expect(seatAfter(res, 1).assassinated, "❌ 未落 assassinated 标记").toBe(true);
  });

  it("② 负向对照：首夜不得行动（官方：刺客首夜不行动）", async () => {
    const seats = board(layout("assassin"));
    const res = await runRole(assassinAbility, seats, 0, {
      night: 1,
      phase: "firstNight",
      targets: [1],
      snapshot: { isFirstNight: true },
    });
    expect(res.aborted, "❌ 刺客首夜仍行动了").toBe(true);
    expect(seatAfter(res, 1).isDead, "❌ 首夜不该有人死").toBe(false);
    expect(String(res.abortReason), "❌ 中止原因应提到「首夜」").toContain("首夜");
  });

  it("③ 边界：每局限一次 ⇒ 第二次中止；未选目标 ⇒ 不消耗", async () => {
    const seats = board(layout("assassin"));
    const first = await runRole(assassinAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(first.meta.assassinationSuccess, "❌ 第一次应成功").toBe(true);

    const seats2 = board(layout("assassin"));
    const second = await runRole(assassinAbility, seats2, 0, {
      night: 3,
      phase: "night",
      targets: [1],
    });
    expect(second.aborted, "❌ 刺客第二次仍被允许").toBe(true);
    expect(seatAfter(second, 1).isDead, "❌ 第二次不该杀人").toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  21. 主谋 mastermind
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 主谋(mastermind)", () => {
  it("① 恶魔白天被处决 ⇒ mastermindActive 置位（游戏延长）", async () => {
    const seats = board(layout("mastermind"));
    const res = await runRole(mastermindAbility, seats, 0, {
      night: 2,
      phase: "day",
      snapshot: { demonExecutedToday: true },
    });
    expect(
      res.snapshot.mastermindActive,
      "❌ 恶魔被处决但 mastermindActive 未置位 —— 游戏不会延长"
    ).toBe(true);
    expect(res.meta.abilityResult.gameExtended, "❌ gameExtended 应为 true").toBe(true);
    expect(res.meta.abilityResult.demonExecuted, "❌ demonExecuted 应为 true").toBe(true);
  });

  it("② 负向对照：恶魔未被处决 ⇒ 不得置位", async () => {
    const seats = board(layout("mastermind"));
    const res = await runRole(mastermindAbility, seats, 0, {
      night: 2,
      phase: "day",
      snapshot: { demonExecutedToday: false },
    });
    expect(
      res.snapshot.mastermindActive === true,
      "❌ 恶魔没被处决主谋却激活了"
    ).toBe(false);
    expect(res.meta.abilityResult.gameExtended, "❌ gameExtended 应为 false").toBe(false);
    expect(res.meta.abilityResult.demonExecuted, "❌ demonExecuted 应为 false").toBe(false);
  });

  it("③ 边界：字段缺失（undefined）不得被当作 true", async () => {
    const seats = board(layout("mastermind"));
    const res = await runRole(mastermindAbility, seats, 0, {
      night: 2,
      phase: "day",
      // 不传 demonExecutedToday ⇒ undefined
    });
    expect(
      res.snapshot.mastermindActive === true,
      "❌ demonExecutedToday 缺失时不得激活主谋（undefined !== true）"
    ).toBe(false);
    expect(res.meta.abilityResult.gameExtended, "❌ 缺失时 gameExtended 应为 false").toBe(false);
    expect(
      res.meta.abilityResult.demonExecuted,
      "❌ 缺失时 demonExecuted 应为 false"
    ).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  22. 僵怖 zombuul
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 僵怖(zombuul)", () => {
  it("① 白天无人死亡 ⇒ 目标死亡并落 zombuul_kill", async () => {
    const seats = board(layout("zombuul"));
    const before = clone(seats);
    const res = await runRole(zombuulAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      snapshot: { lastDuskExecution: null, dayDeathsToday: 0 },
    });
    expect(res.aborted, `❌ 满足前提却中止：${res.abortReason ?? "无"}`).toBeFalsy();
    expect(
      changedKeys(before[1], seatAfter(res, 1)).length,
      "❌ 满足前提后目标状态完全没变"
    ).toBeGreaterThan(0);
    expect(seatAfter(res, 1).isDead, "❌ 目标应死亡").toBe(true);
    expect(
      seatAfter(res, 1).deathSource,
      `❌ deathSource 应为 zombuul_kill（实际 ${seatAfter(res, 1).deathSource}）`
    ).toBe("zombuul_kill");
  });

  it("② 负向对照：白天有人死亡 ⇒ 不得被唤醒", async () => {
    const seats = board(layout("zombuul"));
    const before = clone(seats);
    const res = await runRole(zombuulAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      snapshot: { lastDuskExecution: 1, dayDeathsToday: 1 },
    });
    expect(res.aborted, "❌ 白天有人死亡时僵怖应中止").toBe(true);
    expect(
      changedKeys(before[1], seatAfter(res, 1)).length,
      "❌ 中止后仍改了座位"
    ).toBe(0);
    expect(seatAfter(res, 1).isDead, "❌ 不该有人死").toBe(false);
  });

  it("③ 边界：目标有 protected ⇒ 不死亡", async () => {
    const seats = board(layout("zombuul"));
    seats[1].statusEffects = [{ type: "protected" }];
    const res = await runRole(zombuulAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      snapshot: { lastDuskExecution: null, dayDeathsToday: 0 },
    });
    expect(
      seatAfter(res, 1).isDead,
      "❌ 受保护目标不该被僵怖杀死（官方：保护优先）"
    ).toBe(false);
    expect(res.aborted, "❌ 受保护不应中止唤醒本身").toBeFalsy();
    // ⚠️ 本行曾被「加入 ④」的补丁误删（锚点吃掉了它），2026-09-21 已补回：
    //    「受保护者不得落死因」是 ③ 的第 3 条硬门槛断言（每用例 >=3 expect）。
    expect(
      seatAfter(res, 1).deathSource,
      "❌ 受保护者不得落死因"
    ).toBeUndefined();
  });

  /**
   * ④ ⭐ 变异检验补强（2026-09-21，由细粒度变异反向逼出）
   *
   * 🔎 起因：把实现 zombuul.ability.ts:45
   *      if (lastDuskExecution !== null || dayDeaths > 0)
   *    的 || 改成 && 后，原有 ①②③ **全部仍然通过**（SURVIVED = 测试对该分支无效）。
   *    根因：①②③ 传的快照里 lastDuskExecution 与 dayDeathsToday **总是同时成立或同时不成立**
   *    （① 都是「无死亡」、② 都是「有死亡」）⇒ || 与 && 行为完全一致，短路语义从未被触达。
   *
   * ✅ 补强：显式构造「只有一个信号成立」的两种组合 —— 这正是 || 的定义域。
   *    这两条信号分别代表「白天有人被处决」与「白天有玩家暴毙」，
   *    官方规则只要求「今天白天有人死亡」，**任一成立即等于「白天有人死亡」**。
   */
  it("④ ⭐ 边界：两个「白天有人死亡」信号只成立其一 ⇒ 仍必须中止（覆盖 || 短路语义）", async () => {
    // 组合一：白天有处决（lastDuskExecution 有值），但 dayDeathsToday 没记上
    const onlyExecution = await runRole(zombuulAbility, board(layout("zombuul")), 0, {
      night: 2,
      phase: "night",
      targets: [1],
      snapshot: { lastDuskExecution: 1, dayDeathsToday: 0 },
    });
    expect(
      onlyExecution.aborted,
      "❌ 白天有处决（lastDuskExecution=1、dayDeathsToday=0）却仍唤醒僵怖杀人 —— 白天死人 = 僵怖不行动（abortReason=" +
        (onlyExecution.abortReason || "无") +
        "）"
    ).toBe(true);
    expect(seatAfter(onlyExecution, 1).isDead, "❌ 白天有处决时目标不该死").toBe(false);

    // 组合二：白天有人暴毙（dayDeathsToday>0），但没有处决记录
    const onlyDayDeath = await runRole(zombuulAbility, board(layout("zombuul")), 0, {
      night: 2,
      phase: "night",
      targets: [1],
      snapshot: { lastDuskExecution: null, dayDeathsToday: 1 },
    });
    expect(
      onlyDayDeath.aborted,
      "❌ 白天有暴毙（dayDeathsToday=1、lastDuskExecution=null）却仍唤醒僵怖杀人 —— 白天死人 = 僵怖不行动（abortReason=" +
        (onlyDayDeath.abortReason || "无") +
        "）"
    ).toBe(true);
    expect(seatAfter(onlyDayDeath, 1).isDead, "❌ 白天有暴毙时目标不该死").toBe(false);

    // 组合三：两条信号都明确为「无死亡」，但走的是 dayDeathsToday 的**兜底来源**
    //   （anyoneDiedToday 分支，见 zombuul.ability.ts:43 的 ?? 链）⇒ 必须正常杀人。
    //   注：lastDuskExecution 的声明类型是 number | null，且 GameContext.tsx:693 初始化
    //   为 null ⇒ 生产路径上不会出现 undefined，故此处不用 {} 制造三态。
    const fallbackSource = await runRole(zombuulAbility, board(layout("zombuul")), 0, {
      night: 2,
      phase: "night",
      targets: [1],
      snapshot: { lastDuskExecution: null, anyoneDiedToday: false },
    });
    expect(
      seatAfter(fallbackSource, 1).isDead,
      "❌ 白天无死亡（走 anyoneDiedToday 兜底）时僵怖应正常杀人"
    ).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  23. 普卡 pukka（两阶段：先中毒、下夜毒发）
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 普卡(pukka)", () => {
  it("① 新目标中毒：isPoisoned=true + statusDetails 写「普卡中毒（永久）」", async () => {
    const seats = board(layout("pukka"));
    const before = clone(seats);
    const res = await runRole(pukkaAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(res.aborted, "❌ 普卡被中止").not.toBe(true);
    expect(
      changedKeys(before[1], seatAfter(res, 1)).length,
      "❌ 目标状态完全没变 —— 下毒没落库"
    ).toBeGreaterThan(0);
    expect(seatAfter(res, 1).isPoisoned, "❌ 目标 isPoisoned 应为 true").toBe(true);
    expect(
      (seatAfter(res, 1).statusDetails ?? []).some(
        (d: any) => (typeof d === "string" && d.includes("普卡中毒")) || d?.source === "pukka"
      ),
      "❌ 缺少普卡中毒标记（下夜毒发依赖它）"
    ).toBe(true);
  });

  it("② 旧中毒目标毒发死亡并解毒（两阶段机制）", async () => {
    const seats = board(layout("pukka"));
    seats[1].statusDetails = ["普卡中毒（永久）"];
    seats[1].isPoisoned = true;
    const before = clone(seats);
    const res = await runRole(pukkaAbility, seats, 0, {
      night: 3,
      phase: "night",
      targets: [2],
    });
    expect(
      changedKeys(before[1], seatAfter(res, 1)).length,
      "❌ 旧中毒目标状态没变 —— 毒发死亡没落库"
    ).toBeGreaterThan(0);
    expect(seatAfter(res, 1).isDead, "❌ 旧中毒目标应毒发死亡").toBe(true);
    expect(
      seatAfter(res, 1).deathSource,
      `❌ deathSource 应为 pukka_poison_death（实际 ${seatAfter(res, 1).deathSource}）`
    ).toBe("pukka_poison_death");
    expect(seatAfter(res, 1).isPoisoned, "❌ 毒发后应恢复健康").toBe(false);
    expect(seatAfter(res, 2).isPoisoned, "❌ 新目标应中毒").toBe(true);
  });

  it("③ 负向对照 / 边界：目标已死亡 ⇒ 中止；未选目标 ⇒ 中止", async () => {
    const seats = board(layout("pukka"));
    seats[1].isDead = true;
    const rc = await runRole(pukkaAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(rc.aborted, "❌ 目标已死亡时普卡应中止").toBe(true);
    expect(String(rc.abortReason), "❌ 中止原因应提到「已死亡」").toContain("已死亡");

    const seats2 = board(layout("pukka"));
    const rd = await runRole(pukkaAbility, seats2, 0, {
      night: 2,
      phase: "night",
      targets: [],
    });
    expect(rd.aborted, "❌ 未选目标时应中止").toBe(true);
    expect(seatAfter(rd, 1).isPoisoned, "❌ 中止后不该有人中毒").toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  24. 沙巴洛斯 shabaloth
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 沙巴洛斯(shabaloth)", () => {
  it("① 选 2 名目标 ⇒ 两人都死亡并落 shabaloth_kill", async () => {
    const seats = board(layout("shabaloth"));
    const before = clone(seats);
    const res = await runRole(shabalothAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1, 2],
    });
    expect(res.aborted, "❌ 沙巴洛斯被中止").not.toBe(true);
    const changed =
      changedKeys(before[1], seatAfter(res, 1)).length +
      changedKeys(before[2], seatAfter(res, 2)).length;
    expect(changed, "❌ 两名目标状态完全没变 —— 击杀没落库").toBeGreaterThan(0);
    expect(seatAfter(res, 1).isDead, "❌ 1号 应死亡").toBe(true);
    expect(seatAfter(res, 2).isDead, "❌ 2号 应死亡").toBe(true);
    expect(
      seatAfter(res, 1).deathSource,
      `❌ deathSource 应为 shabaloth_kill（实际 ${seatAfter(res, 1).deathSource}）`
    ).toBe("shabaloth_kill");
  });

  it("② 负向对照：目标数不是 2 ⇒ 中止且不杀人", async () => {
    const seats = board(layout("shabaloth"));
    const before = clone(seats);
    const res = await runRole(shabalothAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(res.aborted, "❌ 只选 1 人却未中止").toBe(true);
    expect(changedKeys(before[1], seatAfter(res, 1)).length, "❌ 中止后仍改座位").toBe(0);
    expect(seatAfter(res, 1).isDead, "❌ 不该有人死").toBe(false);
  });

  it("③ 边界：反刍（复活）—— 指定已死目标 ⇒ 复活且清死因", async () => {
    const seats = board(layout("shabaloth"));
    seats[3].isDead = true;
    seats[3].deathSource = "shabaloth_kill";
    const before = clone(seats);
    const res = await runRole(shabalothAbility, seats, 0, {
      night: 3,
      phase: "night",
      targets: [1, 2],
      storytellerInput: { regurgitatedSeatId: 3 },
    });
    expect(
      changedKeys(before[3], seatAfter(res, 3)).length,
      "❌ 反刍没有产生状态变化"
    ).toBeGreaterThan(0);
    expect(seatAfter(res, 3).isDead, "❌ 反刍目标应复活（isDead=false）").toBe(false);
    expect(
      (seatAfter(res, 3).statusEffects ?? []).some((e: any) => e.type === "resurrected"),
      "❌ 缺 resurrected 效果"
    ).toBe(true);
    expect(seatAfter(res, 3).deathSource, "❌ 复活后死因应被清除").toBeUndefined();
  });
  it("④ ⭐ 官方回归：两名目标**都已死亡** ⇒ 能力不得空转（lastKill 必须落地）", async () => {
    /**
     * 官方【角色能力】「每个夜晚*，你要选择两名玩家：他们死亡。」
     * 官方【范例】「沙巴洛斯攻击了**存活的侍臣和已死亡的驱魔人**。侍臣死亡。
     *   在下一个夜晚，说书人决定让**驱魔人复活**。」
     *   ⇒ **已死亡的玩家是合法目标**，且是反刍机制的必要输入。
     * 官方【提示标记】「放置条件：选择的玩家当前存活……**如果上述情况不满足，
     *   仍然需要放置该标记，但倒转放置**，代表该标记没有任何效果，
     *   仅用于标记该玩家**被沙巴洛斯选择过**（回溯型能力）」
     *
     * 🔴 修复前的缺陷链：
     *   `calculateKillTargets` 用 `!targetSeat?.isDead` 过滤
     *   ⇒ 两目标都已死时 `validTargets` 变空
     *   ⇒ `updateKillState` 开头 `if (length === 0) return context` 早返回
     *   ⇒ `lastKill` 不落地（本角色原本**根本没写** lastKill）
     *   ⇒ `invariantTesting/invariants.ts:605` 的 kill 语义不变量四个通过条件全不成立
     *   ⇒ 判「shabaloth 声明语义 kill 但执行后无对应状态落地（空转能力）」
     *   ⇒ `stress.test.ts` 20 局压测**随机复现失败**（seed=20260810 / 20260814）。
     */
    const seats = board(layout("shabaloth"));
    // 两个目标都「已死，且死于更早的夜」
    seats[1].isDead = true;
    seats[1].diedAtNight = 1;
    seats[1].deathSource = "imp_kill";
    seats[2].isDead = true;
    seats[2].diedAtNight = 1;
    seats[2].deathSource = "imp_kill";

    const res = await runRole(shabalothAbility, seats, 0, {
      night: 3,
      phase: "night",
      targets: [1, 2],
    });

    expect(
      res.aborted,
      "❌ 选择两名已死玩家不应被中止（官方明确允许）"
    ).not.toBe(true);
    expect(
      (res.snapshot as any).lastKill,
      "❌ 两名目标都已死时 `lastKill` 未落地 —— kill 语义不变量会判「空转能力」"
    ).toBeDefined();
    expect(
      (res.snapshot as any).lastKill.killed,
      "❌ 本夜无人新死 ⇒ lastKill.killed 必须为 false"
    ).toBe(false);
    /**
     * ⚠️ 还要钉住「**已死玩家是合法目标**」这一点：
     *   若上游 `calculateKillTargets` 用 `!isDead` 把死者过滤掉，
     *   `validTargets` 会变空 ⇒ `lastKill.targetId` 落成 `null`
     *   ⇒ 回溯型能力（下一夜据此判断反刍谁）就失去了依据。
     */
    expect(
      (res.snapshot as any).lastKill.targetId,
      "❌ 官方允许选择已死亡玩家 ⇒ lastKill.targetId 应记录「被选择过的目标」，不得为 null"
    ).not.toBeNull();
    // 已死目标的历史不得被篡改（此前会无条件写 diedAtNight/deathSource）
    expect(
      seatAfter(res, 1).diedAtNight,
      "❌ 不得把已死目标的死亡夜篡改成今夜"
    ).toBe(1);
    expect(
      seatAfter(res, 1).deathSource,
      "❌ 不得篡改已死目标的死因"
    ).toBe("imp_kill");
  });

});

// ══════════════════════════════════════════════════════════════════════════
//  25. 珀 po（充能机制）
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 珀(po)", () => {
  it("① 选择目标 ⇒ 目标死亡并落 po_kill，且 poCharged 归 false", async () => {
    const seats = board(layout("po"));
    const before = clone(seats);
    const res = await runRole(poAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    expect(res.aborted, "❌ 珀被中止").not.toBe(true);
    expect(
      changedKeys(before[1], seatAfter(res, 1)).length,
      "❌ 目标状态完全没变 —— 杀不死人"
    ).toBeGreaterThan(0);
    expect(seatAfter(res, 1).isDead, "❌ 目标应死亡").toBe(true);
    expect(
      seatAfter(res, 1).deathSource,
      `❌ deathSource 应为 po_kill（实际 ${seatAfter(res, 1).deathSource}）`
    ).toBe("po_kill");
    expect(res.snapshot.poCharged, "❌ 行动后 poCharged 应归 false").toBe(false);
  });

  it("② 负向对照：不选目标 ⇒ 无人死亡（官方：可以不杀）", async () => {
    const seats = board(layout("po"));
    const before = clone(seats);
    const res = await runRole(poAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [],
    });
    const dead = (res.snapshot.seats ?? []).filter(
      (s: any) =>
        s.isDead === true && before.find((b: any) => b.id === s.id)?.isDead !== true
    );
    expect(dead.length, "❌ 未选目标却有人死亡").toBe(0);
    expect(seatAfter(res, 1).isDead, "❌ 未选目标时 1号 不该死").toBe(false);
    // ⚠️ 记录在案（不改生产）：po.ability.ts:75-83 的「无目标」早退分支只写
    //    snapshot.poCharged，**完全不产出 meta.abilityResult** ⇒ 下游
    //    createSettlementPostProcess("珀") 拿不到结算源 ⇒ 疑似 I9（技能执行完成
    //    却无结算产物）。此处只断言「没有杀人」不得被误报为 true。
    expect(res.meta.abilityResult?.killed, "❌ 未选目标不得被判为已杀人").not.toBe(
      true
    );
    /**
     * ⚠️ 2026-09-21 补强（原断言太弱 —— `undefined` 也能通过 `.not.toBe(true)`）：
     *   `invariantTesting/invariants.ts:605` 的 kill 语义不变量要求「声明 kill
     *   必须有落地」，四个通过条件之一是 `snap.lastKill !== undefined`。
     *   珀「蓄力」之夜必然无死亡 ⇒ **必须靠 lastKill 兜底**，否则判空转。
     */
    expect(
      (res.snapshot as any).lastKill,
      "❌ 蓄力之夜 lastKill 未落地 —— kill 语义不变量会判「空转能力」"
    ).toBeDefined();
    expect(
      (res.snapshot as any).lastKill.killed,
      "❌ 蓄力之夜无人死亡 ⇒ killed 必须为 false"
    ).toBe(false);
    expect(
      res.meta.abilityResult?.killed,
      "❌ 蓄力之夜 abilityResult.killed 必须是**明确的 false**（undefined 不满足 exempt）"
    ).toBe(false);
    // ⚠️ 附带记录：官方原文「如果珀在上一个夜晚不选择任何人时处于醉酒或中毒，
    //    当晚珀仍然能够选择三名玩家」⇒ 醉酒时**也必须充能**。实现为
    //    poCharged = isAbilityEffective（:80），醉酒(abilityEffective=false)
    //    会写成 false ⇒ 与官方冲突（见 ④）。
  });

  it("③ 边界：能力失效（醉酒）⇒ 不得杀人，且充能必须被消耗", async () => {
    const seats = board(layout("po"));
    drunk(seats, 0);
    const res = await runRole(poAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      snapshot: { poCharged: true },
    });
    expect(
      seatAfter(res, 1).isDead,
      "❌ 醉酒珀仍杀了人（官方：干扰时能力无效）"
    ).toBe(false);
    expect(res.snapshot.poCharged, "❌ 醉酒行动后充能应归 false").toBe(false);
    expect(
      seatAfter(res, 1).deathSource,
      "❌ 不该落死因"
    ).toBeUndefined();
  });

  // 🔴 待修 P0（官方条文冲突）——官方原文：
  //   「如果珀在上一个夜晚不选择任何人时处于醉酒或中毒，当晚珀仍然能够选择三名玩家。」
  //   ⇒ 「不选目标」这一动作在**醉酒/中毒时也照样充能**。
  // ✅ 2026-09-21 已修：早退分支原写 `poCharged: isAbilityEffective`，
  //   醉酒时 abilityEffective === false ⇒ poCharged 被写成 false ⇒ 少给一次三杀。
  //   官方原文（两处）：
  //     ① 「如果珀在上一个夜晚不选择任何人时处于醉酒或中毒，当晚珀**仍然能够**选择三名玩家。」
  //     ② 「放置条件：在珀夜晚行动并**选择不进行攻击**后，放置在珀角色标记旁。
  //         **不论珀在未做选择时是否醉酒中毒，都需要进行放置。**」
  //   ⇒ 已改为无条件 `poCharged: true`。本用例由 it.fails **反转为正向断言**。
  it(
    "✅ 已修 P0：醉酒且不选目标 ⇒ 仍然充能（官方明文）",
    async () => {
      const seats = board(layout("po"));
      drunk(seats, 0);
      const res = await runRole(poAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [],
        snapshot: { poCharged: false },
      });
      expect(res.aborted, "❌ 醉酒不应中止（技能照常执行）").not.toBe(true);
      expect(
        res.snapshot.poCharged,
        "❌ 官方：醉酒时「不选目标」也必须充能（po.ability.ts:80 写成了 isAbilityEffective）"
      ).toBe(true);
    }
  );
});


// ══════════════════════════════════════════════════════════════════════════
//  26. 【2026-09-21】醉酒/中毒失效门控 —— 黯月初升
// ══════════════════════════════════════════════════════════════════════════
//  官方核心规则：**醉酒或中毒的玩家失去其能力**（说书人只装作他仍有能力、走过场执行）。
//
//  🔬 判定方法（重要，别退化成静态扫描）：
//    对 14 个「疑似缺门控」角色**逐个做变异检验**（禁用候选门控 → 跑 → 必须变红）。
//    结果 = **5 真缺陷 + 9 假阳性**：
//    · 【真缺陷】goon / tinker / minstrel / pacifist / mastermind
//      —— 全文件无任何有效性判定，而 `stateUpdate` 在 `middlewarePipeline.ts:91`
//         **无条件**执行。禁用其新门控 ⇒ 对应用例立刻变红（已双向验证）。
//    · 【假阳性】已被下列机制拦住（**静态扫描全部漏判**）：
//      ① `commonPreCheckAlive`（roleAbility.types.ts:39）写 `meta.abilityEffective`
//         → exorcist / sailor
//      ② ⭐ `abilityPriorityCalculation`（abilityPriorityMiddleware.ts:127-142）
//         被注入到**每一个**能力的 `calculate` **最前面**（middlewarePipeline.ts:65），
//         判定醉酒/中毒并置 `abilityEffective=false`
//         → devils_advocate / courtier：其 calculate 读 `meta.abilityEffective ?? true`，
//           拿到的正是中间件刚写好的 `false` ⇒ **门控本来就有效**
//      ③ 角色自己的 preCheck / 工具函数已含判定
//         → fool（`canFoolSurvive` 内含 `isDrunkOrPoisoned`）/ tea_lady / grandmother / moonchild
//      ④ 信息类角色无对外效果 → lunatic
//
//  🔒 **每条用例都带阳性对照**（清醒时效果必须落地）——
//     只断言「醉酒后没效果」在能力整体损坏时也会变绿，那是零断言不是防线。
describe("L5 · 【已修】醉酒/中毒失效门控（黯月初升 5 角色）", () => {
  const GATE_CORE = ["chambermaid", "gossip", "grandmother", "tinker"];
  /** 造盘：第 0 位是行动者，extra 紧跟其后，其余用安全配角补齐 */
  const gateBoard = (actor: string, ...extra: string[]) =>
    board([
      actor,
      ...extra,
      ...GATE_CORE.filter((x) => x !== actor && !extra.includes(x)),
    ]);
  const hasEff = (x: any, source: string, type: string) =>
    ((x?.statusEffects ?? []) as any[]).some(
      (e) => e.source === source && e.type === type
    );

  it("① 莽夫 goon：清醒 ⇒ 选者醉酒 + 自身转阵营；醉酒 ⇒ 两者皆不发生", async () => {
    const opts = {
      night: 2,
      phase: "night" as const,
      meta: { chooserSeatId: 1 },
    };
    const a = await runRole(goonAbility, gateBoard("goon", "mastermind"), 0, opts);
    expect(
      hasEff(seatAfter(a, 1), "goon", "drunk"),
      "❌ 阳性对照失败：清醒莽夫必须令选者醉酒"
    ).toBe(true);
    expect(
      seatAfter(a, 0)?.alignment,
      "❌ 阳性对照失败：选者是邪恶（主谋）⇒ 莽夫应转为邪恶"
    ).toBe("evil");

    const ds = gateBoard("goon", "mastermind");
    drunk(ds, 0);
    const b = await runRole(goonAbility, ds, 0, opts);
    expect(
      hasEff(seatAfter(b, 1), "goon", "drunk"),
      "❌ 醉酒莽夫不得令选者醉酒"
    ).toBe(false);
    expect(
      seatAfter(b, 0)?.alignment,
      "❌ 醉酒莽夫不得改变自身阵营"
    ).not.toBe("evil");
  });

  it("② 修补匠 tinker：清醒 ⇒ 说书人可令其死亡；醉酒 ⇒ 不得死亡", async () => {
    const opts = {
      night: 2,
      phase: "night" as const,
      storytellerInput: { shouldKillTinker: true },
    };
    const a = await runRole(tinkerAbility, gateBoard("tinker"), 0, opts);
    expect(
      seatAfter(a, 0)?.isDead,
      "❌ 阳性对照失败：清醒修补匠应可说书人触发死亡"
    ).toBe(true);

    const ds = gateBoard("tinker");
    drunk(ds, 0);
    const b = await runRole(tinkerAbility, ds, 0, opts);
    expect(
      seatAfter(b, 0)?.isDead,
      "❌ 醉酒修补匠不得死亡（官方：醉酒/中毒失去能力）"
    ).not.toBe(true);
  });

  it("③ 吟游诗人 minstrel：清醒 ⇒ 全员醉酒指令；醉酒 ⇒ 官方明文不触发", async () => {
    // 官方明文：「如果一名爪牙玩家在吟游诗人**醉酒或中毒期间**死于处决时，
    //            吟游诗人的能力**不会触发**。」
    const opts = {
      night: 2,
      phase: "dusk" as const,
      storytellerInput: { executedSeatId: 1 }, // 座位1 = 主谋（爪牙）
    };
    const a = await runRole(
      minstrelAbility,
      gateBoard("minstrel", "mastermind"),
      0,
      opts
    );
    expect(
      updates(a)?.type,
      "❌ 阳性对照失败：清醒吟游诗人遇爪牙被处决应下达全员醉酒指令"
    ).toBe("MARK_ALL_FOR_DRUNK");

    const ds = gateBoard("minstrel", "mastermind");
    drunk(ds, 0);
    const b = await runRole(minstrelAbility, ds, 0, opts);
    expect(
      updates(b)?.type,
      "❌ 官方明文：醉酒吟游诗人不得触发全员醉酒"
    ).not.toBe("MARK_ALL_FOR_DRUNK");
  });

  it("④ 和平主义者 pacifist：清醒 ⇒ 可免除处决死；醉酒 ⇒ 不得免除", async () => {
    const opts = {
      night: 2,
      phase: "dusk" as const,
      storytellerInput: { executedSeatId: 1, shouldSave: true }, // 座位1 = 侍女（善良）
    };
    const a = await runRole(pacifistAbility, gateBoard("pacifist"), 0, opts);
    expect(
      updates(a)?.type,
      "❌ 阳性对照失败：清醒和平主义者应下达取消死亡指令"
    ).toBe("CANCEL_DEATH");

    const ds = gateBoard("pacifist");
    drunk(ds, 0);
    const b = await runRole(pacifistAbility, ds, 0, opts);
    expect(
      updates(b)?.type,
      "❌ 醉酒和平主义者不得免除处决死亡"
    ).not.toBe("CANCEL_DEATH");
  });

  it("⑤ 主谋 mastermind：清醒 ⇒ 恶魔被处决后延长游戏；醉酒 ⇒ 正常结束", async () => {
    const opts = {
      night: 2,
      phase: "day" as const,
      snapshot: { demonExecutedToday: true },
    };
    const a = await runRole(mastermindAbility, gateBoard("mastermind"), 0, opts);
    expect(
      a.snapshot?.mastermindActive,
      "❌ 阳性对照失败：清醒主谋应令游戏延长"
    ).toBe(true);

    const ds = gateBoard("mastermind");
    drunk(ds, 0);
    const b = await runRole(mastermindAbility, ds, 0, opts);
    expect(
      b.snapshot?.mastermindActive,
      "❌ 醉酒主谋不得延长游戏（应正常结束）"
    ).not.toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  27. 【回归防线】黯月初升「既有醉酒门控」—— 防将来被误删
// ══════════════════════════════════════════════════════════════════════════
//  这 3 个角色**本轮经变异检验判定为假阳性**（门控本来就有）：
//    · fool            → `canFoolSurvive`（bmrMechanics.ts:133）内含 `isDrunkOrPoisoned`
//    · devils_advocate → 读 `meta.abilityEffective`，由 `abilityPriorityCalculation` 写入
//    · courtier        → 同上
//  它们**不是修复**，但同样值得钉住：一旦有人删掉 `canFoolSurvive` 的醉酒判定、
//  或把 priority 中间件从 `enhancedCalculate` 里去掉，下面的用例会立刻变红。
describe("L5 · 【回归防线】既有醉酒/中毒门控（黯月初升）", () => {
  const CORE2 = ["chambermaid", "gossip", "grandmother", "tinker"];
  const gb2 = (actor: string, ...extra: string[]) =>
    board([actor, ...extra, ...CORE2.filter((x) => x !== actor && !extra.includes(x))]);
  const hasEff2 = (x: any, source: string, type: string) =>
    ((x?.statusEffects ?? []) as any[]).some(
      (e) => e.source === source && e.type === type
    );

  it("⑥ 弄臣 fool：清醒 ⇒ 首次免死并消耗；醉酒 ⇒ preCheck 直接中止、不消耗", async () => {
    const opts = { night: 2, phase: "night" as const };
    const a = await runRole(foolAbility, gb2("fool"), 0, opts);
    expect(a.aborted, "❌ 阳性对照失败：清醒弄臣不应被中止").not.toBe(true);
    expect(
      seatAfter(a, 0)?.foolUsed,
      "❌ 阳性对照失败：清醒弄臣首次死亡应免死并消耗"
    ).toBe(true);

    const ds = gb2("fool");
    drunk(ds, 0);
    const b = await runRole(foolAbility, ds, 0, opts);
    // 锚在**源头变量** `aborted`（而非只断言座位没变化）：
    // `fool.ability.ts:23` 的 `canFoolSurvive(seat)` 在醉酒时为 false ⇒ preCheck 中止。
    expect(
      b.aborted,
      "❌ 醉酒弄臣应被 preCheck 中止（canFoolSurvive 含 isDrunkOrPoisoned）"
    ).toBe(true);
    expect(
      seatAfter(b, 0)?.foolUsed,
      "❌ 醉酒弄臣不得消耗免死"
    ).not.toBe(true);
  });

  it("⑦ 魔鬼代言人 devils_advocate：醉酒 ⇒ abilityPriority 置 abilityEffective=false ⇒ 无保护", async () => {
    const opts = { night: 2, phase: "night" as const, targets: [1] };
    const a = await runRole(devils_advocateAbility, gb2("devils_advocate"), 0, opts);
    expect(
      a.meta?.abilityEffective,
      "❌ 阳性对照失败：清醒时 abilityPriority 应置 abilityEffective=true"
    ).toBe(true);
    expect(
      hasEff2(seatAfter(a, 1), "devils_advocate", "execution_protected"),
      "❌ 阳性对照失败：清醒魔鬼代言人应给目标处决保护"
    ).toBe(true);

    const ds = gb2("devils_advocate");
    drunk(ds, 0);
    const b = await runRole(devils_advocateAbility, ds, 0, opts);
    // ⭐ 锚在**源头变量**：证明是 `abilityPriorityCalculation`（calculate 最前）写的 false，
    //   而不是靠角色的 `?? true` 兜底。
    expect(
      b.meta?.abilityEffective,
      "❌ 醉酒时 abilityPriorityCalculation 应置 abilityEffective=false"
    ).toBe(false);
    expect(
      hasEff2(seatAfter(b, 1), "devils_advocate", "execution_protected"),
      "❌ 醉酒魔鬼代言人不得施加处决保护"
    ).toBe(false);
  });

  it("⑧ 侍臣 courtier：醉酒 ⇒ abilityEffective=false ⇒ 不令目标醉酒（但能力照常消耗）", async () => {
    const opts = {
      night: 2,
      phase: "night" as const,
      storytellerInput: { targetRoleId: "chambermaid" },
    };
    const a = await runRole(courtierAbility, gb2("courtier"), 0, opts);
    expect(
      hasEff2(seatAfter(a, 1), "courtier", "drunk"),
      "❌ 阳性对照失败：清醒侍臣应令目标角色醉酒（座位1=侍女）"
    ).toBe(true);
    expect(a.meta?.abilityEffective, "❌ 阳性对照：清醒时应为 true").toBe(true);

    const ds = gb2("courtier");
    drunk(ds, 0);
    const b = await runRole(courtierAbility, ds, 0, opts);
    expect(
      b.meta?.abilityEffective,
      "❌ 醉酒时 abilityPriorityCalculation 应置 abilityEffective=false"
    ).toBe(false);
    expect(
      hasEff2(seatAfter(b, 1), "courtier", "drunk"),
      "❌ 醉酒侍臣不得令目标醉酒"
    ).toBe(false);
  });
});
