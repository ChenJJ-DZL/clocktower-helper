#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
血染钟楼Wiki数据采集脚本
可以直接运行采集所有角色数据
"""

import os
import time
import json
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import urllib3
import re
import sys
from typing import List, Dict, Optional

# 禁用SSL警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ================= 配置区域 =================
BASE_URL = "https://clocktower-wiki.gstonegames.com"
START_URLS = [
    BASE_URL + "/index.php?title=%E9%A6%96%E9%A1%B5",  # 首页
    BASE_URL + "/index.php?title=%E5%88%86%E7%B1%BB:%E8%A7%92%E8%89%B2",  # 角色分类
    BASE_URL + "/index.php?title=%E5%88%86%E7%B1%BB:%E5%89%A7%E6%9C%AC",  # 剧本分类
    BASE_URL + "/index.php?title=%E5%88%86%E7%B1%BB:%E8%A7%84%E5%88%99"   # 规则分类
]

OUTPUT_DIR = "json/official"
BACKUP_DIR = "json/backup"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Referer": BASE_URL
}

REQUEST_DELAY = 2.0  # 秒
TIMEOUT = 30

# ===========================================

def create_session():
    """创建带有重试机制的Session"""
    session = requests.Session()
    retries = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[500, 502, 503, 504]
    )
    session.mount('http://', HTTPAdapter(max_retries=retries))
    session.mount('https://', HTTPAdapter(max_retries=retries))
    session.headers.update(HEADERS)
    return session

def get_page(url, session):
    """获取页面内容"""
    try:
        response = session.get(url, timeout=TIMEOUT, verify=False)
        response.raise_for_status()
        response.encoding = 'utf-8'
        time.sleep(REQUEST_DELAY)
        return response
    except Exception as e:
        print(f"警告: 请求失败 {url}: {e}")
        return None

def extract_character_data(soup, url):
    """从页面提取角色数据"""
    try:
        # 1. 获取标题 - 使用h1.title或第一个h1
        title_elem = soup.find('h1', class_='title')
        if not title_elem:
            title_elem = soup.find('h1')
        
        if not title_elem:
            return None
        
        name = title_elem.get_text(strip=True)
        
        # 2. 提取英文名 - 从页面文本中查找
        english_name = ""
        all_text = soup.get_text()
        
        # 查找英文名模式
        import re
        english_patterns = [
            r'English[：:]\s*([^\n\r]+)',
            r'英文[：:]\s*([^\n\r]+)',
            r'\(([A-Za-z\s]+)\)'
        ]
        
        for pattern in english_patterns:
            match = re.search(pattern, all_text)
            if match:
                english_name = match.group(1).strip()
                if english_name:
                    break
        
        # 3. 提取角色类型 - 从文本中查找
        char_type = "unknown"
        type_patterns = [
            r'角色类型[：:]\s*([^\n\r]+)',
            r'Type[：:]\s*([^\n\r]+)',
            r'类型[：:]\s*([^\n\r]+)'
        ]
        
        for pattern in type_patterns:
            match = re.search(pattern, all_text)
            if match:
                char_type = match.group(1).strip()
                if char_type:
                    break
        
        # 如果没找到，尝试从文本内容推断
        if char_type == "unknown":
            if '镇民' in all_text and '角色类型' not in all_text:
                char_type = '镇民'
            elif '外来者' in all_text:
                char_type = '外来者'
            elif '爪牙' in all_text:
                char_type = '爪牙'
            elif '恶魔' in all_text:
                char_type = '恶魔'
            elif '旅行者' in all_text:
                char_type = '旅行者'
            elif '传奇' in all_text:
                char_type = '传奇角色'
        
        # 4. 提取主要内容
        content = {}
        content_div = soup.find('div', id='mw-content-text') or soup.find('div', class_='mw-parser-output')
        
        if content_div:
            # 清理不需要的元素
            for selector in ['script', 'style', '.mw-editsection', '#toc', '.navbox', '.infobox']:
                for element in content_div.select(selector):
                    element.decompose()
            
            # 提取章节内容
            current_section = "简介"
            current_text = []
            
            # 获取所有直接子元素
            for element in content_div.find_all(['h2', 'h3', 'p', 'ul', 'ol']):
                if element.name in ['h2', 'h3']:
                    # 保存当前章节
                    if current_section and current_text:
                        content[current_section] = '\n'.join(current_text)
                        current_text = []
                    
                    # 开始新章节
                    current_section = element.get_text(strip=True)
                else:
                    # 添加内容到当前章节
                    text = element.get_text(strip=True)
                    if text and len(text) > 10:  # 过滤太短的文本
                        current_text.append(text)
            
            # 保存最后一个章节
            if current_section and current_text:
                content[current_section] = '\n'.join(current_text)
        
        # 5. 生成ID
        if 'title=' in url:
            parsed_url = url.split('title=')[-1]
            char_id = parsed_url.split('&')[0].replace('%', '_')
        else:
            char_id = re.sub(r'[^\w]', '_', name)
        
        # 6. 创建角色对象
        character = {
            "id": char_id,
            "name": name,
            "english_name": english_name,
            "type": char_type,
            "url": url,
            "content": content,
            "metadata": {
                "extracted_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "source": "clocktower-wiki.gstonegames.com"
            }
        }
        
        return character
        
    except Exception as e:
        print(f"错误: 提取角色数据失败 {url}: {e}")
        return None

def discover_links(soup, url, visited):
    """发现页面中的链接"""
    content_div = soup.find('div', id='mw-content-text') or soup.find('div', class_='mw-parser-output')
    if not content_div:
        return []
    
    links = []
    for link in content_div.find_all('a', href=True):
        href = link.get('href')
        if not href or href.startswith('#'):
            continue        
        # 过滤不需要的链接
        if any(pattern in href for pattern in ['action=', 'diff=', 'oldid=', 'Special:', 'File:', 'User:']):
            continue        
        # 转换为绝对URL
        full_url = urljoin(url, href)        
        # 只添加Wiki内部链接
        if BASE_URL in full_url and 'index.php?title=' in full_url:
            if full_url not in visited and full_url not in links:
                links.append(full_url)    
    return links

def crawl(start_urls, max_pages=200):
    """主爬取函数"""
    session = create_session()
    visited = set()
    characters = []
    
    queue = start_urls.copy()
    page_count = 0
    
    while queue and page_count < max_pages:
        url = queue.pop(0)
        
        if url in visited:
            continue
        
        response = get_page(url, session)
        if not response:
            continue
        
        visited.add(url)
        page_count += 1
        
        print(f"[{page_count}] 处理: {url}")
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # 提取角色数据
        character = extract_character_data(soup, url)
        if character:
            characters.append(character)
            print(f"   提取成功: {character['name']} ({character['type']})")
        
        # 发现新链接
        new_links = discover_links(soup, url, visited)
        for link in new_links:
            if link not in queue:
                queue.append(link)
        
        # 进度报告
        if page_count % 10 == 0:
            print(f"进度: 页面={page_count}, 角色={len(characters)}")
    
    return characters

def save_data(characters, output_dir):
    """保存数据到JSON文件"""
    os.makedirs(output_dir, exist_ok=True)
    
    # 保存所有角色数据
    all_file = os.path.join(output_dir, "all_characters.json")
    with open(all_file, 'w', encoding='utf-8') as f:
        json.dump(characters, f, ensure_ascii=False, indent=2)
    
    print(f"保存成功: 所有角色数据, {len(characters)} 个角色")
    
    # 按类型分组
    grouped = {
        "townsfolk": [],
        "outsiders": [],
        "minions": [],
        "demons": [],
        "travellers": [],
        "legends": [],
        "fabled": [],
        "unknown": []
    }
    
    for char in characters:
        char_type = char.get('type', '').lower()
        if 'townsfolk' in char_type or '镇民' in char_type:
            grouped['townsfolk'].append(char)
        elif 'outsider' in char_type or '外来者' in char_type:
            grouped['outsiders'].append(char)
        elif 'minion' in char_type or '爪牙' in char_type:
            grouped['minions'].append(char)
        elif 'demon' in char_type or '恶魔' in char_type:
            grouped['demons'].append(char)
        elif 'traveller' in char_type or '旅行者' in char_type:
            grouped['travellers'].append(char)
        elif 'legend' in char_type or '传奇' in char_type:
            grouped['legends'].append(char)
        elif 'fabled' in char_type:
            grouped['fabled'].append(char)
        else:
            grouped['unknown'].append(char)
    
    # 保存分组数据
    for char_type, char_list in grouped.items():
        if char_list:
            filepath = os.path.join(output_dir, f"{char_type}.json")
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(char_list, f, ensure_ascii=False, indent=2)
            
            print(f"  保存分组: {char_type}, {len(char_list)} 个角色")
    
    return all_file

def main():
    """主函数"""
    print("=" * 60)
    print("血染钟楼Wiki数据采集脚本")
    print("=" * 60)
    
    # 检查依赖
    try:
        import requests
        from bs4 import BeautifulSoup
    except ImportError:
        print("错误: 缺少依赖包，请安装：")
        print("   pip install requests beautifulsoup4")
        return
    
    print(f"目标网站: {BASE_URL}")
    print(f"输出目录: {OUTPUT_DIR}")
    print(f"请求延迟: {REQUEST_DELAY} 秒")
    print("-" * 60)
    
    try:
        # 开始爬取
        characters = crawl(START_URLS, max_pages=50)
        
        if not characters:
            print("警告: 未发现任何角色数据")
            return
        
        # 保存数据
        all_file = save_data(characters, OUTPUT_DIR)
        
        print("-" * 60)
        print(f"采集完成!")
        print(f"数据文件: {all_file}")
        print(f"总共采集: {len(characters)} 个角色")
        print("=" * 60)
        
    except KeyboardInterrupt:
        print("\n警告: 用户中断，保存已收集的数据...")
        if characters:
            save_data(characters, OUTPUT_DIR)
        else:
            print("警告: 未收集到任何数据")
    except Exception as e:
        print(f"错误: 运行失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()