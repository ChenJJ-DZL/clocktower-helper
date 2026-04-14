#!/usr/bin/env python3
import json
import re

def load_json_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json_file(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def get_missing_entries_with_positions():
    """获取缺失的条目及其正确插入位置"""
    
    # 加载官方数据
    official_first = load_json_file('json/rule/夜晚行动顺序一览（首夜）.json')
    official_other = load_json_file('json/rule/夜晚行动顺序一览（其他夜晚）.json')
    
    # 加载项目数据
    project_data = load_json_file('src/data/nightOrder.json')
    project_first = project_data.get('firstNight', [])
    project_other = project_data.get('otherNights', [])
    
    # 创建项目名称到索引的映射
    project_first_names = {item.get('chineseName', ''): idx for idx, item in enumerate(project_first)}
    project_other_names = {item.get('chineseName', ''): idx for idx, item in enumerate(project_other)}
    
    # 处理首夜缺失
    missing_first_with_pos = []
    for official_item in official_first.get('行动顺序', []):
        seq = official_item.get('序号', '')
        match = re.match(r'(\d+)\.(.+)', seq)
        if not match:
            continue
            
        position = int(match.group(1))
        name = match.group(2).strip()
        
        # 检查是否缺失
        if name not in project_first_names:
            # 创建新的条目
            new_entry = {
                'id': generate_id(name),
                'chineseName': name,
                'englishName': generate_english_id(name),
                'description': official_item.get('描述', '')
            }
            missing_first_with_pos.append({
                'position': position,
                'name': name,
                'entry': new_entry
            })
    
    # 处理其他夜晚缺失
    missing_other_with_pos = []
    for official_item in official_other.get('行动顺序', []):
        seq = official_item.get('序号', '')
        match = re.match(r'(\d+)\.(.+)', seq)
        if not match:
            continue
            
        position = int(match.group(1))
        name = match.group(2).strip()
        
        # 检查是否缺失
        if name not in project_other_names:
            # 创建新的条目
            new_entry = {
                'id': generate_id(name),
                'chineseName': name,
                'englishName': generate_english_id(name),
                'description': official_item.get('描述', '')
            }
            missing_other_with_pos.append({
                'position': position,
                'name': name,
                'entry': new_entry
            })
    
    return missing_first_with_pos, missing_other_with_pos

def generate_id(chinese_name):
    """从中文名称生成ID"""
    mapping = {
        "失忆者": "amnesiac",
        "魔术师": "magician",
        "爪牙信息": "minion_info",
        "落难少女": "damsel",
        "提线木偶": "puppet",
        "帽匠": "hatter",
        "麻脸巫婆": "pockmarked_witch",
        "诺-达鲺": "no_dashi",
        "哈迪寂亚": "hadesia",
        "暴君": "tyrant",
        "造谣者": "rumor_monger",
        "修补匠": "tinker",
        "月之子": "moonchild",
        "祖母": "grandmother",
        "信息类角色行动开始": "info_roles_start",
        "黄昏（旅行者）": "dusk"  # 注意：项目可能已有dusk，但名称不同
    }
    
    # 特殊处理
    if "黄昏" in chinese_name:
        return "dusk"
    
    return mapping.get(chinese_name, chinese_name.lower().replace(' ', '_').replace('-', '_').replace('（', '').replace('）', ''))

def generate_english_id(chinese_name):
    """从中文名称生成英文ID"""
    mapping = {
        "失忆者": "amnesiac",
        "魔术师": "magician",
        "爪牙信息": "minion_info",
        "落难少女": "damsel",
        "提线木偶": "puppet",
        "帽匠": "hatter",
        "麻脸巫婆": "pockmarked_witch",
        "诺-达鲺": "nodashi",
        "哈迪寂亚": "hadesia",
        "暴君": "tyrant",
        "造谣者": "rumormonger",
        "修补匠": "tinker",
        "月之子": "moonchild",
        "祖母": "grandmother",
        "信息类角色行动开始": "info_roles_start",
        "黄昏（旅行者）": "dusk"
    }
    
    if "黄昏" in chinese_name:
        return "dusk"
    
    return mapping.get(chinese_name, chinese_name.lower().replace(' ', '').replace('-', '').replace('（', '').replace('）', ''))

def insert_missing_entries(project_list, missing_with_pos):
    """将缺失的条目插入到正确位置"""
    # 按位置排序
    missing_with_pos.sort(key=lambda x: x['position'])
    
    # 创建新列表
    new_list = project_list.copy()
    
    # 反向插入，避免位置偏移
    offset = 0
    for item in missing_with_pos:
        pos = item['position'] - 1  # 转为0-based索引
        insert_pos = pos + offset
        
        # 确保插入位置有效
        if insert_pos > len(new_list):
            insert_pos = len(new_list)
        
        print(f"在位置 {insert_pos} 插入 {item['name']}")
        new_list.insert(insert_pos, item['entry'])
        offset += 1
    
    return new_list

def main():
    print("开始修复夜晚行动顺序...")
    
    # 加载项目数据
    project_data = load_json_file('src/data/nightOrder.json')
    
    # 获取缺失条目及其位置
    missing_first, missing_other = get_missing_entries_with_positions()
    
    print(f"\n首夜缺失 {len(missing_first)} 个条目:")
    for item in missing_first:
        print(f"  - 位置 {item['position']}: {item['name']}")
    
    print(f"\n其他夜晚缺失 {len(missing_other)} 个条目:")
    for item in missing_other:
        print(f"  - 位置 {item['position']}: {item['name']}")
    
    # 检查是否有"黄昏（旅行者）"但项目已有"黄昏"
    # 项目中的"黄昏"条目可能在位置1，我们需要检查是否名称不同但实质相同
    project_first_names = {item.get('chineseName', '') for item in project_data.get('firstNight', [])}
    project_other_names = {item.get('chineseName', '') for item in project_data.get('otherNights', [])}
    
    # 过滤掉项目中可能已存在的条目（名称不同但实质相同）
    filtered_missing_first = []
    for item in missing_first:
        name = item['name']
        # 如果名称是"黄昏（旅行者）"但项目已有"黄昏"，则跳过
        if "黄昏" in name and any("黄昏" in existing_name for existing_name in project_first_names):
            print(f"跳过 '{name}'，因为项目已有类似条目")
            continue
        filtered_missing_first.append(item)
    
    filtered_missing_other = []
    for item in missing_other:
        name = item['name']
        if "黄昏" in name and any("黄昏" in existing_name for existing_name in project_other_names):
            print(f"跳过 '{name}'，因为项目已有类似条目")
            continue
        filtered_missing_other.append(item)
    
    # 插入缺失条目
    if filtered_missing_first:
        project_data['firstNight'] = insert_missing_entries(
            project_data.get('firstNight', []),
            filtered_missing_first
        )
    
    if filtered_missing_other:
        project_data['otherNights'] = insert_missing_entries(
            project_data.get('otherNights', []),
            filtered_missing_other
        )
    
    # 保存更新后的文件
    save_json_file('src/data/nightOrder.json', project_data)
    
    print("\n修复完成！")
    print(f"首夜现在有 {len(project_data.get('firstNight', []))} 个条目")
    print(f"其他夜晚现在有 {len(project_data.get('otherNights', []))} 个条目")
    
    # 验证修复
    expected_first = 87  # 官方首夜条目数
    expected_other = 118  # 官方其他夜晚条目数
    
    actual_first = len(project_data.get('firstNight', []))
    actual_other = len(project_data.get('otherNights', []))
    
    print(f"\n验证:")
    print(f"首夜: 期望 {expected_first}, 实际 {actual_first}, {'✓ 通过' if actual_first == expected_first else '✗ 失败'}")
    print(f"其他夜晚: 期望 {expected_other}, 实际 {actual_other}, {'✓ 通过' if actual_other == expected_other else '✗ 失败'}")

if __name__ == "__main__":
    main()