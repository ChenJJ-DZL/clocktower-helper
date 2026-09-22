#!/usr/bin/env bash
# 语义变异检验：每个角色改一处「具体条件」-> 跑三个单测文件必须变红 -> 立刻还原
# 用法：bash mutate.sh primary | fallback
# ⚠️ 不得加 --reporter=basic（本项目 vitest 加载该 reporter 会 ERR_LOAD_URL，
#    导致「退出码非 0」被误判成 DETECTED —— 假阳性）。用默认 reporter。
# ⚠️ 沙箱：`sed -i` 因临时文件改名被拒 -> 备份到 /tmp + `cat > 原文件`；
#    vitest 子进程刚退出时写回偶发被拒 -> 预快照 + cmp 校验 + 重试 6 次。
cd "$(dirname "$0")"
PASS="${1:-primary}"
TSV="mut_${PASS}.tsv"
TESTS="src/roles/__tests__/full/hm_l1_l2.test.ts src/roles/__tests__/full/hm_l3_ui.test.tsx src/roles/__tests__/full/hm_l5_causal.test.ts"
OUT="temp_mutations_${PASS}.tsv"
SNAP="./temp_hm_snap_${PASS}"
rm -rf "$SNAP"; mkdir -p "$SNAP"
awk -F'|' '{ if ($2 != "") print $2 }' "$TSV" | sort -u > ./temp_hm_targets.txt
while read -r f; do mkdir -p "$SNAP/$(dirname "$f")"; cp "$f" "$SNAP/$f"; done < ./temp_hm_targets.txt

restore() {
  local f="$1" i
  for i in 1 2 3 4 5 6; do
    cat "$SNAP/$f" > "$f"
    if cmp -s "$SNAP/$f" "$f"; then return 0; fi
    sleep 1
  done
  return 1
}

: > "$OUT"
while IFS='|' read -r role file line from to; do
  [ -z "$role" ] && continue
  case "$role" in \#*) continue ;; esac
  sed "${line}s@${from}@${to}@" "$SNAP/$file" > ./temp_mut_new.ts
  if cmp -s "$SNAP/$file" ./temp_mut_new.ts; then
    st=NOOP; ev="该行未命中 from"; sn=""
  else
    cat ./temp_mut_new.ts > "$file"
    NODE_OPTIONS="" npx vitest run $TESTS --testTimeout=20000 > ./temp_mut_out.txt 2>&1
    code=$?
    if grep -aq 'Test Files' ./temp_mut_out.txt; then
      if [ $code -ne 0 ] || grep -aqE 'Tests +[0-9]+ failed' ./temp_mut_out.txt; then st=DETECTED; else st=MISS; fi
    else
      st=ENV_ERR
    fi
    ev=$(grep -a -m1 -oE 'Tests +[0-9]+ (failed|passed)[^)]*' ./temp_mut_out.txt | head -1)
    sn=$(grep -a -m1 -oE '❌[^"]{0,110}' ./temp_mut_out.txt | head -1)
    cp ./temp_mut_out.txt "./temp_mut_raw_${role}.txt"
    sleep 1
    restore "$file" || st="${st}_RESTORE_FAIL"
  fi
  printf '%s\t%s\t%s:%s\t%s\t%s\n' "$st" "$role" "$file" "$line" "$ev" "$sn" >> "$OUT"
  echo "[$PASS] $st  $role  $file:$line  $ev  $sn"
done < "$TSV"

echo "--- 最终还原核对（逐文件 cmp 快照）---"
FAILN=0
while read -r f; do
  if cmp -s "$SNAP/$f" "$f"; then :; else echo "❌ 未还原: $f"; restore "$f" && echo "  ↳ 二次还原成功"; FAILN=$((FAILN+1)); fi
done < ./temp_hm_targets.txt
echo "RESTORE_SWEEP_FAIL=$FAILN"
echo "--- git status src/roles/new_engine（应只剩他人改动）---"
git status --short src/roles/new_engine/
