#!/usr/bin/env python3
"""
直接替换JSON文件中的\n转义序列为真正的换行符
警告：这会创建非标准JSON文件
"""

import os
import re

RULES_DIR = "json/rule"

def process_file(filepath):
    """处理单个文件，将\n替换为真正的换行符"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # 找到"内容"字段，将其中的\n转义序列替换为真正的换行符
    # 使用正则表达式匹配"内容": "..."
    pattern = r'("内容"\s*:\s*")([^"]*\\n[^"]*)(")'
    
    def replace_newlines(match):
        prefix = match.group(1)
        text = match.group(2)
        suffix = match.group(3)
        
        # 将\n替换为真正的换行符
        text = text.replace('\\n', '\n')
        return prefix + text + suffix
    
    new_content = re.sub(pattern, replace_newlines, content, flags=re.DOTALL)
    
    if new_content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    
    return False

def main():
    """主函数"""
    print("直接替换JSON文件中的\\n为真正换行符...")
    print("警告：这将创建非标准JSON文件")
    
    if not os.path.exists(RULES_DIR):
        print(f"目录不存在: {RULES_DIR}")
        return
    
    files = os.listdir(RULES_DIR)
    json_files = [f for f in files if f.endswith('.json')]
    
    fixed_count = 0
    for filename in json_files:
        filepath = os.path.join(RULES_DIR, filename)
        print(f"处理: {filename}")
        
        try:
            if process_file(filepath):
                print(f"  已修复")
                fixed_count += 1
            else:
                print(f"  无需修改")
        except Exception as e:
            print(f"  错误: {e}")
    
    print(f"\n完成！处理了 {len(json_files)} 个文件，修复了 {fixed_count} 个文件")

if __name__ == "__main__":
    main()