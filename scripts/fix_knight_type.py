#!/usr/bin/env python3
import json

def fix_knight_type():
    """修复骑士角色的类型字段"""
    file_path = "json/full/all_characters.json"
    
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 找到骑士角色（索引54）
    if len(data) > 54:
        role = data[54]
        print(f"修复角色: {role.get('名称')}")
        print(f"当前类型: '{role.get('类型')}'")
        
        # 根据角色名称判断类型
        name = role.get('名称', '')
        if '骑士' in name:
            # 骑士应该是镇民
            role['类型'] = '镇民'
            print(f"设置类型为: '镇民'")
        
        # 保存
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("已保存修复")
    else:
        print("角色索引54不存在")

if __name__ == "__main__":
    fix_knight_type()