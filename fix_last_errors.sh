#!/bin/bash

echo "Fixing last errors..."

# 修复cerenovus.ts中的重复属性问题
if [ -f "src/roles/minion/cerenovus.ts" ]; then
    sed -i '' 's/sourceId: selfId,//g' "src/roles/minion/cerenovus.ts"
    echo "Fixed cerenovus.ts duplicate property"
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

# 修复shaman.ts
if [ -f "src/roles/minion/shaman.ts" ]; then
    sed -i '' 's/const { targets, selfId, seats, gameState, isFirstNight } = context;/const { targets, selfId, seats } = context;/g' "src/roles/minion/shaman.ts"
    echo "Fixed shaman.ts"
fi

# 修复witch.ts中的Seat导入
if [ -f "src/roles/minion/witch.ts" ]; then
    # 检查是否有Seat导入
    if ! grep -q "import.*Seat" "src/roles/minion/witch.ts"; then
        sed -i '' '1s/^/import type { Seat } from "..\/..\/..\/app\/data";\n/' "src/roles/minion/witch.ts"
        echo "Added Seat import to witch.ts"
    fi
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

# 修复unifiedRoleDefinition.ts中的Seat导入
if [ -f "src/roles/unifiedRoleDefinition.ts" ]; then
    # 检查是否有Seat导入
    if ! grep -q "import.*Seat" "src/roles/unifiedRoleDefinition.ts"; then
        sed -i '' '1s/^/import type { Seat } from "..\/..\/app\/data";\n/' "src/roles/unifiedRoleDefinition.ts"
        echo "Added Seat import to unifiedRoleDefinition.ts"
    fi
fi

echo "All files fixed!"

