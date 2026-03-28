#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
验证完整数据
"""

import json
import os

def validate_data():
    data_path = "json/full/all_characters.json"
    if not os.path.exists(data_path):
        print(f"错误: 文件不存在 {data_path}")
        return
    
    with open(data_path, 'r', encoding='utf-8') as f:
        characters = json.load(f)
    
    print(f"总角色数: {len(characters)}")
    
    # 按类型统计
    type_counts = {}
    missing_fields = []
    
    for char in characters:
        char_type = char.get('type', 'unknown')
        type_counts[char_type] = type_counts.get(char_type, 0) + 1
        
        # 检查必需字段
        if not char.get('name'):
            missing_fields.append(f"缺失名称: {char.get('id', '未知ID')}")
        if not char.get('type'):
            missing_fields.append(f"缺失类型: {char.get('name', '未知名称')}")
        if not char.get('url'):
            missing_fields.append(f"缺失URL: {char.get('name', '未知名称')}")
        if not char.get('content'):
            missing_fields.append(f"缺失内容: {char.get('name', '未知名称')}")
    
    print("\n按类型统计:")
    for char_type, count in sorted(type_counts.items()):
        print(f"  {char_type}: {count}")
    
    # 检查每个分类文件
    print("\n分类文件检查:")
    categories = ["镇民", "外来者", "爪牙", "恶魔", "旅行者", "传奇角色", "奇遇角色"]
    for cat in categories:
        filepath = f"json/full/{cat}.json"
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                cat_chars = json.load(f)
            print(f"  {cat}: {len(cat_chars)} 个角色")
        else:
            print(f"  {cat}: 文件不存在")
    
    if missing_fields:
        print(f"\n警告: 发现 {len(missing_fields)} 个缺失字段:")
        for msg in missing_fields[:10]:
            print(f"  {msg}")
        if len(missing_fields) > 10:
            print(f"  ... 还有 {len(missing_fields) - 10} 个")
    else:
        print("\n[OK] 所有角色都有必需字段")
    
    # 与之前的数据比较
    old_data_path = "json/official/all_characters.json"
    if os.path.exists(old_data_path):
        with open(old_data_path, 'r', encoding='utf-8') as f:
            old_chars = json.load(f)
        print(f"\n与之前数据比较:")
        print(f"  旧数据: {len(old_chars)} 个角色")
        print(f"  新数据: {len(characters)} 个角色")
        print(f"  增加: {len(characters) - len(old_chars)} 个角色")
        
        # 检查是否有旧角色缺失
        old_names = {c.get('name') for c in old_chars if c.get('name')}
        new_names = {c.get('name') for c in characters if c.get('name')}
        missing_in_new = old_names - new_names
        if missing_in_new:
            print(f"  警告: {len(missing_in_new)} 个旧角色在新数据中缺失:")
            for name in sorted(missing_in_new)[:5]:
                print(f"    - {name}")
            if len(missing_in_new) > 5:
                print(f"    ... 还有 {len(missing_in_new) - 5} 个")
        else:
            print("  ✓ 所有旧角色都在新数据中")
    else:
        print("\n注意: 没有找到旧数据文件进行对比")
    
    # 检查英文名提取情况
    english_names = [c.get('english_name', '') for c in characters if c.get('english_name')]
    print(f"\n英文名提取情况:")
    print(f"  有英文名的角色: {len(english_names)} / {len(characters)}")
    print(f"  英文名示例: {english_names[:5] if english_names else '无'}")
    
    # 检查内容完整性
    empty_content = [c.get('name') for c in characters if not c.get('content') or len(c.get('content', {})) == 0]
    if empty_content:
        print(f"\n警告: {len(empty_content)} 个角色内容为空:")
        for name in empty_content[:5]:
            print(f"  - {name}")
    else:
        print("\n[OK] 所有角色都有内容")

if __name__ == "__main__":
    validate_data()