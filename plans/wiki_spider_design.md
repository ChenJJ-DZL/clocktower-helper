# Wiki爬虫脚本设计文档

## 脚本架构设计

### 1. 核心模块结构

```
wiki_spider_v2.py
├── 配置模块 (Config)
├── 数据模型 (Data Models)
├── 页面处理模块 (Page Processor)
├── 数据提取模块 (Data Extractor)
├── 链接发现模块 (Link Discoverer)
├── 数据存储模块 (Data Saver)
└── 主控制模块 (Main Controller)
```

### 2. 详细类设计

#### 2.1 配置类 (Config)
```python
class Config:
    BASE_URL = "https://clocktower-wiki.gstonegames.com"
    START_URLS = [
        f"{BASE_URL}/index.php?title=%E9%A6%96%E9%A1%B5",
        f"{BASE_URL}/index.php?title=%E5%88%86%E7%B1%BB:%E8%A7%92%E8%89%B2",
        f"{BASE_URL}/index.php?title=%E5%88%86%E7%B1%BB:%E5%89%A7%E6%9C%AC",
        f"{BASE_URL}/index.php?title=%E5%88%86%E7%B1%BB:%E8%A7%84%E5%88%99"
    ]
    
    # 输出目录
    OUTPUT_DIR = "json/official"
    RAW_DATA_DIR = "json/raw"
    BACKUP_DIR = "json/backup"
    
    # 请求设置
    REQUEST_DELAY = 1.0  # 秒
    MAX_RETRIES = 3
    TIMEOUT = 30
    
    # 日志设置
    LOG_LEVEL = "INFO"
    LOG_FILE = "wiki_spider.log"
```

#### 2.2 数据模型类 (Data Models)
```python
from dataclasses import dataclass, field
from typing import List, Dict, Optional
from enum import Enum

class PageType(Enum):
    UNKNOWN = "unknown"
    CHARACTER = "character"
    SCRIPT = "script"
    RULE = "rule"
    CATEGORY = "category"
    INDEX = "index"

class CharacterType(Enum):
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
    rule_id: str
    title: str
    content: str = ""
    sections: List[Dict[str, str]] = field(default_factory=list)
```

#### 2.3 页面处理类 (PageProcessor)
```python
class PageProcessor:
    def __init__(self, session):
        self.session = session
        self.visited_urls = set()
        
    def fetch_page(self, url: str) -> Optional[BeautifulSoup]:
        """获取并解析页面"""
        if url in self.visited_urls:
            return None
        
        try:
            response = self.session.get(url, timeout=30, verify=False)
            response.raise_for_status()
            response.encoding = 'utf-8'
            self.visited_urls.add(url)
            time.sleep(1.0)  # 礼貌延迟
            return BeautifulSoup(response.content, 'html.parser')
        except Exception as e:
            logger.error(f"获取页面失败 {url}: {e}")
            return None
    
    def detect_page_type(self, soup: BeautifulSoup, url: str) -> PageType:
        """检测页面类型"""
        # 实现页面类型检测逻辑
        pass
    
    def clean_html(self, soup: BeautifulSoup):
        """清理HTML中的无关元素"""
        selectors = [
            '#toc', '.mw-editsection', 'script', 'style',
            '#catlinks', '#footer', '.printfooter',
            '#mw-navigation', '.magnify', '.navbox',
            '.reference', '.mbox', '.ambox'
        ]
        
        for selector in selectors:
            for element in soup.select(selector):
                element.decompose()
```

#### 2.4 数据提取类 (DataExtractor)
```python
class CharacterExtractor:
    def extract(self, soup: BeautifulSoup, url: str) -> Optional[CharacterData]:
        """从页面提取角色数据"""
        # 提取基本信息
        name = self._extract_name(soup)
        english_name = self._extract_english_name(soup)
        char_type = self._extract_type(soup)
        script = self._extract_script(soup)
        
        # 提取内容
        content = self._extract_content(soup)
        
        # 提取元数据
        metadata = self._extract_metadata(soup)
        
        # 创建角色对象
        character = CharacterData(
            id=self._generate_id(url, name),
            name=name,
            english_name=english_name,
            type=char_type,
            script=script,
            url=url,
            content=content,
            metadata=metadata
        )
        
        return character
    
    def _extract_name(self, soup: BeautifulSoup) -> str:
        """提取角色名称"""
        title_elem = soup.find('h1', id='firstHeading')
        return title_elem.get_text(strip=True) if title_elem else ""
    
    def _extract_english_name(self, soup: BeautifulSoup) -> str:
        """提取英文名称"""
        infobox = soup.find('table', class_='infobox')
        if infobox:
            for row in infobox.find_all('tr'):
                cells = row.find_all(['th', 'td'])
                if len(cells) >= 2:
                    header = cells[0].get_text(strip=True).lower()
                    if 'english' in header or '英文' in header:
                        return cells[1].get_text(strip=True)
        return ""
    
    def _extract_type(self, soup: BeautifulSoup) -> str:
        """提取角色类型"""
        # 从信息框或URL推断类型
        pass
    
    def _extract_content(self, soup: BeautifulSoup) -> Dict[str, str]:
        """提取结构化内容"""
        content = {}
        
        # 查找主要内容区域
        content_div = soup.find('div', id='mw-content-text') or soup.find('div', class_='mw-parser-output')
        if not content_div:
            return content
        
        # 按章节提取
        current_section = None
        current_text = []
        
        for element in content_div.children:
            if element.name in ['h2', 'h3', 'h4']:
                # 保存前一个章节
                if current_section and current_text:
                    content[current_section] = '\n'.join(current_text)
                
                # 开始新章节
                current_section = element.get_text(strip=True)
                current_text = []
            elif element.name in ['p', 'ul', 'ol']:
                if current_section:
                    text = element.get_text(strip=True)
                    if text:
                        current_text.append(text)
        
        # 保存最后一个章节
        if current_section and current_text:
            content[current_section] = '\n'.join(current_text)
        
        return content
```

#### 2.5 链接发现类 (LinkDiscoverer)
```python
class LinkDiscoverer:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.discovered_urls = set()
        self.filter_patterns = [
            'action=',
            'diff=',
            'oldid=',
            'printable=',
            'Special:',
            'File:',
            'User:',
            'Template:'
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
                self.discovered_urls.add(full_url)
        
        return urls
    
    def _should_filter(self, href: str) -> bool:
        """判断是否应该过滤该链接"""
        if href.startswith('#'):
            return True
        
        for pattern in self.filter_patterns:
            if pattern in href:
                return True
        
        return False
```

#### 2.6 数据存储类 (DataSaver)
```python
class DataSaver:
    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
    
    def save_characters(self, characters: Dict[str, CharacterData], group_by_type: bool = True):
        """保存角色数据"""
        if group_by_type:
            # 按类型分组保存
            grouped = self._group_characters_by_type(characters)
            
            for char_type, char_list in grouped.items():
                filepath = os.path.join(self.output_dir, 'characters', f'{char_type}.json')
                os.makedirs(os.path.dirname(filepath), exist_ok=True)
                
                data = [asdict(char) for char in char_list]
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                
                logger.info(f"保存 {char_type} 数据: {len(char_list)} 个角色")
            
            # 保存完整角色列表
            all_chars_path = os.path.join(self.output_dir, 'characters', 'all_characters.json')
            all_data = [asdict(char) for char in characters.values()]
            with open(all_chars_path, 'w', encoding='utf-8') as f:
                json.dump(all_data, f, ensure_ascii=False, indent=2)
        else:
            # 保存为单个文件
            filepath = os.path.join(self.output_dir, 'characters.json')
            data = [asdict(char) for char in characters.values()]
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
    
    def _group_characters_by_type(self, characters: Dict[str, CharacterData]) -> Dict[str, List[CharacterData]]:
        """按角色类型分组"""
        grouped = {
            'townsfolk': [],
            'outsiders': [],
            'minions': [],
            'demons': [],
            'travellers': [],
            'legends': [],
            'fabled': [],
            'unknown': []
        }
        
        for character in characters.values():
            char_type = character.type.lower() if character.type else 'unknown'
            
            # 确定分组
            if any(keyword in char_type for keyword in ['townsfolk', '镇民']):
                grouped['townsfolk'].append(character)
            elif any(keyword in char_type for keyword in ['outsider', '外来者']):
                grouped['outsiders'].append(character)
            elif any(keyword in char_type for keyword in ['minion', '爪牙']):
                grouped['minions'].append(character)
            elif any(keyword in char_type for keyword in ['demon', '恶魔']):
                grouped['demons'].append(character)
            elif any(keyword in char_type for keyword in ['traveller', '旅行者']):
                grouped['travellers'].append(character)
            elif any(keyword in char_type for keyword in ['legend', '传奇']):
                grouped['legends'].append(character)
            elif any(keyword in char_type for keyword in ['fabled']):
                grouped['fabled'].append(character)
            else:
                grouped['unknown'].append(character)
        
        return grouped
```

#### 2.7 主控制类 (WikiSpider)
```python
class WikiSpider:
    def __init__(self):
        self.config = Config()
        self.session = self._create_session()
        self.page_processor = PageProcessor(self.session)
        self.link_discoverer = LinkDiscoverer(self.config.BASE_URL)
        self.data_saver = DataSaver(self.config.OUTPUT_DIR)
        
        # 数据存储
        self.characters: Dict[str, CharacterData] = {}
        self.scripts: Dict[str, ScriptData] = {}
        self.rules: Dict[str, RuleData] = {}
        
        # 状态跟踪
        self.visited_urls: Set[str] = set()
        self.discovered_urls: Set[str] = set()
        self.stats = {
            'total_pages': 0,
            'characters_found': 0,
            'scripts_found': 0,
            'rules_found': 0,
            'errors': 0
        }
    
    def _create_session(self) -> requests.Session:
        """创建HTTP会话"""
        session = requests.Session()
        retries = Retry(
            total=self.config.MAX_RETRIES,
            backoff_factor=1,
            status_forcelist=[500, 502, 503, 504]
        )
        session.mount('http://', HTTPAdapter(max_retries=retries))
        session.mount('https://', HTTPAdapter(max_retries=retries))
        session.headers.update(HEADERS)
        return session
    
    def crawl(self, start_urls: List[str], max_pages: int = 500):
        """主爬取函数"""
        logger.info(f"开始爬取，最大页面数: {max_pages}")
        
        queue = collections.deque(start_urls)
        
        while queue and self.stats['total_pages'] < max_pages:
            url = queue.popleft()
            
            # 处理页面
            self._process_page(url, queue)
            
            # 进度报告
            if self.stats['total_pages'] % 10 == 0:
                self._report_progress()
        
        # 最终报告
        self._report_final()
        
        # 保存数据
        self.save_data()
    
    def _process_page(self, url: str, queue: collections.deque):
        """处理单个页面"""
        try:
            # 获取页面
            soup = self.page_processor.fetch_page(url)
            if not soup:
                return
            
            self.stats['total_pages'] += 1
            
            # 检测页面类型
            page_type = self.page_processor.detect_page_type(soup, url)
            
            # 根据页面类型处理
            if page_type == PageType.CHARACTER:
                self._process_character_page(soup, url)
            elif page_type == PageType.SCRIPT:
                self._process_script_page(soup, url)
            elif page_type == PageType.RULE:
                self._process_rule_page(soup, url)
            
            # 发现新链接
            new_urls = self.link_discoverer.discover(soup)
            for new_url in new_urls:
                if new_url not in self.visited_urls and new_url not in queue:
                    queue.append(new_url)
            
        except Exception as e:
            logger.error(f"处理页面失败 {url}: {e}")
            self.stats['errors'] += 1
    
    def _process_character_page(self, soup: BeautifulSoup, url: str):
        """处理角色页面"""
        extractor = CharacterExtractor()
        character = extractor.extract(soup, url)
        
        if character:
            self.characters[character.id] = character
            self.stats['characters_found'] += 1
            logger.info(f"发现角色: {character.name} ({character.type})")
    
    def save_data(self):
        """保存所有数据"""
        logger.info("开始保存数据...")
        
        # 保存角色数据
        if self.characters:
            self.data_saver.save_characters(self.characters)
        
        # 保存剧本数据
        if self.scripts:
            self._save_scripts()
        
        # 保存规则数据
        if self.rules:
            self._save_rules()
        
        logger.info("数据保存完成")
    
    def _report_progress(self):
        """报告进度"""
        logger.info(
            f"进度: 页面={self.stats['total_pages']}, "
            f"角色={self.stats['characters_found']}, "
            f"剧本={self.stats['scripts_found']}, "
            f"规则={self.stats['rules_found']}, "
            f"错误={self.stats['errors']}"
        )
    
    def _report_final(self):
        """最终报告"""
        logger.info("=" * 50)
        logger.info("爬取完成!")
        logger.info(f"总共处理页面: {self.stats['total_pages']}")
        logger.info(f"发现角色: {self.stats