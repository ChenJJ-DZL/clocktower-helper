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
        "对抗半兽人",
        "规则细节",
        "伪装成半兽人",
        "角色信息"  # 可能出现在最后
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

def process_file(filename, role_name):
    with open(filename, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for i, item in enumerate(data):
        if item['名称'] == role_name:
            print(f"在 {filename} 中找到 {role_name}")
            text = item['content']['text']
            parsed = parse_text(text)
            # 输出部分内容验证
            for key in list(parsed.keys())[:3]:
                print(f"  {key}: {parsed[key][:100]}...")
            # 返回索引和解析后的content
            return i, parsed
    return None, None

if __name__ == '__main__':
    # 处理外来者.json
    idx1, content1 = process_file('json/full/外来者.json', '半兽人（实验角色）')
    # 处理实验型角色.json
    idx2, content2 = process_file('json/full/实验型角色.json', '半兽人（实验角色）')
    
    print("\n两个文件的content结构是否相同?", content1 == content2)
    if content1 and content2:
        # 比较键
        keys1 = set(content1.keys())
        keys2 = set(content2.keys())
        print("外来者.json 独有的键:", keys1 - keys2)
        print("实验型角色.json 独有的键:", keys2 - keys1)
        # 检查值差异
        for k in keys1 & keys2:
            if content1[k] != content2[k]:
                print(f"  键 '{k}' 的值长度不同: {len(content1[k])} vs {len(content2[k])}")
                # 显示前200字符差异
                if content1[k][:200] != content2[k][:200]:
                    print("    前200字符不同")
                break