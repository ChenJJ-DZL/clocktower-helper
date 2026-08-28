/**
 * 军团（Legion）开局角色类型反转工具
 *
 * 官方 Wiki（罂粟花开 1:1 规格书 24.军团）：
 *   "如果军团在场，推荐将在场善良和邪恶玩家的数量在通常的数量上进行反转。
 *    例如，在一局十人游戏中，你可以采取近似七名军团和三名善良玩家的设置。"
 *
 * 实现：
 *   - 输入：完整 24 角色配置（镇民+外来者+爪牙+恶魔）
 *   - 输出：调整后的配置，军团人数 = 原本 镇民+外来者，原本 恶魔+爪牙 转为镇民
 *
 * 触发：仅当 selectedScript.id === "poppyganda" 且 seats 中存在 role.id === "legion" 时
 */
import type { Role, Seat } from "../../app/data";

export interface LegionSwapInput {
  /** 当前座位快照 */
  seats: Seat[];
  /** 当前剧本所有可选角色 */
  scriptRoles: Role[];
}

export interface LegionSwapResult {
  /** 更新后的座位（role.type 已被反转） */
  seats: Seat[];
  /** 军团数 */
  legionCount: number;
  /** 由恶魔+爪牙转来的镇民数 */
  newTownsfolkCount: number;
  /** 是否应用了反转 */
  applied: boolean;
}

/**
 * 应用军团 setup 角色类型反转。
 * 规则：
 *   1. 计算当前分配中 townsfolk + outsider 总数 → 全部变为 legion (type=demon, role.id=legion)
 *   2. 计算 demon + minion 总数 → 全部变为 townsfolk (type=townsfolk)
 *   3. 同一玩家不能既是原镇民又变军团，所以采用"重新分配"策略：
 *      - 原镇民 + 原外来者 玩家 → 变 legion
 *      - 原恶魔 + 原爪牙 玩家 → 变 townsfolk
 *   4. 实际选角由 useSeatManager 在 setup 阶段按此规则重新分配角色池
 *
 * 注：此函数是"角色类型重新映射器"，用于验证反转逻辑；
 * 实际应用时由 useSeatManager 在 setup 阶段按此映射重新分发角色标记。
 */
export function applyLegionRoleSwap(input: LegionSwapInput): LegionSwapResult {
  const { seats, scriptRoles } = input;

  const hasLegion = seats.some((s) => s.role?.id === "legion");
  if (!hasLegion) {
    return {
      seats,
      legionCount: 0,
      newTownsfolkCount: 0,
      applied: false,
    };
  }

  // 找出原 镇民+外来者 玩家（将变 legion）
  // 注意：legion 已是 demon，不应包含在此 filter
  const townsfolkAndOutsiderSeats = seats.filter(
    (s) =>
      s.role &&
      s.role.id !== "legion" &&
      (s.role.type === "townsfolk" || s.role.type === "outsider")
  );
  // 找出原 恶魔+爪牙 玩家（将变 townsfolk）
  // 注意：legion 不应再次被转换
  const demonAndMinionSeats = seats.filter(
    (s) =>
      s.role &&
      s.role.id !== "legion" &&
      (s.role.type === "demon" || s.role.type === "minion")
  );

  // 找一个 townsfolk Role 作为新的镇民身份（默认用第一个 townsfolk）
  const townsfolkRoles = scriptRoles.filter((r) => r.type === "townsfolk");
  const defaultTownsfolk =
    townsfolkRoles[0] ??
    ({
      id: "washerwoman",
      name: "洗衣妇",
      type: "townsfolk",
    } as Role);

  // 找一个 outsider Role 作为新的"善良玩家"身份（保留角色池多样性）
  // 实际游戏中由 useSeatManager 在 setup 阶段按池重新分发
  const outsiderRoles = scriptRoles.filter((r) => r.type === "outsider");
  const newTownsfolk: Role =
    demonAndMinionSeats.length > 0 && outsiderRoles[0]
      ? ({ ...defaultTownsfolk, _originalType: outsiderRoles[0].type } as any)
      : defaultTownsfolk;

  // 应用映射：所有原 镇民+外来者 玩家 → legion；所有原 恶魔+爪牙 玩家 → townsfolk
  // 注意：原 legion 玩家保持不动（已是 demon，不再次转换）
  const newSeats = seats.map((s) => {
    if (!s.role) return s;
    // 原 legion 跳过（保持不变）
    if (s.role.id === "legion") return s;
    if (s.role.type === "townsfolk" || s.role.type === "outsider") {
      // 变 legion
      return {
        ...s,
        role: {
          id: "legion",
          name: "军团",
          type: "demon",
        } as Role,
        isEvilConverted: true,
      };
    }
    if (s.role.type === "demon" || s.role.type === "minion") {
      // 变 townsfolk（保留恶魔座位上的玩家变为镇民）
      return {
        ...s,
        role: newTownsfolk,
        isEvilConverted: false,
      };
    }
    return s;
  });

  return {
    seats: newSeats,
    legionCount: townsfolkAndOutsiderSeats.length,
    newTownsfolkCount: demonAndMinionSeats.length,
    applied: true,
  };
}

/**
 * 检测当前对局是否应应用军团反转。
 */
export function shouldApplyLegionSwap(seats: Seat[]): boolean {
  return seats.some((s) => s.role?.id === "legion");
}
