#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
采集官方剧本数据
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

def extract_play_data(soup, url):
    """从剧本页面提取数据"""
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
        content = {}
        
        if content_div:
            # 清理不需要的元素
            for selector in ['script', 'style', '.mw-editsection', '#toc', '.navbox', '.infobox', '.printfooter']:
                for element in content_div.select(selector):
                    element.decompose()
            
            # 提取段落内容
            paragraphs = content_div.find_all('p')
            if paragraphs:
                main_content = '\n'.join([p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True)])
                if main_content:
                    content["内容"] = main_content
            
            # 提取表格内容
            tables = content_div.find_all('table')
            for i, table in enumerate(tables):
                table_data = []
                for row in table.find_all('tr'):
                    cells = row.find_all(['th', 'td'])
                    if cells:
                        row_text = ' | '.join([cell.get_text(strip=True) for cell in cells])
                        table_data.append(row_text)
                if table_data:
                    content[f"表格{i+1}"] = '\n'.join(table_data)
        
        # 提取分类信息
        categories = []
        cat_div = soup.find('div', id='catlinks')
        if cat_div:
            for cat_link in cat_div.find_all('a'):
                cat_name = cat_link.get_text(strip=True)
                if cat_name and not cat_name.startswith('分类'):
                    categories.append(cat_name)
        
        play = {
            "id": url.split('title=')[-1].replace('%', '_') if 'title=' in url else re.sub(r'[^\w]', '_', name),
            "name": name,
            "url": url,
            "content": content,
            "categories": categories,
            "metadata": {
                "extracted_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "source": "clocktower-wiki.gstonegames.com"
            }
        }
        
        return play
    except Exception as e:
        print(f"错误: 提取剧本数据失败 {url}: {e}")
        return None

def collect_plays():
    """采集所有官方剧本"""
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    
    # 已知的官方剧本URL - 根据实际搜索找到的有效URL
    known_play_urls = [
        # 找到的有效剧本URL
        "https://clocktower-wiki.gstonegames.com/index.php?title=%E6%9A%97%E6%B5%81%E6%B6%8C%E5%8A%A8",  # 暗流涌动 (Trouble Brewing)
        "https://clocktower-wiki.gstonegames.com/index.php?title=%E9%BB%AF%E6%9C%88%E5%88%9D%E5%8D%87",  # 黯月初升 (Bad Moon Rising)
        "https://clocktower-wiki.gstonegames.com/index.php?title=%E5%8D%8E%E7%81%AF%E5%88%9D%E4%B8%8A",  # 华灯初上 (Laissez un Faire)
        "https://clocktower-wiki.gstonegames.com/index.php?title=%E6%A2%A6%E6%AE%92%E6%98%A5%E5%AE%B5",  # 梦殒春宵 (Sects & Violets) - 修正编码
    ]
    
    all_plays = []
    processed_urls = set()
    
    # 只处理一次所有URL
    for i, url in enumerate(known_play_urls):
        if url in processed_urls:
            continue
            
        print(f"[{i+1}/{len(known_play_urls)}] 处理: {url}")
        processed_urls.add(url)
        
        response = get_page(url, session)
        if not response:
            print(f"  警告: 无法获取页面")
            continue
        
        soup = BeautifulSoup(response.content, 'html.parser')
        play = extract_play_data(soup, url)
        
        if play:
            all_plays.append(play)
            print(f"  成功: {play['name']}")
        else:
            print(f"  失败: 无法提取数据")
        
        # 礼貌延迟
        time.sleep(1.5)
    
    # 保存数据
    output_dir = "json/full/play"
    os.makedirs(output_dir, exist_ok=True)
    
    # 保存所有剧本
    all_plays_file = os.path.join(output_dir, "all_plays.json")
    with open(all_plays_file, 'w', encoding='utf-8') as f:
        json.dump(all_plays, f, ensure_ascii=False, indent=2)
    
    print(f"\n保存所有剧本数据: {len(all_plays)} 个剧本")
    print(f"  文件: {all_plays_file}")
    
    # 按类型分组保存
    if all_plays:
        print("\n剧本列表:")
        for play in all_plays:
            print(f"  - {play['name']}")
    
    return all_plays

if __name__ == "__main__":
    plays = collect_plays()
    print(f"\n总共采集 {len(plays)} 个官方剧本")