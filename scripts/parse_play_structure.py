#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
解析剧本内容，按照指定结构重新组织
"""

import os
import sys
import json
import re
from urllib.parse import urlencode

def parse_play_content(play_data):
    """解析剧本内容，按指定结构组织"""
    content = play_data['content']['内容']
    lines = content.split('\n')
    
    result = {
        "id": play_data['id'],
        "剧本名称": play_data['名称'],
        "难度": "",
        "背景故事": "",
        "简要介绍": "",
        "角色列表": {
            "镇民": [],
            "外来者": [],
            "爪牙": [],
            "恶魔": [],
            "旅行者": []
        },
        "夜晚顺序表": {
            "首个夜晚": [],
            "其他夜晚": []
        },
        "url": play_data['url'],
        "metadata": play_data['metadata']
    }
    
    # 解析难度
    for line in lines:
        if line.startswith("难度："):
            result['难度'] = line.replace("难度：", "").split("。")[0].strip()
            break
    
    # 解析背景故事和简要介绍
    background = []
    intro = []
    in_background = True
    
    for line in lines:
        if line.startswith("难度："):
            in_background = False
            continue
        if line.startswith("当你游玩《"):
            in_background = False
            intro.append(line)
            continue
        if line.startswith("在《") and "中，" in line:
            intro.append(line)
            continue
        
        if in_background and line.strip():
            background.append(line)
        elif not in_background and line.strip() and not re.match(r'^[\u4e00-\u9fa5]{2,4}$', line.strip()) and not line.startswith("检查所有玩家") and not line.startswith("（注：") and not ("：展示" in line and "信息标记" in line) and not "标记那名玩家" in line:
            intro.append(line)
    
    result['背景故事'] = '\n'.join(background).strip()
    result['简要介绍'] = '\n'.join(intro).strip()
    
    # 解析角色列表
    # 基础角色分组
    role_groups = {
        "镇民": ["洗衣妇", "图书管理员", "调查员", "厨师", "共情者", "占卜师", "送葬者", "僧侣", "守鸦人", "贞洁者", "猎手", "士兵", "镇长", 
                 "祖母", "水手", "侍女", "驱魔人", "旅店老板", "赌徒", "造谣者", "侍臣", "教授", "吟游诗人", "茶艺师", "和平主义者", "弄臣",
                 "钟表匠", "筑梦师", "舞蛇人", "数学家", "卖花女孩", "城镇公告员", "神谕者", "博学者", "女裁缝", "哲学家", "艺术家", "杂耍艺人", "贤者"],
        "外来者": ["管家", "酒鬼", "陌客", "圣徒", "修补匠", "月之子", "莽夫", "疯子", "畸形秀演员", "心上人", "理发师", "呆瓜", "镜像双子"],
        "爪牙": ["投毒者", "间谍", "红唇女郎", "男爵", "教父", "魔鬼代言人", "刺客", "主谋", "女巫", "洗脑师", "麻脸巫婆"],
        "恶魔": ["小恶魔", "僵怖", "普卡", "沙巴洛斯", "珀", "方古", "亡骨魔", "诺-达鲺", "涡流"],
        "旅行者": ["官员", "乞丐", "枪手", "窃贼", "替罪羊", "唱诗男孩", "国王", "将军", "气球驾驶员", "赏金猎人", "守夜人", "小精灵", "异教领袖", "告密者", "哥布林", "提线木偶", "炸弹人"]
    }
    
    for line in lines:
        line = line.strip()
        if not line or len(line) > 6 or line.startswith("（注："):
            continue
        
        for group, roles in role_groups.items():
            if line in roles:
                if line not in result['角色列表'][group]:
                    result['角色列表'][group].append(line)
                break
    
    # 解析夜晚顺序
    in_first_night = False
    in_other_night = False
    first_night = []
    other_night = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        if "检查所有玩家是否闭上眼睛" in line:
            if not in_first_night and not in_other_night:
                in_first_night = True
                first_night.append(line)
            elif in_first_night:
                in_first_night = False
                in_other_night = True
                other_night.append(line)
            continue
        
        if in_first_night:
            first_night.append(line)
        elif in_other_night:
            other_night.append(line)
    
    result['夜晚顺序表']['首个夜晚'] = first_night
    result['夜晚顺序表']['其他夜晚'] = other_night
    
    return result

def process_all_plays():
    """处理所有剧本文件"""
    input_dir = "json/play"
    output_dir = "json/play"
    os.makedirs(output_dir, exist_ok=True)
    
    # 读取所有剧本文件
    play_files = [f for f in os.listdir(input_dir) if f.endswith('.json') and f != 'all_plays.json']
    
    all_plays = []
    
    for file in play_files:
        input_path = os.path.join(input_dir, file)
        print(f"处理: {input_path}")
        
        with open(input_path, 'r', encoding='utf-8') as f:
            play_data = json.load(f)
        
        parsed_data = parse_play_content(play_data)
        all_plays.append(parsed_data)
        
        # 保存单个剧本
        output_path = os.path.join(output_dir, file)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(parsed_data, f, ensure_ascii=False, indent=2)
        
        print(f"  完成: {parsed_data['剧本名称']}")
    
    # 保存合并文件
    all_plays_path = os.path.join(output_dir, 'all_plays.json')
    with open(all_plays_path, 'w', encoding='utf-8') as f:
        json.dump(all_plays, f, ensure_ascii=False, indent=2)
    
    print(f"\n所有剧本处理完成，共 {len(all_plays)} 个剧本")
    return all_plays

if __name__ == "__main__":
    process_all_plays()
