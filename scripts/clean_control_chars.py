#!/usr/bin/env python3
"""
清理JSON文件中的控制字符
"""
import os
import json
import re
import sys

def clean_control_chars(text):
    """移除除换行符、制表符外的控制字符"""
    # 保留 \n, \t, \r
    # 移除其他控制字符 (0x00-0x1F 除了 \n, \r, \t)
    lines = []
    for line in text.splitlines(keepends=True):
        # 替换除 \n, \r, \t 外的控制字符
        cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', line)
        lines.append(cleaned)
    return ''.join(lines)

def process_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 尝试解析JSON
        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            print(f"  解析错误: {e}")
            # 尝试清理后重新解析
            cleaned = clean_control_chars(content)
            try:
                data = json.loads(cleaned)
                print(f"  清理后解析成功")
                # 写回文件
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                return True
            except json.JSONDecodeError as e2:
                print(f"  清理后仍然失败: {e2}")
                return False
        
        # 如果已经能解析，检查是否有控制字符
        if re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', content):
            print(f"  发现控制字符，清理...")
            cleaned = clean_control_chars(content)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(cleaned)
            return True
        return True
    except Exception as e:
        print(f"  处理文件时出错: {e}")
        return False

def main():
    rule_dir = "json/rule"
    if not os.path.exists(rule_dir):
        print(f"目录不存在: {rule_dir}")
        return
    
    files = [f for f in os.listdir(rule_dir) if f.endswith('.json')]
    print(f"处理 {len(files)} 个规则文件...")
    
    success = 0
    for file in files:
        filepath = os.path.join(rule_dir, file)
        print(f"处理 {file}...")
        if process_file(filepath):
            success += 1
    
    print(f"\n完成: {success}/{len(files)} 个文件成功处理")
    return 0 if success == len(files) else 1

if __name__ == '__main__':
    sys.exit(main())