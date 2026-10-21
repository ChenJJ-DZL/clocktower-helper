import { roles as ALL_ROLES, type Role, type Script } from "../../app/data";
import { nightOrderParser } from "./nightOrderParser";
import { injectChoirboyKing } from "./expansionMechanics";
import { nextDealRandom } from "./dealRng";
import {
  STANDARD_COMPOSITIONS as SST_STANDARD_COMPOSITIONS,
  computeSetupComposition,
} from "./setupComposition";

// ⚠️ 2026-09-20（P0-10）：配比表已收敛为**唯一事实来源** `utils/setupComposition.ts`。
//   此处改为再导出（保持既有 import 路径兼容），**不得**再另行定义一份。
export const STANDARD_COMPOSITIONS = SST_STANDARD_COMPOSITIONS;

/**
 * 随机洗牌
 *
 * ⚠️ 2026-10-20：随机源改为**发牌专用** `nextDealRandom()`，不再直接用全局
 *   `Math.random`。原因：同页面里渲染路径也在调 `Math.random`（React key /
 *   快照 id 等），调用次数随渲染批次变化 ⇒ 同一 E2E seed 每次发出的阵容都不同，
 *   回归不成立。详见 `utils/dealRng.ts` 注释。
 */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(nextDealRandom() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 从池中随机抽取 n 个元素
 */
function pick<T>(pool: T[], n: number): T[] {
  return shuffle(pool).slice(0, Math.min(n, pool.length));
}

/**
 * 获取角色在夜间行动的排序权重
 * 规则：首夜有行动的角色排在前列；其次是非首夜有行动的角色；最后是纯被动角色
 */
export function getRoleActionSortWeight(roleId: string): number {
  const firstPriority = nightOrderParser.getRolePriority(roleId, true);
  const otherPriority = nightOrderParser.getRolePriority(roleId, false);

  // 首夜有行动 (1 ~ 900)
  if (firstPriority > 0 && firstPriority < 900) {
    return firstPriority;
  }
  // 非首夜有行动 (1000 ~ 1900)
  if (otherPriority > 0 && otherPriority < 900) {
    return 1000 + otherPriority;
  }
  // 纯被动角色 (2000+)
  return 2000;
}

/**
 * 按照规则为指定人数生成随机阵容，并按角色行动顺序排序
 */

/**
 * E2E 专用：强制指定阵容（`window.__CT_FORCE_LINEUP__ = string[]`）。
 *
 * 为什么要它：按剧本逐角色验证时，靠随机发牌碰角色是不可控也不可复现的
 * （15 人局要凑齐 15 个指定角色，命中概率接近 0）。注入后发牌器照单发。
 *
 * 安全边界：
 *   · 未注入 / 空数组 ⇒ 返回 null，**行为与原来完全一致**（生产路径不受影响）；
 *   · 长度与人数不符 ⇒ 抛错（不静默补人）；
 *   · 含剧本外角色 / 未注册 id ⇒ 抛错并列出名字（不静默换人）。
 */
/** 长度不符的告警只打印一次/人数，避免预览重算刷屏 */
const warnedMismatch = new Set<number>();

/** 官方 setup 规则会**凭空注入**的角色：唱诗男孩在场时必须带国王 */
const SETUP_INJECTABLE_ROLE_IDS = new Set(["king"]);

function readForcedLineup(
  availableRoles: Role[],
  allRoles: Role[],
  playerCount: number,
  scriptName: string
): Role[] | null {
  if (typeof window === "undefined") return null;
  const forced = (window as any).__CT_FORCE_LINEUP__;
  if (!Array.isArray(forced) || forced.length === 0) return null;
  if (forced.length !== playerCount) {
    /**
     * ⚠️ 长度不符**不能抛错**：`QuickStartModal` 在打开时会用默认人数
     *   （5 人）先算一次预览阵容，注入了 15 人阵容时这里必然不等 ——
     *   抛错会把弹窗直接打崩，连人数都选不了（实测）。
     *   正确语义：这次调用不是给它的 ⇒ 返回 null 走随机，并留一条告警。
     *   真正的兜底在 E2E 侧：用例会断言「发出的牌 === 注入的牌」，
     *   注入长度写错时该断言必然失败，不会静默放过。
     */
    if (!warnedMismatch.has(playerCount)) {
      warnedMismatch.add(playerCount);
      console.warn(
        `[quickStartGenerator] __CT_FORCE_LINEUP__ 长度 ${forced.length} ≠ 人数 ${playerCount}` +
          ` ⇒ 本次调用按随机发牌（预览路径），实际发牌时人数必须相等`
      );
    }
    return null;
  }
  const byId = new Map(availableRoles.map((r) => [r.id, r]));
  const out: Role[] = [];
  const missing: string[] = [];
  for (const id of forced) {
    // 唱诗男孩会把一名镇民换成国王（官方 [+国王]），这个 id 可能不在剧本池里
    const hit =
      byId.get(String(id)) ??
      (SETUP_INJECTABLE_ROLE_IDS.has(String(id))
        ? allRoles.find((r) => r.id === String(id))
        : undefined);
    if (!hit) {
      missing.push(String(id));
      continue;
    }
    out.push(hit);
  }
  if (missing.length > 0) {
    throw new Error(
      `[quickStartGenerator] __CT_FORCE_LINEUP__ 含不在剧本「${scriptName}」的角色：` +
        missing.join(", ")
    );
  }
  return out;
}

export function generateAndSortQuickStartLineup(
  script: Script,
  allRoles: Role[],
  playerCount: number
): {
  sortedRoles: Array<
    Role & {
      charadeRole?: Role | null;
      apparentDemonRole?: Role | null;
      displayRole?: Role | null;
    }
  >;
  hasBaron: boolean;
  composition: {
    townsfolk: number;
    outsider: number;
    minion: number;
    demon: number;
  };
} {
  const scriptRoleIds = new Set(script.roleIds || []);
  const availableRoles = allRoles.filter((r) => scriptRoleIds.has(r.id));

  const groups = {
    townsfolk: availableRoles.filter((r) => r.type === "townsfolk"),
    outsider: availableRoles.filter((r) => r.type === "outsider"),
    minion: availableRoles.filter((r) => r.type === "minion"),
    demon: availableRoles.filter((r) => r.type === "demon"),
  };

  /** E2E 强制阵容（未注入时为 null ⇒ 走原随机路径） */
  const forcedRoles = readForcedLineup(availableRoles, allRoles, playerCount, script.name);

  const baseComp = STANDARD_COMPOSITIONS[playerCount] || {
    townsfolk: Math.max(0, playerCount - 2),
    outsider: 0,
    minion: 1,
    demon: 1,
  };

  let pickedMinions: Role[] = [];
  let pickedOutsiders: Role[] = [];
  let pickedTownsfolk: Role[] = [];
  let finalDemons: Role[] = [];
  let hasBaron = false;

  if (forcedRoles) {
    /**
     * 强制阵容分支：只校验「能不能发」，不替调用方补齐。
     * 配比与人数配比不一致时**抛错**——否则会出现「注入了 15 个角色，
     * 实际发出 14 个 + 随机补 1 个」的静默走私，覆盖表就失真了。
     */
    const cnt = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
    for (const r of forcedRoles) {
      if (r.type === "townsfolk") cnt.townsfolk++;
      else if (r.type === "outsider") cnt.outsider++;
      else if (r.type === "minion") cnt.minion++;
      else if (r.type === "demon") cnt.demon++;
    }
    const forcedLegion = forcedRoles.some((r) => r.id === "legion");
    if (!forcedLegion) {
      const expected = computeSetupComposition(playerCount, {
        baronInPlay: forcedRoles.some((r) => r.id === "baron"),
        availableOutsiderPool: groups.outsider.length,
        // ⚠️ 2026-10-21：强制阵容里**所有**角色都已知 ⇒ 把在场 id 全部传进去。
        //   否则 setup 修正角色（方古 / 亡骨魔 / 教父 / 气球驾驶员）会被漏算，
        //   配比期望值偏掉 ⇒ 误判「配比非法」抛错（E2E 卡死）。
        inPlayRoleIds: forcedRoles.map((r) => r.id),
      });
      const exp = expected.counts;
      const mismatch: string[] = [];
      if (cnt.townsfolk !== exp.townsfolk) mismatch.push(`镇民 ${cnt.townsfolk}≠${exp.townsfolk}`);
      if (cnt.outsider !== exp.outsider) mismatch.push(`外来者 ${cnt.outsider}≠${exp.outsider}`);
      if (cnt.minion !== exp.minion) mismatch.push(`爪牙 ${cnt.minion}≠${exp.minion}`);
      if (cnt.demon !== exp.demon) mismatch.push(`恶魔 ${cnt.demon}≠${exp.demon}`);
      if (mismatch.length > 0) {
        throw new Error(
          `[quickStartGenerator] __CT_FORCE_LINEUP__ 配比非法（${script.name} ${playerCount} 人）：` +
            mismatch.join("，")
        );
      }
    }
    pickedTownsfolk = forcedRoles.filter((r) => r.type === "townsfolk");
    pickedOutsiders = forcedRoles.filter((r) => r.type === "outsider");
    pickedMinions = forcedRoles.filter((r) => r.type === "minion");
    finalDemons = forcedRoles.filter((r) => r.type === "demon");
    hasBaron = forcedRoles.some((r) => r.id === "baron");
  } else {
    // 1. 抽取恶魔
    const pickedDemon = pick(groups.demon, baseComp.demon);
    const isLegion = pickedDemon.some((r) => r.id === "legion");


    if (isLegion) {
      // 军团（Legion）专属开局规则：
      // 1. 无爪牙 (No Minions)
      // 2. 善良玩家数量减少（反转，等于通常邪恶数量 minion + demon）
      // 3. 其余所有玩家均为【军团】(Legion, Demon)
      // 4. 共享 3 个不在场的镇民伪装
      const targetGoodCount = Math.max(1, baseComp.minion + baseComp.demon);
      const targetOutsiders = Math.min(
        baseComp.outsider > 0 ? 1 : 0,
        groups.outsider.length,
        Math.max(0, targetGoodCount - 1)
      );
      const targetTownsfolk = targetGoodCount - targetOutsiders;
      pickedTownsfolk = pick(groups.townsfolk, targetTownsfolk);
      pickedOutsiders = pick(groups.outsider, targetOutsiders);
      pickedMinions = [];
      hasBaron = false;

      const legionCount =
        playerCount - (pickedTownsfolk.length + pickedOutsiders.length);
      const legionTemplate =
        pickedDemon.find((r) => r.id === "legion") ||
        ({
          id: "legion",
          name: "军团",
          type: "demon",
          ability:
            "每个夜晚*，可能有一名玩家死亡。如果一项提名只有邪恶玩家投票，投票无效。你也会被当作是爪牙。[多数玩家为军团]",
        } as Role);

      finalDemons = Array.from({ length: legionCount }, () => ({
        ...legionTemplate,
      }));
    } else {
      // 常规模式：优先抽取爪牙与男爵判定
      pickedMinions = pick(groups.minion, baseComp.minion);
      hasBaron = pickedMinions.some((r) => r.id === "baron");

      // ⚠️⚠️ 2026-09-20 修复 P0-10：男爵 +2 **改为走唯一事实来源**。
      //   旧实现内联 `Math.min(2, maxOutsidersAvailable - outsiderCount)`
      //   且**静默少配**（池子不足时不提示），与 setup UI / 男爵能力三方分叉。
      //   现在统一调用 `computeSetupComposition`，并把告警带出去。
      // ⚠️⚠️ 2026-10-21：setup 修正角色（方古 / 亡骨魔 / 教父 / 气球驾驶员）的配比
      //   修正也统一由 `computeSetupComposition` 出数 —— 把**已抽到的**
      //   爪牙 + 恶魔 id 传进去（这四种角色在本仓分属爪牙/恶魔，抽到即在场）。
      const composition = computeSetupComposition(playerCount, {
        baronInPlay: hasBaron,
        availableOutsiderPool: groups.outsider.length,
        inPlayRoleIds: [
          ...pickedMinions.map((r) => r.id),
          ...pickedDemon.map((r) => r.id),
        ],
      });
      const outsiderCount = composition.counts.outsider;
      const townsfolkCount = composition.counts.townsfolk;
      if (composition.warnings.length > 0) {
        // 不静默：开局前把配比告警打到控制台（UI 层应同样展示）
        console.warn(
          "[quickStartGenerator] 配比告警：\n" +
            composition.warnings.map((w) => ` · ${w}`).join("\n")
        );
      }

      pickedOutsiders = pick(groups.outsider, outsiderCount);
      pickedTownsfolk = pick(groups.townsfolk, townsfolkCount);
      finalDemons = pickedDemon;
    }
  }

  const rawSelected: Role[] = [
    ...pickedTownsfolk,
    ...pickedOutsiders,
    ...pickedMinions,
    ...finalDemons,
  ];

  // 4. 特殊角色伪装配置：根据官方规则，落座时保持原角色（无伪装身份），必须由说书人右键设置或下一步强制弹窗手动选择
  const processedRoles = rawSelected.map((r) => {
    const roleCopy = { ...r } as Role & {
      charadeRole?: Role | null;
      apparentDemonRole?: Role | null;
      displayRole?: Role | null;
    };
    roleCopy.charadeRole = null;
    roleCopy.apparentDemonRole = null;
    roleCopy.displayRole = null;
    return roleCopy;
  });

  // 5. 按照阵营（镇民 -> 外来者 -> 爪牙 -> 恶魔）主排序，阵营内按夜间行动顺序副排序
  const typeOrder: Record<string, number> = {
    townsfolk: 1,
    outsider: 2,
    minion: 3,
    demon: 4,
  };

  const sortedRoles = [...processedRoles].sort((a, b) => {
    const tA = typeOrder[a.type] || 5;
    const tB = typeOrder[b.type] || 5;
    if (tA !== tB) {
      return tA - tB;
    }
    const weightA = getRoleActionSortWeight(a.id);
    const weightB = getRoleActionSortWeight(b.id);
    if (weightA !== weightB) {
      return weightA - weightB;
    }
    return a.id.localeCompare(b.id);
  });

  // 6. 🎪 提线木偶（Marionette）特殊座次规则：必须与恶魔相邻（小怪宝时与爪牙相邻）
  const ensuredRoles = ensureMarionetteAdjacency(sortedRoles);

  // 7. 👑 [+国王] 设置调整：唱诗男孩在场且国王不在场 ⇒ 用国王**替换**一名其他镇民
  //    官方：「在游戏设置阶段，如果唱诗男孩在场而国王不在场，那么国王就会被添加进来
  //    并替换掉一个其他镇民。」
  //    ⚠️ 快速开局**不经 `useSeatManager.changeRole`** ⇒ 不会触发 `IRoleAbility.onSetup`，
  //      因此必须在此显式调用**同一个** SST 纯函数（否则两条设置路径行为不一致）。
  const kingRole = (ALL_ROLES as any[]).find((r: any) => r.id === "king");
  const kingInjected = injectChoirboyKing(
    ensuredRoles.map((r: any) => ({ id: r.id, type: r.type, __src: r })) as any[],
    kingRole ? ({ id: kingRole.id, type: kingRole.type, __src: kingRole } as any) : undefined
  );
  const finalRoles = kingInjected.changed
    ? ensuredRoles.map((r: any) =>
        r.id === kingInjected.replacedId ? (kingRole as any) : r
      )
    : ensuredRoles;

  return {
    sortedRoles: finalRoles,
    hasBaron,
    composition: {
      townsfolk: pickedTownsfolk.length,
      outsider: pickedOutsiders.length,
      minion: pickedMinions.length,
      demon: finalDemons.length,
    },
  };
}

/**
 * 🎪 提线木偶（Marionette）邻座保障算法
 * 官方规则：提线木偶必须与恶魔相邻；若恶魔为小怪宝（Lil' Monsta）则必须与一名爪牙相邻。
 * 无论外部如何洗牌打乱，此函数保证提线木偶在圆环上与目标物理相邻。
 */
export function ensureMarionetteAdjacency<
  T extends { id: string; type: string },
>(roles: T[]): T[] {
  const result = [...roles];
  const marionetteIdx = result.findIndex((r) => r.id === "marionette");
  if (marionetteIdx === -1 || result.length <= 2) return result;

  const hasLilMonsta = result.some((r) => r.id === "lil_monsta");
  const targetIdx = result.findIndex(
    hasLilMonsta
      ? (r) => r.type === "minion" && r.id !== "marionette"
      : (r) => r.type === "demon"
  );

  if (targetIdx === -1) return result;

  const len = result.length;
  const diff = Math.abs(marionetteIdx - targetIdx);
  const isAdjacent = diff === 1 || diff === len - 1;

  if (!isAdjacent) {
    const [mRole] = result.splice(marionetteIdx, 1);
    const newTargetIdx = result.findIndex(
      hasLilMonsta
        ? (r) => r.type === "minion" && r.id !== "marionette"
        : (r) => r.type === "demon"
    );
    // 优先插入到恶魔邻座（newTargetIdx + 1）
    result.splice((newTargetIdx + 1) % (result.length + 1), 0, mRole);
  }

  return result;
}
