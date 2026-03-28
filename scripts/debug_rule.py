#!/usr/bin/env python3
import json
import sys

filepath = 'json/rule/规则解释.json'
try:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    print("File length:", len(content))
    print("First 200 chars:", repr(content[:200]))
    
    # 尝试解析
    data = json.loads(content)
    print("Parsed successfully")
except json.JSONDecodeError as e:
    print("Error:", e)
    print("Line:", e.lineno)
    print("Column:", e.colno)
    print("Char:", e.pos)
    
    # 显示有问题的行
    lines = content.split('\n')
    if e.lineno <= len(lines):
        problem_line = lines[e.lineno - 1]
        print("Problem line:", repr(problem_line))
        if e.colno <= len(problem_line):
            print("Problem char:", repr(problem_line[e.colno - 1]))
            # 显示周围字符
            start = max(0, e.colno - 10)
            end = min(len(problem_line), e.colno + 10)
            print("Context:", repr(problem_line[start:end]))
    
    # 显示原始字节
    with open(filepath, 'rb') as f:
        raw = f.read()
        pos = e.pos
        start = max(0, pos - 20)
        end = min(len(raw), pos + 20)
        print("Raw bytes around position:", raw[start:end])
        print("Hex:", raw[start:end].hex())
        
        # 检查控制字符
        for i in range(start, end):
            if raw[i] < 32 and raw[i] not in (9, 10, 13):  # 不是制表符、换行符、回车符
                print(f"Control character at byte {i}: {raw[i]} (0x{raw[i]:02x})")