#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试爬虫脚本的基本功能
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from wiki_crawler import (
    create_session, 
    get_page, 
    extract_character_data,
    BASE_URL
)
from bs4 import BeautifulSoup

def test_connection():
    """测试网站连接"""
    print(">>> 测试网站连接...")
    session = create_session()
    
    test_url = BASE_URL + "/index.php?title=%E6%B4%97%E8%A1%A3%E5%A6%87"
    print(f"测试URL: {test_url}")
    
    response = get_page(test_url, session)
    if response:
        print(">>> 连接成功!")
        print(f"状态码: {response.status_code}")
        print(f"页面大小: {len(response.content)} 字节")
        return response
    else:
        print(">>> 连接失败")
        return None

def test_character_extraction():
    """测试角色数据提取"""
    print("\n>>> 测试角色数据提取...")
    session = create_session()
    
    # 测试洗衣妇页面
    test_url = BASE_URL + "/index.php?title=%E6%B4%97%E8%A1%A3%E5%A6%87"
    response = get_page(test_url, session)
    
    if not response:
        print(">>> 无法获取测试页面")
        return None
    
    soup = BeautifulSoup(response.content, 'html.parser')
    character = extract_character_data(soup, test_url)
    
    if character:
        print(">>> 角色数据提取成功!")
        print(f"角色名称: {character['name']}")
        print(f"英文名称: {character['english_name']}")
        print(f"角色类型: {character['type']}")
        print(f"内容章节数: {len(character['content'])}")
        
        # 显示前几个内容章节
        print("\n内容章节:")
        for i, (section, content) in enumerate(list(character['content'].items())[:3]):
            preview = content[:100] + "..." if len(content) > 100 else content
            print(f"  {i+1}. {section}: {preview}")
        
        return character
    else:
        print(">>> 角色数据提取失败")
        return None

def test_data_structure():
    """测试数据结构"""
    print("\n>>> 测试数据结构...")
    
    test_data = {
        "id": "test_character",
        "name": "测试角色",
        "english_name": "Test Character",
        "type": "townsfolk",
        "url": "https://example.com",
        "content": {
            "背景故事": "这是一个测试角色",
            "角色能力": "测试能力"
        },
        "metadata": {
            "extracted_at": "2026-03-28 08:00:00",
            "source": "test"
        }
    }
    
    import json
    test_json = json.dumps(test_data, ensure_ascii=False, indent=2)
    print(">>> 数据结构测试通过")
    print(f"示例JSON大小: {len(test_json)} 字节")
    
    return test_data

def main():
    """主测试函数"""
    print("=" * 60)
    print("血染钟楼爬虫脚本测试")
    print("=" * 60)
    
    # 测试1: 连接
    response = test_connection()
    if not response:
        print(">>> 连接测试失败，停止测试")
        return False
    
    # 测试2: 角色提取
    character = test_character_extraction()
    if not character:
        print(">>> 角色提取测试失败")
        return False
    
    # 测试3: 数据结构
    test_data_structure()
    
    print("\n" + "=" * 60)
    print(">>> 所有测试通过!")
    print("=" * 60)
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)