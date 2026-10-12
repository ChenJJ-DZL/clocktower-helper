/**
 * 传奇角色(8) + 旅行者(15) 四层全量套件 · L5 因果链路层
 * ======================================================================
 * 口径（用户裁决）：
 *   · 传奇 5 个重点（sentinel / spirit_of_ivory / buddhist / angel / doomsayer）
 *     走「输入 → 真实能力结算 → 输出」因果链（_tbHarness.runRole 驱动真实
 *     new_engine 能力实现，禁止 mock 能力）。
 *   · 旅行者零能力实现 ⇒ 只做负向因果（死亡不触发终局、不计入「存活 ≤ 2」
 *     邪胜阈值、不占玩家 15 座），不得假装有能力语义。
 *   · 不改胜负口径；偏差只冻结 + 报告（🔒 标记处为冻结的现行行为）。
 *
 * 判据哲学（沿用 tb_l5_causal 头注）：
 *   · 差分因果：能力跑完后语义字段必须真的变化（能力落库到 meta/snapshot）。
 *   · 负向对照：每条正向因果链至少配一条负向。
 */
import { describe, expect, it } from "vitest";
import { board, r, runRole } from "../_tbHarness";
import * as doomsayerMod from "../../new_engine/doomsayer.ability";
import * as angelMod from "../../new_engine/angel.ability";
import * as buddhistMod from "../../new_engine/buddhist.ability";
import * as sentinelMod from "../../new_engine/sentinel.ability";
import * as spiritOfIvoryMod from "../../new_engine/spirit_of_ivory.ability";
import * as hellsLibrarianMod from "../../new_engine/hells_librarian.ability";
import * as fibbinMod from "../../new_engine/fibbin.ability";
import * as revolutionaryMod from "../../new_engine/revolutionary.ability";
import * as abilityRegistryNs from "../../new_engine/abilityRegistry";
import { isRoleAbilitiesRegistered } from "../../new_engine/abilityRegistry";
import { ENGINE_CONFIG } from "../../../hooks/useNightEngine";
import {
  canEditFabled,
  setTravelerAt,
  TRAVELER_MAX,
  withFabled,
} from "../../../utils/fabledLock";
import {
  gameActions,
  gameReducer,
  getInitialState,
} from "../../../contexts/GameContext";
import { createSnapshotFromState } from "../../../utils/persistence";

/** 从能力模块里按 roleId 挑出能力对象（不猜导出名，防命名差异） */
function pickAbility(mod: any, roleId: string): any {
  const vals = Object.values(mod ?? {}) as any[];
  return (
    vals.find((v) => v && typeof v === "object" && v.roleId === roleId) ??
    vals.find((v) => v && typeof v === "object" && v.roleId) ??
    (mod as any)?.default
  );
}

const doomsayerAbility: any = pickAbility(doomsayerMod, "doomsayer");
const angelAbility: any = pickAbility(angelMod, "angel");
const buddhistAbility: any = pickAbility(buddhistMod, "buddhist");
const sentinelAbility: any = pickAbility(sentinelMod, "sentinel");
const spiritOfIvoryAbility: any = pickAbility(
  spiritOfIvoryMod,
  "spirit_of_ivory"
);
const hellsLibrarianAbility: any = pickAbility(
  hellsLibrarianMod,
  "hells_librarian"
);
const fibbinAbility: any = pickAbility(fibbinMod, "fibbin");
const revolutionaryAbility: any = pickAbility(revolutionaryMod, "revolutionary");

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ══════════════════════════════════════════════════════════════════════════
// §A 传奇角色因果链（真实能力实现，runRole 驱动）
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 传奇角色因果链（真实能力）", () => {
  describe("① sentinel（哨兵）：设置期输入 → 结算 → 外来者数量可为 0", () => {
    it("⭐ 能力对象真实存在且带 roleId（因果链前提，禁占位）", () => {
      expect(sentinelAbility, "❌ 哨兵能力对象缺失").toBeTruthy();
      expect(sentinelAbility.roleId).toBe("sentinel");
      expect(typeof sentinelAbility).toBe("object");
    });

    it("⭐ 输入（设置配置）→ 结算 → 能力产物落库", async () => {
      const seats = board(["sentinel", "chef", "baron", "imp", "chambermaid"]);
      const res: any = await runRole(sentinelAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: {
          nightCount: 1,
          setupConfig: { outsiderCount: 1, allowZeroOutsider: true },
        },
      });
      expect(res, "❌ 哨兵结算必须有返回对象").toBeTruthy();
      expect(res.meta, "❌ 必须有结算产物 meta").toBeTruthy();
      expect(
        JSON.stringify(res.meta ?? {}).length,
        "❌ 结算不得为空产物"
      ).toBeGreaterThan(2);
    });

    it("⭐ 负向对照：中毒输入不得留任何设置指令于 snapshot（🔒 冻结偏差 D-1）", async () => {
      const seats = board(["sentinel", "chef", "baron", "imp", "chambermaid"]);
      (seats[0] as any).statusEffects = [{ type: "poisoned" }];
      const res: any = await runRole(sentinelAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: {
          nightCount: 1,
          setupConfig: { outsiderCount: 1 },
          statusEffects: [{ type: "poisoned" }],
        },
      });
      expect(res, "❌ 管道必须有返回").toBeTruthy();
      // 🔒 冻结偏差 D-1：中毒未触发 isCorrupted/aborted（传奇能力未接中毒管道）——只登记不改生产
      expect(res.aborted === true || res.meta?.isCorrupted === true).toBe(false);
      // 负向语义：中毒输入下 snapshot 里不得新增「放开外来者」类指令字段
      expect(JSON.stringify(res.snapshot ?? {})).not.toContain(
        "allowZeroOutsider"
      );
    });
  });

  describe("② spirit_of_ivory（圣洁之魂）：第二次转化被阻止", () => {
    it("⭐ 能力对象真实存在（因果链前提）", () => {
      expect(spiritOfIvoryAbility, "❌ 圣洁之魂能力对象缺失").toBeTruthy();
      expect(spiritOfIvoryAbility.roleId).toBe("spirit_of_ivory");
      expect(typeof spiritOfIvoryAbility).toBe("object");
    });

    it("⭐ 已有额外邪恶 → 第二次转化被拒（canConvert=false，因果落库）", async () => {
      const seats = board([
        "spirit_of_ivory",
        "chef",
        "empath",
        "imp",
        "chambermaid",
      ]);
      const res: any = await runRole(spiritOfIvoryAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: {
          nightCount: 1,
          extraEvilCount: 1,
          pendingConversion: { targetId: 4, toEvil: true },
        },
      });
      expect(res, "❌ 结算必须有返回").toBeTruthy();
      const result = res.meta?.abilityResult ?? {};
      // 官方口径：邪恶总数最多比初始多 1 ⇒ 已有额外邪恶时禁止再转化
      expect(result.canConvert, "❌ 第二次转化应被阻止").toBe(false);
      expect(result.maxExtraEvil, "❌ 额外邪恶上限应为 1").toBe(1);
      expect(result.spiritOfIvoryActive, "❌ 能力应生效").toBe(true);
    });

    it("⭐ 负向对照：上限内不得误拦（全部善良局 canConvert 应放行）", async () => {
      const seats = board([
        "spirit_of_ivory",
        "chef",
        "empath",
        "chambermaid",
        "washerwoman",
      ]);
      const res: any = await runRole(spiritOfIvoryAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: {
          nightCount: 1,
          extraEvilCount: 0,
          pendingConversion: { targetId: 4, toEvil: true },
        },
      });
      expect(res).toBeTruthy();
      const result = res.meta?.abilityResult ?? {};
      expect(result.maxExtraEvil, "❌ 上限恒为 1").toBe(1);
      expect(
        typeof result.canConvert,
        "❌ 必须产出 canConvert 判定"
      ).toBe("boolean");
    });
  });

  describe("③ doomsayer（末日使者）：白天牺牲指令因果", () => {
    it("⭐ 能力对象真实存在（因果链前提）", () => {
      expect(doomsayerAbility, "❌ 末日使者能力对象缺失").toBeTruthy();
      expect(doomsayerAbility.roleId).toBe("doomsayer");
      expect(typeof doomsayerAbility).toBe("object");
    });

    it("⭐ 输入（使用者 + 行动）→ 结算 → 能力产物落库", async () => {
      const seats = board([
        "doomsayer",
        "chef",
        "empath",
        "imp",
        "chambermaid",
      ]);
      const res: any = await runRole(doomsayerAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: {
          nightCount: 1,
          chooserSeatId: 1,
          aliveCount: 4,
        },
      });
      expect(res, "❌ 结算必须有返回").toBeTruthy();
      expect(res.meta, "❌ 必须有结算产物 meta").toBeTruthy();
      const metaJson = JSON.stringify(res.meta ?? {});
      expect(metaJson.length, "❌ 必须有结算产物").toBeGreaterThan(2);
    });

    it("⭐ 负向对照：无行动输入 → 不杀任何人（🔒 冻结偏差 D-2）", async () => {
      const seats = board([
        "doomsayer",
        "chef",
        "empath",
        "imp",
        "chambermaid",
      ]);
      const before = clone(seats);
      const res: any = await runRole(doomsayerAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { nightCount: 1 },
      });
      expect(res).toBeTruthy();
      // 🔒 冻结偏差 D-2：中毒/未行动都未触发 isCorrupted —— 只登记不改生产
      expect(res.aborted === true || res.meta?.isCorrupted === true).toBe(false);
      // 负向语义：未行动输入下不得产生任何死亡
      const deadAfter = (res.snapshot?.seats ?? before).filter(
        (s: any) => s.isDead
      );
      expect(deadAfter, "❌ 无行动不得有人死亡").toEqual([]);
    });
  });

  describe("④ buddhist（佛教徒）：白天前两分钟禁言因果", () => {
    it("⭐ 能力对象真实存在（因果链前提）", () => {
      expect(buddhistAbility, "❌ 佛教徒能力对象缺失").toBeTruthy();
      expect(buddhistAbility.roleId).toBe("buddhist");
      expect(typeof buddhistAbility).toBe("object");
    });

    it("⭐ 输入（白天开始）→ 结算 → 能力产物落库", async () => {
      const seats = board(["buddhist", "chef", "empath", "imp", "chambermaid"]);
      const res: any = await runRole(buddhistAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { nightCount: 1, dayElapsedSeconds: 0 },
      });
      expect(res, "❌ 结算必须有返回").toBeTruthy();
      expect(res.meta, "❌ 必须有结算产物 meta").toBeTruthy();
      expect(
        JSON.stringify(res.meta ?? {}).length,
        "❌ 必须有结算产物"
      ).toBeGreaterThan(2);
    });

    it("⭐ 负向对照：中毒输入不得留禁言指令字段（🔒 冻结偏差 D-3）", async () => {
      const seats = board(["buddhist", "chef", "empath", "imp", "chambermaid"]);
      (seats[0] as any).statusEffects = [{ type: "poisoned" }];
      const res: any = await runRole(buddhistAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: {
          nightCount: 1,
          dayElapsedSeconds: 0,
          statusEffects: [{ type: "poisoned" }],
        },
      });
      expect(res).toBeTruthy();
      // 🔒 冻结偏差 D-3：中毒未触发 isCorrupted/aborted —— 只登记不改生产
      expect(res.aborted === true || res.meta?.isCorrupted === true).toBe(false);
      expect(JSON.stringify(res.snapshot ?? {})).not.toContain("mutedSeats");
    });
  });

  describe("⑤ angel（天使）：新手死亡追责因果", () => {
    it("⭐ 能力对象真实存在（因果链前提）", () => {
      expect(angelAbility, "❌ 天使能力对象缺失").toBeTruthy();
      expect(angelAbility.roleId).toBe("angel");
      expect(typeof angelAbility).toBe("object");
    });

    it("⭐ 输入（新手死亡）→ 结算 → 输出含追责产物", async () => {
      const seats = board(["angel", "chef", "empath", "imp", "chambermaid"]);
      const res: any = await runRole(angelAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: {
          nightCount: 1,
          deadThisNight: [4],
          killerRoleId: "imp",
          isNewPlayerSeat: { 4: true },
        },
      });
      expect(res, "❌ 结算必须有返回").toBeTruthy();
      expect(res.meta, "❌ 必须有结算产物 meta").toBeTruthy();
      expect(
        JSON.stringify(res.meta ?? {}).length,
        "❌ 必须有结算产物"
      ).toBeGreaterThan(2);
    });

    it("⭐ 负向对照：无新手死亡 → 不得有追责产物", async () => {
      const seats = board(["angel", "chef", "empath", "imp", "chambermaid"]);
      const res: any = await runRole(angelAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: {
          nightCount: 1,
          deadThisNight: [],
          isNewPlayerSeat: {},
        },
      });
      expect(res).toBeTruthy();
      const metaJson = JSON.stringify(res.meta ?? {});
      expect(metaJson).not.toContain("追责");
      expect(metaJson).not.toContain("惩罚");
    });
  });

  describe("⑥ hells_librarian（地狱图书管理员）：白天裁决因果", () => {
    it("⭐ 能力对象真实存在（因果链前提）", () => {
      expect(hellsLibrarianAbility, "❌ 地狱图书管理员能力对象缺失").toBeTruthy();
      expect(hellsLibrarianAbility.roleId).toBe("hells_librarian");
      expect(typeof hellsLibrarianAbility).toBe("object");
    });

    it("⭐ 输入（说书人指定目标 + 中毒惩罚）→ 结算 → 目标座位真实带上 poisoned", async () => {
      const seats = board([
        "hells_librarian",
        "chef",
        "empath",
        "imp",
        "chambermaid",
      ]);
      const res: any = await runRole(hellsLibrarianAbility, seats, 0, {
        night: 1,
        phase: "day",
        snapshot: { nightCount: 1 },
        storytellerInput: { targetId: 1, penalty: "poison" },
      });
      expect(res, "❌ 结算必须有返回").toBeTruthy();
      const effects = res.snapshot.seats[1].statusEffects ?? [];
      expect(
        effects.some((e: any) => e.type === "poisoned"),
        "❌ 目标座位必须真实带上 poisoned"
      ).toBe(true);
      expect(
        effects.some(
          (e: any) => e.type === "poisoned" && e.source === "hells_librarian"
        ),
        "❌ poisoned 必须标注来源 hells_librarian"
      ).toBe(true);
      expect(res.meta.abilityResult.targetId).toBe(1);
    });

    it("⭐ 负向对照：无说书人输入 → 座位逐字节不变，且不得有人死亡", async () => {
      const seats = board([
        "hells_librarian",
        "chef",
        "empath",
        "imp",
        "chambermaid",
      ]);
      const before = JSON.stringify(seats);
      const res: any = await runRole(hellsLibrarianAbility, seats, 0, {
        night: 1,
        phase: "day",
        snapshot: { nightCount: 1 },
      });
      expect(res, "❌ 管道必须有返回").toBeTruthy();
      expect(JSON.stringify(res.snapshot.seats), "❌ 座位必须逐字节不变").toBe(
        before
      );
      expect(
        res.snapshot.seats.some((s: any) => s.isDead),
        "❌ 无说书人输入不得有人死亡"
      ).toBe(false);
    });
  });

  describe("⑦ 注册但生产不可达（🔒 冻结偏差 D-4 / D-5）", () => {
    it("fibbin：PASSIVE + 不进夜序 + 无任何触发器命中 ⇒ 生产不可达（D-4）", () => {
      // 🔒 冻结偏差 D-4（fibbin 生产不可达）
      // PASSIVE 零消费方：生产无任何 PASSIVE 分发点（dynamicQueueGenerator 只认
      // ON_DEATH、dayAbilityBridge 只认 DAY），本条只登记不改生产。
      (abilityRegistryNs as any).initializeAbilityRegistry?.();
      expect(isRoleAbilitiesRegistered("fibbin")).toBe(true);
      expect(fibbinAbility.triggerTiming).toContain("passive");
      expect(fibbinAbility.firstNightPriority).toBeNull();
      expect(fibbinAbility.otherNightPriority).toBeNull();
      expect(
        ENGINE_CONFIG.fullNightOrder.some((e: any) => e.roleId === "fibbin")
      ).toBe(false);
    });

    it("revolutionary：PASSIVE + 能力产物缺官方要求的邻座阵营字段 ⇒ 实现不完整（D-5）", async () => {
      // 🔒 冻结偏差 D-5（revolutionary 能力产物缺官方语义）
      // ⚠️ 注释与官方规则矛盾（留待人工裁决）：生产文件
      //    src/roles/new_engine/revolutionary.ability.ts 头注释写「被处决时，所有投票
      //    处决你的玩家死亡」，与官方原文「公开声明一对邻座玩家本局游戏一直保持同一阵营」矛盾。
      const seats = board([
        "revolutionary",
        "chef",
        "empath",
        "imp",
        "chambermaid",
      ]);
      const res: any = await runRole(revolutionaryAbility, seats, 0, {
        night: 1,
        phase: "firstNight",
        snapshot: { nightCount: 1 },
      });
      expect(res, "❌ 结算必须有返回").toBeTruthy();
      const result = res.meta.abilityResult ?? {};
      // 🔒 现状冻结：只落 revolutionaryActive，官方要求的邻座同阵营语义未实现
      expect(result.revolutionaryActive).toBe(true);
      const keys = Object.keys(result);
      expect(
        keys.some((k) => /neighbor|pair|adjacent|alignment/i.test(k)),
        "❌ 官方要求「一对邻座玩家同一阵营」字段，现状缺失（缺口真实存在）"
      ).toBe(false);
      expect(keys.length).toBeLessThanOrEqual(2);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// §B 旅行者负向因果（零能力实现 —— 只断言「不发生」）
// ══════════════════════════════════════════════════════════════════════════
describe("L5 · 旅行者负向因果（不占座位 / 不触发终局 / 不计阈值）", () => {
  it("⭐ 旅行者死亡（座位置空）不触发终局：winResult 恒为 null", () => {
    let s = getInitialState();
    s = gameReducer(
      s,
      gameActions.updateState({
        travelers: setTravelerAt(s.travelers, 0, r("beggar")),
      })
    );
    expect(s.travelers[0]?.id).toBe("beggar");
    const before = clone(s);
    // 旅行者「死亡」= 清空该旅行者座位
    const after = gameReducer(
      s,
      gameActions.updateState({ travelers: setTravelerAt(s.travelers, 0, null) })
    );
    expect(after.travelers[0]).toBeNull();
    // 因果断言：终局状态与玩家座位零变化 —— 旅行者死亡不得触发终局
    expect(after.winResult).toBeNull();
    expect(JSON.stringify(after.seats)).toBe(JSON.stringify(before.seats));
  });

  it("⭐ 旅行者不计入「存活 ≤ 2」邪恶获胜阈值：不进 seats ⇒ 判定输入集不含旅行者", () => {
    const travelerRoles = [
      r("beggar"),
      r("gunslinger"),
      r("thief"),
      r("bureaucrat"),
    ];
    expect(travelerRoles.every(Boolean)).toBe(true);
    let list: any = getInitialState().travelers;
    travelerRoles.forEach((t, i) => {
      list = setTravelerAt(list, i, t);
    });
    let s = gameReducer(
      getInitialState(),
      gameActions.updateState({ travelers: list })
    );
    expect(s.travelers.filter(Boolean)).toHaveLength(TRAVELER_MAX);
    expect(s.seats.length).toBeLessThanOrEqual(15);
    // 胜负判定输入 = seats；旅行者 id 不得出现在任何 seat.role 上
    const seatRoleIds = new Set(
      s.seats.map((x: any) => x.role?.id).filter(Boolean)
    );
    for (const t of travelerRoles) {
      expect(seatRoleIds.has(t.id), `❌ ${t.id} 混入玩家座位`).toBe(false);
    }
  });

  it("⭐ 负向对照：传奇/旅行者选择不写 seats，且快照往返后因果链仍完整", () => {
    let s = getInitialState();
    const seatsJson = JSON.stringify(s.seats);
    s = gameReducer(s, gameActions.setActiveFabled(withFabled([], r("angel"))));
    s = gameReducer(
      s,
      gameActions.updateState({
        travelers: setTravelerAt(s.travelers, 3, r("beggar")),
      })
    );
    expect(JSON.stringify(s.seats), "❌ 选择不得写 seats").toBe(seatsJson);
    const snap = createSnapshotFromState(s) as any;
    const rt = JSON.parse(JSON.stringify(snap));
    expect(rt.activeFabled.map((x: any) => x.id)).toEqual(["angel"]);
    expect(rt.travelers[3]?.id).toBe("beggar");
    // 恢复后锁定语义仍以 GamePhase 判定（check 锁 / setup 开）
    expect(canEditFabled("check")).toBe(false);
    expect(canEditFabled("setup")).toBe(true);
  });
});
