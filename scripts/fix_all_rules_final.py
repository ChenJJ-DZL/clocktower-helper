#!/usr/bin/env python3
"""
最终修复所有规则文件：移除控制字符并确保JSON有效性
"""
import os
import json
import re
import sys

def fix_file(filepath):
    try:
        # 读取原始字节
        with open(filepath, 'rb') as f:
            raw = f.read()
        
        # 解码为UTF-8，忽略错误
        content = raw.decode('utf-8', errors='ignore')
        
        # 方法1：尝试直接解析
        try:
            data = json.loads(content)
            # 如果成功，检查是否需要重新格式化
            # 确保内容字段有正确的换行符
            if isinstance(data, dict) and '内容' in data:
                # 确保是字符串
                if isinstance(data['内容'], str):
                    # 替换 \\n 为 \n（如果还有转义序列）
                    data['内容'] = data['内容'].replace('\\n', '\n')
            # 写回文件，使用标准JSON格式化
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return True
        except json.JSONDecodeError as e:
            # 方法2：尝试修复控制字符
            # 移除所有控制字符（除了 \n, \r, \t）
            def replace_control(match):
                ch = match.group(0)
                if ch in '\n\r\t':
                    return ch
                return ' '
            
            # 使用正则替换
            cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', replace_control, content)
            
            try:
                data = json.loads(cleaned)
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                return True
            except json.JSONDecodeError as e2:
                print(f"  第二次解析失败: {e2}")
                # 方法3：尝试逐行修复
                lines = content.split('\n')
                fixed_lines = []
                for line in lines:
                    # 移除行中的控制字符
                    line = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', ' ', line)
                    fixed_lines.append(line)
                fixed_content = '\n'.join(fixed_lines)
                try:
                    data = json.loads(fixed_content)
                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    return True
                except json.JSONDecodeError as e3:
                    print(f"  最终解析失败: {e3}")
                    # 作为最后的手段，创建一个有效的JSON骨架
                    print(f"  创建备份并生成简单版本")
                    # 备份原文件
                    backup = filepath + '.bak'
                    with open(backup, 'wb') as f:
                        f.write(raw)
                    # 创建简单版本
                    simple = {
                        "来源": "https://clocktower-wiki.gstonegames.com",
                        "采集时间": "2026-03-28",
                        "标题": os.path.basename(filepath).replace('.json', ''),
                        "内容": "[内容解析错误，请查看原始文件]"
                    }
                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump(simple, f, ensure_ascii=False, indent=2)
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
        if fix_file(filepath):
            success += 1
            print("  成功")
        else:
            print("  失败")
    
    print(f"\n完成: {success}/{len(files)} 个文件成功处理")
    
    # 验证所有文件
    print("\n验证所有文件...")
    valid = 0
    for file in files:
        filepath = os.path.join(rule_dir, file)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                json.load(f)
            valid += 1
        except:
            print(f"  {file} 验证失败")
    
    print(f"验证通过: {valid}/{len(files)}")
    return 0 if valid == len(files) else 1

if __name__ == '__main__':
    sys.exit(main())