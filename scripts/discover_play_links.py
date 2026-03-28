#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从官方规则首页发现所有剧本链接
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

def discover_play_links():
    """从规则首页发现所有剧本链接"""
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    
    # 官方规则首页
    home_url = "https://clocktower-wiki.gstonegames.com/index.php?title=%E9%A6%96%E9%A1%B5"
    
    print(f"访问规则首页: {home_url}")
    
    response = get_page(home_url, session)
    if not response:
        print("无法获取规则首页")
        return []
    
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # 目标剧本名称
    target_plays = [
        "暗流涌动", "黯月初升", "梦殒春宵", "游园惊梦", 
        "无名之墓", "凶宅魅影", "无上愉悦", "窃窃私语"
    ]
    
    play_links = []
    
    # 搜索所有链接
    all_links = soup.find_all('a', href=True)
    
    print(f"\n找到 {len(all_links)} 个链接")
    
    # 查找包含目标剧本名称的链接
    for link in all_links:
        href = link.get('href', '')
        text = link.get_text(strip=True)
        
        # 检查链接文本或URL编码
        for play_name in target_plays:
            if play_name in text:
                full_url = urljoin(BASE_URL, href)
                if full_url in [p['url'] for p in play_links]:
                    continue
                play_links.append({
                    "name": play_name,
                    "url": full_url,
                    "link_text": text
                })
                print(f"找到: {play_name} -> {full_url}")
    
    # 也尝试通过URL编码查找
    url_encoded_names = {
        "暗流涌动": "%E6%9A%97%E6%B5%81%E6%B6%8C%E5%8A%A8",
        "黯月初升": "%E9%BB%AF%E6%9C%88%E5%88%9D%E5%8D%87",
        "梦殒春宵": "%E6%A2%A6%E6%AE%92%E6%98%A5%E5%AE%B5",
        "华灯初上": "%E5%8D%8E%E7%81%AF%E5%88%9D%E4%B8%8A",
    }
    
    # 保存发现的链接
    output_file = "scripts/discovered_play_links.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(play_links, f, ensure_ascii=False, indent=2)
    
    print(f"\n保存发现的剧本链接到: {output_file}")
    print(f"共发现 {len(play_links)} 个剧本链接")
    
    # 检查哪些剧本没有找到
    found_names = [p['name'] for p in play_links]
    missing = [name for name in target_plays if name not in found_names]
    if missing:
        print(f"\n未找到的剧本: {missing}")
    
    return play_links

if __name__ == "__main__":
    # 禁用SSL警告
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    links = discover_play_links()
