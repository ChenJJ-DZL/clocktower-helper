#!/usr/bin/env python3
"""
修复并恢复规则文件
处理备份文件中的编码问题，创建正确的JSON格式
"""

import json
import os
import re
from datetime import datetime

# 规则目录
RULES_DIR = "json/rule"

def clean_control_chars(text):
    """清理控制字符"""
    # 移除控制字符（除了换行符和制表符）
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)

def fix_backup_file(bak_path):
    """修复备份文件"""
    try:
        # 以二进制方式读取文件
        with open(bak_path, 'rb') as f:
            raw_data = f.read()
        
        # 尝试多种编码
        encodings = ['utf-8', 'gbk', 'gb2312', 'latin-1']
        decoded_data = None
        
        for encoding in encodings:
            try:
                decoded_data = raw_data.decode(encoding)
                # 检查是否包含中文字符
                if any('\u4e00' <= char <= '\u9fff' for char in decoded_data):
                    break
            except UnicodeDecodeError:
                continue
        
        if decoded_data is None:
            # 如果所有编码都失败，使用utf-8并忽略错误
            decoded_data = raw_data.decode('utf-8', errors='ignore')
        
        # 清理控制字符
        cleaned_data = clean_control_chars(decoded_data)
        
        # 尝试解析JSON
        try:
            data = json.loads(cleaned_data)
        except json.JSONDecodeError as e:
            # 如果JSON解析失败，尝试手动修复
            print(f"JSON解析失败 {bak_path}: {e}")
            # 尝试提取字段
            return None
        
        return data
    
    except Exception as e:
        print(f"处理文件失败 {bak_path}: {e}")
        return None

def restore_rules():
    """恢复规则文件"""
    # 确保目录存在
    os.makedirs(RULES_DIR, exist_ok=True)
    
    # 获取当前时间
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # 查找所有.bak文件
    bak_files = []
    for filename in os.listdir(RULES_DIR):
        if filename.endswith('.bak'):
            bak_files.append(filename)
    
    if not bak_files:
        print("未找到备份文件")
        return
    
    print(f"找到 {len(bak_files)} 个备份文件")
    
    restored_count = 0
    
    # 字段名映射（修复乱码字段名）
    field_mapping = {
        "来源": "来源",
        "采集时间": "采集时间", 
        "标题": "标题",
        "内容": "内容",
        "说明": "说明",
        "行动顺序": "行动顺序"
    }
    
    for bak_file in bak_files:
        # 原始文件名（去掉.bak）
        original_name = bak_file[:-4]
        
        bak_path = os.path.join(RULES_DIR, bak_file)
        target_path = os.path.join(RULES_DIR, original_name)
        
        # 修复备份文件
        data = fix_backup_file(bak_path)
        
        if data is None:
            # 如果修复失败，尝试创建基本结构
            print(f"创建基本文件: {original_name}")
            # 从文件名提取标题
            title = original_name.replace('.json', '')
            
            # 创建基本数据结构
            data = {
                "来源": "https://clocktower-wiki.gstonegames.com/index.php?title=%E9%A6%96%E9%A1%B5",
                "采集时间": current_time,
                "标题": title,
                "内容": f"{title}内容（需要重新采集）"
            }
        
        # 确保字段名正确
        fixed_data = {}
        for key, value in data.items():
            # 如果key是乱码，尝试映射
            if '来源' in key or '��Դ' in key:
                fixed_data["来源"] = value
            elif '采集时间' in key or '�ɼ�ʱ��' in key:
                fixed_data["采集时间"] = current_time  # 更新为当前时间
            elif '标题' in key or '����' in key:
                fixed_data["标题"] = value
            elif '内容' in key or '����' in key:
                fixed_data["内容"] = value
            elif '说明' in key:
                fixed_data["说明"] = value
            elif '行动顺序' in key:
                fixed_data["行动顺序"] = value
            else:
                fixed_data[key] = value
        
        # 确保必要字段存在
        if "来源" not in fixed_data:
            fixed_data["来源"] = "https://clocktower-wiki.gstonegames.com/index.php?title=%E9%A6%96%E9%A1%B5"
        if "采集时间" not in fixed_data:
            fixed_data["采集时间"] = current_time
        if "标题" not in fixed_data:
            fixed_data["标题"] = original_name.replace('.json', '')
        
        # 写入目标文件
        with open(target_path, 'w', encoding='utf-8') as f:
            json.dump(fixed_data, f, ensure_ascii=False, indent=2)
        
        print(f"已恢复: {original_name}")
        restored_count += 1
    
    # 检查夜晚行动顺序文件
    night_files = ["夜晚行动顺序一览（首夜）.json", "夜晚行动顺序一览（其他夜晚）.json"]
    for night_file in night_files:
        night_path = os.path.join(RULES_DIR, night_file)
        if not os.path.exists(night_path):
            # 创建基本结构
            title = night_file.replace('.json', '')
            data = {
                "来源": "https://clocktower-wiki.gstonegames.com/index.php?title=%E9%A6%96%E9%A1%B5",
                "采集时间": current_time,
                "标题": title,
                "说明": "需要重新采集夜晚行动顺序数据",
                "行动顺序": []
            }
            
            with open(night_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            
            print(f"已创建: {night_file}")
            restored_count += 1
    
    print(f"恢复完成！共处理 {restored_count} 个文件")

if __name__ == "__main__":
    restore_rules()