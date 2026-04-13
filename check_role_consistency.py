#!/usr/bin/env python3
import json
import re

def load_official_role_descriptions():
    """加载官方角色描述"""
    official_roles = {}
    
    # 加载镇民JSON
    with open('json/full/镇民.json', 'r', encoding='utf-8') as f:
        townsfolk = json.load(f)
        for role in townsfolk:
            official_roles[role['名称']] = role
    
    # 加载外来者JSON
    with open('json/full/外来者.json', 'r', encoding='utf-8') as f:
        outsiders = json.load(f)
        for role in outsiders:
            official_roles[role['名称'] = role
    
    # 加载爪牙JSON
    with open('json/full/爪牙.json', 'r', encoding='utf-8') as f:
        minions = json.load(f)
        for role in minions:
            official_roles[role['名称'] = role
    
    # 加载恶魔JSON
    with open('json/full/恶魔.json', 'r', encoding='utf-8') as f:
        demons = json.load(f)
        for role in demons:
            official_roles[role['名称'] = role
    
    return official_roles

def load_project_role_implementations():
    """加载项目角色实现"""
    project_roles = {}
    
    # 加载rolesData.json
    with open('src/data/rolesData.json', 'r', encoding='utf-8') as f:
        roles_data = json.load(f)
        for role in roles_data:
            project_roles[role['id']] = role
    
    return project_roles

def compare_role_abilities(official_roles, project_roles):
    """比较角色能力实现的一致性"""
    inconsistencies = []
    
    # 检查关键角色
    key_roles = [
        ("洗衣妇", "washerwoman"),
        ("图书管理员", "librarian"),
        ("调查员", "investigator"),
        ("厨师", "chef"),
        ("共情者", "empath"),
        ("占卜师", "fortune_teller"),
        ("送葬者", "undertaker"),
        ("僧侣", "monk"),
        ("守鸦人", "ravenkeeper"),
        ("猎手", "huntsman"),
        ("士兵", "soldier"),
        ("镇长", "mayor"),
        ("圣徒", "saint"),
        ("酒鬼", "drunk"),
        ("管家", "butler"),
        ("陌客", "recluse"),
        ("异端分子", "heretic"),
        ("哥布林", "goblin"),
        ("爪牙", "minion"),
        ("小恶魔", "imp")
    ]
    
    for chinese_name, english_id in key_roles:
        if chinese_name not in official_roles:
            print(f"警告: 官方角色中未找到 {chinese_name}")
            continue
        
        if english_id not in project_roles:
            print(f"警告: 项目实现中未找到 {english_id} ({chinese_name})")
            continue
        
        official_role = official_roles[chinese_name]
        project_role = project_roles[english_id]
        
        # 检查基本字段
        official_ability = official_role.get('content', {}).get('角色能力', '')
        project_type = project_role.get('type', '')
        
        # 验证类型匹配
        expected_type = "镇民"
        if chinese_name in ["圣徒", "酒鬼", "管家", "陌客", "异端分子"]:
            expected_type = "外来者"
        elif chinese_name in ["爪牙", "小恶魔"]:
            expected_type = "爪牙" if chinese_name == "爪牙" else "恶魔"
        
        if project_type != expected_type:
            inconsistencies.append({
                'role': chinese_name,
                'issue': f'类型不匹配: 官方={expected_type}, 项目={project_type}',
                'severity': '高'
            })
        
        # 检查能力描述
        official_desc = official_role.get('content', {}).get('角色简介', '')
        
        # 这里可以添加更详细的检查逻辑
        # 例如：验证能力实现是否包含关键机制
        
        # 检查洗衣妇的特殊逻辑
        if chinese_name == "洗衣妇":
            # 检查是否有处理醉酒/中毒的逻辑
            with open('src/roles/new_engine/washerwoman.ability.ts', 'r', encoding='utf-8') as f:
                content = f.read()
                if 'isAbilityActive' not in content:
                    inconsistencies.append({
                        'role': chinese_name,
                        'issue': '缺少醉酒/中毒状态检查逻辑',
                        'severity': '中'
                    })
    
    return inconsistencies

def check_game_end_implementation():
    """检查游戏结束逻辑的实现"""
    issues = []
    
    try:
        with open('app/gameLogic.ts', 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 检查关键胜利条件
        key_conditions = [
            "圣徒被处决",
            "地精被处决", 
            "爪牙猜中落难少女",
            "呆瓜误判",
            "旋涡世界平安日"
        ]
        
        for condition in key_conditions:
            if condition not in content:
                issues.append(f'游戏结束检查中缺少条件: {condition}')
    except FileNotFoundError:
        issues.append("无法找到 app/gameLogic.ts 文件")
    
    return issues

def main():
    print("开始检查角色能力实现一致性...")
    
    # 加载数据
    print("加载官方角色描述...")
    try:
        official_roles = load_official_role_descriptions()
        print(f"已加载 {len(official_roles)} 个官方角色")
    except Exception as e:
        print(f"加载官方角色描述失败: {e}")
        official_roles = {}
    
    print("加载项目角色实现...")
    try:
        project_roles = load_project_role_implementations()
        print(f"已加载 {len(project_roles)} 个项目角色")
    except Exception as e:
        print(f"加载项目角色实现失败: {e}")
        project_roles = {}
    
    # 检查角色能力一致性
    print("\n检查角色能力一致性...")
    if official_roles and project_roles:
        inconsistencies = compare_role_abilities(official_roles, project_roles)
        
        if inconsistencies:
            print(f"发现 {len(inconsistencies)} 个不一致问题:")
            for inc in inconsistencies:
                print(f"  [{inc['severity']}] {inc['role']}: {inc['issue']}")
        else:
            print("未发现明显的不一致问题")
    else:
        print("无法进行一致性检查：数据加载不完整")
    
    # 检查游戏结束逻辑
    print("\n检查游戏结束逻辑实现...")
    game_end_issues = check_game_end_implementation()
    
    if game_end_issues:
        print(f"发现 {len(game_end_issues)} 个游戏结束逻辑问题:")
        for issue in game_end_issues:
            print(f"  - {issue}")
    else:
        print("游戏结束逻辑实现基本完整")
    
    # 总结
    print("\n=== 总结 ===")
    print("建议进行以下验证:")
    print("1. 检查所有角色的能力实现是否与JSON官方描述一致")
    print("2. 验证醉酒/中毒状态处理逻辑")
    print("3. 确保特殊胜利条件（圣徒、地精等）正确实现")
    print("4. 运行自动化测试验证修复结果")

if __name__ == "__main__":
    main()