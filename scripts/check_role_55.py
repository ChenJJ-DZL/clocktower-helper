#!/usr/bin/env python3
import json

def check_role_55():
    file_path = "json/full/all_characters.json"
    
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 角色索引从0开始，所以第55个角色是索引54
    if len(data) > 54:
        role = data[54]
        print(f"第55个角色（索引54）:")
        print(f"  名称: {role.get('名称')}")
        print(f"  英文名: '{role.get('英文名')}'")
        print(f"  类型: {role.get('类型')}")
        print(f"  所属剧本: '{role.get('所属剧本')}'")
        print(f"  角色能力类型: '{role.get('角色能力类型')}'")
        
        # 检查英文名是否为空或只有空格
        english = role.get('英文名', '')
        if english is None or english.strip() == '':
            print("  ⚠️ 英文名为空！")
        else:
            print(f"  ✓ 英文名存在: {english}")
    else:
        print(f"数据只有 {len(data)} 个角色，没有第55个角色")

if __name__ == "__main__":
    check_role_55()