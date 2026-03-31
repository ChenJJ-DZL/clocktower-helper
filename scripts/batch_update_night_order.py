#!/usr/bin/env python3
"""
批量更新角色JSON文件的夜晚行动顺序字段
可以指定起始索引和批次大小
"""

import json
import re
import os
import sys
from typing import Dict, List, Tuple

def load_night_order_mappings():
    """加载两个夜晚顺序文件的映射关系"""
    first_night_path = "json/rule/夜晚行动顺序一览（首夜）.json"
    other_nights_path = "json/rule/夜晚行动顺序一览（其他夜晚）.json"
    
    with open(first_night_path, 'r', encoding='utf-8') as f:
        first_night_data = json.load(f)
    
    with open(other_nights_path, 'r', encoding='utf-8') as f:
        other_nights_data = json.load(f)
    
    first_night_map = {}
    other_nights_map = {}
    
    # 解析首夜顺序
    for entry in first_night_data.get("行动顺序", []):
        seq_str = entry.get("序号", "")
        match = re.match(r'(\d+)\.(.+)', seq_str)
        if match:
            position = match.group(1)
            role_name = match.group(2).strip()
            if '（' in role_name:
                role_name = role_name.split('（')[0]
            first_night_map[role_name] = position
    
    # 解析其他夜晚顺序
    for entry in other_nights_data.get("行动顺序", []):
        seq_str = entry.get("序号", "")
        match = re.match(r'(\d+)\.(.+)', seq_str)
        if match:
            position = match.group(1)
            role_name = match.group(2).strip()
            if '（' in role_name:
                role_name = role_name.split('（')[0]
            other_nights_map[role_name] = position
    
    return first_night_map, other_nights_map

def find_role_position(role_name: str, first_night_map: Dict, other_nights_map: Dict) -> Tuple[str, str]:
    """查找角色在两个顺序中的位置"""
    # 尝试直接匹配
    first_night_pos = first_night_map.get(role_name, "无法行动")
    other_nights_pos = other_nights_map.get(role_name, "无法行动")
    
    # 如果直接匹配失败，尝试部分匹配
    if first_night_pos == "无法行动":
        for night_role in first_night_map:
            if role_name in night_role or night_role in role_name:
                first_night_pos = first_night_map[night_role]
                break
    
    if other_nights_pos == "无法行动":
        for night_role in other_nights_map:
            if role_name in night_role or night_role in role_name:
                other_nights_pos = other_nights_map[night_role]
                break
    
    return first_night_pos, other_nights_pos

def update_json_file(file_path: str, first_night_map: Dict, other_nights_map: Dict, 
                     start_index: int = 0, batch_size: int = 5, preview: bool = False):
    """更新角色JSON文件，添加夜晚行动顺序字段"""
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    total_roles = len(data)
    end_index = min(start_index + batch_size, total_roles)
    
    print(f"处理文件: {file_path}")
    print(f"总角色数: {total_roles}")
    print(f"处理批次: {start_index+1} 到 {end_index}")
    
    updated_count = 0
    for i in range(start_index, end_index):
        role = data[i]
        role_name = role.get("名称", "")
        
        if not role_name:
            continue
        
        first_night_pos, other_nights_pos = find_role_position(role_name, first_night_map, other_nights_map)
        
        # 检查是否已经存在这两个字段
        if "首夜行动顺序" in role and "其他夜晚行动顺序" in role:
            print(f"  ⚠️ {role_name}: 已存在夜晚行动顺序字段，跳过")
            continue
        
        if preview:
            print(f"  📝 {role_name}: 首夜={first_night_pos}, 其他夜晚={other_nights_pos}")
            continue
        
        # 在"类型"字段后添加两个新字段
        if "类型" in role:
            new_role = {}
            for key, value in role.items():
                new_role[key] = value
                if key == "类型":
                    new_role["首夜行动顺序"] = first_night_pos
                    new_role["其他夜晚行动顺序"] = other_nights_pos
            
            data[i] = new_role
            updated_count += 1
            print(f"  ✅ {role_name}: 首夜={first_night_pos}, 其他夜晚={other_nights_pos}")
    
    if not preview and updated_count > 0:
        # 保存更新后的文件
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"已更新 {updated_count} 个角色")
    return updated_count, end_index

def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description='批量更新角色JSON文件的夜晚行动顺序字段')
    parser.add_argument('--file', type=str, default='json/full/镇民.json',
                       help='要处理的JSON文件路径')
    parser.add_argument('--start', type=int, default=0,
                       help='起始索引（从0开始）')
    parser.add_argument('--batch', type=int, default=5,
                       help='批次大小')
    parser.add_argument('--preview', action='store_true',
                       help='预览模式，不实际修改文件')
    parser.add_argument('--all', action='store_true',
                       help='处理所有角色（忽略批次大小）')
    
    args = parser.parse_args()
    
    print("=== 批量更新夜晚行动顺序字段 ===")
    
    # 加载映射
    print("加载夜晚顺序映射...")
    first_night_map, other_nights_map = load_night_order_mappings()
    print(f"首夜顺序中有 {len(first_night_map)} 个角色")
    print(f"其他夜晚顺序中有 {len(other_nights_map)} 个角色")
    
    if not os.path.exists(args.file):
        print(f"错误: 文件不存在: {args.file}")
        sys.exit(1)
    
    # 确定批次大小
    batch_size = args.batch
    if args.all:
        with open(args.file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        batch_size = len(data) - args.start
    
    # 更新文件
    updated, next_index = update_json_file(
        args.file, first_night_map, other_nights_map,
        start_index=args.start, batch_size=batch_size,
        preview=args.preview
    )
    
    if args.preview:
        print(f"\n预览完成，不会修改文件")
    else:
        print(f"\n处理完成，下次从索引 {next_index} 开始")
        print(f"要处理下一批，运行: python3 {sys.argv[0]} --file {args.file} --start {next_index} --batch {args.batch}")

if __name__ == "__main__":
    main()