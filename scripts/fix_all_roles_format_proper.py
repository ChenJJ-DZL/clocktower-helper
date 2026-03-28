#!/usr/bin/env python3
"""
正确修复所有角色JSON格式的脚本
将所有角色统一为洗衣妇的格式
"""

import json
import os
import sys
import glob

def extract_from_content(content):
    """从content中提取角色信息并解析"""
    if not isinstance(content, dict):
        return {}, ""
    
    # 获取角色信息字段
    role_info_text = content.get('角色信息', '')
    
    # 初始化结果
    extracted_fields = {
        '英文名': '',
        '所属剧本': '',
        '角色能力类型': ''
    }
    
    if not role_info_text:
        return extracted_fields, role_info_text
    
    # 按行分割并解析
    lines = role_info_text.split('\n')
    for line in lines:
        line = line.strip()
        if line.startswith('英文名：'):
            extracted_fields['英文名'] = line.replace('英文名：', '').strip()
        elif line.startswith('所属剧本：'):
            extracted_fields['所属剧本'] = line.replace('所属剧本：', '').strip()
        elif line.startswith('角色能力类型：'):
            extracted_fields['角色能力类型'] = line.replace('角色能力类型：', '').strip()
    
    return extracted_fields, role_info_text

def fix_role_format(role):
    """修复单个角色的格式为洗衣妇格式"""
    # 创建新角色字典
    new_role = {}
    
    # 1. 复制基本字段（保持原样）
    if 'id' in role:
        new_role['id'] = role['id']
    
    # 2. 处理名称字段 - 检查是否有name或名称字段
    if '名称' in role:
        new_role['名称'] = role['名称']
    elif 'name' in role:
        new_role['名称'] = role['name']
    
    # 3. 处理英文名 - 先检查现有的
    if '英文名' in role:
        new_role['英文名'] = role['英文名']
    elif 'english_name' in role:
        new_role['英文名'] = role['english_name']
    
    # 4. 处理类型字段
    if '类型' in role:
        new_role['类型'] = role['类型']
    elif 'type' in role:
        new_role['类型'] = role['type']
    
    # 5. 处理原始名称（实验角色）
    if 'original_name' in role:
        new_role['原始名称'] = role['original_name']
    
    # 6. 处理content字段，提取角色信息
    if 'content' in role:
        content = role['content']
        extracted_fields, role_info_text = extract_from_content(content)
        
        # 更新英文名（如果从角色信息中提取到了）
        if extracted_fields['英文名'] and not new_role.get('英文名'):
            new_role['英文名'] = extracted_fields['英文名']
        
        # 添加所属剧本字段
        if extracted_fields['所属剧本']:
            new_role['所属剧本'] = extracted_fields['所属剧本']
        
        # 添加角色能力类型字段
        if extracted_fields['角色能力类型']:
            new_role['角色能力类型'] = extracted_fields['角色能力类型']
        
        # 创建新的content，删除角色信息字段
        if isinstance(content, dict):
            new_content = content.copy()
            if '角色信息' in new_content:
                del new_content['角色信息']
            new_role['content'] = new_content
        else:
            # 如果content不是字典，保持原样
            new_role['content'] = content
    
    # 7. 复制其他字段
    for field in ['url', 'metadata']:
        if field in role:
            new_role[field] = role[field]
    
    # 8. 确保所有必需字段都存在（即使为空）
    required_fields = ['id', '名称', '英文名', '类型', 'url', 'content', 'metadata']
    for field in required_fields:
        if field not in new_role:
            new_role[field] = ''
    
    # 9. 确保可选字段存在（如果可能）
    optional_fields = ['所属剧本', '角色能力类型']
    for field in optional_fields:
        if field not in new_role:
            new_role[field] = ''
    
    return new_role

def process_file(filepath):
    """处理单个JSON文件"""
    print(f"正在处理文件: {os.path.basename(filepath)}")
    
    # 创建备份
    backup_path = filepath + ".backup2"
    if not os.path.exists(backup_path):
        import shutil
        shutil.copy2(filepath, backup_path)
        print(f"  已创建备份: {os.path.basename(backup_path)}")
    
    # 读取文件
    with open(filepath, 'r', encoding='utf-8') as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"  [ERROR] JSON解析错误: {e}")
            return False, 0
    
    if not isinstance(data, list):
        print("  [ERROR] 数据不是数组")
        return False, 0
    
    # 处理每个角色
    fixed_data = []
    modified_count = 0
    
    for i, role in enumerate(data):
        new_role = fix_role_format(role)
        
        # 检查是否有修改
        if json.dumps(role, sort_keys=True, ensure_ascii=False) != json.dumps(new_role, sort_keys=True, ensure_ascii=False):
            modified_count += 1
        
        fixed_data.append(new_role)
    
    # 写回文件
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(fixed_data, f, ensure_ascii=False, indent=2)
    
    # 验证JSON格式
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            json.load(f)
        print(f"  成功修改 {modified_count} 个角色")
        print(f"  文件验证: JSON格式有效")
        return True, modified_count
    except json.JSONDecodeError as e:
        print(f"  [ERROR] 写入后JSON验证失败: {e}")
        return False, 0

def main():
    """主函数"""
    print("开始正确修复所有JSON文件的格式...")
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
    
    success_count = 0
    total_modified = 0
    
    for filepath in json_files:
        if not os.path.exists(filepath):
            print(f"[ERROR] 文件不存在: {filepath}")
            continue
        
        success, modified = process_file(filepath)
        if success:
            success_count += 1
            total_modified += modified
        print()
    
    print("=" * 60)
    print("修复结果汇总:")
    print(f"  成功处理: {success_count}/{len(json_files)} 个文件")
    print(f"  总修改角色数: {total_modified}")
    
    if success_count == len(json_files):
        print("\n[SUCCESS] 所有文件格式修复成功！")
        return True
    else:
        print(f"\n[FAILURE] 修复失败：{len(json_files) - success_count} 个文件有问题")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)