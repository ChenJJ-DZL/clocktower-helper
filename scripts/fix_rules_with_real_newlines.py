#!/usr/bin/env python3
"""
修复规则文件，使用真正的换行符（非标准JSON）
"""

import json
import os
import re

RULES_DIR = "json/rule"

def process_file(filepath):
    """处理单个文件，使用真正的换行符"""
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    modified = False
    
    # 处理内容字段
    if "内容" in data:
        content = data["内容"]
        
        # 分割成行
        lines = content.split('\n')
        fixed_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            # 检查是否以数字开头（如 "1. " 或 "1、"）
            if re.match(r'^\d+[\.\、]', line):
                # 确保末尾有句号
                if not line.endswith('。'):
                    line += '。'
            elif re.match(r'^[•\-*]', line):
                # 项目符号行，确保末尾有句号
                if not line.endswith('。'):
                    line += '。'
            elif line.endswith('：') or line.endswith(':'):
                # 标题行，不加句号
                pass
            else:
                # 其他行，根据情况添加句号
                if not line.endswith(('。', '！', '？', '.', '!', '?')):
                    line += '。'
            
            fixed_lines.append(line)
        
        # 重新组合，使用真正的换行符
        new_content = '\n'.join(fixed_lines)
        
        if new_content != content:
            data["内容"] = new_content
            modified = True
    
    if modified:
        # 写入文件，使用真正的换行符（非标准JSON）
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write('{\n')
            first = True
            for key, value in data.items():
                if not first:
                    f.write(',\n')
                first = False
                
                if key == "内容" and isinstance(value, str):
                    # 对于内容字段，使用真正的换行符
                    # 需要转义双引号
                    escaped_value = value.replace('"', '\\"')
                    # 将换行符分割成多行
                    lines = escaped_value.split('\n')
                    f.write(f'  "{key}": "')
                    for i, line in enumerate(lines):
                        if i > 0:
                            f.write('\\n')
                        f.write(line)
                    f.write('"')
                else:
                    f.write(f'  "{key}": {json.dumps(value, ensure_ascii=False)}')
            f.write('\n}')
        return True
    
    return False

def main():
    """主函数"""
    print("修复规则文件，使用真正的换行符...")
    
    if not os.path.exists(RULES_DIR):
        print(f"目录不存在: {RULES_DIR}")
        return
    
    files = os.listdir(RULES_DIR)
    json_files = [f for f in files if f.endswith('.json')]
    
    fixed_count = 0
    for filename in json_files:
        filepath = os.path.join(RULES_DIR, filename)
        print(f"处理: {filename}")
        
        try:
            if process_file(filepath):
                print(f"  已修复")
                fixed_count += 1
            else:
                print(f"  格式正确")
        except Exception as e:
            print(f"  错误: {e}")
    
    print(f"\n完成！处理了 {len(json_files)} 个文件，修复了 {fixed_count} 个文件")

if __name__ == "__main__":
    main()