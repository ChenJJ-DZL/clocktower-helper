#!/usr/bin/env python3
import json
import re

# 用户提供的完整文本
text = """首个夜晚
Dusk.png 黄昏：检查所有玩家是否闭上眼睛。部分旅行者和传奇角色会在这时行动。（官员、窃贼、学徒、咖啡师）

Lordoftyphon.png 堤丰之首：将位于堤丰之首两侧的对应数量的玩家变成邪恶的爪牙，并分别唤醒他们通知他们的角色和阵营变化。

Wraith.png 亡魂：从现在开始，亡魂可以在夜晚睁眼。每当你要在夜晚唤醒一名邪恶玩家时，先唤醒亡魂。当你让这名邪恶玩家重新入睡时，也让亡魂入睡。

Boffin.png 科学怪人：（分别或同时）唤醒科学怪人和恶魔，通知他们恶魔因为科学怪人而获得的善良角色的能力。

Amnesiac.png 失忆者：决定失忆者的能力，并根据具体能力决定是否需要唤醒失忆者、何时唤醒、唤醒后让他做出什么操作或得知什么信息。（调整理由：根据失忆者的能力，失忆者的夜晚顺序会相应地进行调整。因此，将失忆者放在夜晚顺序的最开始部分，以便提醒说书人在此时决定失忆者的唤醒时机，并在当晚的合适时机下唤醒失忆者并令其进行行动。）

Philosopher.png 哲学家：唤醒哲学家，他可以摇头不使用能力，或选择获得角色列表上的一个善良角色的能力。

Alchemist.png 炼金术士：唤醒炼金术士，对他展示他获得的能力所对应的爪牙角色标记。

Poppygrower.png 罂粟种植者：如果罂粟种植者在场，跳过今晚的爪牙信息和恶魔信息环节。

Kazali.png 卡扎力：唤醒卡扎力，让他选择玩家变成邪恶爪牙。

Magician.png 魔术师：如果魔术师在场，则需要对爪牙信息环节和恶魔信息环节的相关内容进行调整。（添加理由：在爪牙信息开始前添加魔术师的行动顺序，用以提醒说书人在提供给爪牙和恶魔信息时，不要出错。因为魔术师与罂粟种植者同属对首夜邪恶信息的干扰，因此将魔术师的行动放在了这里。）

Mi.png 爪牙信息：如果有七名或更多玩家，唤醒所有爪牙：展示“他是恶魔”信息标记。指向恶魔。如果下方的其他对爪牙暴露的角色在场，不要让爪牙入睡，而是一并给出相关信息后再让爪牙入睡。

Snitch.png 告密者：如果告密者在场，对爪牙展示三个不在场的善良角色标记。

Damsel.png 落难少女：如果落难少女在场，对爪牙展示落难少女角色标记。（调整理由：原本的落难少女行动顺序只涉及到巡山人相关，而巡山人的夜晚行动中本身已经提示了说书人需要对落难少女进行角色变更和唤醒操作，故原本的落难少女行动提示略显累赘。因为落难少女本身具有对爪牙的暴露能力，因此将其首夜行动调整到这里，并删除其他夜晚行动，同时也可以对“暴露角色”相关能力解释优化以便于理解。）

Summoner.png 召唤师：唤醒召唤师，对他展示三个不在场的善良角色标记。

Lunatic.png 疯子：唤醒疯子并向他提供恶魔信息。如可能，则让疯子进行相应的恶魔行动。随后在恶魔信息环节对恶魔提供疯子的相关信息。

Taowu.png 梼杌：如果梼杌在场，跳过他的恶魔信息环节。

Di.png 恶魔信息：如果有七名或更多玩家，唤醒恶魔：展示“他们是你的爪牙”信息标记。指向所有爪牙。展示“这些角色不在场”信息标记。展示三个不在场的善良角色。如果其他对恶魔暴露的角色在场，不要让恶魔入睡，而是一并给出相关信息后再让恶魔入睡。

King.png 国王：如果国王在场，对恶魔展示国王角色标记并指向国王玩家。

Marionette.png 提线木偶：如果提线木偶在场，对恶魔展示提线木偶角色标记并指向提线木偶玩家。（调整理由：与疯子和国王同属暴露给恶魔的角色，因此调整顺序使得说书人方便一次性向恶魔展示所有信息。）

Shusheng.png 书生：如果书生在场，对恶魔展示书生角色标记。

Xizi.png 戏子：唤醒所有戏子并让他们互认。

Qianke.png 掮客：唤醒掮客，让他选择两名玩家，如果这两名玩家阵营相同，放置“熟客”标记。

Sailor.png 水手：唤醒水手，让他选择一名玩家。决定他俩其中谁因为水手能力醉酒。

Engineer.png 工程师：唤醒工程师，他可以摇头不使用能力，或选择角色列表上的恶魔或爪牙角色，来执行同角色类型的这些玩家的角色变化。

Preacher.png 传教士：唤醒传教士，让他选择一名玩家。如果他选中了爪牙，该爪牙失去能力。在传教士入睡后通知该爪牙被传教士选中。

Lilmonsta.png 小怪宝：唤醒所有爪牙选择由谁照看小怪宝。

Lleech.png 痢蛭：唤醒痢蛭，让他选择一名玩家以寄生。

Huapi.png 画皮：唤醒画皮，让他攻击一名存活玩家，该玩家变成活尸。

Xaan.png 限：在等同初始外来者数量的夜晚，所有镇民中毒。

Poisoner.png 投毒者：唤醒投毒者，让他选择一名玩家，那名玩家中毒。

Widow.png 寡妇：唤醒寡妇，让她查看魔典。在她查看完毕后让她选择一名玩家，那名玩家中毒。随后如果寡妇未醉酒中毒，唤醒一名善良玩家，对他展示寡妇角色标记。

Courtier.png 侍臣：唤醒侍臣，他可以摇头不使用能力，或选择角色列表上的一个任意角色，该角色对应的玩家之一醉酒。

Wizard.png 巫师：如果有必要，让巫师的能力生效。

Snakecharmer.png 舞蛇人：唤醒舞蛇人，让他选择一名存活玩家。如果选中恶魔则执行角色和阵营的交换，并在舞蛇人入睡后通知旧恶魔角色变化。

Godfather.png 教父：唤醒教父，对他展示外来者角色标记，告诉他有哪些外来者在场。

Organgrinder.png 街头风琴手：让街头风琴手选择自己是否醉酒。如果他点头，标记街头风琴手醉酒。

Devilsadvocate.png 魔鬼代言人：唤醒魔鬼代言人，让他选择一名玩家，那名玩家处决不死。

Eviltwin.png 镜像双子：分别独自唤醒镜像双子和对立双子，告知他们由于镜像双子能力而得知的信息。

Witch.png 女巫：唤醒女巫，让她选择一名玩家，那名玩家被诅咒。

Cerenovus.png 洗脑师：唤醒洗脑师，让他选择一名玩家和角色列表上的一个善良角色，那名玩家明天需要“疯狂”证明自己是那个角色。在洗脑师入睡后通知那名玩家被洗脑。

Fearmonger.png 恐惧之灵：唤醒恐惧之灵，让他选择一名玩家，随后通知所有玩家恐惧之灵选择了一名玩家。

Harpy.png 鹰身女妖：唤醒鹰身女妖，让她选择两名玩家，第一名玩家明天需要“疯狂”证明第二名玩家邪恶。在鹰身女妖入睡后通知第一名玩家被鹰身女妖选中。

Mezepheles.png 灵言师：唤醒灵言师，对他展示他的关键词。

Humeiniang.png 狐媚娘：唤醒狐媚娘，让她选择一名玩家。在狐媚娘入睡后通知那名玩家狐媚娘在场。

Pukka.png 普卡：唤醒普卡，让他选择一名玩家，那名玩家中毒。

Yaggababble.png 牙噶巴卜：唤醒牙噶巴卜，对他展示他的秘密短语。

Niangjiushi.png 酿酒师：唤醒酿酒师，让他选择角色列表上的一个镇民角色并让他给出信息。

Yongjiang.png 俑匠：唤醒俑匠，让他选择一名玩家，如果那名玩家是善良的且没有邪恶玩家死亡，俑匠和他都只会死于处决。

Xionghaizi.png 熊孩子：唤醒熊孩子，让他选择角色列表上的一个镇民角色，该角色会产生错误信息。

Pixie.png 小精灵：唤醒小精灵，对他展示一个在场镇民角色标记。

Huntsman.png 巡山人：唤醒巡山人，他可以摇头不使用能力，或选择一名玩家。如果巡山人选中了落难少女，则在巡山人入睡后通知落难少女角色变化。

Washerwoman.png 洗衣妇：唤醒洗衣妇，对她指向两名玩家，并展示一个镇民角色标记。这两名玩家其中之一是这个镇民。

Librarian.png 图书管理员：唤醒图书管理员，对他指向两名玩家，并展示一个外来者角色标记。这两名玩家其中之一是这个外来者。

Investigator.png 调查员：唤醒调查员，对他指向两名玩家，并展示一个爪牙角色标记。这两名玩家其中之一是这个爪牙。

Chef.png 厨师：唤醒厨师，对他用手势比划数字来告知他邻座邪恶玩家有几对。

Empath.png 共情者：唤醒共情者，对他用手势比划数字来告知他与他邻近的存活玩家中有几人是邪恶玩家。

Fortuneteller.png 占卜师：唤醒占卜师，让他选择两名玩家。以点头或摇头告知他是否选中了恶魔。

Butler.png 管家：唤醒管家，让他选择一名除自己以外的玩家，那名玩家成为他的主人。

Nichen.png 逆臣：唤醒逆臣，让他选择一名除自己以外的玩家，那名玩家现在与他不共戴天。

Grandmother.png 祖母：唤醒祖母，对她指向一名善良玩家，并展示该玩家的角色标记。

Clockmaker.png 钟表匠：唤醒钟表匠，对他用手势比划数字来告知他恶魔与爪牙之间的最近距离。

Dreamer.png 筑梦师：唤醒筑梦师，让他选择一名除自己以外的非旅行者玩家。对他展示一善一恶两个角色标记。

Seamstress.png 女裁缝：唤醒女裁缝，她可以摇头不使用能力，或选择除自己以外的两名玩家。以点头或摇头告知她选择的玩家是否为同一阵营。

Steward.png 事务官：唤醒事务官，对他指向一名善良玩家。

Knight.png 骑士：唤醒骑士，对他指向两名非恶魔玩家。

Noble.png 贵族：唤醒贵族，对他指向三名玩家。这三名玩家中有且仅有一名是邪恶玩家。

Balloonist.png 气球驾驶员：唤醒气球驾驶员，对他指向一名玩家。

Yinyangshi.png 阴阳师：唤醒阴阳师，对他展示两个善良角色和两个邪恶角色。

Langzhong.png 郎中：唤醒郎中，让他指向一名玩家。对郎中展示一个与该玩家能力相关的词语。

Dianxiaoer.png 店小二：唤醒店小二，对他指向两名善良玩家。

Villageidiot.png 村夫：唤醒村夫，让他指向一名玩家，用手势告诉他那名玩家的阵营。

Bountyhunter.png 赏金猎人：（在进入首个夜晚时立即通知赏金猎人转变的那个镇民他的阵营发生了变化）唤醒赏金猎人，对他指向一名邪恶玩家。

Nightwatchman.png 守夜人：唤醒守夜人，他可以摇头不使用能力，或选择一名玩家。如果守夜人选择了玩家，则在守夜人入睡后通知那名玩家谁是守夜人。

Cultleader.png 异教领袖：如果异教领袖的阵营发生了变化，将他唤醒并通知他最新阵营。

Spy.png 间谍：唤醒间谍，让他查看魔典。

Ogre.png 食人魔：唤醒食人魔，让他选择一名玩家。如果他选择了邪恶玩家，将他的角色标记在魔典中倒置以表示他转变为邪恶阵营。

Highpriestess.png 女祭司：唤醒女祭司，对她指向一名玩家。

Shugenja.png 修行者：唤醒修行者，对他指向对应方向来告知他最近的邪恶玩家的方向。

Qintianjian.png 钦天监：唤醒钦天监，对他指向对应方向来告知他最近的邪恶玩家的方向。

General.png 将军：唤醒将军，对他用手势比划当前的优势阵营。

Fangshi.png 方士：唤醒方士，让他选择一个数字。如果他选择了当晚对应的数字，向他展示对应数量在场的角色标记。

Chambermaid.png 侍女：唤醒侍女，让她选择两名除自己以外的存活玩家。用手势比划数字来告知她这些玩家中因自己能力而唤醒的玩家数量。

Yinluren.png 引路人：唤醒引路人，让他选择一至三名玩家，以点头或摇头告知他选择的玩家中是否有玩家在当晚被邪恶玩家的能力选择或影响过。

Mathematician.png 数学家：唤醒数学家，用手势比划数字来告诉他今天有多少玩家的能力未正常生效。

Dawn.png 黎明：等待数秒。让所有玩家睁眼。

Leviathan.png 利维坦：如果利维坦在场，告知所有人利维坦在场，现在是第一个白天。

Vizier.png 维齐尔：如果维齐尔在场，告知所有人谁是维齐尔。"""

def parse_text_to_entries(text):
    lines = text.split('\n')
    entries = []
    current_role = None
    current_desc = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # 检查是否是角色行：包含.png 或者 中文名后跟冒号
        if '.png' in line or '：' in line or line.endswith('信息') or line.endswith('黎明') or line.endswith('黄昏'):
            # 保存前一个条目
            if current_role is not None and current_desc:
                desc = ' '.join(current_desc).strip()
                # 清理描述中的多余空格
                desc = re.sub(r'\s+', ' ', desc)
                entries.append({
                    "角色": current_role,
                    "描述": desc
                })
            
            # 开始新条目
            if '.png' in line:
                # 格式如 "Dusk.png 黄昏：检查所有玩家是否闭上眼睛..."
                parts = line.split(' ', 1)
                if len(parts) == 2:
                    current_role = parts[1].split('：')[0] if '：' in parts[1] else parts[1]
                else:
                    current_role = line
            else:
                # 格式如 "首个夜晚" 或 "爪牙信息：如果有七名或更多玩家..."
                if '：' in line:
                    current_role = line.split('：')[0]
                else:
                    current_role = line
            current_desc = [line.split('：', 1)[1] if '：' in line else '']
        else:
            # 描述续行
            if current_desc:
                current_desc.append(line)
            else:
                current_desc = [line]
    
    # 添加最后一个条目
    if current_role is not None and current_desc:
        desc = ' '.join(current_desc).strip()
        desc = re.sub(r'\s+', ' ', desc)
        entries.append({
            "角色": current_role,
            "描述": desc
        })
    
    return entries

def create_new_json(entries):
    # 读取现有JSON结构
    with open('json/rule/夜晚行动顺序一览（首夜）.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 创建新的行动顺序数组
    new_order = []
    for i, entry in enumerate(entries):
        # 跳过"首个夜晚"标题
        if entry["角色"] == "首个夜晚":
            continue
        # 格式化序号
        seq_num = i + 1
        # 如果角色是"黄昏"，添加"(旅行者)"后缀以匹配原格式
        if entry["角色"] == "黄昏":
            role_display = "黄昏（旅行者）"
        else:
            role_display = entry["角色"]
        
        new_order.append({
            "序号": f"{seq_num}.{role_display}",
            "描述": entry["描述"]
        })
    
    # 更新数据
    data["行动顺序"] = new_order
    # 更新采集时间
    data["采集时间"] = "2026-03-30 21:23:47"
    
    return data

def main():
    print("解析文本...")
    entries = parse_text_to_entries(text)
    print(f"解析出 {len(entries)} 个条目")
    
    # 显示前5个条目
    for i, e in enumerate(entries[:5]):
        print(f"{i+1}. {e['角色']}: {e['描述'][:50]}...")
    
    data = create_new_json(entries)
    
    # 写入文件
    with open('json/rule/夜晚行动顺序一览（首夜）.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"文件已更新，包含 {len(data['行动顺序'])} 个行动顺序条目")
    
    # 验证JSON
    try:
        with open('json/rule/夜晚行动顺序一览（首夜）.json', 'r', encoding='utf-8') as f:
            json.load(f)
        print("JSON验证通过")
    except Exception as e:
        print(f"JSON验证失败: {e}")

if __name__ == '__main__':
    main()