#!/usr/bin/env python3
"""
验证所有角色JSON文件是否具有正确的格式
"""

import json
import os
import sys

# 要验证的文件列表
ROLE_FILES = [
    "json/full/镇民.json",
    "json/full/外来者.json", 
    "json/full/爪牙.json",
    "json/full/恶魔.json",
    "json/full/旅行者.json",
    "json/full/传奇角色.json",
    "json/full/奇遇角色.json",
    "json/full/实验型角色.json",
    "json/full/all_characters.json"
]

def validate_file(file_path):
    """验证单个文件"""
    print(f"验证文件: {file_path}")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"  读取文件失败: {e}")
        return False
    
    if not isinstance(data, list):
        print(f"  文件不是JSON数组")
        return False
    
    required_fields = ["id", "名称", "英文名", "类型", "所属剧本", "角色能力类型", "url", "content", "metadata"]
    
    errors = []
    for i, character in enumerate(data):
        if not isinstance(character, dict):
            errors.append(f"角色{i+1}不是字典")
            continue
        
        # 检查必需字段
        for field in required_fields:
            if field not in character:
                errors.append(f"角色{i+1}缺少字段: {field}")
        
        # 检查字段是否为空（某些字段可以为空）
        if not character.get("名称"):
            errors.append(f"角色{i+1}的'名称'字段为空")
        if not character.get("类型"):
            errors.append(f"角色{i+1}的'类型'字段为空")
        if not character.get("url"):
            errors.append(f"角色{i+1}的'url'字段为空")
    
    if errors:
        print(f"  发现 {len(errors)} 个错误:")
        for error in errors[:5]:  # 只显示前5个错误
            print(f"    {error}")
        if len(errors) > 5:
            print(f"    ... 还有 {len(errors)-5} 个错误")
        return False
    else:
        print(f"  验证通过，共 {len(data)} 个角色")
        return True

def main():
    """主函数"""
    print("验证所有角色JSON文件格式...")
    print("=" * 60)
    
    success_count = 0
    fail_count = 0
    
    for file_path in ROLE_FILES:
        if not os.path.exists(file_path):
            print(f"文件不存在: {file_path}")
            fail_count += 1
            continue
        
        print()
        if validate_file(file_path):
            success_count += 1
        else:
            fail_count += 1
    
    print()
    print("=" * 60)
    print(f"验证完成！成功: {success_count}, 失败: {fail_count}")
    
    if fail_count == 0:
        print("所有文件格式正确！")
        return 0
    else:
        print("部分文件格式不正确，请检查。")
        return 1

if __name__ == "__main__":
    sys.exit(main())