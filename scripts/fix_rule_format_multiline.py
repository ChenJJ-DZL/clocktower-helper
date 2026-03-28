#!/usr/bin/env python3
"""
修复规则JSON文件格式 - 多行版本
将内容中的"\n"替换为真正的换行，使JSON文件中的内容字段显示为多行字符串
"""

import json
import os
import re

# 规则目录
RULES_DIR = "json/rule"

def fix_content_multiline(content):
    """修复内容格式为多行，确保每个项目单独一行且末尾有句号"""
    if not content:
        return content
    
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
    
    # 返回真正的多行字符串
    return '\n'.join(fixed_lines)

def process_file(filepath):
    """处理单个文件"""
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    modified = False
    
    # 处理内容字段
    if "内容" in data:
        original = data["内容"]
        fixed = fix_content_multiline(original)
        if fixed != original:
            data["内容"] = fixed
            modified = True
    
    if modified:
        # 使用自定义的JSON编码器来保持多行字符串
        with open(filepath, 'w', encoding='utf-8') as f:
            # 手动写入JSON，保持多行字符串
            f.write('{\n')
            first = True
            for key, value in data.items():
                if not first:
                    f.write(',\n')
                first = False
                
                if key == "内容" and isinstance(value, str) and '\n' in value:
                    # 对于多行内容，进行缩进处理
                    f.write(f'  "{key}": "{value.replace(chr(10), "\\\\n").replace(chr(13), "\\\\r")}"')
                else:
                    f.write(f'  "{key}": {json.dumps(value, ensure_ascii=False)}')
            f.write('\n}')
        return True
    
    return False

def main():
    """主函数"""
    print("开始修复规则文件格式为多行显示...")
    
    if not os.path.exists(RULES_DIR):
        print(f"规则目录不存在: {RULES_DIR}")
        return
    
    files = os.listdir(RULES_DIR)
    json_files = [f for f in files if f.endswith('.json')]
    
    if not json_files:
        print("未找到JSON文件")
        return
    
    fixed_count = 0
    for filename in json_files:
        filepath = os.path.join(RULES_DIR, filename)
        print(f"处理: {filename}")
        
        try:
            if process_file(filepath):
                print(f"  [OK] 已修复为多行格式")
                fixed_count += 1
            else:
                print(f"  [OK] 格式正确")
        except Exception as e:
            print(f"  [ERROR] 处理失败: {e}")
    
    print(f"\n处理完成！共处理 {len(json_files)} 个文件，修复了 {fixed_count} 个文件")

if __name__ == "__main__":
    main()