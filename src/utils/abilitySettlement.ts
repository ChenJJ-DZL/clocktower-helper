/**
 * 能力结算产物生成器
 *
 * 部分能力（assassin/devils_advocate/half_ogre/pukka/zombuul 等）的
 * stateUpdate 只修改游戏状态，postProcess 为空 → 技能"发动了但无结算"：
 * 说书人提示（prompt）、游戏日志（abilityLog）、UI 弹窗数据（displayInfo）全缺失。
 *
 * 本工具提供通用结算 postProcess：按行动节点 + 目标生成三件套结算产物。
 * 信息类角色应使用各自能力内部的专属 postProcess（生成具体信息内容）。
 */
import type { MiddlewareContext } from "./middlewarePipeline";

export interface SettlementOptions {
  /** 结算文案类型（用于 displayInfo.type） */
  resultType?: string;
  /** 自定义日志生成（默认按目标生成通用文案） */
  buildLog?: (ctx: MiddlewareContext) => string;
  /** 自定义说书人提示（默认按目标生成通用提示） */
  buildPrompt?: (ctx: MiddlewareContext) => string;
}

function findLabel(ctx: MiddlewareContext, seatId: number): string {
  const seat = (ctx.snapshot.seats as any[]).find((s) => s.id === seatId);
  return seat?.playerName
    ? `${seat.playerName}(${seatId + 1}号)`
    : `${seatId + 1}号`;
}

/**
 * 生成通用结算 postProcess 中间件
 * 仅在 meta 尚无结算产物（prompt/abilityLog/displayInfo）时补充，避免覆盖专属产物。
 */
export function createSettlementPostProcess(
  roleName: string,
  options: SettlementOptions = {}
) {
  return async (context: MiddlewareContext): Promise<MiddlewareContext> => {
    const meta = context.meta ?? {};
    // 已有结算产物则跳过（专属 postProcess 优先）
    if (meta.prompt || meta.abilityLog || meta.displayInfo) return context;

    const node = context.actionNode;
    const seatNo = (node.seatId ?? 0) + 1;
    const targetIds: number[] = context.targetIds ?? [];
    const targetLabel =
      targetIds.length > 0
        ? targetIds.map((t) => findLabel(context, t)).join("、")
        : "（未选择目标）";

    const prompt =
      options.buildPrompt?.(context) ??
      `唤醒${seatNo}号【${roleName}】，已选择目标：${targetLabel}。`;
    const log =
      options.buildLog?.(context) ??
      `${roleName}发动能力：目标 ${targetLabel}。`;

    return {
      ...context,
      meta: {
        ...meta,
        prompt,
        abilityLog: log,
        displayInfo: {
          type: options.resultType ?? `${node.roleId}_action`,
          roleId: node.roleId,
          seatNo,
          targetIds,
          targetLabels: targetIds.map((t) => findLabel(context, t)),
          log,
          isCorrupted: meta.isCorrupted ?? false,
        },
      },
    };
  };
}
