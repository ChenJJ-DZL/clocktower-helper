#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
血染钟楼Wiki完整角色数据采集脚本
从分类页面采集所有角色数据
"""

import os
import time
import json
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import re
import sys

# 禁用SSL警告
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ================= 配置区域 =================
BASE_URL = "https://clocktower-wiki.gstonegames.com"

# 分类页面URL
CATEGORY_URLS = [
    BASE_URL + "/index.php?title=%E9%95%87%E6%B0%91",      # 镇民
    BASE_URL + "/index.php?title=%E5%A4%96%E6%9D%A5%E8%80%85",  # 外来者
    BASE_URL + "/index.php?title=%E7%88%AA%E7%89%99",      # 爪牙
    BASE_URL + "/index.php?title=%E6%81%B6%E9%AD%94",      # 恶魔
    BASE_URL + "/index.php?title=%E6%97%85%E8%A1%8C%E8%80%85",  # 旅行者
    BASE_URL + "/index.php?title=%E4%BC%A0%E5%A5%87%E8%A7%92%E8%89%B2",  # 传奇角色
    BASE_URL + "/index.php?title=%E5%A5%87%E9%81%87%E8%A7%92%E8%89%B2",  # 奇遇角色
]

OUTPUT_DIR = "json/complete"
BACKUP_DIR = "json/backup"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Referer": BASE_URL
}

REQUEST_DELAY = 1.5  # 秒，降低延迟以提高采集速度
TIMEOUT = 30
MAX_PAGES = 500  # 最大页面数

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
        time.sleep(REQUEST_DELAY)  # 礼貌延迟
        return response
    except Exception as e:
        print(f"警告: 请求失败 {url}: {e}")
        return None

def extract_character_data(soup, url, category_type=None):
    """从页面提取角色数据"""
    try:
        # 1. 获取标题
        title_elem = soup.find('h1', class_='title')
        if not title_elem:
            title_elem = soup.find('h1')
        
        if not title_elem:
            return None
        
        name = title_elem.get_text(strip=True)
        
        # 2. 提取英文名
        english_name = ""
        all_text = soup.get_text()
        
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
        
        # 3. 提取角色类型
        char_type = "unknown"
        
        # 首先使用传入的分类类型
        if category_type:
            char_type = category_type
        else:
            # 从文本中查找
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
                if '镇民' in all_text:
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
                elif '奇遇' in all_text:
                    char_type = '奇遇角色'
        
        # 4. 提取主要内容
        content = {}
        content_div = soup.find('div', id='mw-content-text') or soup.find('div', class_='mw-parser-output')
        
        if content_div:
            # 清理不需要的元素
            for selector in ['script', 'style', '.mw-editsection', '#toc', '.navbox', '.infobox', '.printfooter']:
                for element in content_div.select(selector):
                    element.decompose()
            
            # 提取章节内容
            current_section = "简介"
            current_text = []
            
            # 获取所有标题和内容元素
            for element in content_div.find_all(['h2', 'h3', 'p', 'ul', 'ol', 'table']):
                if element.name in ['h2', 'h3']:
                    # 保存当前章节
                    if current_section and current_text:
                        content[current_section] = '\n'.join(current_text)
                        current_text = []
                    
                    # 开始新章节
                    current_section = element.get_text(strip=True)
                else:
                    # 添加内容到当前章节
                    if element.name == 'table':
                        # 处理表格
                        table_text = []
                        for row in element.find_all('tr'):
                            cells = row.find_all(['th', 'td'])
                            if cells:
                                row_text = ' | '.join([cell.get_text(strip=True) for cell in cells])
                                table_text.append(row_text)
                        if table_text:
                            current_text.append('表格: ' + '; '.join(table_text))
                    else:
                        text = element.get_text(strip=True)
                        if text and len(text) > 5:  # 过滤太短的文本
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

def discover_role_links_from_category(soup, url, category_type):
    """从分类页面发现角色链接"""
    content_div = soup.find('div', id='mw-content-text') or soup.find('div', class_='mw-parser-output')
    if not content_div:
        return []
    
    role_links = []
    
    # 查找所有链接
    for link in content_div.find_all('a', href=True):
        href = link.get('href')
        text = link.get_text(strip=True)
        
        if not href or href.startswith('#'):
            continue
        
        # 过滤不需要的链接
        if any(pattern in href for pattern in ['action=', 'diff=', 'oldid=', 'Special:', 'File:', 'User:', 'Category:', 'Template:', 'Talk:', 'Help:']):
            continue
        
        # 检查链接文本是否看起来像角色名
        # 角色名通常是2-10个中文字符，不包含特殊符号
        if text and 2 <= len(text) <= 15:
            # 排除明显不是角色名的文本
            if any(keyword in text for keyword in ['编辑', '查看', '讨论', '历史', '移动', '监视', '更多']):
                continue
            if any(char in text for char in '[](){}<>|#@$%^&*+='):
                continue
            
            # 转换为绝对URL
            full_url = urljoin(url, href)
            
            # 只添加Wiki内部链接
            if BASE_URL in full_url and 'index.php?title=' in full_url:
                # 排除分类页面本身
                if full_url == url:
                    continue
                
                # 添加链接
                role_links.append((text, full_url, category_type))
    
    return role_links

def crawl_all_roles():
    """采集所有角色数据"""
    session = create_session()
    all_characters = []
    visited = set()
    role_links_to_crawl = []
    
    print("=" * 70)
    print("血染钟楼Wiki完整角色数据采集")
    print("=" * 70)
    
    # 第一步：从分类页面发现角色链接
    print("\n第一步：发现角色链接...")
    
    for category_url in CATEGORY_URLS:
        # 从URL推断分类类型
        category_type = "unknown"
        if '%E9%95%87%E6%B0%91' in category_url:
            category_type = "镇民"
        elif '%E5%A4%96%E6%9D%A5%E8%80%85' in category_url:
            category_type = "外来者"
        elif '%E7%88%AA%E7%89%99' in category_url:
            category_type = "爪牙"
        elif '%E6%81%B6%E9%AD%94' in category_url:
            category_type = "恶魔"
        elif '%E6%97%85%E8%A1%8C%E8%80%85' in category_url:
            category_type = "旅行者"
        elif '%E4%BC%A0%E5%A5%87%E8%A7%92%E8%89%B2' in category_url:
            category_type = "传奇角色"
        elif '%E5%A5%87%E9%81%87%E8%A7%92%E8%89%B2' in category_url:
            category_type = "奇遇角色"
        
        print(f"  处理分类: {category_type} ({category_url})")
        
        response = get_page(category_url, session)
        if not response:
            print(f"    警告: 无法访问分类页面")
            continue
        
        soup = BeautifulSoup(response.content, 'html.parser')
        role_links = discover_role_links_from_category(soup, category_url, category_type)
        
        print(f"    发现 {len(role_links)} 个角色链接")
        
        # 添加到待爬取列表
        for text, url, cat_type in role_links:
            if url not in visited:
                role_links_to_crawl.append((text, url, cat_type))
                visited.add(url)
    
    print(f"\n总共发现 {len(role_links_to_crawl)} 个角色链接待爬取")
    
    # 第二步：爬取所有角色页面
    print("\n第二步：爬取角色页面...")
    
    successful = 0
    failed = 0
    
    for i, (role_name, role_url, category_type) in enumerate(role_links_to_crawl, 1):
        if i > MAX_PAGES:
            print(f"  已达到最大页面限制 ({MAX_PAGES})，停止爬取")
            break
        
        print(f"  [{i}/{len(role_links_to_crawl)}] 处理: {role_name}")
        
        response = get_page(role_url, session)
        if not response:
            print(f"    警告: 无法获取页面")
            failed += 1
            continue
        
        soup = BeautifulSoup(response.content, 'html.parser')
        character = extract_character_data(soup, role_url, category_type)
        
        if character:
            all_characters.append(character)
            successful += 1
            print(f"    成功: {character['name']} ({character['type']})")
        else:
            failed += 1
            print(f"    失败: 无法提取角色数据")
        
        # 进度报告
        if i % 10 == 0:
            print(f"    进度: 成功={successful}, 失败={failed}, 总计={i}")
    
    print(f"\n爬取完成!")
    print(f"  成功: {successful} 个角色")
    print(f"  失败: {failed} 个页面")
    print(f"  总计: {len(all_characters)} 个角色数据")
    
    return all_characters

def save_data(characters, output_dir):
    """保存数据到JSON文件"""
    os.makedirs(output_dir, exist_ok=True)
    
    # 保存所有角色数据
    all_file = os.path.join(output_dir, "all_characters.json")
    with open(all_file, 'w', encoding='utf-8') as f:
        json.dump(characters, f, ensure_ascii=False, indent=2)
    
    print(f"\n保存所有角色数据: {len(characters)} 个角色")
    print(f"  文件: {all_file}")
    
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
        
        # 中文类型映射
        if '镇民' in char_type:
            grouped['townsfolk'].append(char)
        elif '外来者' in char_type:
            grouped['outsiders'].append(char)
        elif '爪牙' in char_type:
            grouped['minions'].append(char)
        elif '恶魔' in char_type:
            grouped['demons'].append(char)
        elif '旅行者' in char_type:
            grouped['travellers'].append(char)
        elif '传奇' in char_type:
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
    print("=" * 70)
    print("血染钟楼Wiki完整角色数据采集脚本")
    print("=" * 70)
    
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
    print(f"最大页面: {MAX_PAGES}")
    print("-" * 70)
    
    try:
        # 开始爬取
        characters = crawl_all_roles()
        
        if not characters:
            print("警告: 未发现任何角色数据")
            return
        
        # 保存数据
        all_file = save_data(characters, OUTPUT_DIR)
        
        print("-" * 70)
        print("采集完成!")
        print(f"数据文件: {all_file}")
        print(f"总共采集: {len(characters)} 个角色")
        print("=" * 70)
        
    except KeyboardInterrupt:
        print("\n警告: 用户中断，保存已收集的数据...")
        if characters:
            save_data(characters, OUTPUT_DIR)
        else:
            print("警告: 未收集到任何数据")
    except Exception as e:
