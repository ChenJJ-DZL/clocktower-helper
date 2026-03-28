#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
改进的角色数据提取函数
"""

import requests
from bs4 import BeautifulSoup
import re
import time

BASE_URL = "https://clocktower-wiki.gstonegames.com"
TEST_URL = BASE_URL + "/index.php?title=%E6%B4%97%E8%A1%A3%E5%A6%87"

def improved_extract_character_data(soup, url):
    """改进的角色数据提取函数"""
    try:
        # 1. 获取标题 - 使用h1.title或第一个h1
        title_elem = soup.find('h1', class_='title')
        if not title_elem:
            title_elem = soup.find('h1')
        
        if not title_elem:
            return None
        
        name = title_elem.get_text(strip=True)
        print(f"提取到角色名称: {name}")
        
        # 2. 提取英文名 - 从页面文本中查找
        english_name = ""
        all_text = soup.get_text()
        
        # 查找英文名模式
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
        
        print(f"提取到角色类型: {char_type}")
        
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
        parsed_url = url.split('title=')[-1] if 'title=' in url else ''
        if parsed_url:
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
        print(f"提取角色数据失败: {e}")
        import traceback
        traceback.print_exc()
        return None

def test_improved_extract():
    """测试改进的提取函数"""
    print("测试改进的角色数据提取...")
    
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    
    response = session.get(TEST_URL, timeout=30, verify=False)
    response.encoding = 'utf-8'
    
    print(f"状态码: {response.status_code}")
    
    soup = BeautifulSoup(response.content, 'html.parser')
    character = improved_extract_character_data(soup, TEST_URL)
    
    if character:
        print("\n>>> 提取成功!")
        print(f"角色名称: {character['name']}")
        print(f"英文名称: {character['english_name']}")
        print(f"角色类型: {character['type']}")
        print(f"内容章节数: {len(character['content'])}")
        
        print("\n内容章节:")
        for i, (section, content) in enumerate(list(character['content'].items())[:3]):
            preview = content[:100] + "..." if len(content) > 100 else content
            print(f"  {i+1}. {section}: {preview}")
        
        return character
    else:
        print(">>> 提取失败")
        return None

if __name__ == "__main__":
    test_improved_extract()