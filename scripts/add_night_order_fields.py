#!/usr/bin/env python3
"""
为角色JSON文件添加夜晚行动顺序字段
"""

import json
import re
import os
from typing import Dict, List, Tuple, Optional

def load_night_order_mappings():
    """加载两个夜晚顺序文件的映射关系"""
    first_night_path = "json/rule/夜晚行动顺序一览（首夜）.json"
    other_nights_path = "json/rule/夜晚行动顺序一览（其他夜晚）.json"
    
    # 加载首夜顺序
    with open(first_night_path, 'r', encoding='utf-8') as f:
        first_night_data = json.load(f)
    
    # 加载其他夜晚顺序
    with open(other_nights_path, 'r', encoding='utf-8') as f:
        other_nights_data = json.load(f)
    
    # 创建角色名称到位置的映射
    first_night_map = {}
    other_nights_map = {}
    
    # 解析首夜顺序
    for entry in first_night_data.get("行动顺序", []):
        seq_str = entry.get("序号", "")
        # 提取序号和角色名称，例如 "52.洗衣妇"
        match = re.match(r'(\d+)\.(.+)', seq_str)
        if match:
            position = match.group(1)  # 保留为字符串
            role_name = match.group(2).strip()
            # 移除可能的括号内容，例如 "黄昏（旅行者）" -> "黄昏"
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

def update_role_json_file(file_path: str, first_night_map: Dict, other_nights_map: Dict, 
                          batch_size: int = 5, start_index: int = 0):
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
        
        # 在"类型"字段后添加两个新字段
        if "类型" in role:
            # 创建新的有序字典（实际上Python 3.7+ dict会保持插入顺序）
            new_role = {}
            for key, value in role.items():
                new_role[key] = value
                if key == "类型":
                    # 在"类型"字段后插入新字段
                    new_role["首夜行动顺序"] = first_night_pos
                    new_role["其他夜晚行动顺序"] = other_nights_pos
            
            data[i] = new_role
            updated_count += 1
            print(f"  - {role_name}: 首夜={first_night_pos}, 其他夜晚={other_nights_pos}")
    
    # 保存更新后的文件
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"已更新 {updated_count} 个角色")
    return updated_count, end_index

def main():
    """主函数"""
    print("=== 添加夜晚行动顺序字段 ===")
    
    # 加载映射
    print("加载夜晚顺序映射...")
    first_night_map, other_nights_map = load_night_order_mappings()
    print(f"首夜顺序中有 {len(first_night_map)} 个角色")
    print(f"其他夜晚顺序中有 {len(other_nights_map)} 个角色")
    
    # 测试洗衣妇
    test_role = "洗衣妇"
    first_pos, other_pos = find_role_position(test_role, first_night_map, other_nights_map)
    print(f"\n测试角色 '{test_role}':")
    print(f"  首夜行动顺序: {first_pos} (预期: 52)")
    print(f"  其他夜晚行动顺序: {other_pos} (预期: 无法行动)")
    
    # 处理镇民.json文件（第一批5个角色）
    townsfolk_path = "json/full/镇民.json"
    if os.path.exists(townsfolk_path):
        print(f"\n开始处理 {townsfolk_path}...")
        updated, next_index = update_role_json_file(
            townsfolk_path, first_night_map, other_nights_map, 
            batch_size=5, start_index=0
        )
        print(f"第一批处理完成，下次从索引 {next_index} 开始")
    else:
        print(f"文件不存在: {townsfolk_path}")

if __name__ == "__main__":
    main()