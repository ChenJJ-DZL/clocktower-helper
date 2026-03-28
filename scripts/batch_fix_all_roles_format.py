#!/usr/bin/env python3
"""
批量修改所有角色JSON格式的脚本
将所有角色统一为洗衣妇的格式
"""

import json
import os
import sys
import glob

def parse_role_info(role_info_text):
    """解析角色信息文本，提取各个字段"""
    english_name = ""
    play_name = ""
    ability_type = ""
    background_related = ""
    other_names = ""
    
    if not role_info_text:
        return english_name, play_name, ability_type, background_related, other_names
    
    # 按行分割
    lines = role_info_text.split('\n')
    for line in lines:
        line = line.strip()
        if line.startswith('英文名：'):
            english_name = line.replace('英文名：', '').strip()
        elif line.startswith('所属剧本：'):
            play_name = line.replace('所属剧本：', '').strip()
        elif line.startswith('角色类型：'):
            # 这个信息已经在type字段中了，跳过
            pass
        elif line.startswith('角色能力类型：'):
            ability_type = line.replace('角色能力类型：', '').strip()
        elif line.startswith('角色背景相关：'):
            background_related = line.replace('角色背景相关：', '').strip()
        elif line.startswith('其他称呼（非官方，仅方便索引用）：'):
            other_names = line.replace('其他称呼（非官方，仅方便索引用）：', '').strip()
    
    return english_name, play_name, ability_type, background_related, other_names

def fix_character_format(character):
    """修复单个角色的格式"""
    # 创建新的字典结构
    new_character = {}
    
    # 1. 处理基本字段
    # id保持不变
    if 'id' in character:
        new_character['id'] = character['id']
    
    # 汉化字段名
    if 'name' in character:
        new_character['名称'] = character['name']
    
    # 处理original_name（实验角色）
    if 'original_name' in character:
        new_character['原始名称'] = character['original_name']
    
    # 英文名 - 先设置为空，稍后从角色信息中提取
    new_character['英文名'] = character.get('english_name', '')
    
    # 类型
    if 'type' in character:
        new_character['类型'] = character['type']
    
    # 2. 提取角色信息
    content = character.get('content', {})
    role_info = ""
    
    # 检查content的类型
    if isinstance(content, dict):
        role_info = content.get('角色信息', '')
    elif isinstance(content, str):
        # 有些角色的content是字符串，如实验角色
        # 这种情况下没有角色信息字段
        pass
    
    # 解析角色信息
    english_name, play_name, ability_type, background_related, other_names = parse_role_info(role_info)
    
    # 更新英文名（如果从角色信息中提取到了）
    if english_name:
        new_character['英文名'] = english_name
    
    # 添加所属剧本字段
    if play_name:
        new_character['所属剧本'] = play_name
    
    # 添加角色能力类型字段
    if ability_type:
        new_character['角色能力类型'] = ability_type
    
    # 添加其他字段（如果有）
    if background_related:
        new_character['角色背景相关'] = background_related
    if other_names:
        new_character['其他称呼'] = other_names
    
    # 3. 处理content
    new_content = {}
    if isinstance(content, dict):
        # 复制content，删除角色信息字段
        new_content = content.copy()
        if '角色信息' in new_content:
            del new_content['角色信息']
    elif isinstance(content, str):
        # 对于文本格式的content，保持原样
        new_content = {"text": content}
    
    new_character['content'] = new_content
    
    # 4. 处理metadata
    if 'metadata' in character:
        new_character['metadata'] = character['metadata']
    
    # 5. url保持不变
    if 'url' in character:
        new_character['url'] = character['url']
    
    return new_character

def fix_json_file(file_path):
    """修复单个JSON文件"""
    print(f"正在处理文件: {file_path}")
    
    if not os.path.exists(file_path):
        print(f"错误：文件不存在 {file_path}")
        return False
    
    # 读取文件
    with open(file_path, 'r', encoding='utf-8') as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"JSON解析错误: {e}")
            return False
    
    # 检查是否是数组
    if not isinstance(data, list):
        print(f"错误：文件不是JSON数组 {file_path}")
        return False
    
    # 修复每个角色
    fixed_count = 0
    for i, character in enumerate(data):
        if not isinstance(character, dict):
            continue
        
        # 修复角色格式
        data[i] = fix_character_format(character)
        fixed_count += 1
    
    # 创建备份
    backup_path = f"{file_path}.backup"
    if not os.path.exists(backup_path):
        with open(backup_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"已创建备份文件: {backup_path}")
    
    # 保存修改
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"已修复 {fixed_count} 个角色")
    print(f"已保存修改到: {file_path}")
    
    # 验证文件
    with open(file_path, 'r', encoding='utf-8') as f:
        try:
            json.load(f)
            print("文件验证: JSON格式有效")
        except json.JSONDecodeError as e:
            print(f"文件验证错误: {e}")
            return False
    
    return True

def main():
    # 需要处理的JSON文件列表
    json_files = [
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
    
    # 检查文件是否存在
    existing_files = []
    for file_path in json_files:
        if os.path.exists(file_path):
            existing_files.append(file_path)
        else:
            print(f"警告：文件不存在，跳过 {file_path}")
    
    if not existing_files:
        print("错误：没有找到任何JSON文件")
        return False
    
    print(f"找到 {len(existing_files)} 个需要处理的JSON文件")
    
    # 处理每个文件
    success_count = 0
    for file_path in existing_files:
        print(f"\n{'='*60}")
        success = fix_json_file(file_path)
        if success:
            success_count += 1
        print(f"{'='*60}")
    
    print(f"\n{'='*60}")
    print(f"批量修改完成！")
    print(f"成功处理: {success_count}/{len(existing_files)} 个文件")
    print(f"{'='*60}")
    
    return success_count == len(existing_files)

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)