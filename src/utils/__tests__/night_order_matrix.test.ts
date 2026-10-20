/**
 * 夜序矩阵：队列顺序必须等于**官方优先级**（2026-10-20 · L2）
 * ==================================================================
 * 为什么需要这个文件：
 *   `invariantTesting` 里虽然有个叫 `I6PriorityMatchesOfficialOrder` 的检查，
 *   但它**名不副实** —— 实际只校验「官方夜晚顺序 JSON 里声明唤醒的角色，
 *   引擎有没有对应实现」，完全不看优先级、不看顺序、不用执行结果
 *   （形参是 `_result`）。也就是说：**生成器把两个角色的顺序写反，它照样绿**。
 *
 * 本文件补的正是这一块，对每个剧本 × 每个夜次断言四件事：
 *   ① **值正确**：队列里每个节点的 priority === 官方表里该角色该夜的优先级；
 *   ② **序正确**：整条队列的 priority 序列单调非降；
 *   ③ **成员正确**：官方表里该夜无行动的角色**不得出现**；
 *   ④ **不漏人**：官方表里该夜有行动、且非条件触发的角色**必须出现**。
 *
 * 构造方式：把「剧本全集角色」直接塞进 seats（生成器只看 seats 里的角色类型，
 *   不校验人数配比），一次即可覆盖整剧本夜序。
 *
 * ⚠️ 条件触发角色（送葬者需当日处决 / 守鸦人需当晚死亡 / 赏金猎人需已知目标死亡）
 *   在「无事件局面」下本就不该入队，因此列进 `CONDITIONAL` 白名单，
 *   既不要求必须出现，也不因其缺席判违规。
 */
import { describe, expect, it } from "vitest";
import { roles, scripts } from "../../../app/data";
import { buildFullNightOrder } from "../invariantTesting/engineConfig";
import { nightOrderParser } from "../nightOrderParser";
import { generateDynamicNightQueue } from "../dynamicQueueGenerator";

type Entry = {
  roleId: string;
  roleName?: string;
  firstNightPriority?: number;
  otherNightPriority?: number;
};

const NIGHT_ORDER = buildFullNightOrder() as unknown as Entry[];
const BY_ID = new Map(NIGHT_ORDER.map((e) => [e.roleId, e]));

/**
 * ⭐ 独立基线：官方 JSON 的夜序（`src/data/nightOrder.json`）。
 *
 * ⚠️⚠️ 为什么必须用它、而不是拿 `buildFullNightOrder()` 自己跟自己比：
 *   第一版就是这么写的 —— 结果**变异测不出来**。
 *   实测把 `chef.ability.ts` 的 `firstNightPriority` 从 55 改成 30，
 *   测试仍然 27 条全绿：因为「生成器输出的 priority」与「官方表」同源于
 *   ability ⇒ 断言退化成 `x === x`，属于**自洽检查**，不是正确性检查。
 *
 *   `nightOrder.json` 是纯顺序数组（顺序即优先级），`nightOrderParser`
 *   按下标派生出数值；ability 里是**手写**的数字。两者不同源，
 *   才可能抓到「ability 优先级写错 / 与官方顺序不符」。
 */
/**
 * 官方**顺序 rank**（数组下标）。
 *
 * ⚠️ 为什么不比数值：`nightOrder.json` 是纯顺序数组，parser 按下标派生出
 *   1,2,3… 这类序号；而 `ability.firstNightPriority` 里手写的是血染官方夜序表
 *   的原始数字（洗衣妇 52、厨师 55…）。**两套口径不同**，直接比绝对值会全红。
 *   真正要锁的是「相对先后」——所以比 rank，而不是比数值。
 */
const RANK_FIRST = new Map(
  nightOrderParser.getFirstNightOrder().map((i, idx) => [i.roleId, idx])
);
const RANK_OTHER = new Map(
  nightOrderParser.getOtherNightOrder().map((i, idx) => [i.roleId, idx])
);

/**
 * 「官方表有优先级，但在**无事件局面**下本就不该单独入队」的角色。
 *
 * ⚠️ 这不是放水名单：每一项都写明**缺席原因**与代码依据。新增条目必须在
 *   PR 里解释清楚，否则就等于把真违规藏进白名单。
 *   末尾有一条自检：名单里每个 id 都必须真实存在于官方夜序表（防写错/腐烂）。
 */
const DEFERRED: Record<string, string> = {
  // ── 死亡触发（triggerTiming 含 ON_DEATH）：没有死亡事件就不入队 ──
  farmer: "夜晚死亡触发",
  ravenkeeper: "当晚死亡触发",
  moonchild: "有人死亡时触发",
  barber: "死亡时触发",
  sweetheart: "死亡时触发",
  sage: "死亡时触发",
  plague_doctor: "死亡时触发",
  // ── 条件触发 ──
  undertaker: "当日有处决才唤醒（requiresExecutedToday）",
  bounty_hunter: "已知目标死亡当晚才入队（requiresKnownTargetDead）",
  juggler: "仅白天猜过后当晚结算（dynamicQueueGenerator: jugglerCorrectCount 未定义即不入队）",
  // ── 与其他步骤合并 ──
  lunatic:
    "首夜并入 demon_info（展示不在场角色+爪牙）；仅当 apparentDemonRole 首夜有行动才保留独立节点（dynamicQueueGenerator:518）",
  snitch: "纯被动，伪装在 minion_info 环节展示（dynamicQueueGenerator:542 显式 return false）",
  king: "铁律排除",
};
const CONDITIONAL = new Set(Object.keys(DEFERRED));

/** 系统步骤（不是「角色」，成员校验时不参与角色集合比对） */
const SYSTEM_STEP_IDS = new Set([
  "minion_info",
  "demon_info",
  "legion_mutual_recognition",
  "evil_converted_notice",
]);

const seatRole = (rid: string) => roles.find((r) => r.id === rid);

/** 用剧本全集角色构造 seats（生成器只看角色类型，忽略人数配比） */
function seatsFor(scriptId: string) {
  const script = scripts.find((s) => s.id === scriptId) as any;
  if (!script) throw new Error(`剧本不存在: ${scriptId}`);
  return script.roleIds
    .map((rid: string, i: number) => {
      const role = seatRole(rid);
      if (!role) return null;
      return { id: i, isDead: false, role, statusDetails: [] };
    })
    .filter(Boolean) as any[];
}

function runQueue(scriptId: string, isFirstNight: boolean) {
  return generateDynamicNightQueue(
    NIGHT_ORDER as any,
    { seats: seatsFor(scriptId) } as any,
    { isFirstNight }
  ) as any[];
}

/** 官方顺序 rank；undefined = 官方表里没有该角色 / 该夜不唤醒 */
const rankOf = (roleId: string, isFirstNight: boolean): number | undefined =>
  (isFirstNight ? RANK_FIRST : RANK_OTHER).get(roleId);

describe("L2 夜序矩阵：9 剧本 × 首夜/后续夜", () => {
  for (const script of scripts as any[]) {
    const sid = script.id as string;
    const name = script.name as string;

    for (const isFirstNight of [true, false]) {
      const nightLabel = isFirstNight ? "首夜" : "后续夜";

      it(`${name}（${sid}）· ${nightLabel}：顺序与成员必须匹配官方夜序`, () => {
        const nodes = runQueue(sid, isFirstNight);
        expect(nodes.length, `${name} ${nightLabel} 队列不应为空`).toBeGreaterThan(0);

        // ① 成员合法 + 收集官方 rank
        const checked: Array<{ roleId: string; rank: number }> = [];
        for (const n of nodes) {
          const roleId = String(n.roleId);
          if (SYSTEM_STEP_IDS.has(roleId)) continue; // 系统步骤不在官方角色表里
          const rank = rankOf(roleId, isFirstNight);
          expect(
            rank,
            `${name} ${nightLabel}：${roleId} 不在官方夜序表（该夜不应唤醒），却出现在队列里`
          ).toBeDefined();
          checked.push({ roleId, rank: rank as number });
        }

        // ② 序正确：按**官方顺序 rank** 单调非降（独立于 ability 里手写的数字）
        for (let i = 1; i < checked.length; i++) {
          expect(
            checked[i].rank,
            `${name} ${nightLabel}：队列越序 —— 第 ${i} 位 ${checked[i].roleId}(官方序 ${checked[i].rank}) 排在 ${checked[i - 1].roleId}(官方序 ${checked[i - 1].rank}) 之后，与官方顺序相反。全序列：${nodes
              .map((n) => `${n.roleId}@${n.priority}`)
              .join(" > ")}`
          ).toBeGreaterThanOrEqual(checked[i - 1].rank);
        }

        // ③ 不漏人：官方表中该夜有行动、非条件触发的角色必须出现
        const present = new Set(nodes.map((n) => String(n.roleId)));
        const scriptRoleIds = new Set<string>((script as any).roleIds);
        const missing: string[] = [];
        for (const [roleId, e] of BY_ID) {
          if (SYSTEM_STEP_IDS.has(roleId)) continue;
          if (!scriptRoleIds.has(roleId)) continue; // 不在本剧本
          if (CONDITIONAL.has(roleId)) continue;
          const p = isFirstNight ? e.firstNightPriority : e.otherNightPriority;
          if (typeof p !== "number" || p <= 0) continue;
          // 自身带「仅首夜」/「仅后续夜」约束的，按约束判
          if (isFirstNight && (e as any).otherNightOnly === true) continue;
          if (!isFirstNight && (e as any).firstNightOnly === true) continue;
          if (!present.has(roleId)) missing.push(`${roleId}(${e.roleName ?? ""})`);
        }
        expect(
          missing,
          `${name} ${nightLabel}：官方表声明这些角色该夜唤醒，但队列里没有：${missing.join(", ")}`
        ).toEqual([]);
      });
    }

    it("自检：白名单里每个角色都真实存在于官方夜序表（防白名单腐烂）", () => {
      const unknown = Object.keys(DEFERRED).filter((id) => !BY_ID.has(id));
      expect(
        unknown,
        `白名单出现官方表里不存在的 id（写错了或角色已删）：${unknown.join(", ")}`
      ).toEqual([]);
    });
  }
});
