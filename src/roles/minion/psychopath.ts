import { RoleDefinition, ExecutionContext, ExecutionResult } from "../../types/roleDefinition";

/**
 * 精神病患者
 * 被提名时，与提名者进行石头剪刀布，输则死亡
 */
export const psychopath: RoleDefinition = {
    id: "psychopath",
    name: "精神病患者",
    type: "minion",
    // 无夜晚行动

    /**
     * 精神病患者被处决时的特殊处理
     * 需要与提名者进行石头剪刀布
     */
    onExecution: (context: ExecutionContext): ExecutionResult => {
        const { executedSeat, nominationMap, skipLunaticRps } = context;

        // 如果跳过石头剪刀布，直接处决
        if (skipLunaticRps) {
            return {
                handled: false, // 使用默认处决逻辑
            };
        }

        // 需要石头剪刀布确认（由控制器处理弹窗）
        const nominatorId = nominationMap[executedSeat.id] ?? null;
        return {
            handled: true,
            shouldWait: true,
            logs: {
                privateLog: `精神病患者（${executedSeat.id + 1}号）被处决，需要与提名者进行石头剪刀布`,
            },
        };
    },
};
