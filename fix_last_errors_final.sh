#!/bin/bash

echo "Fixing last errors..."

# 修复evil_twin.ts
if [ -f "src/roles/minion/evil_twin.ts" ]; then
    sed -i '' 's/const { targets, selfId, seats, gameState } = context;/const { targets, selfId, seats } = context;/g' "src/roles/minion/evil_twin.ts"
    echo "Fixed evil_twin.ts"
fi

# 修复shaman.ts
if [ -f "src/roles/minion/shaman.ts" ]; then
    sed -i '' 's/const { targets, selfId, seats, gameState, isFirstNight } = context;/const { targets, selfId, seats } = context;/g' "src/roles/minion/shaman.ts"
    echo "Fixed shaman.ts"
fi

# 修复witch.ts中的sourcePlayerId问题
if [ -f "src/roles/minion/witch.ts" ]; then
    sed -i '' 's/sourcePlayerId/sourceId/g' "src/roles/minion/witch.ts"
    echo "Fixed witch.ts"
fi

# 修复balloonist.ts
if [ -f "src/roles/townsfolk/balloonist.ts" ]; then
    sed -i '' 's/const { targets, selfId, seats, gameState } = context;/const { targets, selfId, seats } = context;/g' "src/roles/townsfolk/balloonist.ts"
    echo "Fixed balloonist.ts"
fi

# 修复engineer.ts
if [ -f "src/roles/townsfolk/engineer.ts" ]; then
    sed -i '' 's/const { targets, selfId, seats, selectedRoles, gameState } = context;/const { targets, selfId, seats } = context;/g' "src/roles/townsfolk/engineer.ts"
    echo "Fixed engineer.ts"
fi

echo "All files fixed!"

