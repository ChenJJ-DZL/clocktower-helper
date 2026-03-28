#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
调试HTML结构
"""

import requests
from bs4 import BeautifulSoup
import re

BASE_URL = "https://clocktower-wiki.gstonegames.com"
TEST_URL = BASE_URL + "/index.php?title=%E6%B4%97%E8%A1%A3%E5%A6%87"

def analyze_structure():
    """分析页面HTML结构"""
    print("分析页面HTML结构...")
    
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    
    response = session.get(TEST_URL, timeout=30, verify=False)
    response.encoding = 'utf-8'
    
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # 保存HTML到文件以便查看
    with open('debug_page.html', 'w', encoding='utf-8') as f:
        f.write(soup.prettify())
    
    print(f"HTML已保存到 debug_page.html")
    
    # 1. 查找所有可能的标题
    print("\n=== 标题元素 ===")
    for tag in ['h1', 'h2', 'h3']:
        elements = soup.find_all(tag)
        print(f"\n{tag}元素 ({len(elements)}个):")
        for i, elem in enumerate(elements[:5]):
            text = elem.get_text(strip=True)
            class_attr = elem.get('class', [])
            id_attr = elem.get('id', '')
            print(f"  {i+1}. 文本: '{text[:50]}' | class: {class_attr} | id: '{id_attr}'")
    
    # 2. 查找表格
    print("\n=== 表格元素 ===")
    tables = soup.find_all('table')
    print(f"表格总数: {len(tables)}")
    for i, table in enumerate(tables[:3]):
        class_attr = table.get('class', [])
        print(f"表格{i+1}: class={class_attr}")
        # 显示前几行
        rows = table.find_all('tr')
        print(f"  行数: {len(rows)}")
        for j, row in enumerate(rows[:2]):
            cells = row.find_all(['th', 'td'])
            cell_texts = [cell.get_text(strip=True)[:30] for cell in cells]
            print(f"    行{j+1}: {cell_texts}")
    
    # 3. 查找角色信息
    print("\n=== 角色信息查找 ===")
    all_text = soup.get_text()
    
    # 查找可能包含角色类型的文本
    type_keywords = ['镇民', '外来者', '爪牙', '恶魔', '旅行者', '传奇', 'Townsfolk', 'Outsider', 'Minion', 'Demon', 'Traveller']
    for keyword in type_keywords:
        if keyword in all_text:
            # 找到上下文
            lines = all_text.split('\n')
            for line in lines:
                if keyword in line:
                    print(f"包含'{keyword}'的行: {line[:100]}")
    
    # 4. 查找主要内容
    print("\n=== 主要内容区域 ===")
    content_div = soup.find('div', id='mw-content-text')
    if content_div:
        print("找到 mw-content-text div")
        # 提取所有文本段落
        paragraphs = content_div.find_all('p')
        print(f"段落数: {len(paragraphs)}")
        for i, p in enumerate(paragraphs[:3]):
            text = p.get_text(strip=True)
            if text:
                print(f"段落{i+1}: {text[:150]}")
    else:
        print("未找到 mw-content-text div")
        # 尝试其他选择器
        for selector in ['div.mw-parser-output', 'div#bodyContent', 'div#content']:
            elem = soup.select_one(selector)
            if elem:
                print(f"找到 {selector}")
                break
    
    # 5. 查找导航链接
    print("\n=== 导航链接 ===")
    nav_links = soup.find_all('a', href=True)
    role_links = []
    for link in nav_links:
        href = link.get('href')
        text = link.get_text(strip=True)
        if 'title=' in href and ('%' in href or '角色' in text):
            role_links.append((text, href))
    
    print(f"找到 {len(role_links)} 个可能包含角色的链接")
    for text, href in role_links[:10]:
        print(f"  '{text}' -> {href}")

if __name__ == "__main__":
    analyze_structure()