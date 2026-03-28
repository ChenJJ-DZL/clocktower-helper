#!/usr/bin/env python3
"""
从官方Clocktower Wiki采集规则内容（修复版）
生成备份文件格式（包含来源、采集时间、标题、内容字段）
"""

import json
import os
import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from datetime import datetime

# 项目基础目录
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES_DIR = os.path.join(BASE_DIR, "json", "rule")

# 用户代理头
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
}

def get_page(url, session):
    """获取页面内容"""
    try:
        response = session.get(url, headers=HEADERS)
        response.raise_for_status()
        return response.text
    except requests.RequestException as e:
        print(f"获取页面失败: {url}, 错误: {e}")
        return None

def extract_section(soup, section_title):
    """提取指定章节内容"""
    # 查找包含章节标题的标签
    for header in soup.find_all(['h2', 'h3', 'h4']):
        if header.get_text().strip() == section_title:
            content = []
            next_node = header.next_sibling
            
            # 收集直到下一个同级标题的内容
            while next_node and next_node.name not in ['h2', 'h3', 'h4']:
                if next_node.name == 'p':
                    content.append(next_node.get_text().strip())
                elif next_node.name == 'ul':
                    content.extend([li.get_text().strip() for li in next_node.find_all('li')])
                elif next_node.name == 'ol':
                    content.extend([li.get_text().strip() for li in next_node.find_all('li')])
                next_node = next_node.next_sibling
            
            return "\n".join(content)
    return ""

def extract_night_order(soup, section_title):
    """提取夜晚行动顺序（返回备份文件格式）"""
    order_data = []
    for header in soup.find_all(['h2', 'h3', 'h4']):
        if header.get_text().strip() == section_title:
            table = header.find_next('table')
            if table:
                for row in table.find_all('tr')[1:]:  # 跳过表头
                    cols = row.find_all('td')
                    if len(cols) >= 2:
                        step = cols[0].get_text().strip()
                        description = cols[1].get_text().strip()
                        # 使用备份文件中的字段名
                        order_data.append({"序号": step, "描述": description})
    
    # 提取说明文本（表格前的段落）
    description_text = ""
    for header in soup.find_all(['h2', 'h3', 'h4']):
        if header.get_text().strip() == section_title:
            # 查找表格前的段落
            prev_node = header
            while prev_node:
                prev_node = prev_node.find_previous_sibling()
                if prev_node and prev_node.name == 'p':
                    description_text = prev_node.get_text().strip()
                    break
    
    return order_data, description_text

def collect_rules():
    """主采集函数"""
    # 创建输出目录
    os.makedirs(RULES_DIR, exist_ok=True)
    
    # 创建会话
    session = requests.Session()
    base_url = "https://clocktower-wiki.gstonegames.com/index.php?title=%E9%A6%96%E9%A1%B5"
    
    # 获取页面内容
    html_content = get_page(base_url, session)
    if not html_content:
        print("无法获取页面内容")
        return
    
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # 获取当前时间
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # 需要采集的普通章节
    sections = [
        "规则概要",
        "重要细节",
        "术语汇总",
        "给说书人的建议",
        "规则解释",
        "相克规则",
        "可以但不建议",
        "隐性规则",
        "规则调整提前公示"
    ]
    
    # 采集并保存各章节
    for section in sections:
        content = extract_section(soup, section)
        if content:
            # 处理特殊文件名
            filename = section + ".json"
            filepath = os.path.join(RULES_DIR, filename)
            
            # 创建符合备份格式的数据
            data = {
                "来源": base_url,
                "采集时间": current_time,
                "标题": section,
                "内容": content
            }
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"已保存: {filename}")
    
    # 特别处理夜晚行动顺序
    first_night_data, first_night_desc = extract_night_order(soup, "夜晚行动顺序一览（首夜）")
    other_nights_data, other_nights_desc = extract_night_order(soup, "夜晚行动顺序一览（其他夜晚）")
    
    # 保存夜晚行动顺序（首夜）
    if first_night_data:
        first_night_file = {
            "来源": base_url,
            "采集时间": current_time,
            "标题": "夜晚行动顺序一览（首夜）",
            "说明": first_night_desc if first_night_desc else "黄昏阶段为旅行者行动时间，后续按角色类型顺序唤醒",
            "行动顺序": first_night_data
        }
        
        with open(os.path.join(RULES_DIR, "夜晚行动顺序一览（首夜）.json"), 'w', encoding='utf-8') as f:
            json.dump(first_night_file, f, ensure_ascii=False, indent=2)
        print("已保存: 夜晚行动顺序一览（首夜）.json")
    
    # 保存夜晚行动顺序（其他夜晚）
    if other_nights_data:
        other_nights_file = {
            "来源": base_url,
            "采集时间": current_time,
            "标题": "夜晚行动顺序一览（其他夜晚）",
            "说明": other_nights_desc if other_nights_desc else "后续夜晚的行动顺序",
            "行动顺序": other_nights_data
        }
        
        with open(os.path.join(RULES_DIR, "夜晚行动顺序一览（其他夜晚）.json"), 'w', encoding='utf-8') as f:
            json.dump(other_nights_file, f, ensure_ascii=False, indent=2)
        print("已保存: 夜晚行动顺序一览（其他夜晚）.json")
    
    print("规则采集完成")

if __name__ == "__main__":
    collect_rules()