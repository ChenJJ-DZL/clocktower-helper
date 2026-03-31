#!/usr/bin/env python3
import json
import re

def parse_text(text):
    # 定义可能出现的节标题（按常见顺序）
    section_patterns = [
        r"^背景故事$",
        r"^角色能力$",
        r"^角色简介$",
        r"^范例$",
        r"^运作方式$",
        r"^提示标记$",
        r"^规则细节$",
        r"^提示与技巧$",
        r"^对抗.*$",
        r"^伪装成.*$",
        r"^角色信息$",
        r"^相克规则$",
        r"^特定角色互动$",
    ]
    # 将模式编译为正则表达式
    section_regexes = [re.compile(p, re.MULTILINE) for p in section_patterns]
    
    lines = text.split('\n')
    parsed = {}
    current_section = None
    current_content = []
    
    for line in lines:
        stripped = line.strip()
        # 检查是否是节标题
        is_section = False
        for regex in section_regexes:
            if regex.match(stripped):
                if current_section is not None:
                    parsed[current_section] = '\n'.join(current_content).strip()
                current_section = stripped
                current_content = []
                is_section = True
                break
        if not is_section:
            current_content.append(line)
    
    if current_section is not None:
        parsed[current_section] = '\n'.join(current_content).strip()
    
    # 清理空值
    parsed = {k: v for k, v in parsed.items() if v and v.strip()}
    return parsed

def convert_batch(filename, start_idx, count):
    with open(filename, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    converted = []
    for i in range(start_idx, min(start_idx + count, len(data))):
        item = data[i]
        if 'content' in item and isinstance(item['content'], dict) and 'text' in item['content']:
            name = item['名称']
            print(f"转换 {name}...")
            parsed = parse_text(item['content']['text'])
            # 验证是否至少解析出一些字段
            if len(parsed) == 0:
                print(f"  警告: 未解析出任何字段，保留原始text")
                continue
            item['content'] = parsed
            converted.append(name)
            print(f"  解析出字段: {list(parsed.keys())}")
    
    # 写回文件
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"\n已转换 {len(converted)} 个角色: {converted}")
    return converted

if __name__ == '__main__':
    convert_batch('json/full/实验型角色.json', 1, 5)  # 从索引1开始，转换5个