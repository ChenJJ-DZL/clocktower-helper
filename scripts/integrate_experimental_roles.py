#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将实验型角色集成到现有的JSON文件中
"""

import os
import sys
import json
import re
from collections import defaultdict

def load_existing_data():
    """加载现有的角色数据"""
    data = {}
    
    # 所有角色的总文件
    all_characters_path = "json/full/all_characters.json"
    if os.path.exists(all_characters_path):
        with open(all_characters_path, 'r', encoding='utf-8') as f:
            data['all_characters'] = json.load(f)
        print(f"加载现有所有角色: {len(data['all_characters'])} 个角色")
    else:
        data['all_characters'] = []
    
    # 按类型分类的文件
    type_files = {
        "镇民": "json/full/镇民.json",
        "外来者": "json/full/外来者.json",
        "爪牙": "json/full/爪牙.json",
        "恶魔": "json/full/恶魔.json",
        "旅行者": "json/full/旅行者.json",
        "传奇角色": "json/full/传奇角色.json",
        "奇遇角色": "json/full/奇遇角色.json"
    }
    
    data['by_type'] = {}
    for role_type, file_path in type_files.items():
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                data['by_type'][role_type] = json.load(f)
            print(f"  加载 {role_type}: {len(data['by_type'][role_type])} 个角色")
        else:
            data['by_type'][role_type] = []
    
    return data

def load_experimental_roles():
    """加载采集到的实验型角色数据"""
    raw_file = "scripts/experimental_roles_raw.json"
    if not os.path.exists(raw_file):
        print(f"错误: 实验型角色数据文件不存在 {raw_file}")
        return []
    
    with open(raw_file, 'r', encoding='utf-8') as f:
        experimental_roles = json.load(f)
    
    print(f"加载实验型角色: {len(experimental_roles)} 个角色")
    
    # 统计类型分布
    type_counts = defaultdict(int)
    for role in experimental_roles:
        role_type = role.get('type', '未知')
        type_counts[role_type] += 1
    
    print("实验型角色类型分布:")
    for role_type, count in sorted(type_counts.items()):
        print(f"  {role_type}: {count} 个角色")
    
    return experimental_roles

def integrate_experimental_roles(existing_data, experimental_roles):
    """将实验型角色集成到现有数据中"""
    print("\n开始集成实验型角色...")
    
    # 按类型分组实验角色
    experimental_by_type = defaultdict(list)
    for role in experimental_roles:
        role_type = role.get('type', '未知')
        experimental_by_type[role_type].append(role)
    
    # 更新所有角色数据
    all_characters = existing_data.get('all_characters', [])
    original_count = len(all_characters)
    
    # 创建现有角色的映射（按原始名称）
    existing_by_original_name = {}
    for i, char in enumerate(all_characters):
        original_name = char.get('original_name')
        if not original_name:
            # 尝试从名称中提取原始名称
            name = char.get('name', '')
            if '（实验角色）' in name:
                original_name = name.replace('（实验角色）', '')
            elif '(实验角色)' in name:
                original_name = name.replace('(实验角色)', '')
            else:
                original_name = name
        
        existing_by_original_name[original_name] = i
    
    print(f"现有所有角色: {original_count} 个角色")
    
    # 集成实验角色
    updated_count = 0
    added_count = 0
    
    for role_type, exp_roles in experimental_by_type.items():
        print(f"\n处理 {role_type}: {len(exp_roles)} 个实验角色")
        
        # 获取该类型的现有角色列表
        existing_of_type = existing_data.get('by_type', {}).get(role_type, [])
        existing_type_by_original_name = {}
        
        for i, char in enumerate(existing_of_type):
            original_name = char.get('original_name')
            if not original_name:
                name = char.get('name', '')
                if '（实验角色）' in name:
                    original_name = name.replace('（实验角色）', '')
                elif '(实验角色)' in name:
                    original_name = name.replace('(实验角色)', '')
                else:
                    original_name = name
            
            existing_type_by_original_name[original_name] = i
        
        # 对于每个实验角色
        for exp_role in exp_roles:
            exp_original_name = exp_role.get('original_name', '')
            if not exp_original_name:
                # 从名称中提取
                name = exp_role.get('name', '')
                if '（实验角色）' in name:
                    exp_original_name = name.replace('（实验角色）', '')
                elif '(实验角色)' in name:
                    exp_original_name = name.replace('(实验角色)', '')
                else:
                    exp_original_name = name
            
            # 检查是否已经存在于所有角色中
            if exp_original_name in existing_by_original_name:
                # 更新现有角色
                idx = existing_by_original_name[exp_original_name]
                all_characters[idx] = exp_role
                updated_count += 1
                print(f"  更新: {exp_original_name}")
            else:
                # 添加新角色
                all_characters.append(exp_role)
                existing_by_original_name[exp_original_name] = len(all_characters) - 1
                added_count += 1
                print(f"  添加: {exp_original_name}")
            
            # 检查是否已经存在于该类型中
            if exp_original_name in existing_type_by_original_name:
                # 更新现有类型角色
                type_idx = existing_type_by_original_name[exp_original_name]
                existing_of_type[type_idx] = exp_role
            else:
                # 添加新类型角色
                existing_of_type.append(exp_role)
                existing_type_by_original_name[exp_original_name] = len(existing_of_type) - 1
        
        # 更新该类型的数据
        if role_type in existing_data.get('by_type', {}):
            existing_data['by_type'][role_type] = existing_of_type
    
    print(f"\n集成完成:")
    print(f"  更新: {updated_count} 个现有角色")
    print(f"  添加: {added_count} 个新角色")
    print(f"  总角色数: {len(all_characters)} 个角色")
    
    existing_data['all_characters'] = all_characters
    return existing_data

def save_integrated_data(data):
    """保存集成后的数据"""
    print("\n保存集成数据...")
    
    # 保存所有角色数据
    all_characters_path = "json/full/all_characters.json"
    with open(all_characters_path, 'w', encoding='utf-8') as f:
        json.dump(data['all_characters'], f, ensure_ascii=False, indent=2)
    print(f"  保存所有角色到 {all_characters_path} ({len(data['all_characters'])} 个角色)")

    # 保存各类型数据

    type_files = {

        "镇民": "json/full/镇民.json",

        "外来者": "json/full/外来者.json",

        "爪牙": "json/full/爪牙.json",

        "恶魔": "json/full/恶魔.json",

        "旅行者": "json/full/旅行者.json",

        "传奇角色": "json/full/传奇角色.json",

        "奇遇角色": "json/full/奇遇角色.json"

    }



    for role_type, file_path in type_files.items():

        if role_type in data.get('by_type', {}):

            with open(file_path, 'w', encoding='utf-8') as f:

                json.dump(data['by_type'][role_type], f, ensure_ascii=False, indent=2)

            print(f"  保存 {role_type} 到 {file_path} ({len(data['by_type'][role_type])} 个角色)")

    # 保存实验型角色单独文件

    experimental_chars = []

    for char in data['all_characters']:

        if char.get('metadata', {}).get('is_experimental', False):

            experimental_chars.append(char)

    if experimental_chars:

        exp_file = "json/full/实验型角色.json"

        with open(exp_file, 'w', encoding='utf-8') as f:

            json.dump(experimental_chars, f, ensure_ascii=False, indent=2)

        print(f"  保存实验型角色到 {exp_file} ({len(experimental_chars)} 个角色)")

    return True

def main():

    """主函数"""

    print("开始集成实验型角色到现有数据...")

    # 加载现有数据

    existing_data = load_existing_data()

    # 加载实验型角色数据

    experimental_roles = load_experimental_roles()

    if not experimental_roles:

        print("错误: 没有实验型角色数据")

        return False

    # 集成数据

    integrated_data = integrate_experimental_roles(existing_data, experimental_roles)

    # 保存数据

    save_integrated_data(integrated_data)

    print("\n集成完成！")

    print(f"总角色数: {len(integrated_data['all_characters'])} 个角色")

    return True

if __name__ == "__main__":

    main()