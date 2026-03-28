#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试更新后的爬虫链接发现
"""

import sys
sys.path.append('.')

import requests
from bs4 import BeautifulSoup
import time
import re
from urllib.parse import urljoin

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

def main():
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    
    url = BASE_URL + "/index.php?title=%E9%95%87%E6%B0%91"
    print("测试更新后的链接发现...")
    
    role_links = discover_role_links_from_category(url, "镇民", session)
    
    if role_links:
        print(f"\n前20个角色链接:")
        for i, (text, full_url, cat) in enumerate(role_links[:20]):
            print(f"  {i+1:2}. {text:15} -> {full_url}")
        
        print(f"\n总计发现 {len(role_links)} 个角色")
        
        # 检查是否有重复
        urls = [url for _, url, _ in role_links]
        duplicates = len(urls) - len(set(urls))
        if duplicates > 0:
            print(f"警告: 有 {duplicates} 个重复链接")
    else:
        print("未发现角色链接")

if __name__ == "__main__":
    main()