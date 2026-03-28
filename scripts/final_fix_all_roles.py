#!/usr/bin/env python3
"""
最终修复所有角色JSON文件的脚本
确保所有角色都有正确的格式，清理重复字段
"""

import json
import os
import sys
from pathlib import Path

# 要修复的文件列表
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

def parse_role_info(role_info_text):
    """解析角色信息文本，提取各个字段"""
    english_name = ""
    play_name = ""
    ability_type = ""
    
    if not role_info_text:
        return english_name, play_name, ability_type
    
    # 按行分割
    lines = role_info_text.strip().split('\n')
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        if line.startswith('英文名：'):
            english_name = line.replace('英文名：', '').strip()
        elif line.startswith('所属剧本：'):
            play_name = line.replace('所属剧本：', '').strip()
        elif line.startswith('角色能力类型：'):
            ability_type = line.replace('角色能力类型：', '').strip()
        elif line.startswith('角色类型：'):
            # 这个字段我们在其他地方已经有类型信息
            pass
    
    return english_name, play_name, ability_type

def fix_character(character):
    """修复单个角色的格式"""
    if not isinstance(character, dict):
        return character
    
    # 创建新的角色字典，确保字段顺序正确
    new_character = {}
    
    # 1. id字段（必须）
    new_character["id"] = character.get("id", "")
    
    # 2. 名称字段 - 优先使用"名称"，否则使用"name"，最后使用默认值
    if "名称" in character:
        new_character["名称"] = character["名称"]
    elif "name" in character:
        new_character["名称"] = character["name"]
    else:
        new_character["名称"] = ""
    
    # 3. 英文名字段 - 优先使用"英文名"，否则使用"english_name"
    if "英文名" in character:
        new_character["英文名"] = character["英文名"]
    elif "english_name" in character:
        new_character["英文名"] = character["english_name"]
    else:
        new_character["英文名"] = ""
    
    # 4. 类型字段 - 优先使用"类型"，否则使用"type"
    if "类型" in character:
        new_character["类型"] = character["类型"]
    elif "type" in character:
        new_character["类型"] = character["type"]
    else:
        new_character["类型"] = ""
    
    # 5. 所属剧本字段 - 优先使用"所属剧本"，否则尝试从角色信息提取
    if "所属剧本" in character:
        new_character["所属剧本"] = character["所属剧本"]
    else:
        new_character["所属剧本"] = ""
    
    # 6. 角色能力类型字段 - 优先使用"角色能力类型"，否则尝试从角色信息提取
    if "角色能力类型" in character:
        new_character["角色能力类型"] = character["角色能力类型"]
    else:
        new_character["角色能力类型"] = ""
    
    # 7. url字段
    new_character["url"] = character.get("url", "")
    
    # 8. content字段
    new_character["content"] = character.get("content", {})
    
    # 9. metadata字段
    new_character["metadata"] = character.get("metadata", {})
    
    # 现在尝试从content中的"角色信息"字段提取缺失信息
    content = new_character.get("content", {})
    if isinstance(content, dict) and "角色信息" in content:
        role_info_text = content["角色信息"]
        english_name_from_info, play_name_from_info, ability_type_from_info = parse_role_info(role_info_text)
        
        # 如果英文名缺失，使用从角色信息提取的
        if not new_character["英文名"] and english_name_from_info:
            new_character["英文名"] = english_name_from_info
        
        # 如果所属剧本缺失，使用从角色信息提取的
        if not new_character["所属剧本"] and play_name_from_info:
            new_character["所属剧本"] = play_name_from_info
        
        # 如果角色能力类型缺失，使用从角色信息提取的
        if not new_character["角色能力类型"] and ability_type_from_info:
            new_character["角色能力类型"] = ability_type_from_info
    
    return new_character

def fix_json_file(file_path):
    """修复单个JSON文件"""
    print(f"修复文件: {file_path}")
    
    # 创建备份
    backup_path = file_path + ".backup2"
    if os.path.exists(file_path):
        import shutil
        shutil.copy2(file_path, backup_path)
        print(f"  已创建备份: {backup_path}")
    
    # 读取文件
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"  读取文件失败: {e}")
        return False
    
    # 修复数据
    if isinstance(data, list):
        fixed_data = []
        for i, item in enumerate(data):
            fixed_item = fix_character(item)
            fixed_data.append(fixed_item)
            
            # 打印前几个角色的修复信息
            if i < 3:
                print(f"    角色 {i+1}: {fixed_item.get('名称', '未知')}")
                print(f"      英文名: {fixed_item.get('英文名', '')}")
                print(f"      所属剧本: {fixed_item.get('所属剧本', '')}")
                print(f"      角色能力类型: {fixed_item.get('角色能力类型', '')}")
    else:
        print(f"  文件不是JSON数组，跳过")
        return False
    
    # 写入文件
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(fixed_data, f, ensure_ascii=False, indent=2)
        print(f"  修复完成，共处理 {len(fixed_data)} 个角色")
        return True
    except Exception as e:
        print(f"  写入文件失败: {e}")
        return False

def main():
    """主函数"""
    print("开始修复所有角色JSON文件...")
    print("=" * 60)
    
    success_count = 0
    fail_count = 0
    
    for file_path in ROLE_FILES:
        if not os.path.exists(file_path):
            print(f"文件不存在: {file_path}")
            fail_count += 1
            continue
        
        print()
        if fix_json_file(file_path):
            success_count += 1
        else:
            fail_count += 1
    
    print()
    print("=" * 60)
    print(f"修复完成！成功: {success_count}, 失败: {fail_count}")
    
    if fail_count == 0:
        print("所有文件修复成功！")
        return 0
    else:
        print("部分文件修复失败，请检查。")
        return 1

if __name__ == "__main__":
    sys.exit(main())