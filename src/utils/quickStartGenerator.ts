import type { Role, Script } from "../../app/data";
import { nightOrderParser } from "./nightOrderParser";

// 官方标准人数阵营配比 (5 ~ 15 人)
export const STANDARD_COMPOSITIONS: Record<
  number,
  { townsfolk: number; outsider: number; minion: number; demon: number }
> = {
  5: { townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
  6: { townsfolk: 3, outsider: 1, minion: 1, demon: 1 },
  7: { townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
  8: { townsfolk: 5, outsider: 1, minion: 1, demon: 1 },
  9: { townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
  10: { townsfolk: 7, outsider: 0, minion: 2, demon: 1 },
  11: { townsfolk: 7, outsider: 1, minion: 2, demon: 1 },
  12: { townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
  13: { townsfolk: 9, outsider: 0, minion: 3, demon: 1 },
  14: { townsfolk: 9, outsider: 1, minion: 3, demon: 1 },
  15: { townsfolk: 9, outsider: 2, minion: 3, demon: 1 },
};

/**
 * 随机洗牌
 */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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

  const baseComp = STANDARD_COMPOSITIONS[playerCount] || {
    townsfolk: Math.max(0, playerCount - 2),
    outsider: 0,
    minion: 1,
    demon: 1,
  };

  // 1. 抽取恶魔
  const pickedDemon = pick(groups.demon, baseComp.demon);
  const isLegion = pickedDemon.some((r) => r.id === "legion");

  let pickedMinions: Role[] = [];
  let pickedOutsiders: Role[] = [];
  let pickedTownsfolk: Role[] = [];
  let finalDemons: Role[] = [];
  let hasBaron = false;

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

    let outsiderCount = baseComp.outsider;
    let townsfolkCount = baseComp.townsfolk;
    if (hasBaron) {
      const maxOutsidersAvailable = groups.outsider.length;
      const addedOutsiders = Math.min(2, maxOutsidersAvailable - outsiderCount);
      outsiderCount += addedOutsiders;
      townsfolkCount = Math.max(0, townsfolkCount - addedOutsiders);
    }

    pickedOutsiders = pick(groups.outsider, outsiderCount);
    pickedTownsfolk = pick(groups.townsfolk, townsfolkCount);
    finalDemons = pickedDemon;
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

  return {
    sortedRoles: ensuredRoles,
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
export function ensureMarionetteAdjacency<T extends { id: string; type: string }>(
  roles: T[]
): T[] {
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
