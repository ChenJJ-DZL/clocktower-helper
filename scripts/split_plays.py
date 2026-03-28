#!/usr/bin/env python3
import json
import os

def split_plays():
    """将all_plays.json拆分为每个剧本单独的JSON文件"""
    input_path = "json/play/all_plays.json"
    output_dir = "json/play"
    
    # 确保输出目录存在
    os.makedirs(output_dir, exist_ok=True)
    
    # 读取all_plays.json
    with open(input_path, 'r', encoding='utf-8') as f:
        plays = json.load(f)
    
    print(f"找到 {len(plays)} 个剧本")
    
    # 定义剧本文件名映射
    play_name_mapping = {
        "暗流涌动": "暗流涌动.json",
        "黯月初升": "黯月初升.json",
        "梦殒春宵": "梦殒春宵.json",
        "华灯初上": "华灯初上.json"
    }
    
    saved_plays = []
    
    for play in plays:
        name = play.get("name", "")
        if name in play_name_mapping:
            filename = play_name_mapping[name]
            output_path = os.path.join(output_dir, filename)
            
            # 将单个剧本保存为JSON数组
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump([play], f, ensure_ascii=False, indent=2)
            
            print(f"[OK] 已保存: {name} -> {filename}")
            saved_plays.append(name)
    
    # 检查缺少的剧本
    expected_plays = [
        "暗流涌动",
        "黯月初升", 
        "梦殒春宵",
        "游园惊梦",
        "无名之墓",
        "凶宅魅影",
        "无上愉悦",
        "窃窃私语"
    ]
    
    missing_plays = [p for p in expected_plays if p not in saved_plays]
    
    if missing_plays:
        print(f"\n[WARN] 缺少以下剧本: {', '.join(missing_plays)}")
    else:
        print("\n[OK] 所有剧本都已保存")
    
    # 更新all_plays.json，确保包含所有8个剧本（如果需要的话）
    print("\n现有剧本:")
    for p in saved_plays:
        print(f"  - {p}")

if __name__ == "__main__":
    split_plays()
