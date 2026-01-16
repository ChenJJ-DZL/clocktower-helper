import { RoleDefinition, ExecutionContext, ExecutionResult } from "../../types/roleDefinition";
import { Seat } from "../../types/game";

/**
 * 僵怖
 * 第一次被处决时假死，保留夜间行动但消耗一次生命
 */
export const zombuul: RoleDefinition = {
  id: "zombuul",
  name: "僵怖",
  type: "demon",
  
  night: {
    order: (isFirstNight) => isFirstNight ? 0 : 8,
    
    target: {
      count: {
        min: 0,
        max: 0,
      },
    },
    
    dialog: (playerSeatId: number, isFirstNight: boolean) => {
      return {
        wake: `唤醒${playerSeatId + 1}号玩家（僵怖）。`,
        instruction: "请执行行动",
        close: `${playerSeatId + 1}号玩家（僵怖），请闭眼。`,
      };
    },
    
    handler: (context) => {
      // TODO: 实现角色逻辑
      return {
        updates: [],
        logs: {
          privateLog: `僵怖（${context.selfId + 1}号）执行了行动`,
        },
      };
    },
  },
  
  /**
   * 僵怖被处决时的特殊处理
   * 第一次被处决时假死，保留夜间行动
   */
  onExecution: (context: ExecutionContext): ExecutionResult => {
    const { executedSeat } = context;
    const zombuulLives = executedSeat.zombuulLives ?? 1;
    
    // 如果还有生命且是第一次假死
    if (zombuulLives > 0 && !executedSeat.isZombuulTrulyDead && !executedSeat.isFirstDeathForZombuul) {
      const details = executedSeat.statusDetails || [];
      const hasFakeDeathTag = details.includes('僵怖假死');
      
      return {
        handled: true,
        seatUpdates: [{
          id: executedSeat.id,
          isDead: false, // 假死，逻辑上仍视为存活
          isFirstDeathForZombuul: true,
          isZombuulTrulyDead: false,
          zombuulLives: Math.max(0, zombuulLives - 1),
          statusDetails: hasFakeDeathTag ? details : [...details, '僵怖假死'],
        }],
        logs: {
          publicLog: `${executedSeat.id + 1}号僵 被处决假死游戏继续`,
        },
        shouldContinueToNight: true, // 继续到下一个夜晚
      };
    }
    
    // 如果生命耗尽，真正死亡
    if (zombuulLives <= 0 || executedSeat.isZombuulTrulyDead) {
      return {
        handled: true,
        seatUpdates: [{
          id: executedSeat.id,
          isDead: true,
          isZombuulTrulyDead: true,
          zombuulLives: 0,
        }],
        gameOver: {
          winResult: 'good',
          winReason: '僵怖被处决',
        },
        logs: {
          publicLog: `${executedSeat.id + 1}号僵 被处决真正死亡`,
          privateLog: '游戏结束：僵怖被处决，好人阵营获胜',
        },
      };
    }
    
    // 默认处理
    return {
      handled: false,
    };
  },
};
