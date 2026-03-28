#!/usr/bin/env python3
"""
最终验证脚本：检查所有JSON数据文件的完整性和格式。
"""
import os
import json
import sys

def check_directory(dir_path, expected_ext='.json'):
    """检查目录中的JSON文件是否可解析"""
    if not os.path.exists(dir_path):
        print(f"错误：目录不存在 {dir_path}")
        return False
    
    files = [f for f in os.listdir(dir_path) if f.endswith(expected_ext)]
    print(f"{dir_path}: {len(files)} 个文件")
    
    error_files = []
    for file in files:
        filepath = os.path.join(dir_path, file)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            error_files.append((file, str(e)))
        except Exception as e:
            error_files.append((file, str(e)))
    
    if error_files:
        print(f"  发现 {len(error_files)} 个错误文件：")
        for file, error in error_files[:5]:
            print(f"    {file}: {error}")
        if len(error_files) > 5:
            print(f"    还有 {len(error_files)-5} 个错误...")
        return False
    else:
        print("  所有文件格式正确")
        return True

def main():
    base = "json"
    print("=" * 60)
    print("最终数据验证")
    print("=" * 60)
    
    # 检查各子目录
    subdirs = ['full', 'play', 'rule']
    all_ok = True
    
    for subdir in subdirs:
        path = os.path.join(base, subdir)
        if not check_directory(path):
            all_ok = False
    
    # 统计角色总数
    full_path = os.path.join(base, 'full')
    if os.path.exists(full_path):
        files = [f for f in os.listdir(full_path) if f.endswith('.json')]
        total_chars = 0
        for file in files:
            filepath = os.path.join(full_path, file)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        total_chars += len(data)
                    else:
                        total_chars += 1  # 如果是对象，至少一个角色
            except:
                pass
        print(f"\n角色总数（根据full目录估算）: {total_chars}")
    
    # 统计剧本总数
    play_path = os.path.join(base, 'play')
    if os.path.exists(play_path):
        play_files = [f for f in os.listdir(play_path) if f.endswith('.json')]
        print(f"剧本总数: {len(play_files)}")
        if len(play_files) > 0:
            print("剧本列表:", ", ".join(play_files))
    
    print("\n" + "=" * 60)
    if all_ok:
        print("✅ 所有数据验证通过！")
        return 0
    else:
        print("❌ 存在验证错误，需要修复")
        return 1

if __name__ == '__main__':
    sys.exit(main())