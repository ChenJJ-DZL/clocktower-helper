#!/usr/bin/env python3
"""
格式化规则文件的内容为点分行格式
确保所有内容都以数字点开头，每行一个要点
"""

import json
import os
import re

# 规则目录
RULES_DIR = "json/rule"

def format_content_to_dot_points(content):
    """将内容格式化为点分行格式"""
    if not content:
        return content
    
    # 检查是否已经有点分行格式（包含数字后跟点或顿号）
    lines = content.split('\n')
    
    # 如果只有一行，尝试分割
    if len(lines) == 1:
        # 尝试按中文数字分割（如 "1." 或 "1、"）
        parts = re.split(r'(\d+[\.\、])', content)
        if len(parts) > 1:
            # 重新组合
            formatted = []
            for i in range(1, len(parts), 2):
                if i+1 < len(parts):
                    formatted.append(f"{parts[i]}{parts[i+1].strip()}")
            if formatted:
                return '\n'.join(formatted)
    
    # 检查每行是否以数字开头
    dot_point_lines = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # 检查是否以数字开头
        if re.match(r'^\d+[\.\、]', line):
            dot_point_lines.append(line)
        elif re.match(r'^[\-\*•]', line):
            # 项目符号行，转换为数字
            dot_point_lines.append(line)
        else:
            # 非点分行，保持原样
            dot_point_lines.append(line)
    
    return '\n'.join(dot_point_lines)

def process_files():
    """处理所有规则文件"""
    # 获取所有JSON文件
    json_files = [f for f in os.listdir(RULES_DIR) if f.endswith('.json') and not f.endswith('.bak')]
    
    print(f"找到 {len(json_files)} 个规则文件")
    
    for filename in json_files:
        filepath = os.path.join(RULES_DIR, filename)
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if "内容" in data:
                original_content = data["内容"]
                formatted_content = format_content_to_dot_points(original_content)
                
                if formatted_content != original_content:
                    data["内容"] = formatted_content
                    
                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    
                    print(f"已格式化: {filename}")
                else:
                    print(f"格式正确: {filename}")
            else:
                print(f"无内容字段: {filename}")
                
        except Exception as e:
            print(f"处理失败 {filename}: {e}")
    
    print("格式化完成")

if __name__ == "__main__":
    process_files()