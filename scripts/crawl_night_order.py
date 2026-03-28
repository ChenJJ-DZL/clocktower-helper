#!/usr/bin/env python3
"""
爬取夜晚行动顺序数据
从官方Wiki页面采集完整的夜晚行动顺序
"""

import requests
from bs4 import BeautifulSoup
import json
import re
import os
from datetime import datetime

def get_page(url):
    """获取页面内容"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        response.encoding = 'utf-8'
        return response.text
    except Exception as e:
        print(f"获取页面失败: {e}")
        return None

def parse_night_order(html, night_type="首夜"):
    """解析夜晚行动顺序"""
    soup = BeautifulSoup(html, 'html.parser')
    
    # 找到主要内容区域
    content_div = soup.find('div', {'id': 'mw-content-text'})
    if not content_div:
        print("未找到内容区域")
        return []
    
    actions = []
    
    # 查找所有标题和内容
    # 根据用户提供的文本格式，行动顺序可能是列表形式
    # 先尝试查找有序列表
    ol_elements = content_div.find_all('ol')
    
    if ol_elements:
        print(f"找到 {len(ol_elements)} 个有序列表")
        for ol in ol_elements:
            li_items = ol.find_all('li')
            for i, li in enumerate(li_items, 1):
                text = li.get_text(strip=True)
                if text:
                    # 提取序号和描述
                    # 文本格式可能是 "1.黄昏（旅行者）：检查所有玩家是否闭上眼睛..."
                    match = re.match(r'^(\d+)\.\s*(.+?)[：:]\s*(.+)$', text)
                    if match:
                        num = match.group(1)
                        title = match.group(2)
                        desc = match.group(3)
                        actions.append({
                            "序号": f"{num}.{title}",
                            "描述": desc
                        })
                    else:
                        # 如果没有明确的冒号分隔，使用整个文本
                        actions.append({
                            "序号": f"{i}.未命名",
                            "描述": text
                        })
    
    # 如果没有找到有序列表，尝试查找段落
    if not actions:
        print("未找到有序列表，尝试查找段落")
        # 查找所有包含数字开头的内容
        paragraphs = content_div.find_all(['p', 'div'])
        for p in paragraphs:
            text = p.get_text(strip=True)
            if text and re.match(r'^\d+\.', text):
                # 提取序号和描述
                match = re.match(r'^(\d+)\.\s*(.+)$', text)
                if match:
                    num = match.group(1)
                    desc = match.group(2)
                    actions.append({
                        "序号": f"{num}.",
                        "描述": desc
                    })
    
    return actions

def save_night_order(actions, night_type, output_dir="json/rule"):
    """保存夜晚行动顺序到JSON文件"""
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    filename = f"夜晚行动顺序一览（{night_type}）.json"
    filepath = os.path.join(output_dir, filename)
    
    data = {
        "来源": "https://clocktower-wiki.gstonegames.com/index.php?title=%E5%A4%9C%E6%99%9A%E8%A1%8C%E5%8A%A8%E9%A1%BA%E5%BA%8F%E4%B8%80%E8%A7%88",
        "采集时间": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "标题": f"夜晚行动顺序一览（{night_type}）",
        "说明": "从官方Wiki采集的完整夜晚行动顺序",
        "行动顺序": actions
    }
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"已保存到: {filepath}")
    return filepath

def main():
    """主函数"""
    url = "https://clocktower-wiki.gstonegames.com/index.php?title=%E5%A4%9C%E6%99%9A%E8%A1%8C%E5%8A%A8%E9%A1%BA%E5%BA%8F%E4%B8%80%E8%A7%88"
    
    print(f"开始爬取夜晚行动顺序数据...")
    print(f"URL: {url}")
    
    html = get_page(url)
    if not html:
        print("无法获取页面内容")
        return
    
    # 保存HTML用于调试
    with open("scripts/night_order_debug.html", 'w', encoding='utf-8') as f:
        f.write(html)
    
    # 尝试解析首夜行动顺序
    print("解析首夜行动顺序...")
    first_night_actions = parse_night_order(html, "首夜")
    
    print(f"找到 {len(first_night_actions)} 个行动")
    
    # 保存首夜行动顺序
    if first_night_actions:
        save_night_order(first_night_actions, "首夜")
    else:
        print("未解析到首夜行动顺序数据")
        
        # 尝试手动解析用户提供的文本
        print("尝试从用户提供的文本解析...")
        # 这里可以添加从用户提供的文本解析的代码
    
    print("完成！")

if __name__ == "__main__":
    main()