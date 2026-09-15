// by 拜甘教成员-大长老
import type { Seat } from "../../../app/data";
import type { RoleDefinition } from "../../types/roleDefinition";
import { isSeatEvil } from "../../utils/seatAlignment";

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
      const isCorrupted =
        selfSeat && isActorDisabledByPoisonOrDrunk
          ? isActorDisabledByPoisonOrDrunk(selfSeat)
          : false;

      // 邪恶玩家列表（统一走 utils/seatAlignment）
      const evilSeats = seats.filter(
        (s) => s.id !== playerSeatId && !s.isDead && isSeatEvil(s)
      );
      const goodSeats = seats.filter(
        (s) => s.id !== playerSeatId && !s.isDead && !isSeatEvil(s)
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
        wake: `唤醒${seatNo}号【赏金猎人】。（他之前得知的邪恶玩家已死亡）指向一名新的邪恶玩家。`,
        instruction: "告诉他新的邪恶目标；同一名邪恶玩家不会被告知两次",
        close: "让赏金猎人重新入睡。",
      };
    },
  },

  /**
   * 🔧 条件唤醒门控（官方：「每当你**得知**的玩家死亡，你会在**当晚**得知
   *    另一名邪恶玩家」——**不是每夜发动**）。
   *
   * 旧实现的 `night` 块没有任何门控，`generateNightTimeline` 的过滤条件就是
   * 「该角色有次夜配置」→ **每夜无条件唤醒**，说书人被空唤醒且每夜白送一名邪恶玩家。
   *
   * 判据：首夜必唤醒；其后仅当"当前得知的那名玩家（statusDetails 含「赏金已知」，
   * 即魔典上"得知"标记所在的那名）已死亡"的当晚唤醒。
   * ⚠️ 与 `roles/new_engine/bounty_hunter.ability.ts` 的
   *    `rotationOnlyAfterKnownDeathCheck` 同源（那边是执行期兜底，此处是队列层根因修复）。
   */
  shouldWake: (isFirstNight, seats) => {
    if (isFirstNight) return true;
    const known = seats.filter((s) => s.statusDetails?.includes("赏金已知"));
    if (known.length === 0) return true; // 异常兜底：无标记时保持原行为
    // 只认最后一枚"得知"标记：官方口径是"放置「得知」标记的玩家死亡时"才移动标记
    const current = known[known.length - 1];
    return current.isDead === true;
  },

  // 赏金猎人在场时，设置阶段自动将一名镇民转变为邪恶阵营
  onSetup: (context: { seats: Seat[]; selfId: number }) => {
    const { seats, selfId } = context;

    // 候选人为除赏金猎人外的其他镇民
    const candidateTownsfolk = seats.filter(
      (s: Seat) =>
        s.id !== selfId && s.role?.type === "townsfolk" && !s.isEvilConverted
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
