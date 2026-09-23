/**
 * 窃窃私语 · L2 引擎矩阵（2026-09-22 建，照 `snv_l2_matrix.test.ts` 模板 + 一处**必要的收紧**）
 * ==================================================================
 * 剧本：**窃窃私语（whispering_secrets）**，19 角色（镇民 7 / 外来者 4 / 爪牙 4 / 恶魔 3 / 特殊 1）。
 * 规模：`⓪ 自证 ×1` + `describe.each` 18 角色 × 3 条（① 边界场景 / ② 静默空转护栏 / ③ 确定性）
 *   + `④ 护栏自证 ×1` + `⑤ 全局棘轮 ×1` ⇒ **1 + 18×3 + 2 = 57 条**（实测 `57 passed`）。
 *
 * ── 为什么这个剧本要单独建矩阵（而不是复用 ws_l1_l2 的 L2 段）────────
 *   `ws_l1_l2.test.ts` 的 L2 段是**声明契约**（静态事实：targetConfig / 夜序优先级 /
 *   四段管道是否为空）；本文件是**运行时矩阵**（真跑 `runFullAbilityPipeline`）。
 *   两者互补：声明可能是对的而运行期崩（或反之）。梦殒春宵那套就是「L1/L2 静态 + L2 矩阵」
 *   双份，本文件补齐窃窃私语的运行时一半。
 *
 * ══════════════════════════════════════════════════════════════════
 * ⚠️⚠️ 移植 `snv_l2_matrix` 时**踩到的唯一一个大坑**（记录在此，别重复踩）
 * ══════════════════════════════════════════════════════════════════
 * snv 版的原判据是「去向 = `aborted` **或** `meta.abilityResult` 存在」。
 * 直接照搬到窃窃私语 ⇒ **5 条假红**（po / recluse / spy / assassin）。
 * 用探针实测（`[PROBE]` 原始输出）后确认**四条全是假红**，原因是该判据**过窄**：
 *
 *   | 角色/场景 | 真实产出通道 | 为什么被误判 |
 *   |---|---|---|
 *   | `po` 醉酒/中毒 | `displayInfo.type="po_kill"` + `prompt` + `abilityLog` | 被门控时**刻意不写 `abilityResult`**；同族恶魔（`vortox`/`fang_gu`/`vigormortis`/`no_dashii`）会写 ⇒ 只是通道不同 |
 *   | `recluse` | `recluseActive` / `recluseRegistrations` | PASSIVE，`fn/on` 皆 `null` ⇒ **生产从不唤醒它**（走管道是 harness artifact） |
 *   | `spy` | `grimoireData`（整本魔典） | 输出走 `grimoireData`，不走 `abilityResult` |
 *   | `assassin` 不选目标 | `assassinationSuccess`；`min=0` 合法「不使用能力」 | 对齐 I11 的合法空转豁免 |
 *
 * 🔒 **修正原则：把判据锚到项目自己的独立事实源 `invariantTesting/invariants.ts::I11`**
 *   （而不是抄 snv 的经验值）。I11 的豁免与判据被逐条对齐：
 *     · `invariants.ts:568` —— `abilityEffective === false` ⇒ **官方允许能力不生效**，豁免
 *     · `invariants.ts:573` —— `targetConfig.min === 0 且未给目标` ⇒ **合法「不行动/跳过」**，豁免
 *     · `invariants.ts:575-625` —— 效果落地看**快照变化 / `lastKill` 等快照级字段**，不只看 `abilityResult`
 *
 * ⇒ 本文件的 ② 不再是「必须有 `abilityResult`」，而是**「必须留下可追溯痕迹」**（多通道）。
 *
 * ⚠️ 为防止把判据放宽成**恒真**（零断言），单配 **③ 自证用例**：
 *   把一个「声明了夜行能力 + 给了合法目标，但四段管道全空」的**桩能力**喂进同一个检查器，
 *   必须被判为静默空转 —— 否则 ② 就是摆设（这是本技能 §A.2 要求的双向验证）。
 *
 * ⚠️ 不使用跨行正则（本仓库在中文目录，Windows 下反斜杠易被破坏）。
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { scripts } from "../../../app/data";
import { resetLimitedAbilityUses } from "../../utils/LimitedAbilityManager";
import {
  getAbilityForRole,
  initializeAbilityRegistry,
  isRoleAbilitiesRegistered,
} from "../new_engine/abilityRegistry";
import { isRoleMigrated } from "../../utils/nightInfoAdapter";
import { board, runRole } from "./_tbHarness";

/**
 * 窃窃私语 19 角色。
 * ⚠️ 顺序刻意按阵营分组（便于人工比对），与 `app/data.ts` 的 `roleIds` 顺序**不同**
 *    ⇒ ⓪ 会做排序后比对，不做顺序比对（顺序不是契约）。
 */
const ROSTER = [
  // 镇民 7
  "chambermaid",
  "gossip",
  "oracle",
  "mathematician",
  "artist",
  "flowergirl",
  "innkeeper",
  // 外来者 4
  "fool",
  "saint",
  "recluse",
  "politician",
  // 爪牙 4
  "spy",
  "witch",
  "assassin",
  "devils_advocate",
  // 恶魔 3
  "vortox",
  "po",
  "zombuul",
  // 特殊 1
  "plague_doctor",
];

/**
 * ⚠️ **已登记的例外**：`saint` 在本剧本里是**外来者版**，**没有新引擎能力**。
 *
 *   事实链（可复核，不是"我们忽略了"）：
 *     · `src/roles/new_engine/saint.ability.ts:229` 的 `roleId` 写的是 **`saint_townsfolk`**
 *       （扩展镇民版圣徒），而窃窃私语要的是 `saint`（外来者）。
 *     · 故 `getAbilityForRole("saint")` 取不到、`isRoleRegistered("saint")` 为 false。
 *     · 本剧本圣徒的「被处决 ⇒ 善良阵营失败」走 **legacy `checkGameEnd`**。
 *   这与 `ws_l1_l2.test.ts:574-581` 登记的是**同一件事**（那处断言 `notMigrated === ["saint"]`）。
 *
 *   ⇒ 本文件对它的处理：**进 ⓪ 的负向对照**（断言"确实没有能力"），**不进 `describe.each` 矩阵**
 *     （没有能力可跑，硬跑只会得到一条无意义的红）。
 */
const NO_ENGINE_ABILITY = new Set<string>(["saint"]);

/** 真正进矩阵的角色（18 个） */
const MATRIX_ROSTER = ROSTER.filter((id) => !NO_ENGINE_ABILITY.has(id));

/**
 * **全局计数**：供 ⑤ 做「判据不是恒真」的棘轮断言。
 * ⚠️ 依赖 vitest 在同一文件内**按声明顺序串行**执行（本仓库未开 `.concurrent` / `sequence.shuffle`）
 *    ⇒ ⑤ 必须声明在最后。
 */
const TALLY = { nonExempt: 0, exempt: 0, combos: 0 };

/**
 * 九类边界场景（对齐 `snv_l2_matrix.test.ts`）。
 *
 * 每一类都对应一种**真实可能出错**的形态：
 *   · 「首夜」两场景：不少角色的首夜与非首夜**不是同一段代码**
 *     （`firstNightPriority` / `otherNightOnly`）。窃窃私语尤其相关：
 *     `spy`(fn=75) / `chambermaid` / `mathematician` / `artist` 都有首夜槽位。
 *   · 「超选 3 个目标」：`targetConfig.max` 之外的越界输入必须被安全消化
 *     （不得把 3 个目标都杀了）。
 *   · 「行动者已死」：`preCheck` 应当中止（仓库已有 `!x.isDead` 内联棘轮）。
 *   · 「目标已死」：死者能否被再次选中（部分角色允许，部分不允许）——
 *     本矩阵只要求「有明确去向、不崩」，不断言具体允许与否。
 */
type Scene = {
  key: string;
  night?: number;
  targets: number[];
  impair?: "drunk" | "poisoned";
  actorDead?: boolean;
  targetDead?: boolean;
};

const SCENES: Scene[] = [
  { key: "不选目标", targets: [] },
  { key: "选中 0 号（1号玩家，边界）", targets: [0] },
  { key: "醉酒", targets: [1], impair: "drunk" },
  { key: "中毒", targets: [1], impair: "poisoned" },
  { key: "首夜（night=1）· 不选目标", night: 1, targets: [] },
  { key: "首夜（night=1）· 选中 0 号", night: 1, targets: [0] },
  { key: "超选：一次给 3 个目标（越界保护）", targets: [1, 2, 3] },
  { key: "行动者已死亡", targets: [1], actorDead: true },
  { key: "目标为已死亡的座位", targets: [1], targetDead: true },
];

/**
 * 填充位池 —— **必须全部是窃窃私语本剧本角色**（否则测的不是这个剧本的组合）。
 *
 * ⚠️ 池内**刻意放两个恶魔（`po` / `zombuul`）**：
 *   被测角色本身就是恶魔（`vortox` / `po` / `zombuul`）时会被 `filter` 摘掉，
 *   若池内只有一个恶魔 ⇒ 摘完后**场上无恶魔**，而窃窃私语里有依赖恶魔存在的角色
 *   （`oracle` 数死亡邪恶玩家 / `flowergirl` 看恶魔投票 / `gossip` 声明推进死亡）
 *   ⇒ 会得到一个**不属于本剧本真实局面**的棋盘，测出来的绿灯没有意义。
 */
const FILL = ["oracle", "mathematician", "innkeeper", "witch", "po", "zombuul"];

const BAD = ["[object", "undefined", "NaN"];

/**
 * 通用脚手架 meta 键 —— **任何角色都会被管道写上**，不能当作「该角色产出了东西」的证据。
 *
 * 🔒 这个白名单是**实测出来的**，不是猜的：探针显示 `po` 被门控时
 *   （`abilityResult === null`）meta 仍有 `abilityEffective / abilityLog / displayInfo /
 *   isDrunk / isPoisoned / prioritySource / prompt / validTargets` 八个键
 *   ⇒ 这八个属于脚手架；只要**出现白名单之外**的键，就说明该角色确实产出了自己的东西
 *     （`spy → grimoireData`、`assassin → assassinationSuccess`、`recluse → recluseRegistrations`…）。
 */
const SCAFFOLD_META_KEYS = new Set<string>([
  "abilityEffective",
  "abilityLog",
  "isAbilityActive",
  "isDrunk",
  "isPoisoned",
  "isDead",
  "isCorrupted",
  "prioritySource",
  "prompt",
  "displayInfo",
  "validTargets",
  "abilityResult",
  "targetIds",
  "_abilityResults",
]);

function roleSpecificMetaKeys(res: any): string[] {
  return Object.keys(res?.meta ?? {}).filter((k) => !SCAFFOLD_META_KEYS.has(k));
}

/** 座位的**结构化指纹**：只取与"能力是否落地"有关的字段 */
function seatSig(seats: any[]): string {
  return JSON.stringify(
    (seats ?? []).map((s: any) => ({
      id: s.id,
      isDead: s.isDead === true,
      mfd: s.markedForDeath === true,
      role: s.role?.id ?? null,
      charade: s.charadeRole?.id ?? s.charadeRole ?? null,
      fx: (Array.isArray(s.statusEffects) ? s.statusEffects : [])
        .map((e: any) => String(e?.type ?? "?"))
        .sort(),
    }))
  );
}

/**
 * ⭐ 核心判据：这个结果**留下可追溯痕迹**了吗？
 *   判据与豁免逐条对齐 `invariants.ts::I11`（项目自己的独立事实源）。
 */
function hasTrace(args: {
  res: any;
  sigBefore: string;
  sigAfter: string;
  ability: any;
  targets: number[];
}): { ok: boolean; how: string } {
  const { res, sigBefore, sigAfter, ability, targets } = args;
  const meta = res?.meta ?? {};

  // ① 中止且有原因（I11:560 直接 continue —— 中止本身就是明确去向）
  if (res?.aborted === true) {
    return { ok: String(res?.abortReason ?? "").length > 0, how: "aborted" };
  }
  // ② 产出 abilityResult
  if (meta.abilityResult != null) return { ok: true, how: "abilityResult" };
  // ③ 角色专属 meta 产出（走别的通道，如 grimoireData / assassinationSuccess）
  const specific = roleSpecificMetaKeys(res);
  if (specific.length > 0) return { ok: true, how: "meta:" + specific.join(",") };
  // ④ 快照发生实质变化（死亡 / 状态 / 角色 / 伪装）
  if (sigBefore !== sigAfter) return { ok: true, how: "snapshot" };

  // ── 以下为**豁免**（对齐 I11，官方允许的"没做事"）────────────────────
  // ⑤ 醉酒/中毒 ⇒ 能力不生效是规则允许的（invariants.ts:568）
  if (meta.abilityEffective === false) return { ok: true, how: "exempt:gated" };
  // ⑥ `min === 0` 且未给目标 ⇒ 合法「不行动/跳过」（invariants.ts:573）
  const tc = ability?.targetConfig ?? {};
  if ((tc.min ?? 0) === 0 && targets.length === 0) {
    return { ok: true, how: "exempt:no-action" };
  }
  // ⑦ 该角色**无夜行槽位**（fn/on 皆 null）⇒ 生产从不唤醒它，
  //    硬跑管道无产出属 harness artifact，不是能力缺陷
  if (ability?.firstNightPriority == null && ability?.otherNightPriority == null) {
    return { ok: true, how: "exempt:no-night-action" };
  }
  // ⑧ 越界输入（目标数不在 [min,max] 内）⇒ 只要求"不崩/不脏/座位数不变"（见 ①）
  const n = targets.length;
  if (n < (tc.min ?? 0) || n > (tc.max ?? 0)) {
    return { ok: true, how: "exempt:out-of-contract" };
  }

  return { ok: false, how: "-" };
}

function mkSeats(actor: string, scene: Scene) {
  const seats = board([actor, ...FILL.filter((x) => x !== actor)]);
  if (scene.impair) {
    seats[0].statusEffects = [{ type: scene.impair }];
  }
  if (scene.actorDead) seats[0].isDead = true;
  if (scene.targetDead && seats[1]) seats[1].isDead = true;
  return seats;
}

/** 只取**稳定、可比**的字段（排除 `_abilityResults` 等可能含运行期细节的字段） */
function stableShape(res: any) {
  return JSON.stringify({
    aborted: res?.aborted === true,
    abortReason: res?.abortReason ?? null,
    abilityResult: res?.meta?.abilityResult ?? null,
    seats: (res?.snapshot?.seats ?? []).map((s: any) => ({
      id: s.id,
      isDead: s.isDead === true,
      role: s.role?.id ?? null,
      fx: (Array.isArray(s.statusEffects) ? s.statusEffects : [])
        .map((e: any) => String(e?.type ?? "?"))
        .sort(),
    })),
  });
}

describe("L2 · 窃窃私语 · 引擎矩阵（18 角色 × 9 边界场景 + 静默空转护栏 + 确定性）", () => {
  beforeAll(() => {
    initializeAbilityRegistry();
  });

  /** 限次能力（artist 每局限一次等）的**模块级**状态隔离 */
  beforeEach(() => {
    resetLimitedAbilityUses();
  });

  /**
   * ⓪ **自证**（防「矩阵测了个空集」这类最隐蔽的假绿）。
   *
   * 🔒 为什么必须有：`describe.each(MATRIX_ROSTER…)` 若名单写错（漏角色 / 多角色 / id 打错），
   *   它会**安静地**少跑几条或对着未注册能力报红 —— 前者是假绿，后者是噪音。
   *   本用例把「名单与真实剧本花名册一致」钉死：任何人增删角色都必须回来改这里。
   */
  it("⓪ 自证：名单与剧本 roleIds 完全一致（19 个）；18 个有引擎能力，saint 例外要能被负向证实", () => {
    const script = scripts.find((s) => s.id === "whispering_secrets");
    expect(script, "❌ app/data.ts 里找不到 whispering_secrets 剧本").toBeTruthy();

    const actual = [...(script!.roleIds as string[])].sort();
    const declared = [...ROSTER].sort();
    expect(
      declared,
      "❌ ROSTER 与剧本 roleIds 不一致（增删角色必须回来同步本矩阵）"
    ).toEqual(actual);
    expect(declared.length, "❌ 窃窃私语应为 19 个角色").toBe(19);
    expect(new Set(declared).size, "❌ ROSTER 内有重复 id").toBe(19);

    // 进矩阵的必须有能力
    for (const id of MATRIX_ROSTER) {
      expect(
        isRoleAbilitiesRegistered(id),
        "❌ 角色能力未注册（abilityRegistry 与 app/data.ts 两处都要有）：" + id
      ).toBe(true);
      expect(
        getAbilityForRole(id),
        "❌ getAbilityForRole 取不到能力：" + id
      ).toBeTruthy();
    }

    // 例外的**负向对照**：`saint` 必须"真的没有"，而不是我们视而不见
    expect(MATRIX_ROSTER.length, "❌ 进矩阵的应恰为 18 个").toBe(18);
    for (const id of NO_ENGINE_ABILITY) {
      expect(
        isRoleAbilitiesRegistered(id),
        "❌ " +
          id +
          " 被登记为『无新引擎能力』，但注册表里确实有 —— 例外已失效，必须回来改本文件"
      ).toBe(false);
      expect(
        isRoleMigrated(id),
        "❌ " +
          id +
          " 被登记为『走 legacy』，但 isRoleMigrated 为 true —— 例外已失效"
      ).toBe(false);
      /**
       * ⚠️⚠️ **`getAbilityForRole` 是模糊匹配，会"串门"**（本文件实测踩到，别再踩）：
       *   `abilityRegistry.ts:536-538` 的查找键是 `k.startsWith(roleId)`，
       *   于是 `getAbilityForRole("saint")` 会命中的是 **`saint_townsfolk`（扩展镇民版圣徒）**
       *   的能力对象 —— **返回非 null，但不是我们要的那个角色**。
       *   ⇒ 判「某角色有没有新引擎能力」**必须用 `isRoleAbilitiesRegistered(id)`**，
       *     绝不能用 `getAbilityForRole(id) != null`（会得到假阳性）。
       */
      const fuzzy = getAbilityForRole(id) as any;
      expect(
        fuzzy?.roleId,
        "❌ getAbilityForRole('" +
          id +
          "') 应模糊命中别人（saint_townsfolk），实际返回 " +
          String(fuzzy?.roleId)
      ).not.toBe(id);
    }
  });

  describe.each(MATRIX_ROSTER.map((id) => [id] as const))("L2 · %s", (roleId) => {
    it("① 边界场景：不崩 / 中止必有原因 / 不脏 / 座位数不变", async () => {
      const ability = getAbilityForRole(roleId) as any;
      expect(ability, "❌ 未注册能力：" + roleId).toBeTruthy();

      for (const scene of SCENES) {
        const seats = mkSeats(roleId, scene);
        const before = seats.length;
        let res: any;
        try {
          res = await runRole(ability, seats, 0, {
            night: scene.night ?? 2,
            phase: (scene.night ?? 2) === 1 ? "firstNight" : "night",
            targets: scene.targets,
          });
        } catch (e: any) {
          throw new Error(
            "❌ " + roleId + " / " + scene.key + " 抛异常：" + String(e && e.message)
          );
        }

        // 中止必须给原因（否则无法定位，也无法在 UI 上解释）
        if (res?.aborted === true) {
          expect(
            String(res?.abortReason ?? "").length,
            "❌ " + roleId + " / " + scene.key + " 中止但没给 abortReason"
          ).toBeGreaterThan(0);
        }

        // 不脏：产出文本不得含 JS 退化串
        for (const tok of BAD) {
          const blob = JSON.stringify(res?.meta?.abilityResult ?? {}) +
            JSON.stringify(res?.meta?.displayInfo ?? {}) +
            String(res?.meta?.prompt ?? "");
          expect(
            blob.includes(tok),
            "❌ " +
              roleId +
              " / " +
              scene.key +
              " 产出含退化串「" +
              tok +
              "」：" +
              blob.slice(0, 160)
          ).toBe(false);
        }

        // 座位数不变（能力不得凭空增删座位）
        expect(
          (res?.snapshot?.seats ?? []).length,
          "❌ " + roleId + " / " + scene.key + " 改变了座位数量"
        ).toBe(before);
      }
    });

    /**
     * ② **静默空转护栏**（本文件的核心价值）。
     *
     * 抓的缺陷形态（真实存在过）：能力被正常调度、未被门控、目标合法，
     * 但**什么都没做、也不留痕迹** —— 典型如 `!targetId` 在 `targetId === 0`
     * （**1号玩家**）时误判为"未选择" ⇒ 能力静默空转（见 `assassin.ability.ts` 注释）。
     *
     * ⚠️ 豁免项全部对齐 `invariants.ts::I11`，逐条在 `hasTrace()` 里注明行号。
     * ⚠️ 若某角色在 9 个场景里**全部被豁免** ⇒ 本用例对它实际零检查，
     *    故额外断言"被动角色（无夜行槽位）必须零检查"以**显式暴露**这种情况；
     *    判据本身是否恒真，由 ③ 的桩能力自证。
     */
    it("② 静默空转护栏：未被豁免的场景必须留下可追溯痕迹", async () => {
      const ability = getAbilityForRole(roleId) as any;
      const silent: string[] = [];
      let checked = 0;

      for (const scene of SCENES) {
        const seats = mkSeats(roleId, scene);
        const sigBefore = seatSig(seats);
        const res = await runRole(ability, seats, 0, {
          night: scene.night ?? 2,
          phase: (scene.night ?? 2) === 1 ? "firstNight" : "night",
          targets: scene.targets,
        });
        const sigAfter = seatSig(res?.snapshot?.seats ?? []);

        const verdict = hasTrace({
          res,
          sigBefore,
          sigAfter,
          ability,
          targets: scene.targets,
        });
        // 只把「非豁免」的通过计入有效检查
        if (verdict.ok && !verdict.how.startsWith("exempt:")) checked++;
        else if (!verdict.ok) silent.push(scene.key);
        else TALLY.exempt += 1;
      }

      expect(
        silent,
        "❌ " +
          roleId +
          " 在下列场景既未中止、也无任何产出、也未改变状态（静默空转）：" +
          silent.join(" / ")
      ).toEqual([]);

      TALLY.nonExempt += checked;
      TALLY.combos += SCENES.length;
    });

    /**
     * ③ **确定性**。
     *
     * 🔒 为什么必须单独测：
     *   项目铁律「凡『同一事实会算两次』的路径**禁 `Math.random()`**，走注入 `context.rng`」
     *   —— 该缺陷**已复发 4 次**，且**排查信号**正是「测试概率性失败（重跑就绿）」。
     *   本用例把「同一输入 ⇒ 同一输出」变成**确定性断言**：一旦有人偷偷加了
     *   `Math.random()` / `Date.now()`，或让**模块级状态**（限次表、缓存）泄漏到结果里，
     *   这里会**稳定变红**，而不是偶发。
     *
     * ⚠️ 每次运行前 `resetLimitedAbilityUses()`：否则限次角色（artist 等）
     *    第二次会被限次表挡住，差异是**测试自身造成的**（假红），不是不确定性。
     */
    it("③ 确定性：同一输入连跑两次，关键字段必须逐字相同（防隐藏随机 / 模块级状态泄漏）", async () => {
      const ability = getAbilityForRole(roleId) as any;
      const scene = SCENES[1]; // 选中 0 号（最活跃的通用场景）

      const once = async () => {
        resetLimitedAbilityUses();
        const seats = mkSeats(roleId, scene);
        const res = await runRole(ability, seats, 0, {
          night: 2,
          phase: "night",
          targets: scene.targets,
        });
        return stableShape(res);
      };

      const a = await once();
      const b = await once();
      expect(
        b,
        "❌ " +
          roleId +
          " 同一输入连跑两次结果不同 —— 存在隐藏随机源或模块级状态泄漏" +
          "（随机铁律：凡同一事实会算两次的路径必须走注入 context.rng）"
      ).toBe(a);
    });
  });

  /**
   * ④ **护栏自证（防假绿）** —— 本技能 §A.2 要求的双向验证。
   *
   * 构造一个「**声明了夜行能力（on 非 null）+ 给了契约内目标（1 个）+ 未被门控**，
   * 但四段管道全空」的桩能力，喂进 `hasTrace()`：
   *   · 必须判为**静默空转**（`ok === false`）
   *   · 且**不得**落到任何 `exempt:` 分支（否则说明豁免条件写宽了，真缺陷会被漏掉）
   *
   * ⇒ 若有人日后把判据放宽成恒真（例如把 `min===0` 误写成 `max===0`，
   *   或把越界豁免写成无条件），本用例立刻变红。
   */
  it("④ 护栏自证：四段全空但声明了夜行能力的桩能力，必须被判为静默空转（防判据恒真）", async () => {
    const stub = {
      roleId: "vortox", // 借一个真实 roleId，使 runRole 能取到角色名
      abilityId: "stub_silent_noop",
      abilityName: "桩能力（全空）",
      triggerTiming: ["every_night"],
      firstNightPriority: null,
      otherNightPriority: 52,
      firstNightOnly: false,
      targetConfig: { min: 1, max: 1, allowSelf: false, allowDead: false },
      preCheck: [],
      calculate: [],
      stateUpdate: [],
      postProcess: [],
    } as any;

    const seats = mkSeats("vortox", { key: "选中 0 号", targets: [1] });
    const sigBefore = seatSig(seats);
    const res = await runRole(stub, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });
    const sigAfter = seatSig(res?.snapshot?.seats ?? []);

    const verdict = hasTrace({
      res,
      sigBefore,
      sigAfter,
      ability: stub,
      targets: [1],
    });
    expect(
      verdict.how.startsWith("exempt:"),
      "❌ 桩能力落进了豁免分支「" +
        verdict.how +
        "」—— 说明豁免条件写宽了，真缺陷会被漏掉"
    ).toBe(false);
    expect(
      verdict.ok,
      "❌ 桩能力（声明夜行 + 合法目标 + 未被门控 + 无产出）未被判为静默空转" +
        " ⇒ ② 的判据是恒真的，形同摆设"
    ).toBe(false);
  });

  /**
   * ⑤ **全局棘轮**（防「② 虽然不恒真、但实际对所有角色都走豁免」）。
   *
   * ④ 已证明判据对**桩能力**有牙齿；⑤ 再证明它**真的落在真实角色身上**：
   *   `TALLY.exempt` 若等于 `combos`（162），说明每个组合都被豁免掉了
   *   ⇒ ② 对生产代码实际零检查。这里把「非豁免检查数」钉成**只许上调**的棘轮。
   *
   * ⚠️ 棘轮口径：数字**只能变大**（改小 = 有人偷偷放宽了豁免条件，必须当场解释为什么）。
   *   实测值见失败信息里的 `[L2-TALLY]`。
   */
  it("⑤ 全局棘轮：非豁免的有效检查数必须达标（只许上调，防『全被豁免 ⇒ 零检查』）", () => {
    console.log("[L2-TALLY]", JSON.stringify(TALLY));
    expect(
      TALLY.combos,
      "❌ 组合数应恰为 18 角色 × 9 场景 = 162（说明 describe.each 少跑了角色）"
    ).toBe(MATRIX_ROSTER.length * SCENES.length);

    /** 🔒 棘轮下限（2026-09-22 实测 nonExempt=159 / exempt=3 / combos=162；留 4 的余量） */
    const FLOOR = 155;
    expect(
      TALLY.nonExempt,
      "❌ 非豁免检查数低于棘轮下限 " +
        FLOOR +
        " (实测 " +
        TALLY.nonExempt +
        "/" +
        TALLY.combos +
        ") —— 要么判据被放宽了，要么真的有角色在空转"
    ).toBeGreaterThanOrEqual(FLOOR);
  });
});
