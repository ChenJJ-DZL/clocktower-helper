import { describe, expect, it } from "vitest";
import { board, r, runRole, seat, textOf } from "../_tbHarness";

import { baronAbility } from "../../new_engine/baron.ability";
import { butlerAbility } from "../../new_engine/butler.ability";
import { chefAbility } from "../../new_engine/chef.ability";
import { drunkAbility } from "../../new_engine/drunk.ability";
import { empathAbility } from "../../new_engine/empath.ability";
import { fortuneTellerAbility } from "../../new_engine/fortune_teller.ability";
import { generateFakeRoleName as rkFakeRoleName, ravenkeeperAbility, resolveTargetRole } from "../../new_engine/ravenkeeper.ability";
import { generateFakeRoleName as utFakeRoleName, resolveExecutedRole, undertakerAbility } from "../../new_engine/undertaker.ability";
import { impAbility } from "../../new_engine/imp.ability";
import { investigatorAbility } from "../../new_engine/investigator.ability";
import { librarianAbility } from "../../new_engine/librarian.ability";
import { mayorAbility } from "../../new_engine/mayor.ability";
import { monkAbility } from "../../new_engine/monk.ability";
import { poisonerAbility } from "../../new_engine/poisoner.ability";
import { recluseAbility, resolveRecluseRegistration } from "../../new_engine/recluse.ability";
import { saintAbility } from "../../new_engine/saint.ability";
import { scarletWomanAbility } from "../../new_engine/scarlet_woman.ability";
import { slayerAbility } from "../../new_engine/slayer.ability";
import { soldierAbility } from "../../new_engine/soldier.ability";
import { spyAbility } from "../../new_engine/spy.ability";
import { virginAbility } from "../../new_engine/virgin.ability";
import { washerwomanAbility } from "../../new_engine/washerwoman.ability";

import { createDeterministicRandom } from "../../core/deterministicRandom";
import { isImmuneToDemonKill } from "../../../utils/soldierImmunity";

/**
 * L5 · 暗流涌动（Trouble Brewing）22 角色**因果链**层
 * ==================================================================
 * 只回答一个问题：**「这个能力跑完之后，世界（或说书人收到的指令）真的变了吗？」**
 *
 * 🔒 判据设计
 *   · 差分：深拷贝 `before` → 跑管道 → 比对 `after`，要求语义字段真的变化；
 *     纯信息类改为断言「**信息的事实正确性**」+「改变配置 ⇒ 结果必须变」。
 *   · 特征字段：如 `deathSource === "imp_kill"`、`deathSource === "suicide"`、
 *     `protected.source === "monk"`、`poisoned.source === "poisoner"`。
 *   · 每角色 ≥1 条负向对照（详见各 §负向对照 用例）。
 *
 * 🔒 靶子安全：一律用 `chambermaid` / `gossip` / `tinker`（纯信息/无免疫）。
 *   绝不使用 sailor / fool / tea_lady / pacifist / innkeeper / goon / moonchild。
 *
 * 🔒 前提齐备：`runRole` 默认 snapshot 只有
 *   nightCount / gamePhase / seats / statusEffects / statusEffectMap /
 *   isVortoxWorld / reminders / log —— 其余字段默认 undefined。
 *   本文件凡涉及 `todayExecutedId` / `setupConfig` / `isMayorDying` /
 *   `killerRoleId` / `nominatorId` / `chooserSeatId` 均在 opts 里显式传。
 *
 * ⚠️ 只加测试不改生产：发现的疑虑只写报告。
 */

const seatAfter = (res: any, id: number): any =>
  (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);

const SEMANTIC_KEYS = [
  "isDead",
  "markedForDeath",
  "diedAtNight",
  "deathSource",
  "deathSourceSeatId",
  "deathReason",
  "statusEffects",
  "isPoisoned",
  "isDrunk",
  "role",
  "masterId",
  "fakeRole",
  "executedToday",
  "substitutedForMayor",
  "protectedByTeaLady",
] as const;

function changedKeys(beforeSeat: any, afterSeat: any): string[] {
  return SEMANTIC_KEYS.filter(
    (k) => JSON.stringify(beforeSeat?.[k]) !== JSON.stringify(afterSeat?.[k])
  );
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const effectsOf = (res: any, id: number): any[] =>
  (seatAfter(res, id)?.statusEffects ?? []) as any[];

// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 暗流涌动 · 22 角色因果链", () => {
  // ────────────────────────────────────────────────────────────────────────
  describe("① 洗衣妇(washerwoman)：首夜信息的**事实正确性**", () => {
    const LAYOUT = ["washerwoman", "chef", "baron", "imp", "chambermaid"];

    it("⭐⭐ 告知的角色名，必须真的由两名候选之一持有（不是凭空捏造）", async () => {
      const seats = board(LAYOUT);
      const res = await runRole(washerwomanAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { nightCount: 1 },
      });
      const info = res.meta.abilityResult;
      expect(res.meta.isCorrupted, "（前置）首夜清醒时不得受干扰").toBe(false);
      expect(info.roleName, "❌ 洗衣妇未产出角色名").toBeTruthy();

      const holder = seatAfter(res, info.seat1)?.role?.name === info.roleName
        ? info.seat1
        : seatAfter(res, info.seat2)?.role?.name === info.roleName
          ? info.seat2
          : -1;
      expect(
        holder,
        `❌ 洗衣妇告知「${info.roleName}」，但 ${info.seat1 + 1}号/${info.seat2 + 1}号 都不是该角色 —— 信息凭空捏造`
      ).not.toBe(-1);
      expect(info.seat1, "❌ 两个候选必须是不同玩家").not.toBe(info.seat2);
      expect(
        (res.snapshot as any)._abilityResults?.washerwoman?.roleName,
        "❌ 洗衣妇信息未落库到 snapshot._abilityResults"
      ).toBe(info.roleName);
    });

    it("⭐ 改变配置 ⇒ 结果必须变（换掉唯一镇民，roleName 必须跟着换）", async () => {
      const a = board(["washerwoman", "chef", "baron", "imp", "chambermaid"]);
      const ra = await runRole(washerwomanAbility, a, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { nightCount: 1 },
      });
      const b = board(["washerwoman", "empath", "baron", "imp", "chambermaid"]);
      const rb = await runRole(washerwomanAbility, b, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { nightCount: 1 },
      });
      expect(ra.meta.abilityResult.roleName).toBe(r("chef").name);
      expect(rb.meta.abilityResult.roleName).toBe(r("empath").name);
      expect(
        ra.meta.abilityResult.roleName !== rb.meta.abilityResult.roleName,
        "❌ 换掉镇民后洗衣妇告知的角色名竟未变化 —— 说明它没在读场上配置"
      ).toBe(true);
    });

    it("⭐ 负向对照：非首夜 → 管道中止且不留任何信息", async () => {
      const seats = board(LAYOUT);
      const res = await runRole(washerwomanAbility, seats, 0, {
        night: 3,
        phase: "night",
        snapshot: { nightCount: 3 },
      });
      expect(res.aborted, "❌ 洗衣妇非首夜必须中止").toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect((res.snapshot as any)._abilityResults?.washerwoman).toBeUndefined();
    });

    it("⭐ 中毒 → isCorrupted 落库且采用说书人给的假角色名", async () => {
      const seats = board(LAYOUT).map((s) =>
        s.id === 0 ? { ...s, statusEffects: [{ type: "poisoned" }] } : s
      );
      const res = await runRole(washerwomanAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { nightCount: 1 },
        storytellerInput: { fakeResult: { seat1: 1, seat2: 2, roleName: "占卜师" } },
      });
      expect(res.meta.isCorrupted).toBe(true);
      expect(res.meta.abilityResult.roleName).toBe("占卜师");
      // 干扰标记落在 `meta.washerwomanResult`（stateUpdate 的 persistedRecord，见
      // washerwoman.ability.ts:434-440）；`_abilityResults.washerwoman` 存的是裸信息对象。
      expect(
        res.meta.washerwomanResult?.isCorrupted,
        "❌ 受干扰标记未随之落库到 meta.washerwomanResult"
      ).toBe(true);
      expect(res.actionNode.meta.washerwomanResult?.isCorrupted).toBe(true);
      expect(
        (res.snapshot as any)._abilityResults?.washerwoman?.roleName,
        "❌ 洗衣妇信息未落库到 snapshot._abilityResults"
      ).toBe("占卜师");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("② 图书管理员(librarian)：外来者信息事实正确性", () => {
    it("⭐⭐ 场上有外来者 → 两名候选之一必须真的是该外来者", async () => {
      const seats = board(["librarian", "butler", "chef", "baron", "imp", "chambermaid"]);
      const res = await runRole(librarianAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { nightCount: 1 },
      });
      const info = res.meta.abilityResult;
      expect(info.roleName, "❌ 场上确有外来者却没给出角色名").toBeTruthy();
      expect(info.roleName, "❌ 外来者角色名不对").toBe(r("butler").name);
      const ids = [info.seat1, info.seat2];
      expect(
        ids.includes(1),
        `❌ 告知「${info.roleName}」但候选 ${ids.map((i) => i + 1).join("/")} 号里没有真正的持有者 2号`
      ).toBe(true);
    });

    it("⭐ 改变配置 ⇒ 结果必须变：场上无外来者 → 必须给出「0」（空角色名）", async () => {
      const seats = board(["librarian", "chef", "empath", "monk", "imp", "baron"]);
      const res = await runRole(librarianAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { nightCount: 1 },
      });
      const info = res.meta.abilityResult;
      expect(info.roleName, "❌ 无外来者时应以空角色名表达「0」").toBe("");
      expect(info.seat1).toBe(-1);
      expect(info.seat2).toBe(-1);
      // hasOutsider 属于 persistedRecord（librarian.ability.ts:425），
      // 不在 `_abilityResults.librarian`（那里存裸信息）。
      expect(
        res.meta.librarianResult?.hasOutsider,
        "❌ 场上无外来者的标记未落库到 meta.librarianResult"
      ).toBe(false);
    });

    it("⭐ 负向对照：中毒 + 场上有外来者 → 假信息不得等于真信息", async () => {
      const seats = board(["librarian", "butler", "chef", "baron", "imp", "chambermaid"]).map(
        (s) => (s.id === 0 ? { ...s, statusEffects: [{ type: "poisoned" }] } : s)
      );
      const res = await runRole(librarianAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { nightCount: 1 },
        storytellerInput: { fakeResult: { seat1: 2, seat2: 4, roleName: "圣徒" } },
      });
      expect(res.meta.isCorrupted).toBe(true);
      expect(res.meta.abilityResult.roleName).toBe("圣徒");
      expect(res.meta.abilityResult.roleName).not.toBe(r("butler").name);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("③ 调查员(investigator)：爪牙信息事实正确性", () => {
    it("⭐⭐ 场上有爪牙 → 两名候选之一必须真的是该爪牙", async () => {
      const seats = board(["investigator", "chef", "baron", "imp", "chambermaid"]);
      const res = await runRole(investigatorAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { nightCount: 1 },
      });
      const info = res.meta.abilityResult;
      expect(info.roleName).toBe(r("baron").name);
      expect([info.seat1, info.seat2].includes(2)).toBe(true);
      expect(res.meta.isCorrupted).toBe(false);
    });

    it("⭐ 改变配置 ⇒ 结果必须变：无爪牙在场（男爵死去）→ 不得给出爪牙角色名", async () => {
      const seats = board(["investigator", "chef", "baron", "imp", "chambermaid"]);
      seats[2].isDead = true;
      const res = await runRole(investigatorAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { nightCount: 1 },
      });
      expect(
        res.meta.abilityResult.roleName,
        "❌ 爪牙已死亡（离场）时不应给出爪牙角色名"
      ).toBe("");
      expect(res.meta.abilityResult.seat1).toBe(-1);
      expect(res.meta.abilityResult.seat2).toBe(-1);
    });

    it("⭐ 负向对照：非首夜 → 中止且无信息", async () => {
      const seats = board(["investigator", "chef", "baron", "imp", "chambermaid"]);
      const res = await runRole(investigatorAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2 },
      });
      expect(res.aborted).toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect((res.snapshot as any)._abilityResults?.investigator).toBeUndefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("④ 厨师(chef)：相邻邪恶对数的事实正确性", () => {
    it("⭐⭐ 相邻的邪恶座位数必须与棋盘一致", async () => {
      const seats = board(["chef", "baron", "imp", "chambermaid", "gossip"]);
      const res = await runRole(chefAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { nightCount: 1 },
      });
      expect(
        res.meta.abilityResult,
        "❌ 1号男爵与2号小恶魔相邻，应恰好 1 对"
      ).toBe(1);
      expect(res.meta.abilityResultTrue, "❌ 真值未同步").toBe(1);
      expect((res.snapshot as any)._abilityResults?.chef).toBe(1);
    });

    it("⭐ 改变配置 ⇒ 结果必须变：邪恶不相邻 → 必须为 0", async () => {
      const seats = board(["chef", "chambermaid", "gossip", "tinker", "imp"]);
      const res = await runRole(chefAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { nightCount: 1 },
      });
      expect(
        res.meta.abilityResult,
        "❌ 唯二的邪恶只有 5号小恶魔一个（无相邻邪恶），应为 0"
      ).toBe(0);
      expect(res.meta.abilityResultTrue).toBe(0);
      expect(res.meta.isCorrupted).toBe(false);
      expect((res.snapshot as any)._abilityResults?.chef).toBe(0);
      expect(res.actionNode.meta.chefResult?.evilPairCount).toBe(0);
      expect(res.actionNode.meta.chefResult?.isCorrupted).toBe(false);
    });

    it("⭐ 负向对照：中毒 → 告知值必须与真值不同（abilityResultTrue 仍保留真值）", async () => {
      const seats = board(["chef", "baron", "imp", "chambermaid", "gossip"]).map(
        (s) => (s.id === 0 ? { ...s, isDrunk: true } : s)
      );
      const res = await runRole(chefAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { nightCount: 1 },
      });
      expect(res.meta.isCorrupted).toBe(true);
      expect(res.meta.abilityResultTrue, "❌ 真值必须仍然是 1").toBe(1);
      expect(
        res.meta.abilityResult,
        "❌ 中毒时告知的假数字不得等于真值（否则等于泄漏真值）"
      ).not.toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("⑤ 共情者(empath)：存活邻座邪恶数的**事实正确性**", () => {
    it("⭐⭐ 两侧邻座均为邪恶 → 必须报 2", async () => {
      const seats = board(["empath", "imp", "chambermaid", "gossip", "baron"]);
      const res = await runRole(empathAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2 },
      });
      expect(res.meta.abilityResult, "❌ 1号小恶魔 + 5号男爵均在邻座，应为 2").toBe(2);
      expect(res.meta.isCorrupted).toBe(false);
      expect((res.snapshot as any)._abilityResults?.empath).toBe(2);
    });

    it("⭐ 官方「存活」邻座：死亡邻座必须被跳过（取更远的存活者）", async () => {
      const seats = board(["empath", "imp", "chambermaid", "gossip", "baron"]);
      seats[1].isDead = true; // 右侧邻座（小恶魔）已死
      const res = await runRole(empathAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2 },
      });
      expect(
        res.meta.abilityResult,
        "❌ 死亡的小恶魔不应计入；新的右邻 3号侍女善良、左邻 5号男爵邪恶 ⇒ 应为 1"
      ).toBe(1);
      expect(res.meta.isCorrupted).toBe(false);
      expect((res.snapshot as any)._abilityResults?.empath).toBe(1);
      expect(res.actionNode.meta.empathResult?.evilNeighborCount).toBe(1);
    });

    it("⭐ 负向对照：两侧均为善良 → 必须报 0", async () => {
      const seats = board(["empath", "chambermaid", "gossip", "imp", "tinker"]);
      const res = await runRole(empathAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2 },
      });
      expect(res.meta.abilityResult, "❌ 两邻座均善良应为 0").toBe(0);
      expect(res.meta.abilityResult).not.toBe(2);
      expect(res.meta.isCorrupted).toBe(false);
      expect((res.snapshot as any)._abilityResults?.empath).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("⑥ 占卜师(fortune_teller)：有/无恶魔的判定正确性", () => {
    it("⭐⭐ 目标含恶魔 → 结果必须为 true", async () => {
      const seats = board(["fortune_teller", "chambermaid", "imp", "gossip", "tinker"]);
      const res = await runRole(fortuneTellerAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2 },
        targets: [1, 2],
      });
      expect(res.meta.abilityResult, "❌ 2号是小恶魔，结果必须为 true").toBe(true);
      expect(res.meta.selectedTargets).toEqual([1, 2]);
      expect((res.snapshot as any)._abilityResults?.fortune_teller?.result).toBe(true);
    });

    it("⭐ 负向对照：两名善良 → 必须为 false", async () => {
      const seats = board(["fortune_teller", "chambermaid", "gossip", "imp", "tinker"]);
      const res = await runRole(fortuneTellerAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2 },
        targets: [1, 2],
      });
      expect(res.meta.abilityResult, "❌ 1/2 号都不是恶魔，必须为 false").toBe(false);
      expect(res.meta.isCorrupted).toBe(false);
      expect((res.snapshot as any)._abilityResults?.fortune_teller?.result).toBe(false);
      expect(res.actionNode.meta.fortuneTellerResult?.result).toBe(false);
    });

    it("⭐ 中毒 → 告知结果必须与真实相反（100% 错误信息）", async () => {
      const seats = board(["fortune_teller", "chambermaid", "imp", "gossip", "tinker"]).map(
        (s) => (s.id === 0 ? { ...s, statusEffects: [{ type: "poisoned" }] } : s)
      );
      const res = await runRole(fortuneTellerAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2 },
        targets: [1, 2],
      });
      expect(res.meta.isCorrupted).toBe(true);
      expect(
        res.meta.abilityResult,
        "❌ 真值为 true（含小恶魔），中毒必须给相反的 false"
      ).toBe(false);
      expect(res.actionNode.meta.fortuneTellerResult?.isCorrupted).toBe(true);
      expect(res.actionNode.meta.fortuneTellerResult?.selectedTargets).toEqual([1, 2]);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("⑦ 送葬者(undertaker)：被处决者角色的事实正确性", () => {
    const layout = () => board(["undertaker", "chef", "baron", "imp", "gossip"]);

    it("⭐⭐ 今日有人被处决 → 必须给出该玩家的真实角色名", async () => {
      const seats = layout();
      seats[1].executedToday = true;
      const res = await runRole(undertakerAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2, todayExecutedId: 1 },
      });
      // abilityResult 是 `{ executedSeatId, roleName }` 对象（undertaker.ability.ts:398-401）
      expect(res.meta.abilityResult?.roleName, "❌ 送葬者得知的角色名不对").toBe(
        r("chef").name
      );
      expect(res.meta.abilityResult?.executedSeatId).toBe(1);
      expect(res.meta.undertakerResult?.roleName).toBe(r("chef").name);
      expect((res.snapshot as any)._abilityResults?.undertaker).toBeTruthy();
    });

    it("⭐ 负向对照：今日无人被处决 → 中止且无信息", async () => {
      const seats = layout();
      const res = await runRole(undertakerAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2 },
      });
      expect(res.aborted, "❌ 今日无人被处决时必须中止").toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect(res.meta.undertakerResult).toBeUndefined();
      expect(res.actionNode.meta.undertakerResult).toBeUndefined();
      expect((res.snapshot as any)._abilityResults?.undertaker).toBeUndefined();
    });

    it("⭐ 纯判据：酒鬼被处决时得知「酒鬼」真身；假信息永不等于真身", () => {
      const seats = board(["undertaker", "drunk", "baron", "imp", "gossip"]);
      seats[1].charadeRole = r("chef");
      expect(
        resolveExecutedRole(seats[1] as any, seats as any),
        "❌ 酒鬼被处决时送葬者必须得知「酒鬼」（官方明文）"
      ).toBe(r("drunk").name);

      const fake = utFakeRoleName(
        1,
        seats as any,
        r("drunk").name,
        createDeterministicRandom("ut")
      );
      expect(fake, "❌ 假角色名不得等于真身").not.toBe(r("drunk").name);
      expect(fake.length).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("⑧ 僧侣(monk)：保护标记真的落到目标身上", () => {
    const layout = () => board(["monk", "chambermaid", "gossip", "imp", "tinker"]);

    it("⭐⭐ 选中目标 → protected 效果带 source=monk 与到期夜落库", async () => {
      const seats = layout();
      const before = clone(seats);
      const res = await runRole(monkAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2 },
        targets: [1],
      });
      expect(res.aborted).not.toBe(true);
      expect(changedKeys(before[1], seatAfter(res, 1)).length).toBeGreaterThan(0);
      const prot = effectsOf(res, 1).find(
        (e) => e.type === "protected" && e.source === "monk"
      );
      expect(prot, "❌ 目标身上没有僧侣保护标记").toBeTruthy();
      expect(prot?.expiresAtNight, "❌ 保护到期夜不对").toBe(3);
      expect(res.meta.monkResult.targetId).toBe(1);
    });

    it("⭐ 边界：同一僧侣换目标 → 旧座的保护必须被清除（不叠加）", async () => {
      const seats = layout();
      seats[1].statusEffects = [
        { type: "protected", source: "monk", sourceSeatId: 0, expiresAtNight: 3 },
      ];
      const res = await runRole(monkAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2 },
        targets: [2],
      });
      expect(
        effectsOf(res, 1).some((e) => e.type === "protected"),
        "❌ 旧目标的僧侣保护未被清除（会出现两个 🛡️）"
      ).toBe(false);
      expect(effectsOf(res, 2).some((e) => e.type === "protected")).toBe(true);
      expect(res.meta.monkResult?.targetId).toBe(2);
      // 全盘只允许存在一份 monk 保护
      expect(
        (res.snapshot.seats as any[]).filter((s) =>
          (s.statusEffects ?? []).some(
            (e: any) => e.type === "protected" && e.source === "monk"
          )
        ).length,
        "❌ 僧侣保护标记出现了多份（叠加）"
      ).toBe(1);
    });

    it("⭐ 负向对照：醉酒 → 选择仍记录但**不放置**保护标记", async () => {
      const seats = layout().map((s) =>
        s.id === 0 ? { ...s, statusEffects: [{ type: "drunk" }] } : s
      );
      const res = await runRole(monkAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2 },
        targets: [1],
      });
      expect(
        effectsOf(res, 1).some((e) => e.type === "protected"),
        "❌ 醉酒僧侣不得放置保护标记（官方：不放置该标记）"
      ).toBe(false);
      expect(res.meta.monkResult.targetId, "❌ 选择仍须被记录").toBe(1);
      expect(res.meta.monkResult.isProtected).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("⑨ 守鸦人(ravenkeeper)：夜间死亡才触发 + 得知真实角色", () => {
    const deadLayout = () =>
      board(["ravenkeeper", "chambermaid", "chef", "imp"]).map((s) =>
        s.id === 0 ? { ...s, diedAtNight: 3 } : s
      );

    it("⭐⭐ 今夜死亡 → 得知目标的真实角色名", async () => {
      const res = await runRole(ravenkeeperAbility, deadLayout(), 0, {
        night: 3,
        phase: "night",
        snapshot: { nightCount: 3 },
        targets: [1],
      });
      expect(res.aborted, "❌ 今夜死亡的守鸦人必须被唤醒").toBeFalsy();
      expect(res.meta.abilityResult.roleName).toBe(r("chambermaid").name);
      expect(res.meta.abilityResult.targetId).toBe(1);
      expect((res.snapshot as any)._abilityResults?.ravenkeeper).toBeTruthy();
    });

    it("⭐ 边界：markedForDeath=true 也算「今夜死亡」（不等 diedAtNight 落库）", async () => {
      const seats = board(["ravenkeeper", "chambermaid", "chef", "imp"]).map((s) =>
        s.id === 0 ? { ...s, markedForDeath: true } : s
      );
      const res = await runRole(ravenkeeperAbility, seats, 0, {
        night: 3,
        phase: "night",
        snapshot: { nightCount: 3 },
        targets: [1],
      });
      expect(res.aborted).toBeFalsy();
      expect(res.meta.abilityResult.roleName).toBe(r("chambermaid").name);
      expect(res.meta.abilityResult.targetId).toBe(1);
      expect((res.snapshot as any)._abilityResults?.ravenkeeper).toBeTruthy();
    });

    it("⭐ 负向对照：白天死亡（diedAtNight 对不上）→ 中止；纯判据：假名 ≠ 真名", async () => {
      const seats = board(["ravenkeeper", "chambermaid", "chef", "imp"]);
      const res = await runRole(ravenkeeperAbility, seats, 0, {
        night: 3,
        phase: "night",
        snapshot: { nightCount: 3 },
        targets: [1],
      });
      expect(res.aborted, "❌ 白天死亡的守鸦人不得被唤醒").toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();

      const rk = board(["ravenkeeper", "chambermaid", "spy", "recluse", "imp"]);
      const rng = createDeterministicRandom("rk");
      expect(resolveTargetRole(rk[1] as any, rk as any, rng)).toBe(r("chambermaid").name);
      expect(
        rkFakeRoleName(rk as any, r("chambermaid").name, rng),
        "❌ 受干扰时的假角色名不得等于真实角色名"
      ).not.toBe(r("chambermaid").name);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("⑩ 贞洁者(virgin)：提名者是否真的被处决", () => {
    it("⭐⭐ 镇民提名 → 提名者 isDead + executedToday + deathReason 落库", async () => {
      const seats = board(["virgin", "empath", "chef", "baron", "imp"]);
      const before = clone(seats);
      const res = await runRole(virginAbility, seats, 0, {
        phase: "day",
        meta: { nominatorId: 1 },
      });
      expect(changedKeys(before[1], seatAfter(res, 1)).length).toBeGreaterThan(0);
      expect(res.meta.abilityResult.shouldExecute).toBe(true);
      expect(seatAfter(res, 1)?.isDead).toBe(true);
      expect(seatAfter(res, 1)?.executedToday).toBe(true);
      expect(seatAfter(res, 0)?.abilityUsed, "❌ 能力必须被消耗").toBe(true);
    });

    it("⭐ 负向对照：爪牙/恶魔/外来者提名 → 不得处决（但能力照消耗）", async () => {
      for (const rid of ["baron", "imp", "saint", "recluse"]) {
        const seats = board(["virgin", rid, "chef", "monk", "imp"]);
        const res = await runRole(virginAbility, seats, 0, {
          phase: "day",
          meta: { nominatorId: 1 },
        });
        expect(
          seatAfter(res, 1)?.isDead,
          `❌ ${rid} 提名时提名者不得死亡（官方：仅镇民提名才处决）`
        ).toBe(false);
        expect(seatAfter(res, 0)?.abilityUsed).toBe(true);
        expect(
          res.actionNode.meta.virginResult?.shouldExecute,
          `❌ ${rid} 提名竟被登记为「应处决」`
        ).toBe(false);
        expect(seatAfter(res, 1)?.executedToday).not.toBe(true);
      }
    });

    it("⭐ 边界：自己提名自己 / 已被提名过 → 不处决", async () => {
      const self = board(["virgin", "empath", "chef", "baron", "imp"]);
      const rs = await runRole(virginAbility, self, 0, {
        phase: "day",
        meta: { nominatorId: 0 },
      });
      expect(seatAfter(rs, 0)?.isDead).toBe(false);
      expect(seatAfter(rs, 0)?.abilityUsed).toBe(true);

      const used = board(["virgin", "empath", "chef", "baron", "imp"]);
      used[0].abilityUsed = true;
      const ru = await runRole(virginAbility, used, 0, {
        phase: "day",
        meta: { nominatorId: 1 },
      });
      expect(ru.aborted).toBe(true);
      expect(seatAfter(ru, 1)?.isDead).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("⑪ 猎手(slayer)：白天一次性能力是否真的打死恶魔", () => {
    it("⭐⭐ 命中恶魔 → 恶魔死亡 + 游戏结束（善良胜）", async () => {
      const seats = board(["slayer", "chambermaid", "gossip", "imp", "tinker"]);
      const before = clone(seats);
      const res = await runRole(slayerAbility, seats, 0, {
        phase: "day",
        targets: [3],
      });
      expect(changedKeys(before[3], seatAfter(res, 3)).length).toBeGreaterThan(0);
      expect(seatAfter(res, 3)?.isDead).toBe(true);
      expect(seatAfter(res, 3)?.deathReason).toBe("被猎手杀死");
      expect(res.snapshot.gamePhase).toBe("gameOver");
      expect(res.snapshot.gameResult.winner).toBe("good");
    });

    it("⭐ 负向对照：命中非恶魔 → 目标不得死亡且游戏继续", async () => {
      const seats = board(["slayer", "chambermaid", "gossip", "imp", "tinker"]);
      const res = await runRole(slayerAbility, seats, 0, {
        phase: "day",
        targets: [1],
      });
      expect(seatAfter(res, 1)?.isDead).toBe(false);
      expect(res.snapshot.gamePhase).not.toBe("gameOver");
      expect(res.snapshot.gameResult).toBeUndefined();
    });

    it("⭐ 边界：醉酒猎手打中恶魔 → 不杀但**能力仍被消耗**", async () => {
      const seats = board(["slayer", "chambermaid", "gossip", "imp", "tinker"]).map((s) =>
        s.id === 0 ? { ...s, isDrunk: true } : s
      );
      const res = await runRole(slayerAbility, seats, 0, {
        phase: "day",
        targets: [3],
      });
      expect(seatAfter(res, 3)?.isDead, "❌ 醉酒猎手不得击杀恶魔").toBe(false);
      expect(res.snapshot.gamePhase).not.toBe("gameOver");
      expect(seatAfter(res, 0)?.abilityUsed, "❌ 醉酒猎手仍须消耗能力").toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("⑭ 士兵(soldier)：恶魔杀戮免疫", () => {
    it("⭐⭐ 真实因果链：小恶魔夜袭士兵 → 不杀；同一模板把刀指向镇民 → 必杀", async () => {
      // ① 士兵在刀口上
      const withSoldier = board(["imp", "soldier", "gossip", "chef", "baron"]);
      const rA = await runRole(impAbility, withSoldier, 0, {
        night: 2,
        phase: "night",
        targets: [1],
        snapshot: { nightCount: 2 },
      });
      expect(rA.meta.impResult?.killed, "❌ 小恶魔杀死了士兵（免疫未生效）").toBe(false);
      expect(rA.meta.impResult?.log?.blockedBySoldier).toBe(true);
      expect(
        seatAfter(rA, 1)?.markedForDeath,
        "❌ 士兵被打上了死亡标记"
      ).not.toBe(true);
      expect(seatAfter(rA, 1)?.isDead, "❌ 士兵不得死亡").toBe(false);

      // ② 负向对照：换掉被砍的人 → 镇民必须真死（证明上一条不是「小恶魔本来就不会杀人」）
      const withChef = board(["imp", "chef", "gossip", "soldier", "baron"]);
      const rB = await runRole(impAbility, withChef, 0, {
        night: 2,
        phase: "night",
        targets: [1],
        snapshot: { nightCount: 2 },
      });
      expect(rB.meta.impResult?.killed, "❌ 普通镇民竟未被小恶魔杀死").toBe(true);
      expect(seatAfter(rB, 1)?.markedForDeath, "❌ 镇民未落死亡标记").toBe(true);
      expect(seatAfter(rB, 1)?.deathSource, "❌ 死因不是恶魔之刀").toBe("imp_kill");
    });

    it("⭐⭐ 直跑能力管道：恶魔之刀 → 免疫裁决 true + soldierResult 落库", async () => {
      const seats = board(["soldier", "chambermaid", "gossip", "imp", "tinker"]);
      const res = await runRole(soldierAbility, seats, 0, {
        night: 2,
        phase: "night",
        meta: { killerRoleId: "imp" },
      });
      expect(res.aborted, "❌ 存活士兵的管道不得中止").toBe(false);
      expect(res.meta.isDemonKill, "❌ 未识别出「恶魔击杀」").toBe(true);
      expect(res.meta.abilityEffective, "（前置）清醒士兵能力应生效").toBe(true);
      expect(res.meta.abilityResult, "❌ 恶魔击杀下士兵必须免疫").toBe(true);
      expect(res.meta.isCorrupted).toBe(false);
      expect(
        res.actionNode.meta.soldierResult?.isImmune,
        "❌ 免疫结论未落库到 actionNode.meta.soldierResult"
      ).toBe(true);
      expect(res.actionNode.meta.soldierResult?.killerRoleId).toBe("imp");
      expect(res.actionNode.meta.soldierResult?.isImmune).toBe(true);
      expect(res.meta.displayInfo?.type).toBe("soldier_immunity");
      expect(seatAfter(res, 0)?.isDead, "❌ 士兵不得死亡").toBe(false);
    });

    it("⭐ 负向对照：杀手是爪牙（非恶魔）→ 不免疫、不产免疫记录", async () => {
      const seats = board(["soldier", "chambermaid", "gossip", "poisoner", "tinker"]);
      const res = await runRole(soldierAbility, seats, 0, {
        night: 2,
        phase: "night",
        meta: { killerRoleId: "poisoner" },
      });
      expect(res.meta.isDemonKill, "❌ 爪牙之刀不该被判为恶魔击杀").toBe(false);
      expect(res.meta.abilityResult, "❌ 非恶魔击杀不得免疫").toBe(false);
      expect(
        res.actionNode.meta.soldierResult,
        "❌ 未免疫却落库了 soldierResult"
      ).toBeUndefined();
      expect(res.meta.displayInfo).toBeUndefined();
    });

    it("⭐ 边界：醉酒士兵 → 免疫失效", async () => {
      const seats = board(["soldier", "chambermaid", "gossip", "imp", "tinker"]).map((s) =>
        s.id === 0 ? { ...s, statusEffects: [{ type: "drunk" }] } : s
      );
      const res = await runRole(soldierAbility, seats, 0, {
        night: 2,
        phase: "night",
        meta: { killerRoleId: "imp" },
      });
      expect(res.meta.isDemonKill).toBe(true);
      expect(res.meta.abilityEffective, "❌ 醉酒士兵能力应被判失效").toBe(false);
      expect(res.meta.abilityResult, "❌ 醉酒士兵不得免疫").toBe(false);
      expect(res.actionNode.meta.soldierResult).toBeUndefined();
    });

    it("⭐ 生产免疫工具事实核验（与 imp.ability.ts:415 同一函数）", () => {
      const alive = board(["soldier", "chambermaid"])[0];
      expect(isImmuneToDemonKill(alive), "❌ 存活士兵必须免疫恶魔之刀").toBe(true);
      expect(
        isImmuneToDemonKill({ ...alive, isDead: true }),
        "❌ 已死士兵不再免疫"
      ).toBe(false);
      expect(
        isImmuneToDemonKill({ ...alive, statusEffects: [{ type: "poisoned" }] }),
        "❌ 中毒士兵不得免疫"
      ).toBe(false);
      expect(isImmuneToDemonKill(board(["chef"])[0]), "❌ 非士兵不得免疫").toBe(false);
    });

    it("⚠️ 特征化（报告项）：座位已死 → preCheck 直接中止，stateUpdate 的「复活」分支不可达", async () => {
      const seats = board(["soldier", "chambermaid", "gossip", "imp", "tinker"]);
      seats[0] = { ...seats[0], isDead: true, deathReason: "被小恶魔杀死" };
      const res = await runRole(soldierAbility, seats, 0, {
        night: 2,
        phase: "night",
        meta: { killerRoleId: "imp" },
      });
      // 现状：soldier.ability.ts:97-99 在 preCheck 就中止，
      // 因此 soldier.ability.ts:180（把 isDead 改回 false 的「取消死亡」）在管道内不可达。
      // 与生产一致：免疫必须判定在「死亡落库之前」（imp 先查 isImmuneToDemonKill 再杀）。
      expect(res.aborted, "（现状）已死士兵的管道在 preCheck 中止").toBe(true);
      expect(res.meta.abilityResult).toBeUndefined();
      expect(isImmuneToDemonKill(seats[0] as any)).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("⑮ 镇长(mayor)：替死是否真的落地", () => {
    it("⭐⭐ 替死生效 → 镇长复活 + 替死者死亡并带 substitutedForMayor", async () => {
      const seats = board(["mayor", "chambermaid", "gossip", "imp", "tinker"]);
      seats[0] = { ...seats[0], isDead: true, deathReason: "被小恶魔杀死" };
      const res = await runRole(mayorAbility, seats, 0, {
        night: 2,
        phase: "night",
        meta: { isMayorDying: true },
        targets: [1],
      });
      expect(seatAfter(res, 0)?.isDead, "❌ 替死生效后镇长必须存活").toBe(false);
      expect(seatAfter(res, 1)?.isDead, "❌ 替死者必须死亡").toBe(true);
      expect(seatAfter(res, 1)?.substitutedForMayor).toBe(true);
      expect(
        seatAfter(res, 1)?.deathReason,
        "❌ 替死者应继承镇长的死因（官方：死亡原因保持一致）"
      ).toBe("被小恶魔杀死");
    });

    it("⭐ 负向对照：镇长未被攻击 → 中止且不动任何座位", async () => {
      const seats = board(["mayor", "chambermaid", "gossip", "imp", "tinker"]);
      const before = clone(seats);
      const res = await runRole(mayorAbility, seats, 0, {
        night: 2,
        phase: "night",
        targets: [1],
      });
      expect(res.aborted).toBe(true);
      expect(changedKeys(before[1], seatAfter(res, 1))).toEqual([]);
      expect(res.meta.abilityResult).toBeUndefined();
    });

    it("⭐ 边界：醉酒镇长 → 替死失效（镇长保持死亡）", async () => {
      const seats = board(["mayor", "chambermaid", "gossip", "imp", "tinker"]).map((s) =>
        s.id === 0 ? { ...s, isDead: true, isDrunk: true } : s
      );
      const res = await runRole(mayorAbility, seats, 0, {
        night: 2,
        phase: "night",
        meta: { isMayorDying: true },
        targets: [1],
      });
      expect(res.meta.abilityResult.substitutionHappens, "❌ 醉酒镇长不得替死").toBe(false);
      expect(seatAfter(res, 0)?.isDead).toBe(true);
      expect(seatAfter(res, 1)?.isDead).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("⑯ 管家(butler)：主人标记是否真的落库", () => {
    it("⭐⭐ 选主人 → masterId + butler_master 标记 + butlerResult", async () => {
      const seats = board(["butler", "chambermaid", "gossip", "imp", "tinker"]);
      const before = clone(seats);
      const res = await runRole(butlerAbility, seats, 0, { targets: [2] });
      expect(changedKeys(before[0], seatAfter(res, 0)).length).toBeGreaterThan(0);
      expect(seatAfter(res, 0)?.masterId).toBe(2);
      const marker = effectsOf(res, 0).find((e) => e.type === "butler_master");
      expect(marker?.masterId, "❌ butler_master 标记未落库").toBe(2);
      expect(res.meta.butlerResult.masterSet).toBe(true);
    });

    it("⭐ 负向对照：选自己 → 中止且无主人标记", async () => {
      const seats = board(["butler", "chambermaid", "gossip", "imp", "tinker"]);
      const res = await runRole(butlerAbility, seats, 0, { targets: [0] });
      expect(res.aborted).toBe(true);
      expect(seatAfter(res, 0)?.masterId).toBeUndefined();
      expect(res.meta.butlerResult?.masterSet).not.toBe(true);
      expect(
        effectsOf(res, 0).some((e) => e.type === "butler_master"),
        "❌ 选自己竟落下了 butler_master 标记"
      ).toBe(false);
    });

    it("⭐ 边界：醉酒管家 → 选择仍记录，但不得放置主人标记", async () => {
      const seats = board(["butler", "chambermaid", "gossip", "imp", "tinker"]).map((s) =>
        s.id === 0 ? { ...s, statusEffects: [{ type: "drunk" }] } : s
      );
      const res = await runRole(butlerAbility, seats, 0, { targets: [2] });
      expect(seatAfter(res, 0)?.masterId, "❌ 醉酒管家不得放置主人标记").toBeUndefined();
      expect(res.meta.butlerResult.masterSet).toBe(false);
      expect(res.meta.butlerResult.targetId ?? res.meta.abilityResult).toBe(2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("⑰ 酒鬼(drunk)：认知覆盖是否真的落地", () => {
    it("⭐⭐ 首夜 → fakeRole 取自在场镇民 + 永久醉酒效果落库", async () => {
      const seats = board(["drunk", "chambermaid", "gossip", "imp", "tinker"]);
      const before = clone(seats);
      const res = await runRole(drunkAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { nightCount: 1 },
      });
      expect(changedKeys(before[0], seatAfter(res, 0)).length).toBeGreaterThan(0);
      expect(seatAfter(res, 0)?.fakeRole?.type, "❌ fakeRole 必须是镇民").toBe("townsfolk");
      expect(
        effectsOf(res, 0).some((e) => e.type === "drunk" && e.permanent === true),
        "❌ 永久醉酒效果未落库"
      ).toBe(true);
    });

    it("⭐ 前提齐备：说书人指定 fakeRole 时必须以指定值为准", async () => {
      const seats = board(["drunk", "chambermaid", "gossip", "imp", "tinker"]);
      const res = await runRole(drunkAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { nightCount: 1 },
        storytellerInput: { fakeRole: r("mayor") },
      });
      expect(seatAfter(res, 0)?.fakeRole?.id).toBe("mayor");
      expect(res.meta.displayInfo.fakeRoleId).toBe("mayor");
      expect(res.meta.drunkSetupApplied).toBe(true);
    });

    it("⭐ 负向对照：非首夜 → 中止且不改座位", async () => {
      const seats = board(["drunk", "chambermaid", "gossip", "imp", "tinker"]);
      const before = clone(seats);
      const res = await runRole(drunkAbility, seats, 0, {
        night: 3,
        phase: "night",
        snapshot: { nightCount: 3 },
      });
      expect(res.aborted).toBe(true);
      expect(seatAfter(res, 0)?.fakeRole).toBeUndefined();
      expect(changedKeys(before[0], seatAfter(res, 0))).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("⑱ 陌客(recluse)：注册干扰判据", () => {
    it("⭐⭐ 纯判据：默认被登记为邪恶/爪牙（官方：可能被当作邪恶）", () => {
      const reg = resolveRecluseRegistration(3, "k", {});
      expect(reg.registersAsEvil).toBe(true);
      expect(reg.registersAsRoleType).toBe("minion");
      expect(reg.registersAsRoleType, "❌ 默认不得直接登记为恶魔").not.toBe("demon");
      // 同一输入必须始终给同一结论（不得随机翻面）
      expect(resolveRecluseRegistration(3, "k2", {})).toEqual(reg);
      // 缓存：同一 meta 下第二次调用必须复用同一对象
      const meta: any = {};
      expect(resolveRecluseRegistration(3, "k3", meta)).toBe(
        resolveRecluseRegistration(3, "k3", meta)
      );
    });

    it("⭐ 负向对照：说书人显式登记为善良 → 不得再当作邪恶", () => {
      const overrideSeat = {
        id: 3,
        registerAsEvil: false,
        registerAsDemon: false,
      } as any;
      // 对照：同一座位**不带**覆盖时，默认判据给 true —— 证明下面翻的是覆盖，不是参数本身
      expect(resolveRecluseRegistration(3, "k", {}, undefined, undefined).registersAsEvil).toBe(
        true
      );

      const reg = resolveRecluseRegistration(3, "k", {}, undefined, overrideSeat);
      expect(reg.registersAsEvil).toBe(false);
      expect(reg.registersAsRoleType).toBeNull();
    });

    it("⭐ 管道：被动干扰恒激活 + 说书人覆盖优先", async () => {
      const seats = board(["recluse", "chambermaid", "gossip", "imp", "tinker"]);
      const res = await runRole(recluseAbility, seats, 0, {
        night: 2,
        phase: "night",
      });
      expect(res.meta.recluseActive).toBe(true);
      expect((res.snapshot as any)._abilityResults?.recluse?.active).toBe(true);

      const override = {
        registersAsEvil: true,
        registersAsRoleType: "demon" as const,
      };
      const meta: any = {};
      const reg = resolveRecluseRegistration(3, "k", meta, {
        recluseOverride: { 3: override },
      });
      expect(reg.registersAsRoleType).toBe("demon");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("⑲ 圣徒(saint)：被处决 → 游戏结束且邪恶胜", () => {
    it("⭐⭐ executedToday → gamePhase=gameOver + winner=evil + 理由落库", async () => {
      const seats = board(["saint", "chambermaid", "gossip", "imp", "tinker"]);
      seats[0].executedToday = true;
      const res = await runRole(saintAbility, seats, 0, { phase: "day" });
      expect(res.snapshot.gamePhase, "❌ 圣徒被处决必须结束游戏").toBe("gameOver");
      expect(res.snapshot.gameResult?.winner, "❌ 获胜方必须是邪恶").toBe("evil");
      expect(res.snapshot.gameResult?.reason).toContain("圣徒");
      expect(res.meta.gameOverApplied).toBe(true);
    });

    it("⭐ 负向对照：未被处决 → 中止且游戏继续", async () => {
      const seats = board(["saint", "chambermaid", "gossip", "imp", "tinker"]);
      const res = await runRole(saintAbility, seats, 0, { phase: "day" });
      expect(res.aborted).toBe(true);
      expect(res.snapshot.gamePhase).not.toBe("gameOver");
      expect(res.snapshot.gameResult).toBeUndefined();
    });

    it("⭐ 边界：醉酒圣徒被处决 → 仍然触发（官方：角色固有规则）", async () => {
      const seats = board(["saint", "chambermaid", "gossip", "imp", "tinker"]).map((s) =>
        s.id === 0 ? { ...s, executedToday: true, isDrunk: true } : s
      );
      const res = await runRole(saintAbility, seats, 0, { phase: "day" });
      expect(res.snapshot.gamePhase, "❌ 醉酒不影响圣徒诅咒").toBe("gameOver");
      expect(res.snapshot.gameResult?.winner).toBe("evil");
      expect(res.snapshot.gameResult?.reason).toContain("圣徒");
      expect(res.meta.gameOverApplied).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("⑳ 投毒者(poisoner)：中毒标记真的落到目标身上", () => {
    const layout = () => board(["poisoner", "chambermaid", "gossip", "imp", "tinker"]);

    it("⭐⭐ 选中目标 → poisoned 效果带 source=poisoner 与到期夜落库", async () => {
      const seats = layout();
      const before = clone(seats);
      const res = await runRole(poisonerAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2 },
        targets: [1],
      });
      expect(changedKeys(before[1], seatAfter(res, 1)).length).toBeGreaterThan(0);
      const eff = effectsOf(res, 1).find(
        (e) => e.type === "poisoned" && e.source === "poisoner"
      );
      expect(eff, "❌ 目标身上没有投毒者中毒标记").toBeTruthy();
      expect(eff?.expiresAtNight).toBe(3);
      expect(res.meta.poisonerResult.poisoned).toBe(true);
    });

    it("⭐ 负向对照：目标已死亡 → 中止且不下毒", async () => {
      const seats = layout();
      seats[1].isDead = true;
      const res = await runRole(poisonerAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2 },
        targets: [1],
      });
      expect(res.aborted).toBe(true);
      expect(effectsOf(res, 1).some((e) => e.type === "poisoned")).toBe(false);
      expect(res.meta.poisonerResult?.poisoned).not.toBe(true);
      expect(seatAfter(res, 1)?.isDead, "（前置）目标保持死亡").toBe(true);
    });

    it("⭐ 边界：醉酒投毒者 → 选择记录但不下毒", async () => {
      const seats = layout().map((s) =>
        s.id === 0 ? { ...s, statusEffects: [{ type: "drunk" }] } : s
      );
      const res = await runRole(poisonerAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2 },
        targets: [1],
      });
      expect(effectsOf(res, 1).some((e) => e.type === "poisoned")).toBe(false);
      expect(res.meta.poisonerResult.targetId).toBe(1);
      expect(res.meta.poisonerResult.poisoned).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("㉑ 间谍(spy)：魔典内容的事实正确性", () => {
    it("⭐⭐ 魔典逐条列出真实角色与阵营（不是空壳）", async () => {
      const seats = board(["spy", "chambermaid", "baron", "imp", "gossip"]);
      const res = await runRole(spyAbility, seats, 0, { night: 2 });
      const players = res.meta.grimoireData.players as any[];
      expect(players.length).toBe(seats.length);
      const byId = (id: number) => players.find((p) => p.seatId === id);
      expect(byId(3)?.roleName).toBe(r("imp").name);
      expect(byId(3)?.alignment).toBe("evil");
      expect(byId(1)?.alignment).toBe("good");
      expect(
        players.filter((p) => p.alignment === "evil").length,
        "❌ 邪恶人数统计错误（间谍+男爵+小恶魔 = 3）"
      ).toBe(3);
    });

    it("⭐ 官方：间谍死亡仍能查看魔典", async () => {
      const seats = board(["spy", "chambermaid", "baron", "imp", "gossip"]).map((s) =>
        s.id === 0 ? { ...s, isDead: true } : s
      );
      const res = await runRole(spyAbility, seats, 0, { night: 2 });
      expect(res.aborted).toBeFalsy();
      expect(res.meta.grimoireData.players.length).toBe(seats.length);
      expect(seatAfter(res, 0)?.isDead).toBe(true);
    });

    it("⭐ 负向对照：中毒 → grimoireData.isCorrupted 落库", async () => {
      const seats = board(["spy", "chambermaid", "baron", "imp", "gossip"]).map((s) =>
        s.id === 0 ? { ...s, statusEffects: [{ type: "poisoned" }] } : s
      );
      const res = await runRole(spyAbility, seats, 0, { night: 2 });
      expect(res.meta.isCorrupted).toBe(true);
      expect(res.meta.grimoireData.isCorrupted).toBe(true);
      expect(
        (res.snapshot as any)._abilityResults?.spy?.isCorrupted,
        "❌ 受干扰标记未落库到 _abilityResults.spy"
      ).toBe(true);
      expect((res.snapshot as any)._abilityResults?.spy?.lastViewedNight).toBe(2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("㉒ 红唇女郎(scarlet_woman)：继任是否真的改写角色", () => {
    const official = () => [
      seat(0, "imp", { isDead: true }),
      seat(1, "scarlet_woman"),
      seat(2, "baron"),
      seat(3, "empath"),
      seat(4, "chef"),
    ];

    it("⭐⭐ 恶魔死亡且存活足额 → role.id 变为 imp 并清空 abilityUsed", async () => {
      const seats = official();
      const before = clone(seats);
      const res = await runRole(scarletWomanAbility, seats, 1);
      expect(changedKeys(before[1], seatAfter(res, 1)).length).toBeGreaterThan(0);
      expect(seatAfter(res, 1)?.role?.id, "❌ 未继任为恶魔").toBe("imp");
      expect(seatAfter(res, 1)?.roleType).toBe("demon");
      expect(seatAfter(res, 1)?.isDemonSuccessor).toBe(true);
      expect(seatAfter(res, 1)?.abilityUsed).toBe(false);
    });

    it("⭐ 负向对照：存活不足 → 中止且角色不变", async () => {
      const seats = official().slice(0, 4); // imp(dead) sw baron empath → 存活 3
      const res = await runRole(scarletWomanAbility, seats, 1);
      expect(res.aborted).toBe(true);
      expect(seatAfter(res, 1)?.role?.id).toBe("scarlet_woman");
      expect(seatAfter(res, 1)?.isDemonSuccessor).toBeUndefined();
      expect(seatAfter(res, 1)?.roleType).not.toBe("demon");
      expect(res.snapshot.gameResult?.winner).toBeUndefined();
      expect(
        (res.snapshot.seats as any[]).filter((s) => s.role?.type === "demon").length,
        "❌ 存活不足时竟凭空多出一个恶魔"
      ).toBe(1);
    });

    it("⭐ 边界：醉酒红唇女郎 → 不继任（官方：能力须正常生效）", async () => {
      const seats = official().map((s) => (s.id === 1 ? { ...s, isDrunk: true } : s));
      const res = await runRole(scarletWomanAbility, seats, 1);
      expect(res.aborted).toBe(true);
      expect(seatAfter(res, 1)?.isDemonSuccessor).toBeUndefined();
      expect(seatAfter(res, 1)?.role?.id).toBe("scarlet_woman");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("㉓ 男爵(baron)：开局人数调整是否真的写入配置", () => {
    it("⭐⭐ 在场 → setupConfig 镇民-2 / 外来者+2 且打上 baronAdjusted", async () => {
      const seats = board(["baron", "chambermaid", "gossip", "imp", "tinker"]);
      const res = await runRole(baronAbility, seats, 0, {
        snapshot: { setupConfig: { townsfolkCount: 9, outsiderCount: 1, minionCount: 1, demonCount: 1 } },
      });
      const cfg: any = (res.snapshot as any).setupConfig;
      expect(cfg.townsfolkCount).toBe(7);
      expect(cfg.outsiderCount).toBe(3);
      expect(cfg.baronAdjusted).toBe(true);
      expect(res.meta.adjustmentApplied).toBe(true);
    });

    it("⭐ 前提齐备：说书人指定的移除/新增清单必须原样写入", async () => {
      const seats = board(["baron", "chambermaid", "gossip", "imp", "tinker"]);
      const res = await runRole(baronAbility, seats, 0, {
        snapshot: { setupConfig: { townsfolkCount: 9, outsiderCount: 1 } },
        storytellerInput: {
          removedTownsfolk: ["厨师", "共情者"],
          addedOutsiders: ["圣徒", "陌客"],
        },
      });
      const cfg: any = (res.snapshot as any).setupConfig;
      expect(cfg.removedTownsfolk).toEqual(["厨师", "共情者"]);
      expect(cfg.addedOutsiders).toEqual(["圣徒", "陌客"]);
      expect(cfg.townsfolkCount).toBe(7);
    });

    it("⭐ 边界：负数保护 —— 镇民不足 2 时 clamp 到 0（不得出现负人数）", async () => {
      const seats = board(["baron", "chambermaid", "gossip", "imp", "tinker"]);
      const res = await runRole(baronAbility, seats, 0, {
        snapshot: { setupConfig: { townsfolkCount: 1, outsiderCount: 0 } },
      });
      const cfg: any = (res.snapshot as any).setupConfig;
      expect(cfg.townsfolkCount, "❌ 镇民数不得为负").toBe(0);
      expect(cfg.outsiderCount).toBe(2);
      expect(res.meta.displayInfo.applied).toBe(true);
    });

    it("⭐ 负向对照：调整是「替换」而非凭空加人 —— 镇民+外来者总数守恒，且不得越界改爪牙/恶魔", async () => {
      const seats = board(["baron", "chambermaid", "gossip", "imp", "tinker"]);
      const res = await runRole(baronAbility, seats, 0, {
        snapshot: { setupConfig: { townsfolkCount: 9, outsiderCount: 1 } },
      });
      const cfg: any = (res.snapshot as any).setupConfig;
      expect(
        cfg.townsfolkCount + cfg.outsiderCount,
        "❌ 镇民+外来者总数不守恒（等于凭空增删了玩家）"
      ).toBe(10);
      expect(cfg.minionCount, "❌ 男爵不得改动爪牙数量").toBeUndefined();
      expect(cfg.demonCount, "❌ 男爵不得改动恶魔数量").toBeUndefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe("㉔ 小恶魔(imp)：杀戮 / 自杀传刀是否真的落地", () => {
    const layout = () => board(["imp", "chambermaid", "gossip", "tinker", "baron"]);

    it("⭐⭐ 正常击杀 → markedForDeath + diedAtNight + deathSource=imp_kill", async () => {
      const seats = layout();
      const before = clone(seats);
      const res = await runRole(impAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2 },
        targets: [1],
      });
      expect(changedKeys(before[1], seatAfter(res, 1)).length).toBeGreaterThan(0);
      expect(seatAfter(res, 1)?.markedForDeath).toBe(true);
      expect(seatAfter(res, 1)?.diedAtNight).toBe(2);
      expect(seatAfter(res, 1)?.deathSource).toBe("imp_kill");
      expect(seatAfter(res, 1)?.deathSourceSeatId).toBe(0);
    });

    it("⭐⭐ 自杀传刀 → 自己死亡且一名存活爪牙真的变成小恶魔", async () => {
      const seats = layout();
      const res = await runRole(impAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2 },
        targets: [0],
        storytellerInput: { successorSeatId: 4 },
      });
      expect(seatAfter(res, 0)?.isDead).toBe(true);
      expect(seatAfter(res, 0)?.deathSource, "❌ 自杀死因必须是 suicide").toBe("suicide");
      expect(seatAfter(res, 4)?.role?.id, "❌ 爪牙未继任为小恶魔").toBe("imp");
      expect(seatAfter(res, 4)?.isDemonSuccessor).toBe(true);
    });

    it("⭐ 负向对照：目标被保护（僧侣）→ 不得标记死亡", async () => {
      const seats = layout();
      seats[1].statusEffects = [{ type: "protected", source: "monk" }];
      const res = await runRole(impAbility, seats, 0, {
        night: 2,
        phase: "night",
        snapshot: { nightCount: 2 },
        targets: [1],
      });
      expect(seatAfter(res, 1)?.markedForDeath ?? false).toBe(false);
      expect(res.meta.impResult.killed).toBe(false);
      expect(res.meta.impResult.log?.blockedByProtection).toBe(true);
    });
  });
});
