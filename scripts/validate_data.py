#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
验证采集数据的完整性和准确性
"""

import json
import os
import sys

def validate_json_file(filepath):
    """验证JSON文件的完整性"""
    print(f"验证文件: {os.path.basename(filepath)}")
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 检查数据类型
        if isinstance(data, list):
            print(f"  数据格式: 列表, 包含 {len(data)} 个项目")
            
            # 检查列表中的每个项目
            if len(data) > 0:
                first_item = data[0]
                print(f"  第一个项目类型: {type(first_item)}")
                
                # 如果是字典，检查关键字段
                if isinstance(first_item, dict):
                    expected_fields = ['id', 'name', 'type', 'url', 'content', 'metadata']
                    missing_fields = []
                    
                    for field in expected_fields:
                        if field not in first_item:
                            missing_fields.append(field)
                    
                    if missing_fields:
                        print(f"  警告: 缺少字段: {missing_fields}")
                    else:
                        print(f"  所有必需字段都存在")
                        
                        # 显示一些统计信息
                        types = {}
                        for item in data:
                            item_type = item.get('type', '未知')
                            types[item_type] = types.get(item_type, 0) + 1
                        
                        print(f"  类型分布:")
                        for t, count in sorted(types.items()):
                            print(f"    {t}: {count}")
                
                return True
            else:
                print(f"  警告: 列表为空")
                return False
        elif isinstance(data, dict):
            print(f"  数据格式: 字典, 包含 {len(data)} 个键")
            return True
        else:
            print(f"  警告: 未知数据类型: {type(data)}")
            return False
            
    except json.JSONDecodeError as e:
        print(f"  错误: JSON解析失败: {e}")
        return False
    except Exception as e:
        print(f"  错误: 读取文件失败: {e}")
        return False

def main():
    """主验证函数"""
    print("=" * 60)
    print("验证新采集的JSON数据")
    print("=" * 60)
    
    base_dir = "json/official"
    
    if not os.path.exists(base_dir):
        print(f"错误: 目录不存在: {base_dir}")
        return False
    
    files = [
        "all_characters.json",
        "townsfolk.json",
        "outsiders.json",
        "minions.json",
        "demons.json",
        "travellers.json",
        "unknown.json"
    ]
    
    results = {}
    all_valid = True
    
    for filename in files:
        filepath = os.path.join(base_dir, filename)
        
        if os.path.exists(filepath):
            is_valid = validate_json_file(filepath)
            results[filename] = is_valid
            
            if not is_valid:
                all_valid = False
            
            # 获取文件大小
            size = os.path.getsize(filepath)
            print(f"  文件大小: {size} 字节 ({size/1024:.1f} KB)")
        else:
            print(f"警告: 文件不存在: {filename}")
            results[filename] = False
            all_valid = False
        
        print()
    
    # 总结
    print("=" * 60)
    print("验证总结:")
    
    for filename, is_valid in results.items():
        status = "通过" if is_valid else "失败"
        print(f"  {filename}: {status}")
    
    print("-" * 60)
    
    if all_valid:
        print("所有文件验证通过!")
        
        # 显示总角色数
        all_chars_path = os.path.join(base_dir, "all_characters.json")
        if os.path.exists(all_chars_path):
            with open(all_chars_path, 'r', encoding='utf-8') as f:
                all_chars = json.load(f)
            
            print(f"总共采集了 {len(all_chars)} 个角色")
            
            # 检查每个分类的角色数
            for filename in files:
                if filename != "all_characters.json":
                    filepath = os.path.join(base_dir, filename)
                    if os.path.exists(filepath):
                        with open(filepath, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        print(f"  {filename}: {len(data)} 个角色")
        
        print("=" * 60)
        return True
    else:
        print("部分文件验证失败!")
        print("=" * 60)
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)