#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
快速检查实验型角色页面
"""

import requests
from bs4 import BeautifulSoup
import time
import urllib.parse

BASE_URL = "https://clocktower-wiki.gstonegames.com"
EXPERIMENTAL_URL = BASE_URL + "/index.php?title=%E5%AE%9E%E9%AA%8C%E6%80%A7%E8%A7%92%E8%89%B2"

def main():
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    })
    
    print(f"访问实验型角色页面...")
    print(f"URL: {EXPERIMENTAL_URL}")
    
    try:
        response = session.get(EXPERIMENTAL_URL, timeout=30, verify=False)
        response.raise_for_status()
        response.encoding = 'utf-8'
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # 获取页面标题
        title_elem = soup.find('h1', class_='title') or soup.find('h1')
        if title_elem:
            print(f"页面标题: {title_elem.get_text(strip=True)}")
        
        # 检查内容
        content_div = soup.find('div', id='mw-content-text') or soup.find('div', class_='mw-parser-output')
        if not content_div:
            print("错误: 找不到内容区域")
            return
        
        # 保存HTML用于调试
        with open('scripts/debug_experimental.html', 'w', encoding='utf-8') as f:
            f.write(str(content_div))
        print("已保存内容到 scripts/debug_experimental.html")
        
        # 查找所有链接
        all_links = content_div.find_all('a', href=True)
        print(f"\n总链接数: {len(all_links)}")
        
        # 过滤可能的角色链接
        possible_role_links = []
        for link in all_links:
            href = link.get('href', '')
            text = link.get_text(strip=True)
            
            # 过滤条件
            if not href or not text:
                continue
                
            if '/index.php?title=' not in href:
                continue
                
            if any(x in href for x in ['Special:', 'Category:', 'Talk:', 'User:', 'File:', 'MediaWiki:']):
                continue
                
            # 检查文本是否像角色名
            if len(text) < 2 or len(text) > 20:
                continue
                
            if any(keyword in text for keyword in ['编辑', '查看', '讨论', '历史', '分类', '文件', '模板']):
                continue
                
            full_url = urllib.parse.urljoin(BASE_URL, href)
            possible_role_links.append((text, full_url))
        
        print(f"\n可能角色链接: {len(possible_role_links)}")
        
        # 显示前20个
        for i, (text, url) in enumerate(possible_role_links[:20]):
            print(f"{i+1:2d}. {text:15s} -> {url}")
        
        # 检查已知的实验角色
        known_experimental = [
            "半兽人", "兽人", "Orc",
            "疯狂科学家", "疯狂科学家",
            "时间旅行者", "时间旅行者",
            "变形者", "变形者",
            "幻术师", "幻术师",
            "预言家", "预言家",
        ]
        
        print(f"\n检查已知实验角色:")
        for role in known_experimental:
            encoded = urllib.parse.quote(role)
            test_url = BASE_URL + f"/index.php?title={encoded}"
            try:
                resp = session.head(test_url, timeout=10, verify=False, allow_redirects=True)
                if resp.status_code == 200:
                    print(f"  ✓ {role}: 存在")
                    # 添加到可能链接
                    if not any(role in text for text, _ in possible_role_links):
                        possible_role_links.append((role, test_url))
                else:
                    print(f"  ✗ {role}: 状态码 {resp.status_code}")
            except:
                print(f"  ? {role}: 检查失败")
        
        # 去重
        unique_links = []
        seen_urls = set()
        for text, url in possible_role_links:
            if url not in seen_urls:
                seen_urls.add(url)
                unique_links.append((text, url))
        
        print(f"\n唯一链接: {len(unique_links)}")
        
        # 测试前几个链接
        print(f"\n测试前3个链接:")
        for i, (text, url) in enumerate(unique_links[:3]):
            print(f"\n{i+1}. 测试: {text}")
            try:
                resp = session.get(url, timeout=15, verify=False)
                if resp.status_code == 200:
                    soup2 = BeautifulSoup(resp.content, 'html.parser')
                    title = soup2.find('h1', class_='title') or soup2.find('h1')
                    if title:
                        actual_title = title.get_text(strip=True)
                        print(f"   标题: {actual_title}")
                        print(f"   URL: {url}")
                        
                        # 检查内容
                        content = soup2.find('div', id='mw-content-text') or soup2.find('div', class_='mw-parser-output')
                        if content:
                            # 查找角色类型
                            full_text = content.get_text()
                            type_keywords = {
                                '镇民': '镇民',
                                '外来者': '外来者', 
                                '爪牙': '爪牙',
                                '恶魔': '恶魔',
                                '旅行者': '旅行者',
                                '传奇角色': '传奇角色',
                                '奇遇角色': '奇遇角色'
                            }
                            
                            found_type = '实验型角色'
                            for keyword, role_type in type_keywords.items():
                                if keyword in full_text:
                                    found_type = role_type
                                    break
                            
                            print(f"   类型: {found_type}")
                else:
                    print(f"   状态码: {resp.status_code}")
            except Exception as e:
                print(f"   错误: {e}")
            
            time.sleep(1)
        
        return unique_links
        
    except Exception as e:
        print(f"错误: {e}")
        return []

if __name__ == "__main__":
    links = main()
    print(f"\n完成，找到 {len(links)} 个可能角色")