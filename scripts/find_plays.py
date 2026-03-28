#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
查找官方剧本
"""

import requests
from bs4 import BeautifulSoup
import time
import urllib.parse
import re

BASE_URL = "https://clocktower-wiki.gstonegames.com"

def search_plays():
    """搜索剧本页面"""
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })
    
    # 从已知角色页面中查找剧本链接
    print("从已知角色页面查找剧本链接...")
    
    # 检查一些已知角色页面，看是否有剧本链接
    test_pages = [
        "/index.php?title=%E6%B4%97%E8%A1%A3%E5%A6%87",  # 洗衣妇
        "/index.php?title=%E5%8D%AB%E5%85%B5",  # 卫兵
        "/index.php?title=%E5%B7%AB%E5%B8%88",  # 巫师
    ]
    
    play_urls = set()
    
    for page in test_pages:
        url = BASE_URL + page
        try:
            print(f"检查页面: {url}")
            response = session.get(url, timeout=30, verify=False)
            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')
                
                # 查找所有链接
                links = soup.find_all('a', href=True)
                for link in links:
                    href = link.get('href', '')
                    text = link.get_text(strip=True)
                    
                    # 检查是否是剧本链接
                    if ('剧本' in text or '脚本' in text or 
                        '暗流' in text or '黯月' in text or 
                        '华灯' in text or '梦殒' in text or
                        '汀西' in text or '恋人' in text):
                        full_url = urllib.parse.urljoin(BASE_URL, href)
                        if 'index.php?title=' in full_url and 'Special:' not in full_url:
                            play_urls.add((text, full_url))
            
            time.sleep(1)
        except Exception as e:
            print(f"错误检查 {url}: {e}")
    
    # 检查剧本分类页面
    print("\n检查剧本分类页面...")
    category_url = BASE_URL + "/index.php?title=%E5%88%86%E7%B1%BB:%E5%89%A7%E6%9C%AC"
    try:
        response = session.get(category_url, timeout=30, verify=False)
        if response.status_code == 200:
            soup = BeautifulSoup(response.content, 'html.parser')
            content_div = soup.find('div', id='mw-pages') or soup.find('div', class_='mw-content-ltr')
            if content_div:
                links = content_div.find_all('a', href=True)
                for link in links:
                    href = link.get('href', '')
                    text = link.get_text(strip=True)
                    if text and not any(x in text for x in ['分类', 'Category', '讨论', 'Talk']):
                        full_url = urllib.parse.urljoin(BASE_URL, href)
                        if 'index.php?title=' in full_url:
                            play_urls.add((text, full_url))
        else:
            print(f"分类页面状态码: {response.status_code}")
    except Exception as e:
        print(f"分类页面错误: {e}")
    
    # 检查已知的剧本页面
    known_plays = [
        ("暗流涌动", "/index.php?title=%E6%9A%97%E6%B5%81%E6%B6%8C%E5%8A%A8"),
        ("黯月初升", "/index.php?title=%E9%BB%AF%E6%9C%88%E5%88%9D%E5%8D%87"),
        ("华灯初上", "/index.php?title=%E5%8D%8E%E7%81%AF%E5%88%9D%E4%B8%8A"),
        ("梦殒春宵", "/index.php?title=%E6%A2%A6%E6%AE92%E6%98%A5%E5%AE%85"),
        ("汀西维尔", "/index.php?title=%E6%B1%80%E8%A5%BF%E7%BB%B4%E5%B0%94"),
        ("恋人节快递", "/index.php?title=%E6%81%8B%E4%BA%BA%E8%8A%82%E5%BF%AB%E9%80%92"),
        ("教派与紫罗兰", "/index.php?title=%E6%95%99%E6%B4%BE%E4%B8%8E%E7%B4%AB%E7%BD%97%E5%85%B0"),
        ("乌鸦之夜", "/index.php?title=%E4%B9%8C%E9%B8%A6%E4%B9%8B%E5%A4%9C"),
        ("最终狂欢", "/index.php?title=%E6%9C%80%E7%BB%88%E7%8B%82%E6%AC%A2"),
    ]
    
    print("\n验证已知剧本页面...")
    valid_plays = []
    for name, path in known_plays:
        url = BASE_URL + path
        try:
            response = session.head(url, timeout=10, verify=False, allow_redirects=True)
            if response.status_code == 200:
                print(f"✓ {name}: 存在")
                valid_plays.append((name, url))
            else:
                print(f"✗ {name}: 状态码 {response.status_code}")
        except Exception as e:
            print(f"? {name}: 错误 {e}")
    
    # 合并结果
    all_plays = list(play_urls) + valid_plays
    
    # 去重
    unique_plays = []
    seen_urls = set()
    for name, url in all_plays:
        if url not in seen_urls:
            seen_urls.add(url)
            unique_plays.append((name, url))
    
    print(f"\n总共发现 {len(unique_plays)} 个剧本:")
    for name, url in unique_plays:
        print(f"  - {name}: {url}")
    
    return unique_plays

if __name__ == "__main__":
    plays = search_plays()
    print(f"\n剧本搜索完成，找到 {len(plays)} 个剧本")