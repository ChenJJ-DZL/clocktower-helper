#!/usr/bin/env python3
import json

with open('json/full/实验型角色.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"总角色数: {len(data)}")
print("\n前10个角色:")
for i, item in enumerate(data[:10]):
    name = item.get('名称', '未知')
    has_text = 'text' in item.get('content', {})
    print(f"{i+1}. {name}: content类型 = {'text' if has_text else 'structured'}")
    if has_text:
        text = item['content']['text']
        # 检查是否有典型的分节标题
        if '背景故事' in text:
            print("   包含分节标题")
        else:
            print("   可能没有分节标题")

# 统计需要转换的角色
need_conversion = []
for item in data:
    if 'content' in item and isinstance(item['content'], dict) and 'text' in item['content']:
        need_conversion.append(item['名称'])

print(f"\n需要转换的角色数: {len(need_conversion)}")
print("需要转换的角色:", need_conversion)