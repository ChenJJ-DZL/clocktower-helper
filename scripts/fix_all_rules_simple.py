#!/usr/bin/env python3
"""
简单修复所有规则文件格式
确保内容字段中的每个项目单独一行且末尾有句号
"""

import json
import os
import re

RULES_DIR = "json/rule"

def process_file(filepath):
    """处理单个文件"""
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
        
        # 重新组合
        new_content = '\n'.join(fixed_lines)
        
        if new_content != content:
            data["内容"] = new_content
            modified = True
    
    if modified:
        # 写入文件，保持JSON格式
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    
    return False

def main():
    """主函数"""
    print("修复所有规则文件格式...")
    
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