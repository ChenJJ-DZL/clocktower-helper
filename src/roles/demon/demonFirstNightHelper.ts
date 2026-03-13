import type { NightActionContext } from "../../types/roleDefinition";
import type { NightDialog } from "../../types/roleDefinition";

/**
 * 恶魔首夜通用逻辑：认爪牙（受罂粟种植者影响）
 * 被 pukka/zombuul/shabaloth/po/fang_gu/vigormortis/no_dashii/vortox/hadesia 共用
 */
export function buildDemonFirstNightDialog(
  playerSeatId: number,
  demonName: string,
  context: NightActionContext
): NightDialog {
  const { seats, poppyGrowerDead, selfId } = context;
  const currentSeatId = selfId;

  // 检查罂粟种植者状态：如果罂粟种植者在场且存活，恶魔不知道爪牙是谁
  const poppyGrower = seats.find(s => s.role?.id === 'poppy_grower');
  const shouldHideMinions = poppyGrower && !poppyGrower.isDead && poppyGrowerDead === false;

  if (shouldHideMinions) {
    return {
      wake: `🌺 罂粟种植者在场，你不知道你的爪牙是谁。`,
      instruction: `"罂粟种植者在场，你不知道你的爪牙是谁。"`,
      close: "无信息",
    };
  }

  const minions = seats
    .filter(s => s.role?.type === 'minion' && s.id !== currentSeatId)
    .map(s => `${s.id + 1}号`);

  return {
    wake: `👿 爪牙列表：${minions.length > 0 ? minions.join(', ') : '无'}。`,
    instruction: `"${minions.length > 0 ? `你的爪牙是 ${minions.join('、')}。` : '场上没有爪牙。'}请确认你的爪牙。"`,
    close: "无",
  };
}
