#!/bin/bash

# 修复所有缺少Seat导入的文件
for file in src/roles/demon/hadesia.ts src/roles/demon/no_dashii.ts src/roles/demon/po.ts src/roles/demon/shabaloth.ts src/roles/demon/vortox.ts src/roles/demon/zombuul.ts src/roles/minion/assassin.ts src/roles/minion/cerenovus.ts src/roles/minion/devils_advocate.ts; do
    if [ -f "$file" ]; then
        # 检查是否已经有Seat导入
        if ! grep -q "import.*Seat" "$file"; then
            # 添加导入
            sed -i '' '1s/^/import type { Seat } from "..\/..\/..\/app\/data";\n/' "$file"
            echo "Added Seat import to $file"
        fi
    fi
done

# 修复gameState问题
for file in src/roles/demon/pukka.ts src/roles/demon/shabaloth.ts src/roles/minion/assassin.ts src/roles/minion/devils_advocate.ts; do
    if [ -f "$file" ]; then
        # 移除gameState引用
        sed -i '' 's/const { targets, selfId, seats, gameState } = context;/const { targets, selfId, seats } = context;/g' "$file"
        sed -i '' 's/const { targets, selfId, seats, gameState } = context;/const { targets, selfId, seats } = context;/g' "$file"
        echo "Fixed gameState in $file"
    fi
done

# 修复selectedRole问题
if [ -f "src/roles/minion/cerenovus.ts" ]; then
    sed -i '' 's/const { targets, selfId, seats, selectedRole } = context;/const { targets, selfId, seats } = context;/g' "src/roles/minion/cerenovus.ts"
    echo "Fixed selectedRole in src/roles/minion/cerenovus.ts"
fi

# 修复隐式any类型
if [ -f "src/roles/demon/shabaloth.ts" ]; then
    sed -i '' 's/(targetId)/(targetId: number)/g' "src/roles/demon/shabaloth.ts"
    sed -i '' 's/(t)/(t: any)/g' "src/roles/demon/shabaloth.ts"
    echo "Fixed implicit any types in src/roles/demon/shabaloth.ts"
fi

