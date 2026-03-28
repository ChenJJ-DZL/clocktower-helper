#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
简单调试页面结构
"""

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://clocktower-wiki.gstonegames.com"
TEST_URL = BASE_URL + "/index.php?title=%E6%B4%97%E8%A1%A3%E5%A6%87"

def main():
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    
    response = session.get(TEST_URL, timeout=30, verify=False)
    response.encoding = 'utf-8'
    
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # 查找所有文本，看看角色类型信息在哪里
    all_text = soup.get_text()
    
    # 查找包含"角色类型"的行
    lines = all_text.split('\n')
    for i, line in enumerate(lines):
        if '角色类型' in line:
            print(f"行 {i}: {line.strip()}")
        if '镇民' in line and '角色' in line:
            print(f"行 {i}: {line.strip()}")
        if 'Townsfolk' in line:
            print(f"行 {i}: {line.strip()}")
    
    # 查找主要内容的div
    print("\n=== 主要内容区域 ===")
    content_div = soup.find('div', id='mw-content-text')
    if content_div:
        print("找到内容区域")
        # 获取所有段落
        paragraphs = content_div.find_all('p')
        print(f"段落数量: {len(paragraphs)}")
        
        # 显示非空段落
        non_empty = [p for p in paragraphs if p.get_text(strip=True)]
        print(f"非空段落: {len(non_empty)}")
        
        for i, p in enumerate(non_empty[:5]):
            text = p.get_text(strip=True)
            print(f"段落 {i+1}: {text[:200]}")
    
    # 检查页面的元数据
    print("\n=== 页面元数据 ===")
    print(f"页面标题: {soup.title.string if soup.title else '无标题'}")
    
    # 检查是否有分类信息
    categories = soup.find('div', id='catlinks')
    if categories:
        print(f"分类信息: {categories.get_text(strip=True)[:200]}")
    
    # 检查页面信息
    print("\n=== 页面信息 ===")
    page_info = soup.find('div', id='mw-pageinfo')
    if page_info:
        print(f"页面信息: {page_info.get_text(strip=True)[:300]}")

if __name__ == "__main__":
    main()