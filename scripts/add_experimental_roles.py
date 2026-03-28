#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
手动添加实验型角色
"""

import os
import sys
import json
import requests
from bs4 import BeautifulSoup
import time
import re

BASE_URL = "https://clocktower-wiki.gstonegames.com"

def get_page(url, session):
    """获取页面内容"""
    try:
        response = session.get(url, timeout=30, verify=False)
        response.raise_for_status()
        response.encoding = 'utf-8'
        time.sleep(1)
        return response
    except Exception as e:
        print(f"警告: 请求失败 {url}: {e}")
        return None

def extract_character_data(soup, url, role_name, role_type="实验型角色"):
    """从页面提取角色数据"""
    try:
        # 获取标题
        title_elem = soup.find('h1', class_='title')
        if not title_elem:
            title_elem = soup.find('h1')
        
        actual_name = role_name
        if title_elem:
            actual_name = title_elem.get_text(strip=True)
        
        # 提取内容
        content_div = soup.find('div', id='mw-content-text') or soup.find('div', class_='mw-parser-output')
        content_text = ""
        
        if content_div:
            # 清理不需要的元素
            for selector in ['script', 'style', '.mw-editsection', '#toc', '.navbox', '.infobox', '.printfooter']:
                for element in content_div.select(selector):
                    element.decompose()
            
            # 获取所有文本
            content_text = content_div.get_text(separator='\n', strip=True)
        
        # 尝试从内容中提取英文名
        english_name = ""
        english_match = re.search(r'[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*', content_text)
        if english_match:
            english_name = english_match.group(0)
        
        # 生成ID
        role_id = url.split('title=')[-1].replace('%', '_') if 'title=' in url else re.sub(r'[^\w]', '_', actual_name)
        
        # 添加实验角色后缀
        if not actual_name.endswith('（实验角色）') and not actual_name.endswith('(实验角色)'):
            name_with_suffix = actual_name + '（实验角色）'
        else:
            name_with_suffix = actual_name
        
        character = {
            "id": role_id,
            "name": name_with_suffix,
            "original_name": actual_name,
            "english_name": english_name,
            "type": role_type,
            "url": url,
            "content": {
                "text": content_text[:3000]  # 限制长度
            },
            "metadata": {
                "is_experimental": True,
                "extracted_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "source": "clocktower-wiki.gstonegames.com"
            }
        }
        
        return character
    except Exception as e:
        print(f"错误: 提取角色数据失败 {url}: {e}")
        return None

def add_experimental_roles():
    """添加实验型角色"""
    # 已知的实验角色URL
    experimental_roles = [
        # 名称, URL, 类型
        ("半兽人", "/index.php?title=%E5%8D%8A%E5%85%BD%E4%BA%BA", "外来者"),
        ("疯狂科学家", "/index.php?title=%E7%96%AF%E7%8B%82%E7%A7%91%E5%AD%A6%E5%AE%B6", "镇民"),
        ("时间旅行者", "/index.php?title=%E6%97%B6%E9%97%B4%E6%97%85%E8%A1%8C%E8%80%85", "旅行者"),
        ("变形者", "/index.php?title=%E5%8F%98%E5%BD%A2%E8%80%85", "爪牙"),
        ("幻术师", "/index.php?title=%E5%B9%BB%E6%9C%AF%E5%B8%88", "镇民"),
        ("预言家", "/index.php?title=%E9%A2%84%E8%A8%80%E5%AE%B6", "镇民"),
    ]
    
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })
    
    collected_roles = []
    
    for role_name, path, role_type in experimental_roles:
        url = BASE_URL + path
        print(f"处理: {role_name} -> {url}")
        
        response = get_page(url, session)
        if not response:
            print(f"  警告: 无法获取页面，跳过")
            continue
        
        soup = BeautifulSoup(response.content, 'html.parser')
        character = extract_character_data(soup, url, role_name, role_type)
        
        if character:
            collected_roles.append(character)
            print(f"  成功: {character['name']} ({character['type']})")
        else:
            print(f"  失败: 无法提取数据")
        
        time.sleep(1.5)
    
    return collected_roles

def update_json_files(experimental_roles):
    """更新JSON文件"""
    if not experimental_roles:
        print("没有实验角色可添加")
        return
    
    # 读取现有的所有角色数据
    all_characters_path = "json/full/all_characters.json"
    if not os.path.exists(all_characters_path):
        print(f"错误: 文件不存在 {all_characters_path}")
        return
    
    with open(all_characters_path, 'r', encoding='utf-8') as f:
        existing_characters = json.load(f)
    
    print(f"现有角色数: {len(existing_characters)}")
    print(f"要添加的实验角色数: {len(experimental_roles)}")
    
    # 检查是否有重复
    existing_names = {char.get('name', '').replace('（实验角色）', '').replace('(实验角色)', ''): i 
                      for i, char in enumerate(existing_characters)}
    
    new_characters = []
    updated_count = 0
    
    for exp_role in experimental_roles:
        original_name = exp_role.get('original_name', exp_role['name'].replace('（实验角色）', '').replace('(实验角色)', ''))
        if original_name in existing_names:
            idx = existing_names[original_name]
            # 检查是否已经是实验角色
            existing_role = existing_characters[idx]
            if '（实验角色）' in existing_role.get('name', '') or '(实验角色)' in existing_role.get('name', ''):
                print(f"角色已存在且为实验角色: {original_name}")
            else:
                print(f"更新现有角色为实验角色: {original_name} -> {exp_role['name']}")
                existing_characters[idx] = exp_role
                updated_count += 1
        else:
            print(f"添加新实验角色: {exp_role['name']}")
            new_characters.append(exp_role)
    
    # 添加新角色
    all_characters = existing_characters + new_characters
    
    # 保存更新后的所有角色数据
    with open(all_characters_path, 'w', encoding='utf-8') as f:
        json.dump(all_characters, f, ensure_ascii=False, indent=2)
    
    print(f"\n更新完成:")
    print(f"  总角色数: {len(all_characters)}")
    print(f"  新增: {len(new_characters)} 个角色")
    print(f"  更新: {updated_count} 个角色")
    
    # 按类型分组保存
    type_files = {
        "镇民": "json/full/镇民.json",
        "外来者": "json/full/外来者.json",
        "爪牙": "json/full/爪牙.json",
        "恶魔": "json/full/恶魔.json",
        "旅行者": "json/full/旅行者.json",
        "传奇角色": "json/full/传奇角色.json",
        "奇遇角色": "json/full/奇遇角色.json"
    }
    
    # 按类型分组
    roles_by_type = {}
    for char in all_characters:
        role_type = char.get('type', '未知')
        if role_type not in roles_by_type:
            roles_by_type[role_type] = []
        roles_by_type[role_type].append(char)
    
    # 保存每个类型的文件
    for role_type, file_path in type_files.items():
        roles = roles_by_type.get(role_type, [])
        if roles:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(roles, f, ensure_ascii=False, indent=2)
            print(f"  保存 {role_type}: {len(roles)} 个角色到 {file_path}")
    
    # 保存实验角色单独文件
    experimental_chars = [char for char in all_characters if char.get('metadata', {}).get('is_experimental', False)]
    if experimental_chars:
        exp_file = "json/full/实验型角色.json"
        with open(exp_file, 'w', encoding='utf-8') as f:
            json.dump(experimental_chars, f, ensure_ascii=False, indent=2)
        print(f"  保存实验型角色: {len(experimental_chars)} 个角色到 {exp_file}")
    
    return all_characters

if __name__ == "__main__":
    print("开始添加实验型角色...")
    experimental_roles = add_experimental_roles()
    
    if experimental_roles:
        print(f"\n成功采集 {len(experimental_roles)} 个实验角色")
        update_json_files(experimental_roles)
        print("\n实验型角色添加完成")
    else:
        print("没有成功采集到实验角色")