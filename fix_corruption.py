import os

def fix_data_ts():
    file_path = 'app/data.ts'
    if not os.path.exists(file_path):
        print(f"未找到 {file_path}，跳过。")
        return

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 修复 data.ts 中的怪异括号，将其变回可选标记 '?'
    # 例如: fullDescription【: string -> fullDescription?: string
    new_content = content.replace('【:', '?:').replace('】:', '?:')
    
    # 再次兜底替换，防止冒号之间有空格
    new_content = new_content.replace('【', '?').replace('】', '?')

    if content != new_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"✅ 已修复 {file_path} 中的类型定义符号错误。")
    else:
        print(f"{file_path} 无需修复。")

def fix_page_tsx():
    file_path = 'app/page.tsx'
    if not os.path.exists(file_path):
        print(f"未找到 {file_path}，跳过。")
        return

    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_lines = []
    fixed_count = 0
    
    for line in lines:
        original = line
        
        # 修复背景颜色的三元运算符丢失
        # background: gamePhase==='day''rgb... -> gamePhase==='day'?'rgb...
        if "gamePhase==='day''rgb" in line:
            line = line.replace("gamePhase==='day''rgb", "gamePhase==='day'?'rgb")
            line = line.replace("gamePhase==='dusk''rgb", "gamePhase==='dusk'?'rgb")
            fixed_count += 1
            
        # 修复排序逻辑中的三元运算符和逻辑或丢失
        # const order = gamePhase === 'firstNight' : -> const order = gamePhase === 'firstNight' ?
        if "gamePhase === 'firstNight' :" in line:
            line = line.replace("gamePhase === 'firstNight' :", "gamePhase === 'firstNight' ?")
            fixed_count += 1
            
        # 修复 (roleSource.firstNightOrder 0) -> (roleSource.firstNightOrder || 0)
        if "firstNightOrder 0" in line:
            line = line.replace("firstNightOrder 0", "firstNightOrder || 0")
            fixed_count += 1
        if "otherNightOrder 0" in line:
            line = line.replace("otherNightOrder 0", "otherNightOrder || 0")
            fixed_count += 1

        new_lines.append(line)

    if fixed_count > 0:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write("".join(new_lines))
        print(f"✅ 已修复 {file_path} 中的 {fixed_count} 处逻辑符号缺失。")
    else:
        print(f"{file_path} 暂未发现已知模式的错误。")

if __name__ == '__main__':
    print("开始修复符号损坏...")
    fix_data_ts()
    fix_page_tsx()
    print("修复完成！请重新运行 'npm run dev' 或 'npx tsc --noEmit' 验证。")