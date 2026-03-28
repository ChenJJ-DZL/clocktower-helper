#!/usr/bin/env python3
"""
从备份文件恢复规则数据
将.bak文件复制为.json文件，并更新采集时间为当前时间
"""

import json
import os
import shutil
from datetime import datetime

# 规则目录
RULES_DIR = "json/rule"

def restore_from_backup():
    """从备份文件恢复"""
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
    for bak_file in bak_files:
        # 原始文件名（去掉.bak）
        original_name = bak_file[:-4]  # 去掉最后的.bak
        
        bak_path = os.path.join(RULES_DIR, bak_file)
        target_path = os.path.join(RULES_DIR, original_name)
        
        try:
            # 读取备份文件内容
            with open(bak_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # 更新采集时间
            if isinstance(data, dict):
                data["采集时间"] = current_time
                # 确保来源字段正确
                if "来源" not in data:
                    data["来源"] = "https://clocktower-wiki.gstonegames.com/index.php?title=%E9%A6%96%E9%A1%B5"
            
            # 写入目标文件
            with open(target_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            
            print(f"已恢复: {original_name}")
            restored_count += 1
            
        except Exception as e:
            print(f"恢复失败 {bak_file}: {e}")
    
    # 还需要处理夜晚行动顺序文件（可能没有.bak备份）
    # 检查是否有夜晚行动顺序文件
    night_files = ["夜晚行动顺序一览（首夜）.json", "夜晚行动顺序一览（其他夜晚）.json"]
    for night_file in night_files:
        night_path = os.path.join(RULES_DIR, night_file)
        if not os.path.exists(night_path):
            # 尝试从备份文件恢复
            night_bak = night_file + ".bak"
            night_bak_path = os.path.join(RULES_DIR, night_bak)
            if os.path.exists(night_bak_path):
                try:
                    with open(night_bak_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    
                    if isinstance(data, dict):
                        data["采集时间"] = current_time
                        if "来源" not in data:
                            data["来源"] = "https://clocktower-wiki.gstonegames.com/index.php?title=%E9%A6%96%E9%A1%B5"
                    
                    with open(night_path, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    
                    print(f"已恢复: {night_file}")
                    restored_count += 1
                except Exception as e:
                    print(f"恢复夜晚行动顺序失败 {night_file}: {e}")
            else:
                print(f"警告: 缺少夜晚行动顺序文件 {night_file}")
    
    print(f"恢复完成！共恢复 {restored_count} 个文件")

if __name__ == "__main__":
    restore_from_backup()