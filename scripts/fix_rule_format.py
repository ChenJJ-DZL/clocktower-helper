#!/usr/bin/env python3
"""
修复规则JSON文件格式
将内容中的换行符格式化为更清晰的显示格式
"""

import json
import os
import re

# 规则目录
RULES_DIR = "json/rule"

def fix_content_format(content):
    """修复内容格式"""
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
    
    return '\n'.join(fixed_lines)

def fix_night_order_format(data):
    """修复夜晚行动顺序格式"""
    if "行动顺序" in data:
        for item in data["行动顺序"]:
            if "描述" in item:
                # 确保描述有合适的标点
                desc = item["描述"].strip()
                if not desc.endswith(('。', '！', '？', '.', '!', '?')):
                    desc += '。'
                item["描述"] = desc
    return data

def process_file(filepath):
    """处理单个文件"""
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    modified = False
    
    # 处理内容字段
    if "内容" in data:
        original = data["内容"]
        fixed = fix_content_format(original)
        if fixed != original:
            data["内容"] = fixed
            modified = True
    
    # 处理夜晚行动顺序
    if "夜晚行动顺序" in filepath:
        original_json = json.dumps(data, ensure_ascii=False)
        data = fix_night_order_format(data)
        fixed_json = json.dumps(data, ensure_ascii=False)
        if fixed_json != original_json:
            modified = True
    
    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    
    return False

def main():
    """主函数"""
    print("开始修复规则文件格式...")
    
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
                print(f"  ✓ 已修复")
                fixed_count += 1
            else:
                print(f"  ✓ 格式正确")
        except Exception as e:
            print(f"  ✗ 处理失败: {e}")
    
    print(f"\n处理完成！共处理 {len(json_files)} 个文件，修复了 {fixed_count} 个文件")

if __name__ == "__main__":
    main()