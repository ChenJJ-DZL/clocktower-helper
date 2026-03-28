#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
调试分类页面链接
"""

import requests
from bs4 import BeautifulSoup
import re
from urllib.parse import urljoin

BASE_URL = "https://clocktower-wiki.gstonegames.com"

def analyze_townsfolk_page():
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    
    url = BASE_URL + "/index.php?title=%E9%95%87%E6%B0%91"
    print(f"分析镇民分类页面: {url}")
    
    try:
        response = session.get(url, timeout=30, verify=False)
        response.raise_for_status()
        response.encoding = 'utf-8'
    except Exception as e:
        print(f"请求失败: {e}")
        return
    
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # 保存HTML以供检查
    with open('debug_townsfolk.html', 'w', encoding='utf-8') as f:
        f.write(str(soup))
    print("已保存HTML到 debug_townsfolk.html")
    
    # 查找所有链接
    content_div = soup.find('div', id='mw-content-text') or soup.find('div', class_='mw-parser-output')
    if not content_div:
        print("错误: 找不到内容区域")
        return
    
    all_links = content_div.find_all('a', href=True)
    print(f"内容区域中的总链接数: {len(all_links)}")
    
    # 分类链接
    categories = {
        'role_links': [],
        'category_links': [],
        'other_links': [],
        'filtered_links': []
    }
    
    for link in all_links:
        href = link.get('href', '')
        text = link.get_text(strip=True)
        
        if not href or href.startswith('#'):
            continue
        
        full_url = urljoin(url, href)
        
        # 检查链接类型
        if '/index.php?title=' in href:
            if 'Category:' in href or '%E5%88%86%E7%B1%BB:' in href:
                categories['category_links'].append((text, full_url))
            elif any(x in href for x in ['action=', 'diff=', 'oldid=', 'Special:', 'File:', 'User:', 'Template:', 'Talk:', 'Help:']):
                categories['filtered_links'].append((text, full_url))
            else:
                # 可能是角色链接
                categories['role_links'].append((text, full_url))
        else:
            categories['other_links'].append((text, full_url))
    
    print(f"\n角色链接: {len(categories['role_links'])}")
    for i, (text, url) in enumerate(categories['role_links'][:20]):
        print(f"  {i+1}. {text}")
    
    print(f"\n分类链接: {len(categories['category_links'])}")
    for i, (text, url) in enumerate(categories['category_links'][:10]):
        print(f"  {i+1}. {text}")
    
    print(f"\n其他链接: {len(categories['other_links'])}")
    print(f"过滤掉的链接: {len(categories['filtered_links'])}")
    
    # 检查是否有列表或表格
    print("\n检查页面结构:")
    
    # 查找所有列表
    lists = content_div.find_all(['ul', 'ol'])
    print(f"列表数量: {len(lists)}")
    
    for i, lst in enumerate(lists[:5]):
        items = lst.find_all('li')
        print(f"  列表{i+1}: {len(items)} 个项目")
        for j, item in enumerate(items[:3]):
            print(f"    - {item.get_text(strip=True)[:50]}")
    
    # 查找所有段落
    paragraphs = content_div.find_all('p')
    print(f"段落数量: {len(paragraphs)}")
    
    # 查找所有标题
    headings = content_div.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
    print(f"标题数量: {len(headings)}")
    for h in headings[:10]:
        print(f"  {h.name}: {h.get_text(strip=True)}")
    
    # 尝试查找角色列表
    print("\n尝试查找角色列表模式...")
    
    # 查找所有包含"角色"或"镇民"的文本
    all_text = content_div.get_text()
    lines = all_text.split('\n')
    role_lines = [line.strip() for line in lines if '角色' in line or '镇民' in line or '能力' in line]
    print(f"包含角色关键词的行数: {len(role_lines)}")
    for line in role_lines[:10]:
        print(f"  - {line[:100]}")

if __name__ == "__main__":
    analyze_townsfolk_page()