#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试完整爬虫的链接发现功能
"""

import sys
sys.path.append('.')

import requests
from bs4 import BeautifulSoup
import time
import re
from urllib.parse import urljoin

BASE_URL = "https://clocktower-wiki.gstonegames.com"

def test_category_page():
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    
    # 测试镇民分类页面
    url = BASE_URL + "/index.php?title=%E9%95%87%E6%B0%91"
    print(f"测试分类页面: {url}")
    
    try:
        response = session.get(url, timeout=30, verify=False)
        response.raise_for_status()
        response.encoding = 'utf-8'
    except Exception as e:
        print(f"请求失败: {e}")
        return
    
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # 检查内容区域
    content_div = soup.find('div', id='mw-content-text') or soup.find('div', class_='mw-parser-output')
    if not content_div:
        print("错误: 找不到内容区域")
        return
    
    print(f"内容区域找到")
    
    # 查找所有链接
    all_links = content_div.find_all('a', href=True)
    print(f"总链接数: {len(all_links)}")
    
    role_links = []
    for link in all_links[:20]:  # 只检查前20个
        href = link.get('href')
        text = link.get_text(strip=True)
        
        if not href or href.startswith('#') or 'edit' in href:
            continue
        
        # 过滤不需要的链接类型
        if any(pattern in href for pattern in [
            'action=', 'diff=', 'oldid=', 'Special:', 'File:', 'User:', 
            'Category:', 'Template:', 'Talk:', 'Help:', '#cite_'
        ]):
            continue
        
        # 检查是否可能是角色链接
        if '/index.php?title=' in href and not any(x in href for x in ['%E5%88%86%E7%B1%BB:', 'Special:']):
            full_url = urljoin(url, href)
            
            if BASE_URL in full_url:
                if text and 2 <= len(text) <= 15:
                    # 排除明显不是角色名的文本
                    if any(keyword in text for keyword in [
                        '编辑', '查看', '讨论', '历史', '移动', '监视', '更多',
                        '加入', '参数设置', '最近更改', '上传文件', '特殊页面',
                        '页面信息', '固定链接'
                    ]):
                        continue
                    
                    role_links.append((text, full_url))
    
    print(f"发现角色链接: {len(role_links)}")
    for i, (text, url) in enumerate(role_links[:10]):
        print(f"  {i+1}. {text} -> {url}")
    
    if role_links:
        # 测试提取第一个角色
        test_role_url = role_links[0][1]
        print(f"\n测试提取角色: {test_role_url}")
        test_extract_character(test_role_url, session)
    else:
        print("未发现角色链接")

def test_extract_character(url, session):
    try:
        response = session.get(url, timeout=30, verify=False)
        response.raise_for_status()
        response.encoding = 'utf-8'
    except Exception as e:
        print(f"请求失败: {e}")
        return
    
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # 获取标题
    title_elem = soup.find('h1', class_='title')
    if not title_elem:
        title_elem = soup.find('h1')
    
    if not title_elem:
        print("错误: 找不到标题")
        return
    
    name = title_elem.get_text(strip=True)
    print(f"角色名称: {name}")
    
    # 提取英文名
    all_text = soup.get_text()
    english_name = ""
    patterns = [
        r'English[：:]\s*([^\n\r]+)',
        r'英文[：:]\s*([^\n\r]+)',
        r'\(([A-Za-z\s]+)\)'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, all_text)
        if match:
            english_name = match.group(1).strip()
            if english_name:
                break
    
    print(f"英文名称: {english_name}")
    
    # 检查内容区域
    content_div = soup.find('div', id='mw-content-text') or soup.find('div', class_='mw-parser-output')
    if content_div:
        print(f"内容区域存在")
        
        # 提取前3个段落
        paragraphs = content_div.find_all('p')[:3]
        for i, p in enumerate(paragraphs):
            text = p.get_text(strip=True)
            if text:
                print(f"段落{i+1}: {text[:100]}...")
    else:
        print("警告: 没有内容区域")

if __name__ == "__main__":
    test_category_page()