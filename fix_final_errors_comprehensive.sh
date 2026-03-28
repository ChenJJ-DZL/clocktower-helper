#!/bin/bash

echo "Fixing all remaining errors comprehensively..."

# 修复evil_twin.ts
if [ -f "src/roles/minion/evil_twin.ts" ]; then
    # 移除gameState引用
    sed -i '' 's/const { selfId, seats, gameState } = context;/const { selfId, seats } = context;/g' "src/roles/minion/evil_twin.ts"
    # 移除gameState?.evilTwinCounterpart引用
    sed -i '' 's/const evilTwinCounterpart = gameState\?\.evilTwinCounterpart;/const evilTwinCounterpart = null;/g' "src/roles/minion/evil_twin.ts"
    echo "Fixed evil_twin.ts"
fi

# 修复shaman.ts
if [ -f "src/roles/minion/shaman.ts" ]; then
    # 移除gameState和isFirstNight引用
    sed -i '' 's/const { targets, selfId, seats, gameState, isFirstNight } = context;/const { targets, selfId, seats } = context;/g' "src/roles/minion/shaman.ts"
    echo "Fixed shaman.ts"
fi

# 修复balloonist.ts
if [ -f "src/roles/townsfolk/balloonist.ts" ]; then
    # 移除gameState引用
    sed -i '' 's/const { targets, selfId, seats, gameState } = context;/const { targets, selfId, seats } = context;/g' "src/roles/townsfolk/balloonist.ts"
    echo "Fixed balloonist.ts"
fi

# 修复engineer.ts
if [ -f "src/roles/townsfolk/engineer.ts" ]; then
    # 移除selectedRoles和gameState引用
    sed -i '' 's/const { targets, selfId, seats, selectedRoles, gameState } = context;/const { targets, selfId, seats } = context;/g' "src/roles/townsfolk/engineer.ts"
    echo "Fixed engineer.ts"
fi

echo "All files fixed!"

