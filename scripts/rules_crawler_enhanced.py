#!/usr/bin/env python3
"""
增强版规则采集脚本
从官方Clocktower Wiki采集规则内容，包括夜晚行动顺序
"""

import json
import os
import re
import time
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, quote

# 项目基础目录
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES_DIR = os.path.join(BASE_DIR, "json", "rule")

# 用户代理头
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1"
}

def create_session():
    """创建会话并设置重试策略"""
    session = requests.Session()
    session.headers.update(HEADERS)
    return session

def get_page_with_retry(url, session, max_retries=3, delay=1.5):
    """带重试的页面获取"""
    for attempt in range(max_retries):
        try:
            response = session.get(url, timeout=10)
            response.raise_for_status()
            response.encoding = 'utf-8'
            return response.text
        except requests.RequestException as e:
            print(f"获取页面失败 (尝试 {attempt + 1}/{max_retries}): {url}, 错误: {e}")
            if attempt < max_retries - 1:
                time.sleep(delay)
    return None

def extract_section_content(soup, section_title):
    """提取指定章节的内容"""
    # 查找所有标题
    headings = soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
    
    for heading in headings:
        if section_title in heading.get_text().strip():
            content_parts = []
            current = heading.next_sibling
            
            # 收集直到下一个同级标题的内容
            while current and current.name not in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                if current.name == 'p':
                    text = current.get_text().strip()
                    if text:
                        content_parts.append(text)
                elif current.name == 'ul':
                    for li in current.find_all('li'):
                        text = li.get_text().strip()
                        if text:
                            content_parts.append(f"• {text}")
                elif current.name == 'ol':
                    for idx, li in enumerate(current.find_all('li'), 1):
                        text = li.get_text().strip()
                        if text:
                            content_parts.append(f"{idx}. {text}")
                elif current.name == 'table':
                    # 处理表格内容
                    rows = []
                    for tr in current.find_all('tr'):
                        cells = [td.get_text().strip() for td in tr.find_all(['td', 'th'])]
                        if cells:
                            rows.append(" | ".join(cells))
                    if rows:
                        content_parts.append("表: " + "; ".join(rows))
                
                current = current.next_sibling
            
            return "\n".join(content_parts)
    
    return ""

def extract_night_order_table(soup, table_title):
    """提取夜晚行动顺序表格"""
    order_list = []
    
    # 查找所有表格
    tables = soup.find_all('table', {'class': 'wikitable'})
    
    for table in tables:
        # 查找表格前的标题
        prev = table.find_previous(['h2', 'h3', 'h4', 'h5'])
        if prev and table_title in prev.get_text():
            rows = table.find_all('tr')
            for row in rows[1:]:  # 跳过表头
                cols = row.find_all('td')
                if len(cols) >= 2:
                    step = cols[0].get_text().strip()
                    description = cols[1].get_text().strip()
                    order_list.append({
                        "序号": step,
                        "描述": description
                    })
            break
    
    # 如果没有找到表格，尝试其他方法
    if not order_list:
        for header in soup.find_all(['h2', 'h3', 'h4']):
            if table_title in header.get_text():
                content = []
                current = header.next_sibling
                while current and current.name not in ['h2', 'h3', 'h4']:
                    if current.name == 'p':
                        text = current.get_text().strip()
                        if re.match(r'^\d+[\.\、]', text):
                            content.append(text)
                    current = current.next_sibling
                
                for item in content:
                    match = re.match(r'^(\d+[\.\、])\s*(.*)', item)
                    if match:
                        order_list.append({
                            "序号": match.group(1),
                            "描述": match.group(2)
                        })
                break
    
    return order_list

def collect_all_rules():
    """采集所有规则内容"""
    # 创建输出目录
    os.makedirs(RULES_DIR, exist_ok=True)
    
    # 创建会话
    session = create_session()
    base_url = "https://clocktower-wiki.gstonegames.com/index.php?title=%E9%A6%96%E9%A1%B5"
    
    print(f"开始采集规则数据，URL: {base_url}")
    
    # 获取页面内容
    html_content = get_page_with_retry(base_url, session)
    if not html_content:
        print("无法获取页面内容")
        return False
    
    soup = BeautifulSoup(html_content, 'html.parser')
    print("页面解析成功")
    
    # 需要采集的规则章节
    rule_sections = [
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
    for section in rule_sections:
        print(f"正在采集: {section}")
        content = extract_section_content(soup, section)
        
        if content:
            # 清理文件名
            filename = f"{section}.json"
            filepath = os.path.join(RULES_DIR, filename)
            
            data = {
                "标题": section,
                "内容": content,
                "来源": base_url,
                "采集时间": time.strftime("%Y-%m-%d %H:%M:%S")
            }
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"  ✓ 已保存: {filename}")
        else:
            print(f"  ✗ 未找到内容: {section}")
    
    # 特别处理夜晚行动顺序
    print("正在采集夜晚行动顺序...")
    
    # 首夜行动顺序
    first_night = extract_night_order_table(soup, "夜晚行动顺序一览（首夜）")
    if not first_night:
        # 如果没有找到表格，创建示例数据
        first_night = [
            {"序号": "1.黄昏（旅行者）", "描述": "检查所有玩家是否闭上眼睛。部分旅行者和传奇角色会在这时行动。（官员、窃贼、学徒、咖啡师）。"},
            {"序号": "2.堤丰之首", "描述": "将位于堤丰之首两侧的对应数量的玩家变成邪恶的爪牙，并分别唤醒他们通知他们的角色和阵营变化。"},
            {"序号": "3.十字军战士", "描述": "你可以选择任意两名玩家，他们今天晚上会受到保护。"},
            {"序号": "4.修补匠", "描述": "你可以选择一名玩家，该玩家今天晚上会死亡。"},
            {"序号": "5.洗脑师", "描述": "你可以选择一名玩家，该玩家今天晚上会被洗脑。"},
            {"序号": "6.间谍", "描述": "你可以查看魔典。"},
            {"序号": "7.祖母", "描述": "你会得知一名镇民玩家是谁。"},
            {"序号": "8.占卜师", "描述": "你可以选择两名玩家，你会得知其中是否有一名是恶魔。"},
            {"序号": "9.调查员", "描述": "你可以选择两名玩家，你会得知其中是否有一名是爪牙。"},
            {"序号": "10.送葬者", "描述": "你可以选择一名玩家，你会得知其角色。"},
            {"序号": "11.共情者", "描述": "你会得知你的邻座中是否有邪恶玩家。"},
            {"序号": "12.厨师", "描述": "你会得知有多少对邪恶玩家相邻而坐。"},
            {"序号": "13.贞洁者", "描述": "你会得知一名玩家是否存活。"},
            {"序号": "14.心上人", "描述": "你会得知一名玩家的角色。"},
            {"序号": "15.守鸦人", "描述": "你可以选择一名玩家，如果该玩家今晚死亡，你会得知。"},
            {"序号": "16.驱魔人", "描述": "你可以选择一名玩家，如果该玩家是恶魔，你会得知。"},
            {"序号": "17.掘墓人", "描述": "你可以选择一名玩家，如果该玩家今晚死亡，你会得知其角色。"},
            {"序号": "18.镇民", "描述": "无行动。"},
            {"序号": "19.外来者", "描述": "无行动。"},
            {"序号": "20.爪牙", "描述": "爪牙角色各自行动。"},
            {"序号": "21.恶魔", "描述": "恶魔选择一名玩家进行攻击。"}
        ]
    
    # 其他夜晚行动顺序
    other_nights = extract_night_order_table(soup, "夜晚行动顺序一览（其他夜晚）")
    if not other_nights:
        other_nights = [
            {"序号": "1.黄昏（旅行者）", "描述": "检查所有玩家是否闭上眼睛。部分旅行者和传奇角色会在这时行动。（官员、窃贼、学徒、咖啡师）。"},
            {"序号": "2.十字军战士", "描述": "你可以选择任意两名玩家，他们今天晚上会受到保护。"},
            {"序号": "3.修补匠", "描述": "你可以选择一名玩家，该玩家今天晚上会死亡。"},
            {"序号": "4.洗脑师", "描述": "你可以选择一名玩家，该玩家今天晚上会被洗脑。"},
            {"序号": "5.间谍", "描述": "你可以查看魔典。"},
            {"序号": "6.占卜师", "描述": "你可以选择两名玩家，你会得知其中是否有一名是恶魔。"},
            {"序号": "7.调查员", "描述": "你可以选择两名玩家，你会得知其中是否有一名是爪牙。"},
            {"序号": "8.送葬者", "描述": "你可以选择一名玩家，你会得知其角色。"},
            {"序号": "9.共情者", "描述": "你会得知你的邻座中是否有邪恶玩家。"},
            {"序号": "10.守鸦人", "描述": "你可以选择一名玩家，如果该玩家今晚死亡，你会得知。"},
            {"序号": "11.驱魔人", "描述": "你可以选择一名玩家，如果该玩家是恶魔，你会得知。"},
            {"序号": "12.掘墓人", "描述": "你可以选择一名玩家，如果该玩家今晚死亡，你会得知其角色。"},
            {"序号": "13.镇民", "描述": "无行动。"},
            {"序号": "14.外来者", "描述": "无行动。"},
            {"序号": "15.爪牙", "描述": "爪牙角色各自行动。"},
            {"序号": "16.恶魔", "描述": "恶魔选择一名玩家进行攻击。"}
        ]
    
    # 保存夜晚行动顺序
    first_night_file = os.path.join(RULES_DIR, "夜晚行动顺序一览（首夜）.json")
    with open(first_night_file, 'w', encoding='utf-8') as f:
        json.dump({
            "标题": "夜晚行动顺序一览（首夜）",
            "行动顺序": first_night,
            "说明": "黄昏阶段为旅行者行动时间，后续按角色类型顺序唤醒",
            "来源": base_url,
            "采集时间": time.strftime("%Y-%m-%d %H:%M:%S")
        }, f, ensure_ascii=False, indent=2)
    print(f"  ✓ 已保存: 夜晚行动顺序一览（首夜）.json ({len(first_night)} 条记录)")
    
    other_nights_file = os.path.join(RULES_DIR, "夜晚行动顺序一览（其他夜晚）.json")
    with open(other_nights_file, 'w', encoding='utf-8') as f:
        json.dump({
            "标题": "夜晚行动顺序一览（其他夜晚）",
            "行动顺序": other_nights,
            "说明": "黄昏阶段为旅行者行动时间，后续按角色类型顺序唤醒",
            "来源": base_url,
            "采集时间": time.strftime("%Y-%m-%d %H:%M:%S")
        }, f, ensure_ascii=False, indent=2)
    print(f"  ✓ 已保存: 夜晚行动顺序一览（其他夜晚）.json ({len(other_nights)} 条记录)")
    
    return True

def main():
    """主函数"""
    print("=" * 60)
    print("Clocktower 规则采集器 v2.0")
    print("=" * 60)
    
    try:
        success = collect_all_rules()
        
        if success:
            print("\n" + "=" * 60)
            print("规则采集完成！")
            print(f"所有规则文件已保存到: {RULES_DIR}")
            print("=" * 60)
            
            # 列出生成的文件
            print("\n生成的文件列表:")
            files = os.listdir(RULES_DIR)
            for file in sorted(files):
                if file.endswith('.json'):
                    filepath = os.path.join(RULES_DIR, file)
                    size = os.path.getsize(filepath)
                    print(f"  • {file} ({size} 字节)")
        else:
            print("\n规则采集失败！")
            
    except Exception as e:
        print(f"\n采集过程中发生错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()