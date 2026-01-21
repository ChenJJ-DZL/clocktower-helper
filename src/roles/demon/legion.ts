import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 军团 (Legion)
 * 说明：实验性恶魔，多数玩家为军团，提名只有邪恶投票则记 0 票，夜晚可能有 1 人死亡。
 * 当前占位：不改动投票/胜负/夜杀逻辑，仅供角色库与 UI 隐藏展示。
 */
export const legion: RoleDefinition = {
  id: "legion",
  name: "军团",
  type: "demon",
};



