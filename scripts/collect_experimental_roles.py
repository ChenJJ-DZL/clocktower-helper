#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
采集实验型角色数据
"""

import os
import sys
import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import time
import re

BASE_URL = "https://clocktower-wiki.gstonegames.com"
EXPERIMENTAL_ROLES_URL = BASE_URL + "/index.php?title=%E5%AE%9E%E9%AA%8C%E6%80%A7%E8%A7%92%E8%89%B2"

def get_page(url, session):
    """获取页面内容"""
    try:
        response = session.get(url, timeout=30, verify=False)
        response.raise_for_status()
        response.encoding = 'utf-8'
        time.sleep(1.5)
        return response
    except Exception as e:
        print(f"警告: 请求失败 {url}: {e}")
        return None

def extract_role_links_from_experimental_page(soup, url):
    """从实验型角色页面提取角色链接"""
    role_links = []
    
    content_div = soup.find('div', id='mw-content-text') or soup.find('div', class_='mw-parser-output')
    if not content_div:
        return role_links
    
    # 查找图库（gallery）中的链接
    galleries = content_div.find_all(class_='gallery')
    for gallery in galleries:
        links = gallery.find_all('a', href=True)
        for link in links:
            href = link.get('href')
            text = link.get_text(strip=True)
            if href and '/index.php?title=' in href and not any(x in href for x in ['Special:', 'Category:', 'Talk:', 'User:']):
                full_url = urljoin(BASE_URL, href)
                role_links.append((text, full_url))
    
    # 查找列表中的链接
    lists = content_div.find_all(['ul', 'ol'])
    for lst in lists:
        links = lst.find_all('a', href=True)
        for link in links:
            href = link.get('href')
            text = link.get_text(strip=True)
            if href and '/index.php?title=' in href and not any(x in href for x in ['Special:', 'Category:', 'Talk:', 'User:']):
                full_url = urljoin(BASE_URL, href)
                role_links.append((text, full_url))
    
    # 查找所有其他链接
    all_links = content_div.find_all('a', href=True)
    for link in all_links:
        href = link.get('href')
        text = link.get_text(strip=True)
        if href and '/index.php?title=' in href and not any(x in href for x in ['Special:', 'Category:', 'Talk:', 'User:']):
            full_url = urljoin(BASE_URL, href)
            # 过滤掉明显的非角色链接
            if any(keyword in text for keyword in ['角色', '能力', '规则']):
                role_links.append((text, full_url))
    
    # 去重
    unique_links = []
    seen_urls = set()
    for text, url in role_links:
        if url not in seen_urls:
            seen_urls.add(url)
            unique_links.append((text, url))
    
    return unique_links

def extract_character_data(soup, url, category_name="实验型角色"):
    """从页面提取角色数据（基于full_crawler.py中的逻辑）"""
    try:
        # 获取标题
        title_elem = soup.find('h1', class_='title')
        if not title_elem:
            title_elem = soup.find('h1')
        
        if not title_elem:
            return None
        
        name = title_elem.get_text(strip=True)
        
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
        
        # 提取角色类型（尝试从内容中推断）
        role_type = category_name
        
        # 尝试从内容中提取更多信息
        metadata = {}
        if content_text:
            # 查找英文名
            english_name_match = re.search(r'[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*', content_text)
            if english_name_match:
                metadata['english_name'] = english_name_match.group(0)
            
            # 查找角色类型
            type_patterns = [
                r'角色类型[:：]\s*([^\n]+)',
                r'类型[:：]\s*([^\n]+)',
                r'属于[:：]\s*([^\n]+)',
            ]
            
            for pattern in type_patterns:
                match = re.search(pattern, content_text)
                if match:
                    found_type = match.group(1).strip()
                    if '镇民' in found_type:
                        role_type = '镇民'
                    elif '外来者' in found_type:
                        role_type = '外来者'
                    elif '爪牙' in found_type:
                        role_type = '爪牙'
                    elif '恶魔' in found_type:
                        role_type = '恶魔'
                    elif '旅行者' in found_type:
                        role_type = '旅行者'
                    elif '传奇角色' in found_type:
                        role_type = '传奇角色'
                    elif '奇遇角色' in found_type:
                        role_type = '奇遇角色'
                    break
        
        # 生成ID
        role_id = url.split('title=')[-1].replace('%', '_') if 'title=' in url else re.sub(r'[^\w]', '_', name)
        
        # 添加实验角色后缀
        if not name.endswith('（实验角色）') and not name.endswith('(实验角色)'):
            name_with_suffix = name + '（实验角色）'
        else:
            name_with_suffix = name
        
        character = {
            "id": role_id,
            "name": name_with_suffix,
            "original_name": name,  # 保留原始名称
            "english_name": metadata.get('english_name', ''),
            "type": role_type,
            "url": url,
            "content": {
                "text": content_text[:5000]  # 限制长度
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

def collect_experimental_roles():
    """采集实验型角色"""
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })
    
    print(f"访问实验型角色页面: {EXPERIMENTAL_ROLES_URL}")
    
    response = get_page(EXPERIMENTAL_ROLES_URL, session)
    if not response:
        print("错误: 无法获取实验型角色页面")
        return []
    
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # 提取角色链接
    role_links = extract_role_links_from_experimental_page(soup, EXPERIMENTAL_ROLES_URL)
    print(f"发现 {len(role_links)} 个实验型角色链接")
    
    # 采集每个角色的数据
    experimental_roles = []
    for i, (link_text, url) in enumerate(role_links):
        print(f"[{i+1}/{len(role_links)}] 处理: {link_text}")
        
        response = get_page(url, session)
        if not response:
            print(f"  警告: 无法获取页面")
            continue
        
        soup = BeautifulSoup(response.content, 'html.parser')
        character = extract_character_data(soup, url, "实验型角色")
        
        if character:
            experimental_roles.append(character)
            print(f"  成功: {character['name']} ({character['type']})")
        else:
            print(f"  失败: 无法提取数据")
        
        time.sleep(1.5)
    
    print(f"\n总共采集 {len(experimental_roles)} 个实验型角色")
    return experimental_roles

def update_existing_data(experimental_roles):
    """更新现有角色数据"""
    # 读取现有的所有角色数据
    all_characters_path = "json/full/all_characters.json"
    if not os.path.exists(all_characters_path):
        print(f"错误: 文件不存在 {all_characters_path}")
        return
    
    with open(all_characters_path, 'r', encoding='utf-8') as f:
        existing_characters = json.load(f)
    
    print(f"现有角色数: {len(existing_characters)}")
    
    # 检查是否有重复
    existing_names = {char.get('name', '').replace('（实验角色）', '').replace('(实验角色)', ''): i 
                      for i, char in enumerate(existing_characters)}
    
    new_characters = []
    for exp_role in experimental_roles:
        original_name = exp_role.get('original_name', exp_role['name'].replace('（实验角色）', '').replace('(实验角色)', ''))
        if original_name in existing_names:
            idx = existing_names[original_name]
            print(f"更新现有角色: {original_name} -> {exp_role['name']}")
            # 更新现有角色
            existing_characters[idx] = exp_role
        else:
            print(f"添加新角色: {exp_role['name']}")
            new_characters.append(exp_role)
    
    # 添加新角色
    all_characters = existing_characters + new_characters
    
    # 保存更新后的所有角色数据
    with open(all_characters_path, 'w', encoding='utf-8') as f:
        json.dump(all_characters, f, ensure_ascii=False, indent=2)
    
    print(f"更新后总角色数: {len(all_characters)}")
    print(f"  新增: {len(new_characters)} 个角色")
    print(f"  更新: {len(experimental_roles) - len(new_characters)} 个角色")
    
    # 按类型分组保存
    type_files = {
        "镇民": "json/full/镇民.json",
        "外来者": "json/full/外来者.json",
        "爪牙": "json/full/爪牙.json",
        "恶魔": "json/full/恶魔.json",
        "旅行者": "json/full/旅行者.json",
        "传奇角色": "json/full/传奇角色.json",
        "奇遇角色": "json/full/奇遇角色.json",
        "实验型角色": "json/full/实验型角色.json"
    }
    
    # 按类型分组
    roles_by_type = {}
    for role_type in type_files.keys():
        roles_by_type[role_type] = [role for role in all_characters if role.get('type') == role_type]
    
    # 保存每个类型的文件
    for role_type, file_path in type_files.items():
        roles = roles_by_type.get(role_type, [])
        if roles:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(roles, f, ensure_ascii=False, indent=2)
            print(f"保存 {role_type}: {len(roles)} 个角色到 {file_path}")
    
    return all_characters

if __name__ == "__main__":
    print("开始采集实验型角色数据...")
    experimental_roles = collect_experimental_roles()
    
    if experimental_roles:
        print("\n更新现有角色数据...")
        update_existing_data(experimental_roles)
        print("\n实验型角色数据采集完成")
    else:
        print("没有采集到实验型角色数据")