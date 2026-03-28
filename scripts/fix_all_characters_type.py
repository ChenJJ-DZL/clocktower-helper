#!/usr/bin/env python3
import json
import os

def fix_all_characters_type():
    """修复all_characters.json中缺失的类型字段"""
    file_path = "json/full/all_characters.json"
    
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"总角色数: {len(data)}")
    
    # 查找缺失类型的角色
    empty_type = []
    for i, role in enumerate(data):
        if not role.get("类型") or role["类型"].strip() == "":
            empty_type.append((i, role.get("名称")))
    
    print(f"缺失类型的角色数: {len(empty_type)}")
    if empty_type:
        print("缺失类型的角色索引和名称:")
        for idx, name in empty_type[:10]:  # 只显示前10个
            print(f"  [{idx}] {name}")
        if len(empty_type) > 10:
            print(f"  ... 还有 {len(empty_type)-10} 个")
    
    # 尝试修复
    fixed_count = 0
    for i, role in enumerate(data):
        if not role.get("类型") or role["类型"].strip() == "":
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
                        if line.startswith('角色类型：'):
                            role_type = line.replace('角色类型：', '').strip()
                            if role_type:
                                role["类型"] = role_type
                                fixed_count += 1
                                print(f"  修复角色[{i}] {role.get('名称')}: 类型 = {role_type}")
                                break
    
    if fixed_count > 0:
        # 保存修复后的文件
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"已修复 {fixed_count} 个角色的类型字段")
    else:
        print("没有需要修复的类型字段")
    
    # 再次验证
    empty_after = []
    for i, role in enumerate(data):
        if not role.get("类型") or role["类型"].strip() == "":
            empty_after.append((i, role.get("名称")))
    
    if empty_after:
        print(f"修复后仍有 {len(empty_after)} 个角色缺失类型:")
        for idx, name in empty_after:
            print(f"  [{idx}] {name}")
    else:
        print("所有角色的类型字段都已填写")

if __name__ == "__main__":
    fix_all_characters_type()