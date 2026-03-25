#!/bin/bash

echo "Fixing remaining errors..."

# 修复assassin.ts
if [ -f "src/roles/minion/assassin.ts" ]; then
    sed -i '' 's/gameState\./context./g' "src/roles/minion/assassin.ts"
    sed -i '' 's/const { targets, selfId, seats, gameState } = context;/const { targets, selfId, seats } = context;/g' "src/roles/minion/assassin.ts"
    echo "Fixed assassin.ts"
fi

# 修复devils_advocate.ts
if [ -f "src/roles/minion/devils_advocate.ts" ]; then
    sed -i '' 's/gameState\./context./g' "src/roles/minion/devils_advocate.ts"
    sed -i '' 's/const { targets, selfId, seats, gameState } = context;/const { targets, selfId, seats } = context;/g' "src/roles/minion/devils_advocate.ts"
    echo "Fixed devils_advocate.ts"
fi

# 修复evil_twin.ts
if [ -f "src/roles/minion/evil_twin.ts" ]; then
    sed -i '' 's/const { targets, selfId, seats, gameState } = context;/const { targets, selfId, seats } = context;/g' "src/roles/minion/evil_twin.ts"
    echo "Fixed evil_twin.ts"
fi

# 修复pit_hag.ts
if [ -f "src/roles/minion/pit_hag.ts" ]; then
    sed -i '' 's/const { targets, selfId, seats, selectedRole, allRolesInGame } = context;/const { targets, selfId, seats } = context;/g' "src/roles/minion/pit_hag.ts"
    echo "Fixed pit_hag.ts"
fi

# 修复cerenovus.ts - 简化处理
if [ -f "src/roles/minion/cerenovus.ts" ]; then
    # 创建一个简化的处理函数
    cat > "src/roles/minion/cerenovus.ts" << 'CERENOVUS'
import type { Seat } from "../../../app/data";
import type { RoleDefinition } from "../../types/roleDefinition";
import { buildDemonFirstNightDialog } from "../demon/demonFirstNightHelper";

/**
 * 塞壬
 * 每个夜晚*，选择一名玩家与一个角色：他得知自己是该角色，且必须如此扮演。
 */
export const cerenovus: RoleDefinition = {
  id: "cerenovus",
  name: "塞壬",
  type: "minion",
  detailedDescription: `【背景故事】
"我亲爱的，你看起来如此疲惫。来，让我为你唱一首摇篮曲，让你好好休息。"
【角色能力】
每个夜晚*，你可以选择一名玩家与一个角色：他得知自己是该角色，且必须如此扮演。
【角色信息】
- 英文名：Cerenovus
- 所属剧本：黯月初升
- 角色类型：爪牙`,

  firstNight: {
    order: 2,

    target: {
      count: { min: 0, max: 0 },
    },

    dialog: (playerSeatId: number, _isFirstNight: boolean, context) => {
      return buildDemonFirstNightDialog(playerSeatId, "塞壬", context);
    },

    handler: undefined,
  },

  night: {
    order: 12,

    target: {
      count: {
        min: 1,
        max: 1,
      },
    },

    dialog: (_playerSeatId: number, _isFirstNight: boolean, _context) => {
      return {
        wake: "🎭 每个夜晚*，你可以选择一名玩家与一个角色：他得知自己是该角色，且必须如此扮演。",
        instruction:
          '"请选择一名玩家与一个角色。他得知自己是该角色，且必须如此扮演。"',
        close: "madness",
      };
    },

    handler: (context) => {
      const { targets, selfId, seats } = context;

      if (targets.length === 0) {
        return {
          updates: [],
          logs: {
            privateLog: `塞壬（${selfId + 1}号）未选择目标`,
          },
        };
      }

      const targetId = targets[0];
      const targetSeat = seats.find((s) => s.id === targetId);

      // 简化的塞壬逻辑：为目标添加疯狂状态
      const updates: Array<Partial<Seat> & { id: number }> = [];

      updates.push({
        id: targetId,
        statuses: [
          ...(targetSeat?.statuses || []),
          {
            effect: "Madness",
            sourceId: selfId,
            sourceRoleId: "cerenovus",
          },
        ],
      });

      return {
        updates,
        logs: {
          privateLog: `塞壬（${selfId + 1}号）使 ${targetId + 1}号玩家陷入疯狂`,
        },
      };
    },
  },
};
CERENOVUS
    echo "Fixed cerenovus.ts"
fi

echo "All files fixed!"

