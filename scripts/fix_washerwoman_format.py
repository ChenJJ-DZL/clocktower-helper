#!/usr/bin/env python3
"""
修复洗衣妇JSON格式的脚本
将字段名汉化，提取角色信息中的内容为独立字段
"""

import json
import os
import sys

def fix_washerwoman_format():
    # 读取镇民.json文件
    file_path = "json/full/镇民.json"
    
    if not os.path.exists(file_path):
        print(f"错误：文件不存在 {file_path}")
        return False
    
    print(f"正在读取文件: {file_path}")
    with open(file_path, 'r', encoding='utf-8') as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"JSON解析错误: {e}")
            return False
    
    # 查找洗衣妇条目
    washerwoman_found = False
    washerwoman_index = -1
    
    for i, character in enumerate(data):
        if character.get('name') == '洗衣妇':
            washerwoman_found = True
            washerwoman_index = i
            print(f"找到洗衣妇条目，索引 {i}")
            break
    
    if not washerwoman_found:
        print("错误：未找到洗衣妇条目")
        return False
    
    character = data[washerwoman_index]
    
    # 显示原始数据
    print("\n原始数据摘要:")
    print(f"  id: {character.get('id')}")
    print(f"  name: {character.get('name')}")
    print(f"  english_name: {character.get('english_name')}")
    print(f"  type: {character.get('type')}")
    
    content = character.get('content', {})
    role_info = content.get('角色信息', '')
    print(f"  角色信息: {role_info[:100]}...")
    
    # 解析角色信息
    english_name = ""
    play_name = ""
    ability_type = ""
    
    if role_info:
        # 按行分割
        lines = role_info.split('\n')
        for line in lines:
            line = line.strip()
            if line.startswith('英文名：'):
                english_name = line.replace('英文名：', '').strip()
            elif line.startswith('所属剧本：'):
                play_name = line.replace('所属剧本：', '').strip()
            elif line.startswith('角色能力类型：'):
                ability_type = line.replace('角色能力类型：', '').strip()
    
    print(f"\n解析出的信息:")
    print(f"  英文名: {english_name}")
    print(f"  所属剧本: {play_name}")
    print(f"  角色能力类型: {ability_type}")
    
    # 创建新的字典结构，保持顺序
    new_character = {}
    
    # 保持id不变
    if 'id' in character:
        new_character['id'] = character['id']
    
    # 汉化字段名
    if 'name' in character:
        new_character['名称'] = character['name']
    
    # 英文名（从角色信息中提取）
    new_character['英文名'] = english_name if english_name else ""
    
    if 'type' in character:
        new_character['类型'] = character['type']
    
    # 添加所属剧本字段
    if play_name:
        new_character['所属剧本'] = play_name
    
    # 添加角色能力类型字段
    if ability_type:
        new_character['角色能力类型'] = ability_type
    
    # url保持不变
    if 'url' in character:
        new_character['url'] = character['url']
    
    # 处理content（删除角色信息字段）
    new_content = content.copy()
    if '角色信息' in new_content:
        del new_content['角色信息']
    
    new_character['content'] = new_content
    
    # metadata保持不变
    if 'metadata' in character:
        new_character['metadata'] = character['metadata']
    
    # 替换原条目
    data[washerwoman_index] = new_character
    
    print(f"\n修改完成！新字段结构:")
    for key in new_character:
        if key not in ['content', 'metadata']:
            value = new_character[key]
            if isinstance(value, str) and len(value) > 100:
                print(f"  {key}: {value[:100]}...")
            else:
                print(f"  {key}: {value}")
    
    # 验证修改
    print(f"\n验证:")
    print(f"  英文名是否已提取: {new_character.get('英文名', '未找到')}")
    print(f"  所属剧本: {new_character.get('所属剧本', '未找到')}")
    print(f"  角色能力类型: {new_character.get('角色能力类型', '未找到')}")
    print(f"  content中是否还有角色信息: {'角色信息' in new_character.get('content', {})}")
    
    # 创建备份
    backup_path = "json/full/镇民.json.backup"
    if not os.path.exists(backup_path):
        with open(backup_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"\n已创建备份文件: {backup_path}")
    
    # 保存修改
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"\n已保存修改到: {file_path}")
    
    # 验证文件是否有效
    with open(file_path, 'r', encoding='utf-8') as f:
        try:
            json.load(f)
            print("文件验证: JSON格式有效")
        except json.JSONDecodeError as e:
            print(f"文件验证错误: {e}")
            return False
    
    return True

if __name__ == "__main__":
    success = fix_washerwoman_format()
    sys.exit(0 if success else 1)