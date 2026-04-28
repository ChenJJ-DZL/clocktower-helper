import type {
  NightActionContext,
  NightDialog,
} from "../../types/roleDefinition";

/**
 * 恶魔首夜通用逻辑：认爪牙（受罂粟种植者影响）
 * 被 pukka/zombuul/shabaloth/po/fang_gu/vigormortis/no_dashii/vortox/hadesia 共用
 */
export function buildDemonFirstNightDialog(
  _playerSeatId: number,
  _demonName: string,
  context: NightActionContext
): NightDialog {
  const { seats, poppyGrowerDead, selfId, roles = [] } = context;
  const currentSeatId = selfId;

  // 检查罂粟种植者状态：如果罂粟种植者在场且存活，恶魔不知道爪牙是谁
  const poppyGrower = seats.find((s) => s.role?.id === "poppy_grower");
  const shouldHideMinions =
    poppyGrower && !poppyGrower.isDead && poppyGrowerDead === false;

  if (shouldHideMinions) {
    return {
      wake: "🌺 罂粟种植者在场，你不知道你的爪牙是谁。",
      instruction: "罂粟种植者在场，你不知道你的爪牙是谁",
      close: "",
    };
  }

  const minions = seats
    .filter((s) => s.role?.type === "minion" && s.id !== currentSeatId)
    .map((s) => `${s.id + 1}号`);
  const minionText =
    minions.length > 0 ? `你的爪牙是 ${minions.join("、")}` : "场上没有爪牙";

  // 不在场角色：剧本中有但未分配给任何玩家的角色
  // 规则：恶魔只能看到3个不在场的镇民角色（最多可包括1名外来者）
  const assignedRoleIds = new Set(
    seats.filter((s) => s.role).map((s) => s.role!.id)
  );
  const absentRoles = roles.filter(
    (r) => !assignedRoleIds.has(r.id) && r.id !== "drunk"
  );

  // 按类型分组：镇民优先，外来者最多1个
  const absentTownsfolk = absentRoles.filter((r) => r.type === "townsfolk");
  const absentOutsider = absentRoles.filter((r) => r.type === "outsider");

  // 随机打乱并选取（使用简单的随机选择）
  const shuffledTownsfolk = [...absentTownsfolk].sort(() => Math.random() - 0.5);
  const shuffledOutsider = [...absentOutsider].sort(() => Math.random() - 0.5);

  const selectedAbsent: string[] = [];
  // 先取镇民，最多3个
  const townsfolkCount = Math.min(shuffledTownsfolk.length, 3);
  for (let i = 0; i < townsfolkCount; i++) {
    selectedAbsent.push(shuffledTownsfolk[i].name);
  }
  // 如果不足3个，用外来者补充（最多1个）
  if (selectedAbsent.length < 3 && shuffledOutsider.length > 0) {
    selectedAbsent.push(shuffledOutsider[0].name);
  }

  const absentText =
    selectedAbsent.length > 0
      ? `不在场角色：${selectedAbsent.join("、")}`
      : "无不在场角色";

  return {
    wake: `👿 ${minionText}；${absentText}`,
    instruction: `${minionText}；${absentText}`,
    close: "",
  };
}
