#!/usr/bin/env python3
import json
import re

def extract_missing_actions():
    """提取缺失的夜晚行动条目"""
    
    # 加载官方数据
    with open('json/rule/夜晚行动顺序一览（首夜）.json', 'r', encoding='utf-8') as f:
        official_first = json.load(f)
    
    with open('json/rule/夜晚行动顺序一览（其他夜晚）.json', 'r', encoding='utf-8') as f:
        official_other = json.load(f)
    
    # 加载项目数据
    with open('src/data/nightOrder.json', 'r', encoding='utf-8') as f:
        project_data = json.load(f)
    
    project_first = project_data.get('firstNight', [])
    project_other = project_data.get('otherNights', [])
    
    # 创建项目名称映射
    project_first_names = {item.get('chineseName', '') for item in project_first}
    project_other_names = {item.get('chineseName', '') for item in project_other}
    
    # 提取缺失条目
    missing_first = []
    missing_other = []
    
    for action in official_first.get('行动顺序', []):
        seq = action.get('序号', '')
        # 提取名称部分
        match = re.match(r'\d+\.(.+)', seq)
        if match:
            name = match.group(1).strip()
            # 检查是否缺失
            if name not in project_first_names:
                missing_first.append({
                    'id': generate_id(name),
                    'chineseName': name,
                    'englishName': generate_english_id(name),
                    'description': action.get('描述', '')
                })
    
    for action in official_other.get('行动顺序', []):
        seq = action.get('序号', '')
        match = re.match(r'\d+\.(.+)', seq)
        if match:
            name = match.group(1).strip()
            if name not in project_other_names:
                missing_other.append({
                    'id': generate_id(name),
                    'chineseName': name,
                    'englishName': generate_english_id(name),
                    'description': action.get('描述', '')
                })
    
    return missing_first, missing_other

def generate_id(chinese_name):
    """从中文名称生成ID"""
    # 简单的映射表
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
        "信息类角色行动开始": "info_roles_start"
    }
    
    # 特殊处理：黄昏（旅行者）-> dusk
    if "黄昏" in chinese_name:
        return "dusk"
    
    return mapping.get(chinese_name, chinese_name.lower().replace(' ', '_').replace('-', '_'))

def generate_english_id(chinese_name):
    """从中文名称生成英文ID"""
    # 简单的映射
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
        "信息类角色行动开始": "info_roles_start"
    }
    
    if "黄昏" in chinese_name:
        return "dusk"
    
    return mapping.get(chinese_name, chinese_name.lower().replace(' ', '').replace('-', ''))

def main():
    missing_first, missing_other = extract_missing_actions()
    
    print("首夜缺失的条目:")
    for i, item in enumerate(missing_first, 1):
        print(f"{i}. {item['chineseName']} (id: {item['id']})")
        print(f"   描述: {item['description'][:100]}...")
    
    print("\n其他夜晚缺失的条目:")
    for i, item in enumerate(missing_other, 1):
        print(f"{i}. {item['chineseName']} (id: {item['id']})")
        print(f"   描述: {item['description'][:100]}...")
    
    # 输出JSON格式用于修复
    print("\n=== 用于修复的JSON ===")
    
    first_fix = {
        "entries": missing_first
    }
    
    other_fix = {
        "entries": missing_other
    }
    
    print("\n首夜缺失条目JSON:")
    print(json.dumps(first_fix, ensure_ascii=False, indent=2))
    
    print("\n其他夜晚缺失条目JSON:")
    print(json.dumps(other_fix, ensure_ascii=False, indent=2))
    
    # 保存到文件
    with open('missing_actions_first.json', 'w', encoding='utf-8') as f:
        json.dump(first_fix, f, ensure_ascii=False, indent=2)
    
    with open('missing_actions_other.json', 'w', encoding='utf-8') as f:
        json.dump(other_fix, f, ensure_ascii=False, indent=2)
    
    print("\n已保存到 missing_actions_first.json 和 missing_actions_other.json")

if __name__ == "__main__":
    main()