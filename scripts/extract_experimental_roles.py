#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从实验型角色列表页面提取所有实验型角色
"""

import os
import sys
import json
import requests
from bs4 import BeautifulSoup
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
        time.sleep(1)
        return response
    except Exception as e:
        print(f"警告: 请求失败 {url}: {e}")
        return None

def extract_role_links_from_list(soup):
    """从实验型角色列表页面提取角色链接"""
    role_links = []
    
    # 查找所有角色链接
    # 实验型角色页面通常使用图库或列表展示角色
    content_div = soup.find('div', id='mw-content-text') or soup.find('div', class_='mw-parser-output')
    if not content_div:
        print("错误: 找不到内容区域")
        return role_links
    
    # 方法1: 查找图库中的链接
    galleries = content_div.find_all(class_='gallery')
    print(f"发现图库数量: {len(galleries)}")
    
    for gallery in galleries:
        links = gallery.find_all('a', href=True)
        for link in links:
            href = link['href']
            title = link.get('title', '')
            # 过滤掉非角色链接
            if href.startswith('/index.php?title=') and not href.startswith('/index.php?title=%E5%AE%9E%E9%AA%8C%E6%80%A7%E8%A7%92%E8%89%B2'):
                # 检查是否是有效的角色链接
                if ':' not in href and '特殊:' not in href and '文件:' not in href:
                    role_links.append((title, href))
    
    # 方法2: 查找所有指向角色的链接
    if not role_links:
        all_links = content_div.find_all('a', href=True)
        for link in all_links:
            href = link['href']
            title = link.get('title', '')
            # 过滤掉非角色链接
            if href.startswith('/index.php?title=') and not href.startswith('/index.php?title=%E5%AE%9E%E9%AA%8C%E6%80%A7%E8%A7%92%E8%89%B2'):
                # 检查是否是有效的角色链接
                if ':' not in href and '特殊:' not in href and '文件:' not in href:
                    # 检查是否已经存在
                    if not any(href == r[1] for r in role_links):
                        role_links.append((title, href))
    
    # 去重
    unique_links = []
    seen = set()
    for title, href in role_links:
        if href not in seen:
            seen.add(href)
            unique_links.append((title, href))
    
    return unique_links

def extract_character_data(soup, url, role_name):
    """从页面提取角色数据"""
    try:
        # 获取标题
        title_elem = soup.find('h1', class_='title')
        if not title_elem:
            title_elem = soup.find('h1')
        
        actual_name = role_name
        if title_elem:
            actual_name = title_elem.get_text(strip=True)
        
        # 提取角色类型
        role_type = "未知"
        content_text = ""
        
        content_div = soup.find('div', id='mw-content-text') or soup.find('div', class_='mw-parser-output')
        if content_div:
            # 清理不需要的元素
            for selector in ['script', 'style', '.mw-editsection', '#toc', '.navbox', '.infobox', '.printfooter']:
                for element in content_div.select(selector):
                    element.decompose()
            
            # 获取所有文本
            content_text = content_div.get_text(separator='\n', strip=True)
            
            # 从内容中提取角色类型
            type_patterns = [
                r'角色类型[：:]?\s*([^\n]+)',
                r'属于[：:]?\s*([^\n]+)',
                r'类型[：:]?\s*([^\n]+)',
            ]
            
            for pattern in type_patterns:
                match = re.search(pattern, content_text)
                if match:
                    role_type = match.group(1).strip()
                    # 清理类型字符串
                    role_type = re.sub(r'[。，,\.\s]+$', '', role_type)
                    break
            
            # 如果没有匹配到，尝试从常见类型中推断
            if role_type == "未知":
                if "镇民" in content_text and "角色类型" in content_text:
                    role_type = "镇民"
                elif "外来者" in content_text and "角色类型" in content_text:
                    role_type = "外来者"
                elif "爪牙" in content_text and "角色类型" in content_text:
                    role_type = "爪牙"
                elif "恶魔" in content_text and "角色类型" in content_text:
                    role_type = "恶魔"
                elif "旅行者" in content_text and "角色类型" in content_text:
                    role_type = "旅行者"
        
        # 尝试从内容中提取英文名
        english_name = ""
        english_match = re.search(r'英文名[：:]?\s*([A-Za-z\s]+)', content_text)
        if english_match:
            english_name = english_match.group(1).strip()
        else:
            # 尝试其他模式
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
        import traceback
        traceback.print_exc()
        return None

def main():
    """主函数"""
    print("开始提取实验型角色列表...")
    
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })
    
    # 获取实验型角色列表页面
    print(f"获取实验型角色列表: {EXPERIMENTAL_ROLES_URL}")
    response = get_page(EXPERIMENTAL_ROLES_URL, session)
    if not response:
        print("错误: 无法获取实验型角色列表页面")
        return
    
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # 提取角色链接
    role_links = extract_role_links_from_list(soup)
    print(f"发现 {len(role_links)} 个实验型角色链接")
    
    # 显示前10个链接
    for i, (title, href) in enumerate(role_links[:10]):
        print(f"  {i+1}. {title} -> {href}")
    
    if len(role_links) > 10:
        print(f"  ... 还有 {len(role_links)-10} 个角色")
    
    # 保存链接列表供后续使用
    links_file = "scripts/experimental_role_links.json"
    with open(links_file, 'w', encoding='utf-8') as f:
        json.dump(role_links, f, ensure_ascii=False, indent=2)
    print(f"角色链接已保存到 {links_file}")
    
    # 提取每个角色的详细信息
    print("\n开始提取角色详细信息...")
    collected_roles = []
    
    for i, (title, href) in enumerate(role_links):
        url = BASE_URL + href if href.startswith('/') else href
        print(f"处理 {i+1}/{len(role_links)}: {title} -> {url}")
        
        response = get_page(url, session)
        if not response:
            print(f"  警告: 无法获取页面，跳过")
            continue
        
        soup = BeautifulSoup(response.content, 'html.parser')
        character = extract_character_data(soup, url, title)
        
        if character:
            collected_roles.append(character)
            print(f"  成功: {character['name']} ({character['type']})")
        else:
            print(f"  失败: 无法提取数据")
        
        time.sleep(1.5)
    
    print(f"\n成功采集 {len(collected_roles)} 个实验角色")
    
    # 保存采集的数据
    if collected_roles:
        output_file = "scripts/experimental_roles_raw.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(collected_roles, f, ensure_ascii=False, indent=2)
        print(f"实验角色数据已保存到 {output_file}")
        
        # 按类型分组
        roles_by_type = {}
        for char in collected_roles:
            role_type = char.get('type', '未知')
            if role_type not in roles_by_type:
                roles_by_type[role_type] = []
            roles_by_type[role_type].append(char)
        
        print("\n按类型统计:")
        for role_type, roles in roles_by_type.items():
            print(f"  {role_type}: {len(roles)} 个角色")
    
    return collected_roles

if __name__ == "__main__":
    main()