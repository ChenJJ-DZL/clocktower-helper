#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
检查镇民页面结构
"""

import requests
from bs4 import BeautifulSoup
import re

BASE_URL = "https://clocktower-wiki.gstonegames.com"
TOWNSFOLK_URL = BASE_URL + "/index.php?title=%E9%95%87%E6%B0%91"

def analyze_townsfolk_page():
    """分析镇民页面"""
    print("分析镇民页面...")
    
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    
    response = session.get(TOWNSFOLK_URL, timeout=30, verify=False)
    response.encoding = 'utf-8'
    
    print(f"状态码: {response.status_code}")
    print(f"页面大小: {len(response.content)} 字节")
    
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # 保存HTML以便查看
    with open('debug_townsfolk.html', 'w', encoding='utf-8') as f:
        f.write(soup.prettify())
    
    print("HTML已保存到 debug_townsfolk.html")
    
    # 1. 查找所有链接
    print("\n=== 查找角色链接 ===")
    content_div = soup.find('div', id='mw-content-text') or soup.find('div', class_='mw-parser-output')
    
    if content_div:
        # 查找所有链接
        all_links = content_div.find_all('a', href=True)
        print(f"内容区域中的链接总数: {len(all_links)}")
        
        # 查找可能指向角色页面的链接
        role_links = []
        for link in all_links:
            href = link.get('href')
            text = link.get_text(strip=True)
            
            # 过滤条件：指向角色页面的链接
            if href and '/index.php?title=' in href:
                # 排除一些非角色页面
                if any(x in href for x in ['Special:', 'File:', 'User:', 'Category:', 'Talk:', 'Template:']):
                    continue
                
                # 检查链接文本是否看起来像角色名
                if text and len(text) > 1 and '[' not in text and ']' not in text:
                    role_links.append((text, href))
        
        print(f"可能的角色链接: {len(role_links)}")
        
        # 显示前20个
        print("\n前20个可能的角色链接:")
        for i, (text, href) in enumerate(role_links[:20]):
            print(f"  {i+1}. '{text}' -> {href}")
    
    # 2. 查找列表项中的角色
    print("\n=== 查找列表项中的角色 ===")
    list_items = content_div.find_all(['li', 'td', 'tr'])
    print(f"列表项/表格单元格总数: {len(list_items)}")
    
    # 查找包含角色名的列表项
    role_names = []
    for item in list_items:
        text = item.get_text(strip=True)
        # 简单过滤：长度2-10个字符，可能是中文角色名
        if 2 <= len(text) <= 10 and not any(c in text for c in '[](){}|#@$%^&*'):
            # 检查是否包含常见角色类型关键词
            if any(keyword in text for keyword in ['镇民', '外来者', '爪牙', '恶魔', '旅行者']):
                continue
            role_names.append(text)
    
    print(f"可能的角色名称: {len(role_names)}")
    print("前20个可能的角色名称:")
    for i, name in enumerate(role_names[:20]):
        print(f"  {i+1}. {name}")
    
    # 3. 查找表格
    print("\n=== 查找表格 ===")
    tables = content_div.find_all('table')
    print(f"表格总数: {len(tables)}")
    
    for i, table in enumerate(tables[:3]):
        print(f"\n表格 {i+1}:")
        rows = table.find_all('tr')
        print(f"  行数: {len(rows)}")
        
        # 显示前几行
        for j, row in enumerate(rows[:5]):
            cells = row.find_all(['th', 'td'])
            cell_texts = [cell.get_text(strip=True) for cell in cells]
            print(f"  行{j+1}: {cell_texts}")

if __name__ == "__main__":
    analyze_townsfolk_page()