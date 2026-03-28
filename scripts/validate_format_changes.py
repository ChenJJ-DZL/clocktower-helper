#!/usr/bin/env python3
"""
验证所有JSON文件是否已成功修改为洗衣妇格式
"""

import json
import os
import sys

def validate_json_file(filepath):
    """验证单个JSON文件格式"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if not isinstance(data, list):
            print(f"  [ERROR] {os.path.basename(filepath)}: 数据不是数组")
            return False
        
        print(f"  [OK] {os.path.basename(filepath)}: 包含 {len(data)} 个角色")
        
        # 检查每个角色是否有正确的字段
        required_fields = ['id', '名称', '英文名', '类型', '所属剧本', '角色能力类型', 'url', 'content', 'metadata']
        optional_fields = ['英文名', '所属剧本', '角色能力类型']  # 这些字段可能为空
        
        all_valid = True
        for i, role in enumerate(data):
            # 检查必需字段
            missing_fields = []
            for field in required_fields:
                if field not in role:
                    missing_fields.append(field)
            
            if missing_fields:
                print(f"    [ERROR] 角色 {i+1} ({role.get('名称', '未知')}): 缺少字段 {missing_fields}")
                all_valid = False
            
            # 检查内容字段是否包含"角色信息"
            if 'content' in role and isinstance(role['content'], dict):
                if '角色信息' in role['content']:
                    print(f"    [ERROR] 角色 {i+1} ({role.get('名称', '未知')}): content中仍有'角色信息'字段")
                    all_valid = False
            
            # 检查字段名称是否被正确汉化
            old_fields = ['name', 'english_name', 'type']
            for old_field in old_fields:
                if old_field in role:
                    print(f"    [ERROR] 角色 {i+1} ({role.get('名称', '未知')}): 仍有旧字段名 '{old_field}'")
                    all_valid = False
        
        return all_valid
        
    except Exception as e:
        print(f"  [ERROR] {os.path.basename(filepath)}: 读取错误 - {e}")
        return False

def main():
    """主验证函数"""
    print("开始验证所有JSON文件的格式修改...")
    print("=" * 60)
    
    json_files = [
        "json/full/镇民.json",
        "json/full/外来者.json",
        "json/full/爪牙.json",
        "json/full/恶魔.json",
        "json/full/旅行者.json",
        "json/full/传奇角色.json",
        "json/full/奇遇角色.json",
        "json/full/实验型角色.json",
        "json/full/all_characters.json"
    ]
    
    total_valid = 0
    total_roles = 0
    
    for filepath in json_files:
        if not os.path.exists(filepath):
            print(f"[ERROR] 文件不存在: {filepath}")
            continue
            
        print(f"\n验证文件: {os.path.basename(filepath)}")
        print("-" * 40)
        
        is_valid = validate_json_file(filepath)
        
        # 统计角色数量
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                role_count = len(data) if isinstance(data, list) else 0
                total_roles += role_count
        except:
            role_count = 0
        
        if is_valid:
            print(f"  [OK] 格式验证通过")
            total_valid += 1
        else:
            print(f"  [ERROR] 格式验证失败")
    
    print("\n" + "=" * 60)
    print("验证结果汇总:")
    print(f"  成功验证的文件: {total_valid}/{len(json_files)}")
    print(f"  总角色数量: {total_roles}")
    
    # 检查备份文件
    print("\n检查备份文件:")
    backup_count = 0
    for filepath in json_files:
        backup_path = filepath + ".backup"
        if os.path.exists(backup_path):
            backup_count += 1
            print(f"  [OK] {os.path.basename(filepath)}.backup 存在")
        else:
            print(f"  [WARN] {os.path.basename(filepath)}.backup 不存在")
    
    print(f"\n备份文件数量: {backup_count}/{len(json_files)}")
    
    # 检查文件大小
    print("\n检查文件大小:")
    for filepath in json_files:
        if os.path.exists(filepath):
            size = os.path.getsize(filepath)
            print(f"  {os.path.basename(filepath)}: {size:,} bytes")
    
    # 最终验证
    if total_valid == len(json_files):
        print("\n[SUCCESS] 所有JSON文件格式验证成功！")
        return True
    else:
        print(f"\n[FAILURE] 验证失败：{len(json_files) - total_valid} 个文件有问题")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)