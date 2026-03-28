#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
血染钟楼Wiki数据采集脚本 v2.0 - 完整版
功能：从官方Wiki采集所有角色、剧本和规则信息
基于现有脚本改进，增加模块化设计和错误处理
"""

import os
import time
import json
import logging
import argparse
import re
from typing import Dict, List, Optional, Set, Tuple
from dataclasses import dataclass, asdict, field
from enum import Enum
from urllib.parse import urljoin, urlparse
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup
import urllib3

# 禁用SSL警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ================= 配置区域 =================
BASE_URL = "https://clocktower-wiki.gstonegames.com"
START_URLS = [
    BASE_URL + "/index.php?title=%E9%A6%96%E9%A1%B5",  # 首页
    BASE_URL + "/index.php?title=%E5%88%86%E7%B1%BB:%E8%A7%92%E8%89%B2",  # 角色分类
    BASE_URL + "/index.php?title=%E5%88%86%E7%B1%BB:%E5%89%A7%E6%9C%AC",  # 剧本分类
    BASE_URL + "/index.php?title=%E5%88%86%E7%B1%BB:%E8%A7%84%E5%88%99"   # 规则分类
]

OUTPUT_DIR = "json/official"
RAW_DATA_DIR = "json/raw"
BACKUP_DIR = "json/backup"
LOG_DIR = "logs"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Referer": BASE_URL
}

# 请求延迟设置（秒）
REQUEST_DELAY = 1.5
MAX_RETRIES = 3
TIMEOUT = 30
MAX_PAGES = 500

# ===========================================

class PageType(Enum):
    """页面类型枚举"""
    UNKNOWN = "unknown"
    CHARACTER = "character"
    SCRIPT = "script"
    RULE = "rule"
    CATEGORY = "category"
    INDEX = "index"

class CharacterType(Enum):
    """角色类型枚举"""
    TOWNSFOLK = "townsfolk"
    OUTSIDER = "outsider"
    MINION = "minion"
    DEMON = "demon"
    TRAVELLER = "traveller"
    LEGEND = "legend"
    FABLED = "fabled"
    UNKNOWN = "unknown"

@dataclass
class CharacterData:
    """角色数据结构"""
    id: str
    name: str
    english_name: str = ""
    type: str = ""
    script: List[str] = field(default_factory=list)
    url: str = ""
    content: Dict[str, str] = field(default_factory=dict)
    metadata: Dict[str, any] = field(default_factory=dict)

@dataclass
class ScriptData:
    """剧本数据结构"""
    script_id: str
    name: str
    english_name: str = ""
    min_players: int = 0
    recommended_players: int = 0
    description: str = ""
    townsfolk: List[str] = field(default_factory=list)
    outsiders: List[str] = field(default_factory=list)
    minions: List[str] = field(default_factory=list)
    demons: List[str] = field(default_factory=list)
    travellers: List[str] = field(default_factory=list)
    experimental: List[str] = field(default_factory=list)
    night_order: Dict[str, str] = field(default_factory=dict)

@dataclass
class RuleData:
    """规则数据结构"""
    rule_id: str
    title: str
    content: str = ""
    sections: List[Dict[str, str]] = field(default_factory=list)

class Logger:
    """日志管理器"""
    
    @staticmethod
    def setup_logging(log_level="INFO"):
        """设置日志配置"""
        os.makedirs(LOG_DIR, exist_ok=True)
        
        logging.basicConfig(
            level=getattr(logging, log_level),
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(os.path.join(LOG_DIR, 'wiki_spider.log'), encoding='utf-8'),
                logging.StreamHandler()
            ]
        )
        return logging.getLogger(__name__)

class HttpSession:
    """HTTP会话管理器"""
    
    def __init__(self):
        self.session = self._create_session()
        self.request_count = 0
        self.logger = logging.getLogger(__name__)
    
    def _create_session(self) -> requests.Session:
        """创建带有重试机制的Session"""
        session = requests.Session()
        retries = Retry(
            total=MAX_RETRIES,
            backoff_factor=1,
            status_forcelist=[500, 502, 503, 504],
            allowed_methods=["GET"]
        )
        session.mount('http://', HTTPAdapter(max_retries=retries))
        session.mount('https://', HTTPAdapter(max_retries=retries))
        session.headers.update(HEADERS)
        return session
    
    def get(self, url: str, **kwargs) -> Optional[requests.Response]:
        """发送GET请求"""
        try:
            self.request_count += 1
            response = self.session.get(url, timeout=TIMEOUT, verify=False, **kwargs)
            response.raise_for_status()
            response.encoding = 'utf-8'
            
            # 礼貌延迟
            time.sleep(REQUEST_DELAY)
            
            self.logger.debug(f"GET请求成功: {url} (请求 #{self.request_count})")
            return response
            
        except requests.exceptions.RequestException as e:
            self.logger.warning(f"请求失败 {url}: {e}")
            return None

class PageProcessor:
    """页面处理器"""
    
    def __init__(self, http_session: HttpSession):
        self.http = http_session
        self.logger = logging.getLogger(__name__)
    
    def fetch_page(self, url: str) -> Optional[BeautifulSoup]:
        """获取并解析页面"""
        response = self.http.get(url)
        if not response:
            return None
        
        try:
            soup = BeautifulSoup(response.content, 'html.parser')
            return soup
        except Exception as e:
            self.logger.error(f"解析页面失败 {url}: {e}")
            return None
    
    def detect_page_type(self, soup: BeautifulSoup, url: str) -> PageType:
        """检测页面类型"""
        # 检查URL特征
        url_lower = url.lower()
        
        if '分类:' in url or 'category:' in url:
            return PageType.CATEGORY
        
        if '首页' in url or 'main_page' in url_lower:
            return PageType.INDEX
        
        # 检查页面内容特征
        title_elem = soup.find('h1', id='firstHeading')
        if title_elem:
            title = title_elem.get_text(strip=True).lower()
            
            # 角色页面关键词
            character_keywords = ['角色', 'character', 'demon', 'minion', 'townsfolk', 
                                 'outsider', 'traveller', 'legend', 'fabled']
            if any(keyword in title for keyword in character_keywords):
                return PageType.CHARACTER
            
            # 剧本页面关键词
            script_keywords = ['剧本', 'script', '扩展', 'expansion', '黯月', '梦殒', '暗流']
            if any(keyword in title for keyword in script_keywords):
                return PageType.SCRIPT
            
            # 规则页面关键词
            rule_keywords = ['规则', 'rule', '顺序', 'order', '夜晚', '白天', '游戏规则']
            if any(keyword in title for keyword in rule_keywords):
                return PageType.RULE
        
        return PageType.UNKNOWN

class CharacterExtractor:
    """角色数据提取器"""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
    
    def extract(self, soup: BeautifulSoup, url: str) -> Optional[CharacterData]:
        """从页面提取角色数据"""
        try:
            # 提取基本信息
            name = self._extract_name(soup)
            if not name:
                return None
            
            english_name = self._extract_english_name(soup)
            char_type = self._extract_type(soup, name)
            script = self._extract_script(soup)
            
            # 生成ID
            char_id = self._generate_id(name, url)
            
            # 提取内容
            content = self._extract_content(soup)
            
            # 提取元数据
            metadata = self._extract_metadata(soup)
            
            # 创建角色对象
            character = CharacterData(
                id=char_id,
                name=name,
                english_name=english_name,
                type=char_type,
                script=script,
                url=url,
                content=content,
                metadata=metadata
            )
            
            self.logger.info(f"提取角色成功: {name} ({char_type})")
            return character
            
        except Exception as e:
            self.logger.error(f"提取角色数据失败 {url}: {e}")
            return None
    
    def _extract_name(self, soup: BeautifulSoup) -> str:
        """提取角色名称"""
        title_elem = soup.find('h1', id='firstHeading')
        return title_elem.get_text(strip=True) if title_elem else ""
    
    def _extract_english_name(self, soup: BeautifulSoup) -> str:
        """提取英文名称"""
        # 尝试从信息框提取
        infobox = soup.find('table', class_='infobox')
        if infobox:
            for row in infobox.find_all('tr'):
                cells = row.find_all(['th', 'td'])
                if len(cells) >= 2:
                    header = cells[0].get_text(strip=True).lower()
                    if 'english' in header or '英文' in header:
                        return cells[1].get_text(strip=True)
        
        # 尝试从URL推断
        return ""
    
    def _extract_type(self, soup: BeautifulSoup, name: str) -> str:
        """提取角色类型"""
        # 从信息框提取
        infobox = soup.find('table', class_='infobox')
        if infobox:
            for row in infobox.find_all('tr'):
                cells = row.find_all(['th', 'td'])
                if len(cells) >= 2:
                    header = cells[0].get_text(strip=True).lower()
                    if 'type' in header or '类型' in header:
                        return cells[1].get_text(strip=True)
        
        # 根据名称或URL推断
        url = str(soup)
        if any(keyword in url.lower() for keyword in ['townsfolk', '镇民']):
            return CharacterType.TOWNSFOLK.value
        elif any(keyword in url.lower() for keyword in ['outsider', '外来者']):
            return CharacterType.OUTSIDER.value
        elif any(keyword in url(keyword in url.lower() for keyword in ['minion', '爪牙']):
            return CharacterType.MINION.value
        elif any(keyword in url.lower() for keyword in ['demon', '恶魔']):
            return CharacterType.DEMON.value
        
        return CharacterType.UNKNOWN.value
    
    def _extract_script(self, soup: BeautifulSoup) -> List[str]:
        """提取所属剧本"""
        scripts = []
        
        # 从信息框提取
        infobox = soup.find('table', class_='infobox')
        if infobox:
            for row in infobox.find_all('tr'):
                cells = row.find_all(['th', 'td'])
                if len(cells) >= 2:
                    header = cells[0].get_text(strip=True).lower()
                    if 'script' in header or '剧本' in header:
                        value = cells[1].get_text(strip=True)
                        scripts = [s.strip() for s in value.split(',')]
                        break
        
        return scripts
    
    def _extract_content(self, soup: BeautifulSoup) -> Dict[str, str]:
        """提取结构化内容"""
        content = {}
        
        # 查找主要内容区域
        content_div = soup.find('div', id='mw-content-text') or soup.find('div', class_='mw-parser-output')
        if not content_div:
            return content
        
        # 清理HTML
        for selector in ['script', 'style', '.mw-editsection', '#toc']:
            for element in content_div.select(selector):
                element.decompose()
        
        # 按章节提取
        current_section = None
        current_text = []
        
        for element in content_div.children:
            if element.name in ['h2', 'h3']:
                # 保存前一个章节
                if current_section and current_text:
                    content[current_section] = '\n'.join(current_text)
                    current_text = []
                
                # 开始新章节
                current_section = element.get_text(strip=True)
            elif element.name in ['p', 'ul', 'ol']:
                if current_section:
                    text = element.get_text(strip=True)
                    if text:
                        current_text.append(text)
        
        # 保存最后一个章节
        if current_section and current_text:
            content[current_section] = '\n'.join(current_text)
        
        return content
    
    def _extract_metadata(self, soup: BeautifulSoup) -> Dict[str, any]:
        """提取角色元数据"""
        metadata = {}
        
        infobox = soup.find('table', class_='infobox')
        if infobox:
            for row in infobox.find_all('tr'):
                cells = row.find_all(['th', 'td'])
                if len(cells) >= 2:
                    key = cells[0].get_text(strip=True).lower()
                    value = cells[1].get_text(strip=True)
                    
                    if 'first night' in key or '首夜' in key:
                        metadata['first_night'] = value
                    elif 'other nights' in key or '其他夜晚' in key:
                        metadata['other_nights'] = value
                    elif 'reminders' in key or '提示标记' in key:
                        metadata['reminders'] = value
                    elif 'ability' in key or '能力' in key:
                        metadata['ability_summary'] = value
        
        return metadata
    
    def _generate_id(self, name: str, url: str) -> str:
        """生成角色ID"""
        # 使用URL的title参数或名称
        parsed = urlparse(url)
        query = parsed.query
        
        if 'title=' in query:
            title = query.split('title=')[1].split('&')[0]
            return title.replace('%', '_')
        
        # 使用名称生成ID
        return re.sub(r'[^\w]', '_', name)

class LinkDiscoverer:
    """链接发现器"""
    
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.logger = logging.getLogger(__name__)
        self.filter_patterns = [
            'action=',
            'diff=',
            'oldid=',
            'printable=',
            'Special:',
            'File:',
            'User:',
            'Template:',
            'Category:'
        ]
    
    def discover(self, soup: BeautifulSoup) -> List[str]:
        """发现页面中的相关链接"""
        urls = []
        content_div = soup.find('div', id='mw-content-text') or soup.find('div', class_='mw-parser-output')
        
        if not content_div:
            return urls
        
        for link in content_div.find_all('a', href=True):
            href = link.get('href')
            if not href:
                continue
            
            # 过滤不需要的链接
            if self._should_filter(href):
                continue
            
            # 转换为绝对URL
            full_url = urljoin(self.base_url, href)
            
            # 只添加Wiki内部链接
            if self.base_url in full_url and 'index.php?title=' in full_url:
                urls.append(full_url)
        
        self.logger.debug(f"发现 {len(urls)} 个新链接")
        return urls
    
    def _should_filter(self, href: str) -> bool:
        """判断是否应该过滤该链接"""
        if href.startswith('#') or href.startswith('javascript:'):
            return True
        
        for pattern in self.filter_patterns:
            if pattern in href:
                return True
        
        return False

class DataSaver:
    """数据保存器"""
    
    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        self.logger = logging.getLogger(__name__)
        os.makedirs(output_dir, exist_ok=True)
    
    def save_characters(self, characters: Dict[str, CharacterData], group_by_type: bool = True):
        """保存角色数据"""
        if group_by_type:
            # 按类型分组保存
            grouped = self._group_characters_by_type(characters)
            
            for char_type, char_list in grouped.items():
                if not char_list:
                    continue
                
                char_dir = os.path.join(self.output_dir, 'characters')
                os.makedirs(char_dir, exist_ok=True)
                
                filepath = os.path.join(char_dir, f'{char_type}.json')
                data = [asdict(char) for char in char_list]
                with open(filepath, 'w', encoding='utf-8') as f:
