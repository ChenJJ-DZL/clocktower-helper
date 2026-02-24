import { RoleDefinition } from "../../types/roleDefinition";

/**
 * 博学者
 * TODO: 添加角色描述
 */
export const savant: RoleDefinition = {
  id: "savant",
  name: "博学者",
  type: "townsfolk",
  day: {
    name: "获取信息",
    maxUses: 'infinity',
    target: {
      min: 0,
      max: 0
    },
    handler: (context) => {
      return {
        updates: [],
        logs: {
          privateLog: "博学者发动了技能"
        },
        modal: {
          type: 'SAVANT_RESULT',
          data: {
            infoA: '',
            infoB: ''
          }
        }
      };
    }
  }
};
