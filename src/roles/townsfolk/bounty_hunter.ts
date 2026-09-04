// by 拜甘教成员-大长老
import type { Seat } from "../../../app/data";
import type { RoleDefinition } from "../../types/roleDefinition";

/**
 * 赏金猎人 (Bounty Hunter)
 * 官方能力：你在开局时会得知一名邪恶玩家。[会有一名镇民转变为邪恶阵营]
 * 每当你得知的玩家死亡，你会在当晚得知另一名邪恶玩家。
 */
export const bounty_hunter: RoleDefinition = {
  id: "bounty_hunter",
  name: "赏金猎人",
  type: "townsfolk",
  detailedDescription: `【角色能力】
你开局时会得知一名邪恶玩家。[会有一名镇民转变为邪恶阵营]
【运作方式】
在设置阶段，说书人需要将一名镇民玩家转变为邪恶阵营。
在首个夜晚，唤醒赏金猎人，指向一名邪恶玩家（可以是恶魔、爪牙，也可以是转变为邪恶的镇民）。
每当赏金猎人得知的邪恶玩家死亡，当晚赏金猎人会再次被唤醒并得知另一名存活的邪恶玩家。`,

  firstNight: {
    order: 72,
    target: { count: { min: 0, max: 0 } },
    dialog: (playerSeatId, _isFirstNight, context) => {
      const seatNo = playerSeatId + 1;
      const { seats, isActorDisabledByPoisonOrDrunk } = context;
      const selfSeat = seats.find((s) => s.id === playerSeatId);
      const isCorrupted = selfSeat && isActorDisabledByPoisonOrDrunk
        ? isActorDisabledByPoisonOrDrunk(selfSeat)
        : false;

      // 邪恶玩家列表（恶魔、爪牙、转邪恶镇民）
      const evilSeats = seats.filter(
        (s) =>
          s.id !== playerSeatId &&
          !s.isDead &&
          (s.role?.type === "demon" ||
            s.role?.type === "minion" ||
            s.isEvilConverted ||
            (s as any).alignment === "evil")
      );
      const goodSeats = seats.filter(
        (s) =>
          s.id !== playerSeatId &&
          !s.isDead &&
          !s.isEvilConverted &&
          (s as any).alignment !== "evil"
      );

      // 🎯 优先级规则：只要有其他邪恶玩家在场，优先推荐非恶魔玩家（爪牙、转邪恶镇民）
      const nonDemonEvils = evilSeats.filter((s) => s.role?.type !== "demon");
      const priorityEvils =
        nonDemonEvils.length > 0 ? nonDemonEvils : evilSeats;

      const targetPool =
        isCorrupted && goodSeats.length > 0
          ? goodSeats
          : priorityEvils.length > 0
            ? priorityEvils
            : seats.filter((s) => s.id !== playerSeatId);
      const target = targetPool[0];
      const targetNo = target ? target.id + 1 : "?";
      const targetRole = target?.role?.name || "未知角色";

      return {
        wake: `唤醒${seatNo}号【赏金猎人】，指向${targetNo}号玩家【${targetRole}】（告诉他${targetNo}号玩家是邪恶的）。`,
        instruction: isCorrupted
          ? "⚠️ 处于中毒或醉酒状态，请给出虚假信息（指向善良玩家）"
          : "指向一名邪恶玩家",
        close: "让赏金猎人重新入睡。",
      };
    },
  },

  night: {
    order: 105,
    target: { count: { min: 0, max: 0 } },
    dialog: (playerSeatId) => {
      const seatNo = playerSeatId + 1;
      return {
        wake: `唤醒${seatNo}号【赏金猎人】。如果他之前得知的邪恶玩家已死亡，指向一名新的邪恶玩家。`,
        instruction: "如果之前得知的目标已死亡，告知新邪恶目标；否则无需告知",
        close: "让赏金猎人重新入睡。",
      };
    },
  },

  // 赏金猎人在场时，设置阶段自动将一名镇民转变为邪恶阵营
  onSetup: (context: { seats: Seat[]; selfId: number }) => {
    const { seats, selfId } = context;

    // 候选人为除赏金猎人外的其他镇民
    const candidateTownsfolk = seats.filter(
      (s: Seat) =>
        s.id !== selfId &&
        s.role?.type === "townsfolk" &&
        !s.isEvilConverted
    );

    if (candidateTownsfolk.length > 0) {
      const randomIndex = Math.floor(Math.random() * candidateTownsfolk.length);
      const evilTarget = candidateTownsfolk[randomIndex];

      const prevDetails = evilTarget.statusDetails || [];
      const updatedDetails = prevDetails.includes("转为邪恶")
        ? prevDetails
        : [...prevDetails, "转为邪恶"];

      return {
        updates: [
          {
            id: evilTarget.id,
            isEvilConverted: true,
            alignment: "evil",
            statusDetails: updatedDetails,
          },
          {
            id: selfId,
            bountyHunterEvilConvertedId: evilTarget.id,
          },
        ],
        logs: {
          privateLog: `赏金猎人在场：${evilTarget.id + 1}号【${evilTarget.role?.name}】转变为邪恶阵营`,
        },
      } as any;
    }

    return { handled: false };
  },
};
