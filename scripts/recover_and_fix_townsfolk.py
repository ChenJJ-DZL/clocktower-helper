#!/usr/bin/env python3
"""
从备份恢复并正确修复镇民.json文件的脚本
将备份文件中的原始数据恢复，然后正确提取角色信息到顶层字段
"""

import json
import os
import sys

def parse_role_info(role_info_text):
    """解析角色信息文本，提取各个字段"""
    english_name = ""
    play_name = ""
    ability_type = ""
    
    if not role_info_text:
        return english_name, play_name, ability_type
    
    # 按行分割
    lines = role_info_text.split('\n')
    for line in lines:
        line = line.strip()
        if line.startswith('英文名：'):
            english_name = line.replace('英文名：', '').strip()
        elif line.startswith('所属剧本：'):
            play_name = line.replace('所属剧本：', '').strip()
        elif line.startswith('角色能力类型：'):
            ability_type = line.replace('角色能力类型：', '').strip()
    
    return english_name, play_name, ability_type

def fix_role_format(role, category_name="镇民"):
    """根据用户参考格式正确修复单个角色的格式"""
    # 创建新角色字典，从现有角色复制所有字段
    new_role = role.copy()
    
    # 1. 确保"名称"字段存在且正确
    if 'name' in new_role and new_role['name']:
        new_role['名称'] = new_role['name']
        # 保留原始name字段以防需要
    elif '名称' not in new_role or not new_role['名称']:
        # 如果没有名称，尝试从id推断
        if 'id' in new_role:
            # 解码id（可能是URL编码）
            import urllib.parse
            try:
                decoded = urllib.parse.unquote(new_role['id'])
                # 提取可能的名称
                if '_' in decoded:
                    name_part = decoded.split('_')[-1]
                    new_role['名称'] = name_part
            except:
                new_role['名称'] = "未知角色"
    
    # 2. 确保"类型"字段存在且正确
    if 'type' in new_role:
        new_role['类型'] = new_role['type']
    elif '类型' not in new_role or not new_role['类型']:
        new_role['类型'] = category_name
    
    # 3. 从content中的"角色信息"提取英文名、所属剧本、角色能力类型
    if 'content' in new_role and isinstance(new_role['content'], dict):
        content = new_role['content']
        role_info_text = content.get('角色信息', '')
        
        english_name, play_name, ability_type = parse_role_info(role_info_text)
        
        # 更新英文名（如果从角色信息中提取到了）
        if english_name and (not new_role.get('英文名') or not new_role.get('英文名').strip()):
            new_role['英文名'] = english_name
        
        # 添加所属剧本字段
        if play_name:
            new_role['所属剧本'] = play_name
        elif '所属剧本' not in new_role:
            new_role['所属剧本'] = ""
        
        # 添加角色能力类型字段
        if ability_type:
            new_role['角色能力类型'] = ability_type
        elif '角色能力类型' not in new_role:
            new_role['角色能力类型'] = ""
    
    else:
        # 确保字段存在
        new_role['所属剧本'] = ""
        new_role['角色能力类型'] = ""
    
    return new_role

def main():
    """主函数"""
    print("开始从备份恢复并正确修复镇民.json文件...")
    
    # 原始备份文件
    backup_file = "json/full/镇民.json.backup"
    target_file = "json/full/镇民.json"
    
    if not os.path.exists(backup_file):
        print(f"错误：备份文件不存在 {backup_file}")
        return False
    
    # 读取备份文件
    print(f"正在读取备份文件: {os.path.basename(backup_file)}")
    with open(backup_file, 'r', encoding='utf-8') as f:
        try:
            backup_data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"JSON解析错误: {e}")
            return False
    
    # 处理每个角色
    fixed_data = []
    for role in backup_data:
        fixed_role = fix_role_format(role, "镇民")
        fixed_data.append(fixed_role)
    
    print(f"已处理 {len(fixed_data)} 个角色")
    
    # 创建新的备份
    new_backup = target_file + ".recovery_backup"
    if os.path.exists(target_file):
        import shutil
        shutil.copy2(target_file, new_backup)
        print(f"已创建当前文件备份: {os.path.basename(new_backup)}")
    
    # 写入修复后的文件
    with open(target_file, 'w', encoding='utf-8') as f:
        json.dump(fixed_data, f, ensure_ascii=False, indent=2)
    
    print(f"已写入修复文件: {os.path.basename(target_file)}")
    
    # 验证修复
    try:
        with open(target_file, 'r', encoding='utf-8') as f:
            json.load(f)
        
        # 检查关键字段
        sample_roles = []
        for i, role in enumerate(fixed_data[:5]):  # 检查前5个角色
            sample_roles.append({
                "index": i,
                "名称": role.get("名称", ""),
                "英文名": role.get("英文名", ""),
                "类型": role.get("类型", ""),
                "所属剧本": role.get("所属剧本", ""),
                "角色能力类型": role.get("角色能力类型", "")
            })
        
        print("\n修复后前5个角色的字段示例:")
        for sample in sample_roles:
            print(f"  角色 {sample['index']}:")
            print(f"    名称: {sample['名称']}")
            print(f"    英文名: {sample['英文名']}")
            print(f"    类型: {sample['类型']}")
            print(f"    所属剧本: {sample['所属剧本']}")
            print(f"    角色能力类型: {sample['角色能力类型']}")
            print()
        
        # 检查是否有空字段
        missing_fields = []
        for i, role in enumerate(fixed_data):
            required_fields = ["名称", "类型", "英文名", "所属剧本", "角色能力类型"]
            for field in required_fields:
                if field not in role or not role[field]:
                    missing_fields.append((i, field))
        
        if missing_fields:
            print("警告：以下字段缺失或为空:")
            for idx, field in missing_fields[:10]:  # 只显示前10个
                print(f"  角色 {idx} 缺少 '{field}' 字段")
            if len(missing_fields) > 10:
                print(f"  ... 还有 {len(missing_fields) - 10} 个缺失字段")
        else:
            print("✅ 所有必需字段都已正确填充")
        
        print("\n✅ 镇民.json文件修复成功！")
        return True
    except json.JSONDecodeError as e:
        print(f"❌ JSON验证失败: {e}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)