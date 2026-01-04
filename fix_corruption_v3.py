import os

def fix_file_v3():
    files = {
        'app/data.ts': [
            # 修复 data.ts 的接口定义
            ('【:', '?:'),
            ('】:', '?:'),
            ('【', '?'),
            ('】', '?'),
        ],
        'app/page.tsx': [
            # === 1. 修复 className 中的三元运算符 (被变成双冒号的情况) ===
            # 模式: "条件 : '样式A' : '样式B'" -> "条件 ? '样式A' : '样式B'"
            
            # 通用状态
            ("isValid : '", "isValid ? '"),
            ("isTaken : '", "isTaken ? '"),
            ("isTargetDisabled(s) : '", "isTargetDisabled(s) ? '"),
            ("selectedActionTargets.includes(s.id) : '", "selectedActionTargets.includes(s.id) ? '"),
            ("selectedRole?.id===r.id : '", "selectedRole?.id===r.id ? '"),
            
            # 特定逻辑
            ("st.includes('投毒') : '", "st.includes('投毒') ? '"),
            ("s.hasGhostVote === false :", "s.hasGhostVote === false ?"),
            
            # === 2. 修复日志和显示逻辑 ===
            ("nextWakeSeat && nextWakeRole :", "nextWakeSeat && nextWakeRole ?"),
            ("logs[0].phase === 'night' :", "logs[0].phase === 'night' ?"),
            ("logs[0]?.phase === 'day' :", "logs[0]?.phase === 'day' ?"),
            ("logs[0].phase === 'dusk' :", "logs[0].phase === 'dusk' ?"),
            ("initialSeats.length > 0 :", "initialSeats.length > 0 ?"),
            
            # === 3. 修复使用状态 ===
            ("config.usage === 'once' :", "config.usage === 'once' ?"),
            ("hasUsedAbility :", "hasUsedAbility ?"),
            ("used : (", "used ? ("),
            
            # === 4. 修复特定的 ID 生成和字符串 ===
            # 有时候反引号丢失或被转义，这里尝试修复 ID 生成行
            ("id: `${Date.now()}", "id: `${Date.now()}"), # 确保这一行没被截断
            
            # === 5. 修复 data.ts 残留 (如果 page.tsx 里也有引用) ===
            ('【', '?'),
            ('】', '?'),
        ]
    }

    for file_path, replacements in files.items():
        if not os.path.exists(file_path):
            print(f"❌ 未找到 {file_path}")
            continue
            
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except:
            with open(file_path, 'r', encoding='gbk') as f: # 备用编码
                content = f.read()

        original = content
        for wrong, right in replacements:
            content = content.replace(wrong, right)

        if content != original:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"✅ 已修复 {file_path} 中的已知错误模式")
        else:
            print(f"ℹ️ {file_path} 未发现新匹配项")

if __name__ == '__main__':
    print("🚀 开始执行 V3 终极修复...")
    fix_file_v3()
    print("🏁 完成。")