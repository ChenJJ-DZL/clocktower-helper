#!/usr/bin/env python3
import json
import re

def parse_text(text):
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
    section_regexes = [re.compile(p, re.MULTILINE) for p in section_patterns]
    
    lines = text.split('\n')
    parsed = {}
    current_section = None
    current_content = []
    
    for line in lines:
        stripped = line.strip()
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
    
    parsed = {k: v for k, v in parsed.items() if v and v.strip()}
    return parsed

def convert_all_remaining(filename, start_idx):
    with open(filename, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    converted = []
    skipped = []
    for i in range(start_idx, len(data)):
        item = data[i]
        if 'content' in item and isinstance(item['content'], dict) and 'text' in item['content']:
            name = item['名称']
            print(f"转换 {name}...")
            parsed = parse_text(item['content']['text'])
            if len(parsed) == 0:
                print(f"  警告: 未解析出任何字段，保留原始text")
                skipped.append(name)
                continue
            item['content'] = parsed
            converted.append(name)
            # 每10个输出一次进度
            if len(converted) % 10 == 0:
                print(f"  进度: 已转换 {len(converted)} 个角色")
        else:
            # 已经结构化
            pass
    
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"\n总计: 已转换 {len(converted)} 个角色, 跳过 {len(skipped)} 个角色")
    if skipped:
        print("跳过的角色:", skipped)
    return converted

if __name__ == '__main__':
    # 从索引11开始（因为0-10已转换）
    convert_all_remaining('json/full/实验型角色.json', 11)