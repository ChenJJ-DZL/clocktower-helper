#!/usr/bin/env python3
"""
验证规则JSON文件格式
检查是否每个项目单独成行且末尾有句号
"""

import json
import os
import re

RULES_DIR = "json/rule"

def check_file(filepath):
    """检查单个文件格式"""
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    filename = os.path.basename(filepath)
    issues = []
    
    if "内容" in data:
        content = data["内容"]
        lines = content.split('\n')
        
        # 检查每行是否以数字或项目符号开头
        for i, line in enumerate(lines, 1):
            line = line.strip()
            if not line:
                continue
                
            # 检查是否以数字开头（如 "1. " 或 "1、"）
            if re.match(r'^\d+[\.\、]', line):
                if not line.endswith('。'):
                    issues.append(f"  第{i}行 '{line[:30]}...' 缺少句号")
            elif re.match(r'^[•\-*]', line):
                if not line.endswith('。'):
                    issues.append(f"  第{i}行 '{line[:30]}...' 缺少句号")
            elif not line.endswith(('：', ':')):
                # 非标题行应该以句号结尾
                if not line.endswith(('。', '！', '？', '.', '!', '?')):
                    issues.append(f"  第{i}行 '{line[:30]}...' 缺少标点")
    
    return issues

def main():
    """主函数"""
    print("验证规则文件格式...")
    
    if not os.path.exists(RULES_DIR):
        print(f"规则目录不存在: {RULES_DIR}")
        return
    
    files = os.listdir(RULES_DIR)
    json_files = [f for f in files if f.endswith('.json')]
    
    if not json_files:
        print("未找到JSON文件")
        return
    
    total_issues = 0
    for filename in json_files:
        filepath = os.path.join(RULES_DIR, filename)
        issues = check_file(filepath)
        
        if issues:
            print(f"\n{filename} 发现 {len(issues)} 个问题:")
            for issue in issues:
                print(issue)
            total_issues += len(issues)
        else:
            print(f"{filename}: [OK] 格式正确")
    
    print(f"\n验证完成！共检查 {len(json_files)} 个文件，发现 {total_issues} 个问题")

if __name__ == "__main__":
    main()