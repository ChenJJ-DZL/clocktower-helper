import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 艺术家
 * TODO: 添加角色描述
 */
export const artist: RoleDefinition = {
  id: "artist",
  name: "艺术家",
  type: "townsfolk",
  day: {
    name: "提问",
    maxUses: 1,
    target: {
      min: 0,
      max: 0
    },
    handler: (context) => {
      return {
        updates: [],
        logs: {
          privateLog: "艺术家发动了提问技能"
        },
        modal: {
          type: 'ARTIST_RESULT',
          data: {
            result: ''
          }
        }
      };
    }
  }
};
