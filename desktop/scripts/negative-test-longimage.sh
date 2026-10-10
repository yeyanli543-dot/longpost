#!/usr/bin/env bash
# 负向测试：证明 [11] 组「长图导出必须按正文全高出图」真的抓得到退化。
#
# 做法：把工作副本拷到临时目录（不碰仓库），在**拷贝**里逐条破坏 exportLongImage，
# 跑同一条自检，看它是否变红；每次破坏后都从干净副本重来。
#
#   ./desktop/scripts/negative-test-longimage.sh            # 只跑静态（快，~10s）
#   RUN_UI=1 ./desktop/scripts/negative-test-longimage.sh   # 加跑运行时 verify:ui（需要 xvfb + node_modules）
#
# 退出码：全部符合预期 = 0。

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
DESKTOP=$(cd "$HERE/.." && pwd)
APP=$(cd "$DESKTOP/.." && pwd)
WORK=${WORK:-$(mktemp -d "${TMPDIR:-/tmp}/lp-neg-d1.XXXXXX")}
RUN_UI=${RUN_UI:-0}

rm -f "$WORK/verdict"
SRC="$WORK/src"
mkdir -p "$SRC"
rsync -a --exclude node_modules --exclude .git --exclude desktop/release --exclude desktop/.verify \
  "$APP/" "$SRC/" >/dev/null

reset_copy () {
  rm -rf "$SRC/desktop/renderer/app.js"
  rsync -a "$APP/desktop/renderer/app.js" "$SRC/desktop/renderer/app.js"
}

break_app () { # $1 = python 片段（在 $SRC 上做替换）
  python3 - "$SRC" "$1" <<'PY'
import sys, pathlib
root = pathlib.Path(sys.argv[1]); mode = sys.argv[2]
p = root / 'desktop' / 'renderer' / 'app.js'
s = p.read_text()
if mode == 'drop-height':
    old = '        height: fullH,\n'
    assert old in s, '找不到 height: fullH,'
    s = s.replace(old, '', 1)
elif mode == 'client-height':
    old = '        height: fullH,\n'
    assert old in s
    s = s.replace(old, '        height: node.clientHeight,\n', 1)
elif mode == 'drop-style':
    old = "        style: { height: fullH + 'px', maxHeight: 'none', overflow: 'visible' },\n"
    assert old in s, '找不到 style 那一行'
    s = s.replace(old, '', 1)
else:
    raise SystemExit('未知破坏方式 ' + mode)
p.write_text(s)
PY
}

report () { # $1 = 标签, $2 = 日志, $3 = 期望(green|red)
  local label="$1" log="$2" want="$3" red hits tail_line
  red=$(grep -c '^  ✗' "$log" || true)
  hits=$(grep -c 'D1 回归\|长图导出' "$log" || true)
  tail_line=$(grep -E '^通过 ' "$log" || true)
  local sred id c1 c2
  id=$(basename "$2"); id=${id%.log}; id=${id#static-}
  sred=$(grep -c '^  ✗' "$WORK/smoke-$id.log" 2>/dev/null || true)
  c1=$(cat "$WORK/static-$id.code" 2>/dev/null); c2=$(cat "$WORK/smoke-$id.code" 2>/dev/null)
  printf '  %-34s 接线自检红=%-2s / smoke红=%-2s 退出码=%s/%s\n' "$label" "$red" "$sred" "$c1" "$c2"
  sed -n 's/^  ✗ /    ✗ /p' "$WORK/smoke-$id.log" 2>/dev/null | head -2
  printf '  %-34s %s | %s\n' '' "$red" "$(grep -E '^通过 ' "$log" >/dev/null && echo "$tail_line")" "$(sed -n 's/^  ✗ /✗ /p' "$log" | head -3 | tr '\n' ' ')"
  if [ "$want" = green ] && [ "$red" != 0 ]; then echo "    期望全绿但红了 → 不符合预期"; echo "EXIT_MISMATCH=1" >> "$WORK/verdict"; fi
  if [ "$want" = red ] && [ "$red" = 0 ]; then echo "    期望变红但没红 → 这条检查是瞎的"; echo "EXIT_MISMATCH=1" >> "$WORK/verdict"; fi
}

run_static () { # $1 = 标签
  ( cd "$SRC/desktop" && node scripts/run-with-timeout.js 120000 scripts/verify-mobile.js ) \
    > "$WORK/static-$1.log" 2>&1
  echo "$?" > "$WORK/static-$1.code"
  # 桌面流水线只跑 npm test（smoke-test.js），所以两条都要看
  ( cd "$SRC/desktop" && node scripts/smoke-test.js ) > "$WORK/smoke-$1.log" 2>&1
  echo "$?" > "$WORK/smoke-$1.code"
}

echo "工作副本 -> $SRC"
echo
echo "===== 静态检查（verify-mobile.js 的 [11] 组）====="

reset_copy; run_static base
echo "  基线（未破坏）退出码=$(cat "$WORK/static-base.code")"
report "基线 未破坏" "$WORK/static-base.log" green

reset_copy; break_app drop-height; run_static dropheight
echo "  去掉 height: fullH, 退出码=$(cat "$WORK/static-dropheight.code")"
report "去掉 height 传参" "$WORK/static-dropheight.log" red

reset_copy; break_app client-height; run_static clientheight
echo "  把 height 换成 node.clientHeight 退出码=$(cat "$WORK/static-clientheight.code")"
report "height 退化成 clientHeight" "$WORK/static-clientheight.log" red

reset_copy; break_app drop-style; run_static dropstyle
echo "  去掉 style 解高度 退出码=$(cat "$WORK/static-dropstyle.code")"
report "去掉 style 解克隆高度" "$WORK/static-dropstyle.log" red

if [ "$RUN_UI" = 1 ]; then
  echo
  echo "===== 运行时检查（verify:ui，真出图）====="
  NM="$APP/desktop/node_modules"
  [ -d "$NM" ] || { echo "  跳过：找不到 $NM"; exit 0; }
  ln -sfn "$NM" "$SRC/desktop/node_modules"

  reset_copy; rm -f "$SRC/desktop/.verify/ui.png"; mkdir -p "$SRC/desktop/.verify"
  ( cd "$SRC/desktop" && xvfb-run -a npm run verify:ui ) > "$WORK/ui-base.log" 2>&1
  echo "  基线 退出码=$?"
  grep -E 'SMOKE_SCRIPT_RESULT|SMOKE_OK|SMOKE_EXIT' "$WORK/ui-base.log" | sed 's/^/    /'

  reset_copy; break_app drop-height
  ( cd "$SRC/desktop" && xvfb-run -a npm run verify:ui ) > "$WORK/ui-dropheight.log" 2>&1
  echo "  去掉 height 后 退出码=$?"
  grep -E 'SMOKE_SCRIPT_ERROR|SMOKE_EXIT|D1 长图导出回归' "$WORK/ui-dropheight.log" | sed 's/^/    /'
fi

echo
if [ -f "$WORK/verdict" ]; then
  echo "结论：有检查没能按预期反应（见上面 MISMATCH）"
  exit 1
fi
echo "结论：三条破坏都让检查变红，恢复后全绿 —— 检查有效"
