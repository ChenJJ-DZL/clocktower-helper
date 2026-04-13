#!/usr/bin/env python3
import json
import re

def extract_role_id(chinese_name):
    """从中文名称提取可能的角色ID"""
    # 简单的映射表，可以根据需要扩展
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
    return mapping.get(chinese_name, chinese_name)

def load_official_night_order(filepath, night_type):
    """加载官方夜晚行动顺序"""
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    actions = data.get("行动顺序", [])
    result = []
    for action in actions:
        seq = action.get("序号", "")
        desc = action.get("描述", "")
        # 从序号中提取数字和名称
        match = re.match(r'(\d+)\.(.+)', seq)
        if match:
            num = int(match.group(1))
            name = match.group(2).strip()
        else:
            num = len(result) + 1
            name = seq
        
        result.append({
            "序号": num,
            "名称": name,
            "描述": desc,
            "原始序号": seq
        })
    
    print(f"官方{night_type}行动数量: {len(result)}")
    return result

def load_project_night_order(filepath, night_type):
    """加载项目夜晚行动顺序"""
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    if night_type == "首夜":
        actions = data.get("firstNight", [])
    else:
        actions = data.get("otherNights", [])
    
    result = []
    for action in actions:
        result.append({
            "id": action.get("id", ""),
            "chineseName": action.get("chineseName", ""),
            "englishName": action.get("englishName", ""),
            "description": action.get("description", "")
        })
    
    print(f"项目{night_type}行动数量: {len(result)}")
    return result

def compare_night_orders(official, project, night_type):
    """比较官方和项目的夜晚行动顺序"""
    print(f"\n=== 比较{night_type}行动顺序 ===")
    
    # 创建项目名称到条目的映射
    project_map = {}
    for item in project:
        name = item["chineseName"]
        if name:
            project_map[name] = item
    
    # 检查缺失的条目
    missing = []
    for official_item in official:
        official_name = official_item["名称"]
        if official_name not in project_map:
            missing.append(official_item)
    
    print(f"缺失的行动数量: {len(missing)}")
    for item in missing:
        print(f"  - {item['原始序号']}: {item['名称']}")
    
    return missing

def main():
    # 加载官方数据
    official_first = load_official_night_order("json/rule/夜晚行动顺序一览（首夜）.json", "首夜")
    official_other = load_official_night_order("json/rule/夜晚行动顺序一览（其他夜晚）.json", "其他夜晚")
    
    # 加载项目数据
    project_first = load_project_night_order("src/data/nightOrder.json", "首夜")
    project_other = load_project_night_order("src/data/nightOrder.json", "其他夜晚")
    
    # 比较
    missing_first = compare_night_orders(official_first, project_first, "首夜")
    missing_other = compare_night_orders(official_other, project_other, "其他夜晚")
    
    # 输出总结
    print("\n=== 总结 ===")
    print(f"首夜缺失: {len(missing_first)} 个行动")
    print(f"其他夜晚缺失: {len(missing_other)} 个行动")
    
    # 保存缺失信息到文件
    with open("missing_night_actions.txt", "w", encoding="utf-8") as f:
        f.write("首夜缺失的行动:\n")
        for item in missing_first:
            f.write(f"{item['原始序号']}: {item['名称']}\n")
            f.write(f"  描述: {item['描述'][:100]}...\n\n")
        
        f.write("\n其他夜晚缺失的行动:\n")
        for item in missing_other:
            f.write(f"{item['原始序号']}: {item['名称']}\n")
            f.write(f"  描述: {item['描述'][:100]}...\n\n")

if __name__ == "__main__":
    main()