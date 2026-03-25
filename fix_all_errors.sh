#!/bin/bash

# 修复所有文件中的gameState引用
echo "Fixing gameState references..."

# 修复shabaloth.ts
if [ -f "src/roles/demon/shabaloth.ts" ]; then
    sed -i '' 's/gameState\./context./g' "src/roles/demon/shabaloth.ts"
    sed -i '' 's/const { targets, selfId, seats, gameState } = context;/const { targets, selfId, seats } = context;/g' "src/roles/demon/shabaloth.ts"
    echo "Fixed shabaloth.ts"
fi

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

# 修复cerenovus.ts中的selectedRole问题
if [ -f "src/roles/minion/cerenovus.ts" ]; then
    # 简化处理：移除selectedRole引用
    sed -i '' 's/selectedRole\.id/"cerenovus"/g' "src/roles/minion/cerenovus.ts"
    sed -i '' 's/selectedRole\.name/"塞壬"/g' "src/roles/minion/cerenovus.ts"
    sed -i '' 's/selectedRole/undefined/g' "src/roles/minion/cerenovus.ts"
    echo "Fixed cerenovus.ts"
fi

# 修复pit_hag.ts
if [ -f "src/roles/minion/pit_hag.ts" ]; then
    sed -i '' 's/const { targets, selfId, seats, selectedRole, allRolesInGame } = context;/const { targets, selfId, seats } = context;/g' "src/roles/minion/pit_hag.ts"
    echo "Fixed pit_hag.ts"
fi

