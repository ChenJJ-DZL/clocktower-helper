#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
解析剧本内容，按照指定结构重新组织 - 版本2
"""

import os
import sys
import json
import re

def parse_play_raw_data(play_data):
    """从原始采集数据解析剧本内容"""
    raw_content = play_data['content']['内容']
    lines = raw_content.split('\n')
    
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
        if "难度：" in line:
            diff_part = line.split("难度：")[1].split("。")[0].strip()
            result['难度'] = diff_part
            break
    
    # 解析背景故事
    background_lines = []
    in_background = True
    for line in lines:
        if "难度：" in line or "在《" in line or "当你游玩《" in line:
            in_background = False
        if in_background and line.strip():
            background_lines.append(line.strip())
    result['背景故事'] = '\n'.join(background_lines).strip()
    
    # 解析简要介绍
    intro_lines = []
    in_intro = False
    for line in lines:
        if "在《" in line or "当你游玩《" in line:
            in_intro = True
        if "检查所有玩家是否闭上眼睛" in line or re.match(r'^[\u4e00-\u9fa5]{2,4}$', line.strip()):
            break
        if in_intro and line.strip() and not "（注：" in line:
            intro_lines.append(line.strip())
    result['简要介绍'] = '\n'.join(intro_lines).strip()
    
    # 解析角色列表
    role_types = {
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
        if not line or len(line) > 6:
            continue
        for role_type, roles in role_types.items():
            if line in roles and line not in result['角色列表'][role_type]:
                result['角色列表'][role_type].append(line)
                break
    
    # 解析夜晚顺序
    night_sections = []
    current_section = []
    for line in lines:
        if "检查所有玩家是否闭上眼睛" in line:
            if current_section:
                night_sections.append(current_section)
            current_section = [line.strip()]
        elif current_section:
            if "等待数秒。让所有玩家睁眼" in line:
                current_section.append(line.strip())
                night_sections.append(current_section)
                current_section = []
            else:
                current_section.append(line.strip())
    
    if len(night_sections) >= 1:
        result['夜晚顺序表']['首个夜晚'] = night_sections[0]
    if len(night_sections) >= 2:
        result['夜晚顺序表']['其他夜晚'] = night_sections[1]
    
    return result

def process_all_plays():
    """处理所有原始剧本文件"""
    input_dir = "json/play"
    output_dir = "json/play"
    os.makedirs(output_dir, exist_ok=True)
    
    # 先读取all_plays.json的原始数据
    all_plays_path = os.path.join(input_dir, "all_plays.json")
    with open(all_plays_path, 'r', encoding='utf-8') as f:
        all_raw_plays = json.load(f)
    
    parsed_plays = []
    
    for raw_play in all_raw_plays:
        print(f"处理: {raw_play['名称']}")
        parsed = parse_play_raw_data(raw_play)
        parsed_plays.append(parsed)
        
        # 保存单个文件
        output_file = os.path.join(output_dir, f"{parsed['剧本名称']}.json")
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(parsed, f, ensure_ascii=False, indent=2)
    
    # 保存合并后的文件
    with open(all_plays_path, 'w', encoding='utf-8') as f:
        json.dump(parsed_plays, f, ensure_ascii=False, indent=2)
    
    print(f"\n所有剧本处理完成，共 {len(parsed_plays)} 个剧本")
    return parsed_plays

if __name__ == "__main__":
    process_all_plays()
