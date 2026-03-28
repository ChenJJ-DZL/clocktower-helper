#!/usr/bin/env python3
"""
修复规则文件中的控制字符
"""
import os
import re
import sys

def remove_bad_chars(text):
    """移除JSON不允许的控制字符"""
    # JSON允许的控制字符: \b, \f, \n, \r, \t
    # 我们需要保留这些，移除其他（0x00-0x1F中除了上面提到的）
    # 简单方法：用空格替换所有控制字符，但保留 \n, \r, \t
    result = []
    for char in text:
        code = ord(char)
        if code < 32 and char not in '\n\r\t':
            # 替换为空格
            result.append(' ')
        else:
            result.append(char)
    return ''.join(result)

def process_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 检查是否有坏字符
        bad_chars = []
        for i, char in enumerate(content):
            code = ord(char)
            if code < 32 and char not in '\n\r\t':
                bad_chars.append((i, code, char))
        
        if bad_chars:
            print(f"  发现 {len(bad_chars)} 个坏字符")
            # 显示前几个
            for i, code, char in bad_chars[:3]:
                print(f"    位置 {i}: 代码 {code} (0x{code:02x})")
        
        cleaned = remove_bad_chars(content)
        
        # 写回文件
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(cleaned)
        
        # 验证JSON
        import json
        try:
            json.loads(cleaned)
            print("  验证通过")
            return True
        except json.JSONDecodeError as e:
            print(f"  JSON验证失败: {e}")
            return False
            
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