import type { RoleDefinition } from "../../types/roleDefinition";

/**
 * 红唇女郎 (Scarlet Woman)
 * 若恶魔死时活人>=5，她变恶魔（无夜晚行动，但可能在夜晚被唤醒）
 */
export const scarlet_woman: RoleDefinition = {
  id: "scarlet_woman",
  name: "红唇女郎",
  type: "minion",
  detailedDescription:
    "如果大于等于五名玩家存活时（旅行者不计算在内）恶魔死亡，你变成那个恶魔。\n\n**运作方式:**\n如果恶魔死亡，且在恶魔死前有五名或更多的存活玩家，红唇女郎立刻变成恶魔。她现在是恶魔，且具有恶魔的能力。如果她被处决，游戏结束，善良阵营获胜。在小恶魔选择自杀时，有五名或更多的玩家存活，必须是由红唇女郎来变成新的小恶魔（前提是红唇女郎此时能力正常生效）。\n\n**提示与技巧:**\n- 恶魔可以安全地死掉。也许恶魔可以在晚上自杀然后宣称自己是守鸦人，并证实你此前的伪装。也许你可以公开指出邪恶阵营的恶魔，然后恶魔再尽最大努力让大家相信他确实邪恶，这会让你看起来非常善良且值得信赖。\n- 与其他爪牙不同，在游戏前期你更需要“活下来”。你需要避免被首当其冲处决。\n- 如果恶魔在晚上没被杀到人，第二天早上只剩五位及以下的存活玩家时，你的能力就不会生效了。要注意如果恶魔快要死了就尽早把他们解决。\n- 等到只剩不到五人时，你可以大胆地为了恶魔挡刀牺牲自己。",
  clarifications: [
    "如果在恶魔被处决时少于五名玩家存活，游戏会结束，并且善良阵营获胜。红唇女郎不会由于自己的能力变成恶魔。",
    "在判断红唇女郎能力是否生效时，旅行者不被算作玩家数量，这不仅影响判断存活人数，也在计算胜利判定和任何人数相关能力中同样成立。",
    "特定角色互动：痢蛭：当宿主死亡时，如果在宿主死亡之前，场上除旅行者外存活玩家人数为5人，红唇女郎不会因此变成痢蛭。因为在痢蛭死亡时，场上的存活玩家的人数已经不足5人。（宿主与痢蛭的死亡并非同时进行的）",
  ],

  // 首夜：爪牙一同醒来指认恶魔（得知恶魔和爪牙的座位号，不暴露具体角色）
  firstNight: {
    order: 1,
    target: {
      count: { min: 0, max: 0 },
    },
    dialog: (playerSeatId, _isFirstNight, context) => {
      const seatNo = playerSeatId + 1;
      const { seats } = context || {};
      const sorted = [...(seats || [])].sort((a: any, b: any) => a.id - b.id);
      const demonSeats = sorted.filter((s: any) => s.role?.type === "demon");
      const minionSeats = sorted.filter(
        (s: any) => s.role?.type === "minion" && s.id !== playerSeatId
      );
      const demonText =
        demonSeats.length > 0
          ? `${demonSeats.map((s: any) => `${s.id + 1}号`).join("、")}`
          : "无";
      const minionText =
        minionSeats.length > 0
          ? `${minionSeats.map((s: any) => `${s.id + 1}号`).join("、")}`
          : "无";
      return {
        wake: `唤醒${seatNo}号【红唇女郎】，告知恶魔及爪牙座位号：恶魔 ${demonText}，爪牙 ${minionText}。`,
        instruction: "",
        close: "",
      };
    },
  },

  night: {
    order: (isFirstNight) => (isFirstNight ? 0 : 18),

    target: {
      count: {
        min: 0,
        max: 0,
      },
    },

    dialog: (playerSeatId: number) => ({
      wake: `唤醒${playerSeatId + 1}号【红唇女郎】。`,
      instruction: "如果在此时变成恶魔，请执行恶魔行动（否则闭眼）",
      close: "",
    }),

    handler: (context) => {
      // 红唇女郎变成恶魔的逻辑在其他地方处理
      return {
        updates: [],
        logs: {
          privateLog: `红唇女郎（${context.selfId + 1}号）检查是否变成恶魔`,
        },
      };
    },
  },
};
