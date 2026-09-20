// by 拜甘教成员-大长老
import type { Seat } from "../../../app/data";
import type { RoleDefinition } from "../../types/roleDefinition";
import { isSeatEvil } from "../../utils/seatAlignment";
import { applyBountyHunterEvilConversion } from "../../utils/bountyHunterSetup";

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
  //
  // ⚠️⚠️ 2026-09-20 修复 P1-2：**本 onSetup 与 `utils/bountyHunterSetup.ts` 曾双写入点分叉**。
  //   旧实现内联了转换逻辑，与 SST 有三处不一致：
  //     ① 用**裸 `Math.random()`**（SST 用 `createDeterministicRandom(seed)`）
  //        → 同一开局重开两次，转邪恶的可能是**不同的人**，无法复现上一局；
  //     ② **不剥离红罗刹**（SST 明确剥离）→ 红罗刹可能被误转邪恶，与说书人意图相悖；
  //     ③ 不检查幂等（SST 有 `seats.some(isEvilConverted)` 短路）。
  //   ⇒ 现改为**委托唯一事实来源** `applyBountyHunterEvilConversion`，
  //      本处只负责把结果翻译成 onSetup 的 updates 格式。
  onSetup: (context: { seats: Seat[]; selfId: number }) => {
    const { seats } = context;

    const { seats: converted, convertedSeatId } =
      applyBountyHunterEvilConversion(seats as any);

    if (convertedSeatId === null) {
      return { handled: false };
    }

    // 只回传**实际发生变化**的座位：被转换者 + 赏金猎人（记录 convertedId）
    const changed = converted.filter((s: any, i: number) => {
      const before = (seats as any)[i];
      if (!before) return true;
      return (
        s.isEvilConverted !== before.isEvilConverted ||
        s.alignment !== before.alignment ||
        (s.statusDetails ?? []).join("|") !==
          (before.statusDetails ?? []).join("|") ||
        s.bountyHunterEvilConvertedId !== before.bountyHunterEvilConvertedId
      );
    });

    const targetSeat = converted.find((s: any) => s.id === convertedSeatId);
    return {
      handled: true,
      updates: changed.map((s: any) => {
        const { id, ...patch } = s;
        return { id, ...patch };
      }),
      logs: {
        privateLog: `赏金猎人在场：${convertedSeatId + 1}号【${targetSeat?.role?.name ?? "镇民"}】转变为邪恶阵营（确定性抽取）`,
      },
    } as any;
  },
};
