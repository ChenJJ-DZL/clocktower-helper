#!/usr/bin/env python3
import json
import os

def fix_all_characters_english():
    """修复all_characters.json中缺失的英文名"""
    file_path = "json/full/all_characters.json"
    
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"总角色数: {len(data)}")
    
    # 查找缺失英文名的角色
    empty_english = []
    for i, role in enumerate(data):
        if not role.get("英文名") or role["英文名"] == "":
            empty_english.append((i, role.get("名称")))
    
    print(f"缺失英文名的角色数: {len(empty_english)}")
    if empty_english:
        print("缺失英文名的角色索引和名称:")
        for idx, name in empty_english:
            print(f"  [{idx}] {name}")
    
    # 尝试从content中的角色信息提取英文名
    fixed_count = 0
    for i, role in enumerate(data):
        if not role.get("英文名") or role["英文名"] == "":
            # 尝试从content中提取
            content = role.get("content", {})
            if isinstance(content, dict):
                # 检查是否有角色信息字段
                role_info = content.get("角色信息", "")
                if role_info:
                    # 解析角色信息文本
                    lines = role_info.strip().split('\n')
                    for line in lines:
                        line = line.strip()
                        if line.startswith('英文名：'):
                            english_name = line.replace('英文名：', '').strip()
                            if english_name:
                                role["英文名"] = english_name
                                fixed_count += 1
                                print(f"  修复角色[{i}] {role.get('名称')}: 英文名 = {english_name}")
                                break
    
    if fixed_count > 0:
        # 保存修复后的文件
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"已修复 {fixed_count} 个角色的英文名")
    else:
        print("没有需要修复的英文名")
    
    # 再次验证
    empty_after = []
    for i, role in enumerate(data):
        if not role.get("英文名") or role["英文名"] == "":
            empty_after.append((i, role.get("名称")))
    
    if empty_after:
        print(f"修复后仍有 {len(empty_after)} 个角色缺失英文名:")
        for idx, name in empty_after:
            print(f"  [{idx}] {name}")
    else:
        print("所有角色的英文名都已填写")

if __name__ == "__main__":
    fix_all_characters_english()