#!/usr/bin/env python3
"""
从备份文件恢复数据并应用正确格式
"""

import json
import os
import sys
from pathlib import Path
import urllib.parse

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

def extract_name_from_url(url):
    """从URL中提取角色名称"""
    if not url:
        return ""
    
    try:
        # 解析URL，获取title参数
        parsed = urllib.parse.urlparse(url)
        query = urllib.parse.parse_qs(parsed.query)
        if 'title' in query:
            title = query['title'][0]
            # URL解码
            decoded = urllib.parse.unquote(title)
            return decoded
    except:
        pass
    
    # 如果无法解析，尝试从URL路径中提取
    if 'title=' in url:
        try:
            start = url.index('title=') + 6
            end = url.find('&', start)
            if end == -1:
                end = len(url)
            title = url[start:end]
            decoded = urllib.parse.unquote(title)
            return decoded
        except:
            pass
    
    return ""

def extract_name_from_id(role_id):
    """从ID中提取角色名称"""
    if not role_id or not role_id.startswith('_'):
        return ""
    
    # ID格式如 "_E6_B4_97_E8_A1_A3_E5_A6_87"
    # 这是URL编码的十六进制表示
    try:
        # 移除开头的下划线
        hex_str = role_id[1:]
        # 将下划线替换为百分号
        percent_str = hex_str.replace('_', '%')
        # URL解码
        decoded = urllib.parse.unquote(percent_str)
        return decoded
    except:
        return ""

def get_role_type_from_filename(filename):
    """从文件名推断角色类型"""
    if "镇民" in filename:
        return "镇民"
    elif "外来者" in filename:
        return "外来者"
    elif "爪牙" in filename:
        return "爪牙"
    elif "恶魔" in filename:
        return "恶魔"
    elif "旅行者" in filename:
        return "旅行者"
    elif "传奇角色" in filename:
        return "传奇角色"
    elif "奇遇角色" in filename:
        return "奇遇角色"
    elif "实验型角色" in filename:
        return "实验型角色"
    else:
        return ""

def fix_character(character, role_type):
    """修复单个角色的格式，使用所有可用信息"""
    if not isinstance(character, dict):
        return character
    
    # 创建新的角色字典，确保字段顺序正确
    new_character = {}
    
    # 1. id字段（必须）
    new_character["id"] = character.get("id", "")
    
    # 2. 名称字段 - 尝试多种来源
    name = ""
    
    # 首先检查现有字段
    if "名称" in character and character["名称"]:
        name = character["名称"]
    elif "name" in character and character["name"]:
        name = character["name"]
    elif "原始名称" in character and character["原始名称"]:
        name = character["原始名称"]
    
    # 如果仍然为空，尝试从URL或ID提取
    if not name:
        url = character.get("url", "")
        if url:
            name = extract_name_from_url(url)
        else:
            role_id = character.get("id", "")
            if role_id:
                name = extract_name_from_id(role_id)
    
    new_character["名称"] = name
    
    # 3. 英文名字段
    english_name = ""
    if "英文名" in character and character["英文名"]:
        english_name = character["英文名"]
    elif "english_name" in character and character["english_name"]:
        english_name = character["english_name"]
    
    new_character["英文名"] = english_name
    
    # 4. 类型字段
    type_field = ""
    if "类型" in character and character["类型"]:
        type_field = character["类型"]
    elif "type" in character and character["type"]:
        type_field = character["type"]
    else:
        # 使用从文件名推断的类型
        type_field = role_type
    
    new_character["类型"] = type_field
    
    # 5. 所属剧本字段
    play_name = ""
    if "所属剧本" in character and character["所属剧本"]:
        play_name = character["所属剧本"]
    
    new_character["所属剧本"] = play_name
    
    # 6. 角色能力类型字段
    ability_type = ""
    if "角色能力类型" in character and character["角色能力类型"]:
        ability_type = character["角色能力类型"]
    
    new_character["角色能力类型"] = ability_type
    
    # 7. url字段
    new_character["url"] = character.get("url", "")
    
    # 8. content字段
    new_character["content"] = character.get("content", {})
    
    # 9. metadata字段
    new_character["metadata"] = character.get("metadata", {})
    
    return new_character

def restore_file(file_path):
    """恢复单个文件"""
    print(f"恢复文件: {file_path}")
    
    # 从备份文件读取
    backup_path = file_path + ".backup"
    if not os.path.exists(backup_path):
        backup_path = file_path + ".backup2"
    
    if not os.path.exists(backup_path):
        print(f"  找不到备份文件: {backup_path}")
        return False
    
    # 读取备份文件
    try:
        with open(backup_path, 'r', encoding='utf-8') as f:
            backup_data = json.load(f)
    except Exception as e:
        print(f"  读取备份文件失败: {e}")
        return False
    
    # 从文件名推断角色类型
    role_type = get_role_type_from_filename(file_path)
    
    # 修复数据
    if isinstance(backup_data, list):
        fixed_data = []
        for i, item in enumerate(backup_data):
            fixed_item = fix_character(item, role_type)
            fixed_data.append(fixed_item)
            
            # 打印前几个角色的修复信息
            if i < 3:
                print(f"    角色 {i+1}: {fixed_item.get('名称', '未知')}")
                print(f"      英文名: {fixed_item.get('英文名', '')}")
                print(f"      类型: {fixed_item.get('类型', '')}")
                print(f"      所属剧本: {fixed_item.get('所属剧本', '')}")
                print(f"      角色能力类型: {fixed_item.get('角色能力类型', '')}")
    else:
        print(f"  备份文件不是JSON数组，跳过")
        return False
    
    # 创建当前文件的备份
    current_backup = file_path + ".before_restore"
    if os.path.exists(file_path):
        import shutil
        shutil.copy2(file_path, current_backup)
        print(f"  已创建当前文件备份: {current_backup}")
    
    # 写入文件
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(fixed_data, f, ensure_ascii=False, indent=2)
        print(f"  恢复完成，共处理 {len(fixed_data)} 个角色")
        return True
    except Exception as e:
        print(f"  写入文件失败: {e}")
        return False

def main():
    """主函数"""
    print("从备份文件恢复数据并应用正确格式...")
    print("=" * 60)
    
    success_count = 0
    fail_count = 0
    
    for file_path in ROLE_FILES:
        if not os.path.exists(file_path):
            print(f"文件不存在: {file_path}")
            fail_count += 1
            continue
        
        print()
        if restore_file(file_path):
            success_count += 1
        else:
            fail_count += 1
    
    print()
    print("=" * 60)
    print(f"恢复完成！成功: {success_count}, 失败: {fail_count}")
    
    if fail_count == 0:
        print("所有文件恢复成功！")
        return 0
    else:
        print("部分文件恢复失败，请检查。")
        return 1

if __name__ == "__main__":
    sys.exit(main())