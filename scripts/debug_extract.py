#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
调试角色数据提取问题
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import requests
from bs4 import BeautifulSoup
import time

BASE_URL = "https://clocktower-wiki.gstonegames.com"
TEST_URL = BASE_URL + "/index.php?title=%E6%B4%97%E8%A1%A3%E5%A6%87"

def debug_extract():
    """调试提取逻辑"""
    print("调试角色数据提取...")
    print(f"测试URL: {TEST_URL}")
    
    # 获取页面
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    
    response = session.get(TEST_URL, timeout=30, verify=False)
    response.encoding = 'utf-8'
    
    print(f"状态码: {response.status_code}")
    print(f"页面大小: {len(response.content)} 字节")
    
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # 1. 检查标题
    print("\n1. 检查标题...")
    title_elem = soup.find('h1', id='firstHeading')
    if title_elem:
        print(f"找到标题元素: {title_elem}")
        print(f"标题文本: '{title_elem.get_text(strip=True)}'")
    else:
        print("未找到标题元素 (h1#firstHeading)")
        # 尝试其他选择器
        all_h1 = soup.find_all('h1')
        print(f"所有h1元素: {len(all_h1)}")
        for i, h1 in enumerate(all_h1):
            print(f"  h1[{i}]: {h1.get_text(strip=True)[:50]}")
    
    # 2. 检查infobox
    print("\n2. 检查infobox...")
    infobox = soup.find('table', class_='infobox')
    if infobox:
        print(f"找到infobox: {infobox}")
        # 检查行内容
        rows = infobox.find_all('tr')
        print(f"infobox行数: {len(rows)}")
        for i, row in enumerate(rows[:10]):  # 只显示前10行
            cells = row.find_all(['th', 'td'])
            if cells:
                print(f"  行{i}: ", end="")
                for cell in cells:
                    text = cell.get_text(strip=True)[:30]
                    print(f"'{text}' | ", end="")
                print()
    else:
        print("未找到infobox (table.infobox)")
        # 查找所有table
        tables = soup.find_all('table')
        print(f"所有table元素: {len(tables)}")
        for i, table in enumerate(tables[:5]):
            print(f"  table[{i}] class: {table.get('class', '无class')}")
    
    # 3. 检查内容区域
    print("\n3. 检查内容区域...")
    content_div = soup.find('div', id='mw-content-text')
    if not content_div:
        content_div = soup.find('div', class_='mw-parser-output')
    
    if content_div:
        print(f"找到内容区域")
        # 检查是否有常见内容
        paragraphs = content_div.find_all('p')
        print(f"段落数: {len(paragraphs)}")
        if paragraphs:
            print(f"第一个段落: '{paragraphs[0].get_text(strip=True)[:100]}'")
    else:
        print("未找到内容区域")
    
    # 4. 尝试简单的提取
    print("\n4. 尝试简单提取...")
    if title_elem:
        name = title_elem.get_text(strip=True)
        print(f"角色名称: {name}")
        
        # 尝试找英文名
        english_name = ""
        all_text = soup.get_text()
        if 'English' in all_text or '英文' in all_text:
            # 简单查找
            lines = all_text.split('\n')
            for line in lines:
                if 'English' in line or '英文' in line:
                    print(f"可能包含英文的行: {line[:100]}")
    
    return soup

if __name__ == "__main__":
    debug_extract()