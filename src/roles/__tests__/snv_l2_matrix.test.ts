/**
 * 梦殒春宵 · L2 引擎矩阵（2026-09-21 建 / 2026-09-22 扩场景 + 加确定性维度）
 * ============================================================
 * 目的：用**最少的断言**扫出**边界崩溃**与结构异常。
 *
 * 为什么值得做：本项目已出现过真实的「边界」缺陷，例如
 *   `assassin.ability.ts` / `professor.ability.ts` 注释里记录的
 *   「`!targetId` 在 `targetId === 0`（**1号玩家**）时误判为未选择 ⇒ 能力静默空转」。
 *   ⇒ 本矩阵把「0 号座位」当作**常规靶子**之一。
 *
 * 🔒 断言（全部是**结构性契约**，不猜角色语义，避免假红）：
 *   ① `runRole` 不得抛异常
 *   ② 必须给出**明确去向**：`aborted === true`（含 `abortReason`）**或** `meta.abilityResult` 存在
 *   ③ 渲染/产出文本不得含 JS 退化串（`[object` / `undefined` / `NaN`）
 *   ④ 座位数不得改变
 *   ⑤ **确定性**（2026-09-22 新增）：同一输入连跑两次，关键字段必须逐字相同
 *
 * ⚠️ 刻意**不断言具体效果**（如「恶魔必须杀人」）—— 那属 L5 因果链的职责；
 *   本矩阵只保证「不崩、不静默、不脏、可复现」。
 *
 *   ⚠️ 不使用正则（本仓库在中文目录，Windows 下反斜杠易被破坏）。
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { board, runRole } from "./_tbHarness";
import {
  getAbilityForRole,
  initializeAbilityRegistry,
} from "../new_engine/abilityRegistry";
import { resetLimitedAbilityUses } from "../../utils/LimitedAbilityManager";

const ROSTER = [
  "clockmaker", "dreamer", "snake_charmer", "mathematician", "flowergirl",
  "town_crier", "oracle", "savant", "seamstress", "philosopher",
  "artist", "juggler", "sage",
  "mutant", "sweetheart", "barber", "klutz",
  "evil_twin", "witch", "cerenovus", "pit_hag",
  "fang_gu", "vigormortis", "no_dashii", "vortox",
];

/**
 * 九类边界场景（2026-09-22 由 4 类扩到 9 类）。
 *
 * ⚠️ 扩张理由（每一类都对应一种**真实可能出错**的形态）：
 *   · 「首夜」两场景：不少角色的首夜路径与非首夜**不是同一段代码**
 *     （`firstNightPriority` / `otherNightOnly`），只测夜 2 会漏掉首夜分支。
 *   · 「超选 3 个目标」：`targetConfig.max` 之外的越界输入必须被安全消化
 *     （不得崩、不得把 3 个目标都杀了）。
 *   · 「行动者已死」：`preCheck` 应当中止（记忆里已有 `!x.isDead` 内联棘轮）。
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

const FILL = ["imp", "chef", "empath", "gossip", "monk", "butler"];
const BAD = ["[object", "undefined", "NaN"];

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

describe("L2 · 梦殒春宵 · 引擎矩阵（25 角色 × 9 边界场景 + 确定性）", () => {
  beforeAll(() => {
    initializeAbilityRegistry();
  });
  /** 限次能力（seamstress/artist/philosopher/juggler）的**模块级**状态隔离 */
  beforeEach(() => {
    resetLimitedAbilityUses();
  });

  describe.each(ROSTER.map((id) => [id] as const))("L2 · %s", (roleId) => {
    it("① 边界场景：不崩 / 有明确去向 / 不脏 / 座位数不变", async () => {
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

        // ② 明确去向：aborted（需有原因）或产出 abilityResult
        const aborted = res?.aborted === true;
        const hasResult = res?.meta?.abilityResult != null;
        expect(
          aborted || hasResult,
          "❌ " + roleId + " / " + scene.key + " 既未中止也无 abilityResult（静默空转）"
        ).toBe(true);
        if (aborted) {
          expect(
            String(res?.abortReason ?? "").length,
            "❌ " + roleId + " / " + scene.key + " 中止但没给 abortReason"
          ).toBeGreaterThan(0);
        }

        // ③ 不脏：产出文本不得含 JS 退化串
        for (const tok of BAD) {
          const blob = JSON.stringify(res?.meta?.abilityResult ?? {});
          expect(
            blob.includes(tok),
            "❌ " + roleId + " / " + scene.key + " 产出含退化串「" + tok + "」：" + blob.slice(0, 120)
          ).toBe(false);
        }

        // ④ 座位数不变（能力不得凭空增删座位）
        expect(
          (res?.snapshot?.seats ?? []).length,
          "❌ " + roleId + " / " + scene.key + " 改变了座位数量"
        ).toBe(before);
      }
    });

    /**
     * ⑤ **确定性**（2026-09-22 新增）。
     *
     * 🔒 为什么必须单独测：
     *   项目铁律「凡『同一事实会算两次』的路径**禁 `Math.random()`**，走注入 `context.rng`」
     *   —— 该缺陷**已复发 4 次**，且**排查信号**正是「测试概率性失败（重跑就绿）」。
     *   本用例把「同一输入 ⇒ 同一输出」变成**确定性断言**：一旦有人偷偷加了
     *   `Math.random()` / `Date.now()`，或让**模块级状态**（限次表、缓存）泄漏到结果里，
     *   这里会**稳定变红**，而不是偶发。
     *
     * ⚠️ 每次运行前 `resetLimitedAbilityUses()`：否则限次角色第二次会被限次表挡住，
     *    差异是**测试自身造成的**（假红），不是不确定性。
     */
    it("⑤ 确定性：同一输入连跑两次，关键字段必须逐字相同（防隐藏随机 / 模块级状态泄漏）", async () => {
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
        "❌ " + roleId + " 同一输入连跑两次结果不同 —— 存在隐藏随机源或模块级状态泄漏" +
          "（随机铁律：凡同一事实会算两次的路径必须走注入 context.rng）"
      ).toBe(a);
    });
  });
});
