#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
完整角色数据采集脚本
从分类页面获取所有角色链接，然后采集每个角色的详细数据
"""

import os
import time
import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import re
import sys

# 禁用SSL警告
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "https://clocktower-wiki.gstonegames.com"

# 分类页面
CATEGORY_PAGES = {
    "镇民": "/index.php?title=%E9%95%87%E6%B0%91",
    "外来者": "/index.php?title=%E5%A4%96%E6%9D%A5%E8%80%85",
    "爪牙": "/index.php?title=%E7%88%AA%E7%89%99", 
    "恶魔": "/index.php?title=%E6%81%B6%E9%AD%94",
    "旅行者": "/index.php?title=%E6%97%85%E8%A1%8C%E8%80%85",
    "传奇角色": "/index.php?title=%E4%BC%A0%E5%A5%87%E8%A7%92%E8%89%B2",
    "奇遇角色": "/index.php?title=%E5%A5%87%E9%81%87%E8%A7%92%E8%89%B2"
}

def get_page(url, session):
    """获取页面内容"""
    try:
        response = session.get(url, timeout=30, verify=False)
        response.raise_for_status()
        response.encoding = 'utf-8'
        time.sleep(1.5)  # 礼貌延迟
        return response
    except Exception as e:
        print(f"警告: 请求失败 {url}: {e}")
        return None

def discover_role_links_from_category(url, category_name, session):
    """从分类页面发现角色链接"""
    print(f"处理分类: {category_name}")
    
    response = get_page(url, session)
    if not response:
        return []
    
    soup = BeautifulSoup(response.content, 'html.parser')
    content_div = soup.find('div', id='mw-content-text') or soup.find('div', class_='mw-parser-output')
    
    if not content_div:
        print(f"  警告: 内容区域不存在")
        return []
    
    role_links = []
    
    # 方法1: 从图库中提取（主要方法）
    galleries = content_div.find_all(class_='gallery')
    print(f"  发现图库数量: {len(galleries)}")
    
    for gallery in galleries:
        # 在图库中找到所有链接
        gallery_links = gallery.find_all('a', href=True)
        for link in gallery_links:
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
                    if text and 2 <= len(text) <= 20:
                        # 排除明显不是角色名的文本
                        if any(keyword in text for keyword in [
                            '编辑', '查看', '讨论', '历史', '移动', '监视', '更多',
                            '加入', '参数设置', '最近更改', '上传文件', '特殊页面',
                            '页面信息', '固定链接', '图片', '图像'
                        ]):
                            continue
                        
                        # 排除包含特殊字符的文本
                        if any(char in text for char in '[](){}<>|#@$%^&*+=~'):
                            continue
                        
                        role_links.append((text, full_url, category_name))
    
    # 方法2: 如果图库中没有找到链接，使用通用方法
    if len(role_links) == 0:
        print(f"  图库中没有找到链接，使用通用方法")
        all_links = content_div.find_all('a', href=True)
        print(f"  总链接数: {len(all_links)}")
        
        for link in all_links:
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
                    if text and 2 <= len(text) <= 20:
                        # 排除明显不是角色名的文本
                        if any(keyword in text for keyword in [
                            '编辑', '查看', '讨论', '历史', '移动', '监视', '更多',
                            '加入', '参数设置', '最近更改', '上传文件', '特殊页面',
                            '页面信息', '固定链接'
                        ]):
                            continue
                        
                        # 排除包含特殊字符的文本
                        if any(char in text for char in '[](){}<>|#@$%^&*+=~'):
                            continue
                        
                        role_links.append((text, full_url, category_name))
    
    # 去重
    unique_links = []
    seen_urls = set()
    for text, full_url, cat in role_links:
        if full_url not in seen_urls:
            seen_urls.add(full_url)
            unique_links.append((text, full_url, cat))
    
    print(f"  发现角色链接: {len(unique_links)} (去重后)")
    return unique_links

def extract_character_data(soup, url, category_name=None):
    """从页面提取角色数据"""
    try:
        # 获取标题
        title_elem = soup.find('h1', class_='title')
        if not title_elem:
            title_elem = soup.find('h1')
        
        if not title_elem:
            return None
        
        name = title_elem.get_text(strip=True)
        
        # 提取英文名

        english_name = ""
        all_text = soup.get_text()
        
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
        
        # 提取角色类型

        char_type = category_name or "unknown"
        
        if not category_name:
            if '镇民' in all_text:
                char_type = "镇民"
            elif '外来者' in all_text:
                char_type = "外来者"
            elif '爪牙' in all_text:
                char_type = "爪牙"
            elif '恶魔' in all_text:
                char_type = "恶魔"
            elif '旅行者' in all_text:
                char_type = "旅行者"
            elif '传奇' in all_text:
                char_type = "传奇角色"
            elif '奇遇' in all_text:
                char_type = "奇遇角色"
        
        # 提取内容

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
                        if text and len(text) > 5:
                            current_text.append(text)
            
            if current_section and current_text:
                content[current_section] = '\n'.join(current_text)
        
        # 生成ID

        if 'title=' in url:
            parsed_url = url.split('title=')[-1]
            char_id = parsed_url.split('&')[0].replace('%', '_')
        else:
            char_id = re.sub(r'[^\w]', '_', name)
        
        # 创建角色对象

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

def main():
    """主函数"""
    print("=" * 70)
    print("血染钟楼Wiki完整角色数据采集")
    print("=" * 70)
    
    # 创建会话
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    
    all_role_links = []
    visited = set()
    
    print("\n第一步：从分类页面发现角色链接")
    print("-" * 40)
    
    # 从每个分类页面获取角色链接
    for category_name, path in CATEGORY_PAGES.items():
        url = BASE_URL + path
        role_links = discover_role_links_from_category(url, category_name, session)
        
        for role_name, role_url, cat_type in role_links:
            if role_url not in visited:
                all_role_links.append((role_name, role_url, cat_type))
                visited.add(role_url)
    
    print(f"\n总共发现 {len(all_role_links)} 个角色链接")
    
    if len(all_role_links) == 0:
        print("错误: 未发现任何角色链接")
        return
    
    # 第二步：采集角色数据
    print("\n第二步：采集角色数据")
    print("-" * 40)
    
    all_characters = []
    successful = 0
    failed = 0
    
    for i, (role_name, role_url, category_name) in enumerate(all_role_links, 1):
        print(f"[{i}/{len(all_role_links)}] 处理: {role_name}")
        
        response = get_page(role_url, session)
        if not response:
            print(f"  警告: 无法获取页面")
            failed += 1
            continue
        
        soup = BeautifulSoup(response.content, 'html.parser')
        character = extract_character_data(soup, role_url, category_name)
        
        if character:
            all_characters.append(character)
            successful += 1
            print(f"  成功: {character['name']} ({character['type']})")
        else:
            failed += 1
            print(f"  失败: 无法提取角色数据")
        
        # 进度报告
        if i % 10 == 0:
            print(f"  进度: 成功={successful}, 失败={failed}, 总计={i}")
    
    print(f"\n采集完成!")
    print(f"  成功: {successful} 个角色")
    print(f"  失败: {failed} 个页面")
    print(f"  总计: {len(all_characters)} 个角色数据")
    
    # 保存数据
    output_dir = "json/full"
    os.makedirs(output_dir, exist_ok=True)
    
    # 保存所有角色数据
    all_file = os.path.join(output_dir, "all_characters.json")
    with open(all_file, 'w', encoding='utf-8') as f:
        json.dump(all_characters, f, ensure_ascii=False, indent=2)
    
    print(f"\n保存所有角色数据: {len(all_characters)} 个角色")
    print(f"  文件: {all_file}")
    
    # 按类型分组保存
    grouped = {}
    for char in all_characters:
        char_type = char.get('type', 'unknown')
        if char_type not in grouped:
            grouped[char_type] = []
        grouped[char_type].append(char)
    
    for char_type, char_list in grouped.items():
        if char_list:
            filepath = os.path.join(output_dir, f"{char_type}.json")
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(char_list, f, ensure_ascii=False, indent=2)
            
            print(f"  保存分组: {char_type}, {len(char_list)} 个角色")
    
    print("\n" + "=" * 70)
    print("完整角色数据采集完成!")
    print(f"总共采集: {len(all_characters)} 个角色")
    print("=" * 70)

if __name__ == "__main__":
    main()