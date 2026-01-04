#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
修复编码错误导致的乱码 - 最终版本
直接替换已知的乱码模式
"""
import sys
import re

def fix_encoding_errors(file_path):
    """修复文件中的编码错误"""
    try:
        # 读取文件（使用 UTF-8，忽略错误）
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
        
        modified = False
        new_lines = []
        
        for line in lines:
            original_line = line
            
            # 修复 ?精神病患? -> 号【精神病患者】
            # 匹配模式：${sourceId+1}?精神病患? 或 ${targetId+1}?精神病患?
            line = re.sub(r'(\$\{[^}]+\}\+1)[?]精神病患[?]', r'\1号【精神病患者】', line)
            line = re.sub(r'(\$\{[^}]+\}\+1)[?]精神病患[?]', r'\1号【精神病患者】', line)
            
            # 修复 ${seat.id+1}?精神病患? -> ${seat.id+1}号【精神病患者】
            line = re.sub(r'(\$\{seat\.id\+1\})[?]精神病患[?]', r'\1号【精神病患者】', line)
            
            # 修复 杀? -> 杀死
            line = re.sub(r'杀[?]', '杀死', line)
            line = re.sub(r'杀[?]', '杀死', line)
            
            # 修复 打?{ -> 打平${
            line = re.sub(r'打[?]\{', '打平${', line)
            line = re.sub(r'打[?]\{', '打平${', line)
            
            # 修复 已用完? -> 已用完。
            line = re.sub(r'已用完[?]', '已用完。', line)
            line = re.sub(r'已用完[?]', '已用完。', line)
            
            # 修复其他 ? 和 ? 乱码（在特定上下文中）
            # 如果 ? 出现在数字后面，可能是"号"的乱码
            line = re.sub(r'(\d+)[?]', r'\1号', line)
            line = re.sub(r'(\d+)[?]', r'\1号', line)
            
            if line != original_line:
                modified = True
            
            new_lines.append(line)
        
        # 如果内容有变化，写回文件
        if modified:
            with open(file_path, 'w', encoding='utf-8', newline='') as f:
                f.writelines(new_lines)
            print(f"已修复 {file_path}")
            return True
        else:
            print(f"{file_path} 无需修复")
            return False
            
    except Exception as e:
        print(f"处理 {file_path} 时出错: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    files_to_fix = [
        'app/page.tsx',
        'app/data.ts'
    ]
    
    for file_path in files_to_fix:
        fix_encoding_errors(file_path)

