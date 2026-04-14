#!/usr/bin/env python3
import json
import sys

def parse_text(text):
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
        "角色信息"
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
    
    # 移除空值
    parsed = {k: v for k, v in parsed.items() if v}
    return parsed

def update_file(filename, role_name):
    with open(filename, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    modified = False
    for item in data:
        if item['名称'] == role_name:
            if 'text' in item.get('content', {}):
                print(f"正在修改 {filename} 中的 {role_name}")
                text = item['content']['text']
                parsed = parse_text(text)
                item['content'] = parsed
                modified = True
                # 打印新content的键
                print(f"  新content包含字段: {list(parsed.keys())}")
                break
    
    if modified:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  已保存到 {filename}")
    else:
        print(f"  未找到 {role_name} 或已为正确格式")

if __name__ == '__main__':
    # 修改外来者.json
    update_file('json/full/外来者.json', '半兽人（实验角色）')
    # 修改实验型角色.json
    update_file('json/full/实验型角色.json', '半兽人（实验角色）')
    print("\n完成！")