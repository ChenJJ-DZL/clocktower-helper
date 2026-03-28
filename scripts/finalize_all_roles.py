#!/usr/bin/env python3
"""
最终完善所有角色JSON文件的脚本
从content中的"角色信息"字段提取缺失的英文名、所属剧本、角色能力类型
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

def finalize_character(character):
    """完善单个角色的字段"""
    if not isinstance(character, dict):
        return character
    
    # 创建角色的副本
    finalized = character.copy()
    
    # 检查content中是否有"角色信息"字段
    content = finalized.get("content", {})
    if isinstance(content, dict) and "角色信息" in content:
        role_info_text = content["角色信息"]
        english_name_from_info, play_name_from_info, ability_type_from_info = parse_role_info(role_info_text)
        
        # 如果英文名缺失，使用从角色信息提取的
        if (not finalized.get("英文名") or finalized["英文名"] == "") and english_name_from_info:
            finalized["英文名"] = english_name_from_info
        
        # 如果所属剧本缺失，使用从角色信息提取的
        if (not finalized.get("所属剧本") or finalized["所属剧本"] == "") and play_name_from_info:
            finalized["所属剧本"] = play_name_from_info
        
        # 如果角色能力类型缺失，使用从角色信息提取的
        if (not finalized.get("角色能力类型") or finalized["角色能力类型"] == "") and ability_type_from_info:
            finalized["角色能力类型"] = ability_type_from_info
    
    return finalized

def finalize_file(file_path):
    """完善单个文件"""
    print(f"完善文件: {file_path}")
    
    # 读取文件
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"  读取文件失败: {e}")
        return False
    
    # 完善数据
    if isinstance(data, list):
        finalized_data = []
        fixed_count = 0
        for i, item in enumerate(data):
            original_item = item.copy()
            finalized_item = finalize_character(item)
            finalized_data.append(finalized_item)
            
            # 检查是否有字段被修复
            if finalized_item != original_item:
                fixed_count += 1
                if fixed_count <= 3:  # 只打印前几个修复的角色
                    print(f"    修复了角色 {i+1}: {finalized_item.get('名称', '未知')}")
                    if finalized_item.get("英文名") != original_item.get("英文名"):
                        print(f"      英文名: {original_item.get('英文名', '空')} -> {finalized_item.get('英文名', '空')}")
                    if finalized_item.get("所属剧本") != original_item.get("所属剧本"):
                        print(f"      所属剧本: {original_item.get('所属剧本', '空')} -> {finalized_item.get('所属剧本', '空')}")
                    if finalized_item.get("角色能力类型") != original_item.get("角色能力类型"):
                        print(f"      角色能力类型: {original_item.get('角色能力类型', '空')} -> {finalized_item.get('角色能力类型', '空')}")
    else:
        print(f"  文件不是JSON数组，跳过")
        return False
    
    # 创建备份
    backup_path = file_path + ".before_finalize"
    if os.path.exists(file_path):
        import shutil
        shutil.copy2(file_path, backup_path)
        print(f"  已创建备份: {backup_path}")
    
    # 写入文件
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(finalized_data, f, ensure_ascii=False, indent=2)
        print(f"  完善完成，共处理 {len(finalized_data)} 个角色，修复了 {fixed_count} 个角色")
        return True
    except Exception as e:
        print(f"  写入文件失败: {e}")
        return False

def main():
    """主函数"""
    print("完善所有角色JSON文件，从角色信息字段提取缺失数据...")
    print("=" * 60)
    
    success_count = 0
    fail_count = 0
    
    for file_path in ROLE_FILES:
        if not os.path.exists(file_path):
            print(f"文件不存在: {file_path}")
            fail_count += 1
            continue
        
        print()
        if finalize_file(file_path):
            success_count += 1
        else:
            fail_count += 1
    
    print()
    print("=" * 60)
    print(f"完善完成！成功: {success_count}, 失败: {fail_count}")
    
    if fail_count == 0:
        print("所有文件完善成功！")
        return 0
    else:
        print("部分文件完善失败，请检查。")
        return 1

if __name__ == "__main__":
    sys.exit(main())