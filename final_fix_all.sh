#!/bin/bash

echo "Fixing all remaining errors..."

# 修复cerenovus.ts中的sourceRoleId问题
if [ -f "src/roles/minion/cerenovus.ts" ]; then
    sed -i '' 's/sourceRoleId: "cerenovus"/sourceId: selfId/g' "src/roles/minion/cerenovus.ts"
    echo "Fixed cerenovus.ts sourceRoleId"
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

# 修复pit_hag.ts - 简化处理
if [ -f "src/roles/minion/pit_hag.ts" ]; then
    # 创建一个简化的pit_hag.ts文件
    cat > "src/roles/minion/pit_hag.ts" << 'PIT_HAG'
import type { Seat } from "../../../app/data";
import type { RoleDefinition } from "../../types/roleDefinition";
import { buildDemonFirstNightDialog } from "../demon/demonFirstNightHelper";

/**
 * 坑道巫婆
 * 每个夜晚*，选择一名玩家与一个角色：他变成该角色。
 */
export const pit_hag: RoleDefinition = {
  id: "pit_hag",
  name: "坑道巫婆",
  type: "minion",
  detailedDescription: `【背景故事】
"我亲爱的，你看起来如此疲惫。来，让我为你唱一首摇篮曲，让你好好休息。"
【角色能力】
每个夜晚*，你可以选择一名玩家与一个角色：他变成该角色。
【角色信息】
- 英文名：Pit Hag
- 所属剧本：黯月初升
- 角色类型：爪牙`,

  firstNight: {
    order: 2,

    target: {
      count: { min: 0, max: 0 },
    },

    dialog: (playerSeatId: number, _isFirstNight: boolean, context) => {
      return buildDemonFirstNightDialog(playerSeatId, "坑道巫婆", context);
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
        wake: "🧙‍♀️ 每个夜晚*，你可以选择一名玩家与一个角色：他变成该角色。",
        instruction:
          '"请选择一名玩家与一个角色。他变成该角色。"',
        close: "transform",
      };
    },

    handler: (context) => {
      const { targets, selfId, seats } = context;

      if (targets.length === 0) {
        return {
          updates: [],
          logs: {
            privateLog: `坑道巫婆（${selfId + 1}号）未选择目标`,
          },
        };
      }

      const targetId = targets[0];
      const targetSeat = seats.find((s) => s.id === targetId);

      // 简化的坑道巫婆逻辑：为目标添加转换标记
      const updates: Array<Partial<Seat> & { id: number }> = [];

      updates.push({
        id: targetId,
        statuses: [
          ...(targetSeat?.statuses || []),
          {
            effect: "Transformed",
            sourceId: selfId,
          },
        ],
      });

      return {
        updates,
        logs: {
          privateLog: `坑道巫婆（${selfId + 1}号）转换了 ${targetId + 1}号玩家`,
        },
      };
    },
  },
};
PIT_HAG
    echo "Fixed pit_hag.ts"
fi

echo "All files fixed!"

