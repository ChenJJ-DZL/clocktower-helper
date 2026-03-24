import os
import time
import json
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ================= 配置区域 =================
BASE_URL = "https://clocktower-wiki.gstonegames.com"
# 你想抓取的剧本网址
START_URL = "https://clocktower-wiki.gstonegames.com/index.php?title=%E4%BC%A0%E5%A5%87%E8%A7%92%E8%89%B2"
OUTPUT_FILENAME = "blood_clocktower_所有传奇角色.json" # 保存的文件名

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Referer": BASE_URL
}
# ===========================================

# 创建带有重试功能的 Session
session = requests.Session()
retries = Retry(total=3, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
session.mount('http://', HTTPAdapter(max_retries=retries))
session.mount('https://', HTTPAdapter(max_retries=retries))
session.headers.update(HEADERS)

def get_page(url):
    try:
        response = session.get(url, timeout=15, verify=False)
        response.raise_for_status()
        return response
    except Exception as e:
        print(f"⚠️ 连接波动，重试中... ({e})")
        time.sleep(2)
        try:
            response = session.get(url, timeout=20, verify=False)
            response.raise_for_status()
            return response
        except Exception:
            return None

def clean_soup(soup):
    """清理多余标签"""
    selectors = ['#toc', '.mw-editsection', 'script', 'style', 
                 '#catlinks', '#footer', '.printfooter', '#mw-navigation', '.magnify']
    for sel in selectors:
        for tag in soup.select(sel):
            tag.decompose()

def extract_text_recursive(element):
    """
    递归提取文本，保留结构上的换行，但不保留HTML标签。
    返回一个纯文本字符串。
    """
    if element.name is None:
        return str(element)
    
    # 标题加标记，方便AI识别结构
    if element.name in ['h1', 'h2']:
        return f"\n【{element.get_text(strip=True)}】\n"
    if element.name in ['h3', 'h4']:
        return f"\n[{element.get_text(strip=True)}]\n"
    
    # 范例 (Pre)
    if element.name == 'pre':
        return f"\n> 范例: {element.get_text(separator='', strip=True)}\n"
    
    # 列表
    if element.name == 'li':
        return f"- {element.get_text(strip=True)}\n"
        
    # 容器递归
    text_content = ""
    for child in element.children:
        text_content += extract_text_recursive(child)
    
    # 段落加换行
    if element.name == 'p':
        return text_content + "\n"
        
    return text_content

def main():
    print("🚀 开始抓取数据并转换为 JSON 格式...")
    
    response = get_page(START_URL)
    if not response: return

    soup = BeautifulSoup(response.content, 'html.parser')
    content_area = soup.find('div', id='mw-content-text')
    links = content_area.find_all('a')
    
    target_urls = []
    seen_titles = set()

    # 1. 获取所有角色链接
    for link in links:
        href = link.get('href')
        title = link.get('title')
        if href and title and "/index.php?title=" in href:
            if any(x in title for x in ["编辑", "文件", "模板", "分类", "Special"]): continue
            if title not in seen_titles:
                full_url = urljoin(BASE_URL, href)
                target_urls.append((title, full_url))
                seen_titles.add(title)

    print(f"🔍 发现 {len(target_urls)} 个角色，开始处理...")
    
    # 2. 准备数据列表
    all_characters_data = []

    for idx, (title, url) in enumerate(target_urls):
        print(f"[{idx+1}/{len(target_urls)}] 解析: {title} ...")
        
        detail_resp = get_page(url)
        if detail_resp:
            page_soup = BeautifulSoup(detail_resp.content, 'html.parser')
            clean_soup(page_soup)
            
            main_content = page_soup.find('div', class_='mw-parser-output')
            h1 = page_soup.find('h1', id='firstHeading')
            final_title = h1.text.strip() if h1 else title
            
            # 提取正文纯文本
            if main_content:
                raw_text = extract_text_recursive(main_content)
                # 清洗一下多余的空行
                cleaned_text = "\n".join([line.strip() for line in raw_text.splitlines() if line.strip()])
                
                # 构建单个角色对象
                char_data = {
                    "id": idx + 1,
                    "name": final_title,
                    "url": url,
                    "content": cleaned_text # 这里包含了背景、能力、范例的所有文本
                }
                all_characters_data.append(char_data)
            
            time.sleep(0.5)

    # 3. 保存为 JSON 文件
    with open(OUTPUT_FILENAME, 'w', encoding='utf-8') as f:
        # ensure_ascii=False 保证中文正常显示，indent=4 保证格式美观
        json.dump(all_characters_data, f, ensure_ascii=False, indent=4)

    print(f"\n🎉 成功！所有数据已保存到当前目录下的: {OUTPUT_FILENAME}")
    print("现在你可以直接把这个文件拖进 Cursor 了。")
    input("按回车键退出...")

if __name__ == "__main__":
    main()