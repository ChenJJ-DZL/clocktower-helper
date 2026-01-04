import os
import re

def fix_file(file_path, fixes):
    if not os.path.exists(file_path):
        print(f"❌ 未找到 {file_path}，跳过。")
        return

    # 尝试用 utf-8 读取
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        print(f"⚠️ {file_path} 不是 UTF-8 编码，尝试用 GBK 读取...")
        with open(file_path, 'r', encoding='gbk') as f:
            content = f.read()

    original_content = content
    
    for fix_name, (pattern, replacement) in fixes.items():
        # 如果是字符串，直接替换
        if isinstance(pattern, str):
            content = content.replace(pattern, replacement)
        # 如果是正则，用 re.sub
        else:
            content = pattern.sub(replacement, content)

    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"✅ 已修复 {file_path}")
    else:
        print(f"ℹ️ {file_path} 无需修复或未匹配到已知模式")

def main():
    # === 1. 修复 app/data.ts (接口定义损坏) ===
    # 目标：将 'propertyName【: type' 或 'propertyName】: type' 修复为 'propertyName?: type'
    data_fixes = {
        "Fix brackets to optional": (re.compile(r'([a-zA-Z0-9_]+)\s*[【】]\s*:'), r'\1?:'),
        "Fix remaining brackets": (re.compile(r'[【】]'), '?'), # 兜底
    }
    fix_file('app/data.ts', data_fixes)

    # === 2. 修复 app/page.tsx (逻辑符号丢失) ===
    page_fixes = {
        # 修复背景颜色三元运算
        "Fix background style day": (
            "gamePhase==='day''rgb", 
            "gamePhase==='day'?'rgb"
        ),
        "Fix background style dusk": (
            "gamePhase==='dusk''rgb", 
            "gamePhase==='dusk'?'rgb"
        ),
        
        # 修复唤醒顺序计算 (order)
        "Fix order ternary": (
            "gamePhase === 'firstNight' :", 
            "gamePhase === 'firstNight' ?"
        ),
        "Fix firstNightOrder fallback": (
            "firstNightOrder 0", 
            "firstNightOrder || 0"
        ),
        "Fix otherNightOrder fallback": (
            "otherNightOrder 0", 
            "otherNightOrder || 0"
        ),

        # 修复初始玩家计数 (initialPlayerCount)
        "Fix initialPlayerCount ternary": (
            "initialSeats.length > 0 :", 
            "initialSeats.length > 0 ?"
        ),

        # 修复跳过游戏结束检查逻辑 (shouldSkipGameOver)
        "Fix shouldSkipGameOver logic": (
            "skipGameOverCheck (targetSeat", 
            "skipGameOverCheck || (targetSeat"
        ),

        # 修复位置计算 (targetX/Y)
        "Fix targetX ternary": (
            "targetX = seatRect : seatRect.left", 
            "targetX = seatRect ? seatRect.left"
        ),
        "Fix targetY ternary": (
            "targetY = seatRect ? seatRect.top : 0", # 假设这行可能还没坏，或者已经被上面的正则修了一部分，这里针对性修
            "targetY = seatRect ? seatRect.top : 0" 
        ),
        # 如果 seatRect ? 丢失变成了 seatRect : 
        "Fix seatRect broken ternary": (
            re.compile(r'target([XY])\s*=\s*seatRect\s*:\s*seatRect'),
            r'target\1 = seatRect ? seatRect'
        ),

        # 修复状态标签 (statusLabel)
        "Fix statusLabel seat.isDead": (
            "seat.isDead : '已死", 
            "seat.isDead ? '已死"
        ),
        "Fix statusLabel used": (
            "used ? (config.usage === 'once' : '已用", 
            "used ? (config.usage === 'once' ? '已用"
        ),
        "Fix statusLabel colon to ?": (
            ": '已用 : '今日已用'", 
            "? '已用' : '今日已用'"
        ),
        # 修复 '可使; -> '可使';
        "Fix string quote end": (
            "'可使;", 
            "'可使';"
        ),

        # 修复 used 变量计算
        "Fix used variable ternary": (
            "config.usage === 'once' : hasUsedAbility", 
            "config.usage === 'once' ? hasUsedAbility"
        ),
        "Fix used variable daily colon": (
            ": hasUsedDailyAbility", 
            ": hasUsedDailyAbility" # 这一行通常没事，主要是前面的 ? 丢了
        ),

        # 修复样式类名中的三元运算 (className)
        "Fix isTaken ternary": (
            "isTaken 'opacity", 
            "isTaken ? 'opacity"
        ),
        "Fix selectedRole ternary": (
            "selectedRole?.id===r.id'ring", 
            "selectedRole?.id===r.id ? 'ring"
        ),
        "Fix isTargetDisabled ternary": (
            "isTargetDisabled(s)'opacity", 
            "isTargetDisabled(s) ? 'opacity"
        ),
        "Fix selectedActionTargets ternary": (
            "selectedActionTargets.includes(s.id) 'bg-green", 
            "selectedActionTargets.includes(s.id) ? 'bg-green"
        ),
        
        # 修复死者票按钮逻辑
        "Fix ghost vote ternary": (
            "s.hasGhostVote === false :", 
            "s.hasGhostVote === false ?"
        ),
    }
    fix_file('app/page.tsx', page_fixes)

if __name__ == '__main__':
    print("🚀 开始执行 V2 深度修复...")
    main()
    print("🏁 修复完成！请重新运行 'npx tsc --noEmit' 验证。")
    