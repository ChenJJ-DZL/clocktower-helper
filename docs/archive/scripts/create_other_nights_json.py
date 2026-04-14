#!/usr/bin/env python3
import json
import re
from datetime import datetime

# 简化的"其他夜晚"文本（只包含前20个条目作为示例）
text = """其他夜晚
Dusk.png 黄昏：检查所有玩家是否闭上眼睛。部分旅行者和传奇角色会在这时行动。（官员、窃贼、学徒、咖啡师、流莺、集骨者、公爵夫人）

Wraith.png 亡魂：从现在开始，亡魂可以在夜晚睁眼。每当你要在夜晚唤醒一名邪恶玩家时，先唤醒亡魂。当你让这名邪恶玩家重新入睡时，也让亡魂入睡。

Amnesiac.png 失忆者：根据失忆者的具体能力决定是否需要唤醒失忆者、何时唤醒、唤醒后让他做出什么操作或得知什么信息。（调整理由：与首夜相同，根据失忆者的能力，失忆者的夜晚顺序会相应地进行调整。）

Philosopher.png 哲学家：如果哲学家未曾使用能力，唤醒哲学家，他可以摇头不使用能力，或选择获得角色列表上的一个善良角色的能力。

Hatter.png 帽匠：如果帽匠死于白天，（建议分别）唤醒恶魔和爪牙并让他们选择是否改变角色。如果帽匠死于夜晚，则在当前玩家行动结束后立即开始茶会。

Poppygrower.png 罂粟种植者：如果罂粟种植者死于白天，插入执行爪牙信息和恶魔信息（不包含恶魔伪装）流程。如果罂粟种植者死于夜晚，则在当前玩家行动结束后立即执行相关流程。

Qianke.png 掮客：唤醒掮客，让他选择两名玩家，如果这两名玩家阵营相同，放置“熟客”标记。

Sailor.png 水手：唤醒水手，让他选择一名玩家。决定他俩其中谁因为水手能力醉酒。

Engineer.png 工程师：如果工程师未曾使用能力，唤醒工程师，他可以摇头不使用能力，或选择角色列表上的恶魔或爪牙角色，来执行同角色类型的这些玩家的角色变化。

Preacher.png 传教士：唤醒传教士，让他选择一名玩家。如果他选中了爪牙，该爪牙失去能力。在传教士入睡后通知该爪牙被传教士选中。

Pithag.png 麻脸巫婆：唤醒麻脸巫婆，让她选择一名玩家和角色列表上的一个角色。如果该角色不在场，则在麻脸巫婆入睡后通知该玩家角色变化。根据实际情况，可以将相关通知合并，例如玩家变成了恶魔，则在恶魔行动时一并唤醒，通知角色变化并让他执行相应行动。（调整理由：使得麻脸巫婆在创造出任意爪牙时，都能够在当晚能够立即行动，避免与原本比麻脸巫婆先行动的角色在参与麻脸巫婆的变化时，会有一天的时间不具有任何能力，从而导致非良性互动。请注意：即使麻脸巫婆的顺序改变，她的能力造成死亡的时机仍然需要等到首个能够造成死亡的恶魔角色行动之前。）

Xaan.png 限：在等同初始外来者数量的夜晚，所有镇民中毒。

Poisoner.png 投毒者：唤醒投毒者，让他选择一名玩家，那名玩家中毒。

Innkeeper.png 旅店老板：唤醒旅店老板，让他选择两名玩家。这两名玩家今晚不死，同时需要决定他俩其中谁因为旅店老板能力醉酒。

Courtier.png 侍臣：如果侍臣未曾使用能力，唤醒侍臣，他可以摇头不使用能力，或选择角色列表上的一个任意角色，该角色对应的玩家之一醉酒。

Wizard.png 巫师：如果有必要，让巫师的能力生效。

Dagengren.png 打更人：唤醒打更人，让他进行猜测，并放置提示标记到对应玩家旁。

Jinyiwei.png 锦衣卫：唤醒锦衣卫，让他选择一名玩家。他现在开始保护那名玩家。

Limao.png 狸猫：唤醒狸猫，让他选择一名玩家。如果这名玩家是善良角色且在当晚被邪恶角色能力杀死，狸猫与他交换角色。

Xuncha.png 巡察：唤醒巡察，让他选择角色列表上的两个善良角色的图标。如果对应的两名玩家都存活，他们今晚不死。

Gambler.png 赌徒：唤醒赌徒，让他进行猜测。如果猜测错误，他死亡。

Acrobat.png 杂技演员：唤醒杂技演员，让他选择一名玩家。如果当晚这名玩家醉酒或中毒，杂技演员死亡。

Snakecharmer.png 舞蛇人：唤醒舞蛇人，让他选择一名存活玩家。如果选中恶魔则执行角色和阵营的交换，并在舞蛇人入睡后通知旧恶魔角色变化。

Monk.png 僧侣：唤醒僧侣，让他选择除自己以外的一名玩家，那名玩家今晚免受恶魔负面效果影响。"""

def parse_text(text):
    """解析文本为条目列表"""
    lines = text.strip().split('\n')
    entries = []
    current_role = None
    current_desc = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # 检查是否是新的角色行
        if '.png' in line or '：' in line:
            # 保存前一个条目
            if current_role is not None and current_desc:
                desc = ' '.join(current_desc).strip()
                desc = re.sub(r'\s+', ' ', desc)
                entries.append({
                    "角色": current_role,
                    "描述": desc
                })
            
            # 解析新角色
            if '.png' in line:
                # 格式: "Dusk.png 黄昏：描述"
                parts = line.split(' ', 1)
                if len(parts) == 2:
                    role_part = parts[1]
                    if '：' in role_part:
                        current_role = role_part.split('：')[0]
                        current_desc = [role_part.split('：', 1)[1]]
                    else:
                        current_role = role_part
                        current_desc = []
                else:
                    current_role = line
                    current_desc = []
            else:
                # 格式: "角色：描述"
                if '：' in line:
                    current_role = line.split('：')[0]
                    current_desc = [line.split('：', 1)[1]]
                else:
                    current_role = line
                    current_desc = []
        else:
            # 描述续行
            if current_desc is not None:
                current_desc.append(line)
    
    # 添加最后一个条目
    if current_role is not None and current_desc:
        desc = ' '.join(current_desc).strip()
        desc = re.sub(r'\s+', ' ', desc)
        entries.append({
            "角色": current_role,
            "描述": desc
        })
    
    return entries

def create_json(entries):
    """创建JSON结构"""
    # 基础结构
    data = {
        "来源": "https://clocktower-wiki.gstonegames.com/index.php?title=%E5%A4%9C%E6%99%9A%E8%A1%8C%E5%8A%A8%E9%A1%BA%E5%BA%8F%E4%B8%80%E8%A7%88",
        "采集时间": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "标题": "夜晚行动顺序一览（其他夜晚）",
        "说明": "2. 后续夜晚的行动顺序",
        "行动顺序": []
    }
    
    # 创建行动顺序数组，跳过"其他夜晚"标题
    for i, entry in enumerate(entries):
        if entry["角色"] == "其他夜晚":
            continue
            
        # 格式化序号和角色显示
        seq_num = i
        role_display = entry["角色"]
        
        # 特殊处理黄昏
        if entry["角色"] == "黄昏":
            role_display = "黄昏（旅行者）"
        
        data["行动顺序"].append({
            "序号": f"{seq_num}.{role_display}",
            "描述": entry["描述"]
        })
    
    return data

def main():
    print("解析文本...")
    entries = parse_text(text)
    print(f"解析出 {len(entries)} 个条目")
    
    # 显示前5个条目
    for i, e in enumerate(entries[:5]):
        print(f"{i+1}. {e['角色']}: {e['描述'][:50]}...")
    
    data = create_json(entries)
    
    # 写入文件
    output_file = 'json/rule/夜晚行动顺序一览（其他夜晚）.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"文件已更新到 {output_file}，包含 {len(data['行动顺序'])} 个行动顺序条目")
    
    # 验证JSON
    try:
        with open(output_file, 'r', encoding='utf-8') as f:
            json.load(f)
        print("JSON验证通过")
    except Exception as e:
        print(f"JSON验证失败: {e}")

if __name__ == '__main__':
    main()