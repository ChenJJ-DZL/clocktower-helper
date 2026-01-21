import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 水手 (Sailor)
 * 说明：每个夜晚，你要选择一名存活的玩家：你或他之一会醉酒直到下个黄昏。你不会死亡。
 * 当前占位：已在 nightLogic 中实现。
 */
export const sailor: RoleDefinition = {
  id: "sailor",
  name: "水手",
  type: "townsfolk",
};
