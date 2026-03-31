#!/usr/bin/env python3
import json
import re

def parse_text(text):
    # 可能的字段标题
    sections = [
        "背景故事",
        "角色能力",
        "角色简介",
        "范例",
        "运作方式",
        "提示标记",
        "提示与技巧",
        "对抗半兽人",  # 可能没有
        "规则细节",
        "伪装成半兽人"
    ]
    parsed = {}
    lines = text.split('\n')
    current_section = None
    current_content = []
    
    for line in lines:
        stripped = line.strip()
        if stripped in sections:
            if current_section is not None:
                parsed[current_section] = '\n'.join(current_content).strip()
            current_section = stripped
            current_content = []
        else:
            current_content.append(line)
    
    if current_section is not None:
        parsed[current_section] = '\n'.join(current_content).strip()
    
    return parsed

def main():
    with open('json/full/外来者.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for item in data:
        if item['名称'] == '半兽人（实验角色）':
            text = item['content']['text']
            print("找到半兽人，解析文本...")
            parsed = parse_text(text)
            for key, value in parsed.items():
                print(f"=== {key} ===")
                print(value[:200] + "..." if len(value) > 200 else value)
                print()
            # 保存解析结果
            item['content'] = parsed
            # 输出修改后的JSON片段
            print("修改后的content字段:")
            print(json.dumps(item['content'], ensure_ascii=False, indent=2))
            break

if __name__ == '__main__':
    main()