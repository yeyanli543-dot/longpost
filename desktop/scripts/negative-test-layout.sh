#!/usr/bin/env bash
# P1 / P2 护栏的负向测试：把已经修好的两处**逐一改回病灶**，确认护栏会变红。
# 全程只在临时目录里改拷贝，绝不碰工作区。
#
#   bash scripts/negative-test-layout.sh                      # 只跑静态护栏（快，node 即可）
#   RUN_RUNTIME=1 bash scripts/negative-test-layout.sh        # 连运行时探针一起跑（需要 xvfb）
#
# 判读：每个破坏用例都必须「红」，基线必须「绿」；否则护栏等于没装。
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
DESKTOP="$(cd "$HERE/.." && pwd)"
RENDERER="$DESKTOP/renderer"
NODE="$(command -v node)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
RUN_RUNTIME="${RUN_RUNTIME:-0}"
COUNT="$TMP/redcount"

PASS=0
FAIL=0
verdict() { # $1=期望(red/green) $2=实际(green/red) $3=说明
  if [ "$1" = "$2" ]; then PASS=$((PASS + 1)); printf '    ✓ %s（护栏 %s）\n' "$3" "$2";
  else FAIL=$((FAIL + 1)); printf '    ✗ %s —— 期望 %s，实际 %s\n' "$3" "$1" "$2"; fi
}

# 静态护栏：明细打到 stdout，红项数写到 $COUNT
static_run() {
  "$NODE" -e '
    const fs = require("fs");
    const { checkLayout } = require(process.argv[2]);
    const out = checkLayout(process.argv[1]);
    const red = out.filter((c) => !c.ok);
    for (const c of red) console.log("      ✗ " + c.label + (c.detail ? "  —— " + c.detail : ""));
    fs.writeFileSync(process.argv[3], String(red.length));
  ' "$1" "$HERE/layout-guard.js" "$COUNT"
  cat "$COUNT"
}

# 运行时探针（--assert）：走真实渲染，返回退出码（0=绿，非 0=红）
runtime_run() {
  xvfb-run -a -s "-screen 0 1920x1200x24" "$NODE" "$DESKTOP/node_modules/.bin/electron" \
    "$HERE/probe-layout.js" --mode=all --assert --label=neg --out="$TMP/shots" --renderer="$1" \
    >"$TMP/rt.log" 2>&1
  local rc=$?
  grep -E "PROBE_ASSERT_FAIL|^  ✗ |PROBE_ASSERT_OK" "$TMP/rt.log" | sed 's/^/      /' || true
  return $rc
}

check_static() { # $1=dir  $2=期望 red/green  $3=说明  → 刘 $COUNT 里读红项数
  local out red
  out="$(static_run "$1")" || true
  red="$(printf '%s\n' "$out" | tail -n1)"
  printf '%s\n' "$out" | sed '$d'
  case "$red" in (0) verdict "$2" green "$3" ;; (*) verdict "$2" red "$3" ;; esac
}

check_runtime() { # $1=dir $2=期望 $3=说明
  if runtime_run "$1" >/dev/null 2>&1; then verdict "$2" green "$3"; else verdict "$2" red "$3"; fi
}

# ---------------------------------------------------------------- 基线
printf '===== 未破坏（基线） =====\n'
check_static "$RENDERER" green "未破坏时静态护栏全绿"
[ "$RUN_RUNTIME" = "1" ] && check_runtime "$RENDERER" green "未破坏时运行时探针通过"

# ---------------------------------------------------------------- P1 破坏：抽屉不再让出底栏高度
printf '===== 破坏 P1：把 .modal 让出的 --tabbar-h 拿掉 =====\n'
mkdir -p "$TMP/p1/renderer"
cp -r "$RENDERER/." "$TMP/p1/renderer/"
"$NODE" -e '
  const fs = require("fs");
  const p = process.argv[1];
  const before = fs.readFileSync(p, "utf8");
  const after = before.replace(
    /padding:\s*0 0 calc\(var\(--tabbar-h,\s*57px\)\s*\+\s*env\(safe-area-inset-bottom\)\);/,
    "padding: 0 0 env(safe-area-inset-bottom);",
  );
  if (after === before) { console.error("P1 注入点没找到，负向测试本身失效"); process.exit(9); }
  fs.writeFileSync(p, after);
' "$TMP/p1/renderer/style-mobile.css" || exit 9
check_static "$TMP/p1/renderer" red "拿掉让位后静态护栏变红"
[ "$RUN_RUNTIME" = "1" ] && check_runtime "$TMP/p1/renderer" red "拿掉让位后运行时探针变红（footer 被底栏接走）"

# ---------------------------------------------------------------- P2 破坏：把标题下限拿掉 + 工具条重新加 62% 上限
# 忠实还原修前状态：标题 min-width 168px → 0，.tools 基础规则补回 max-width:62%，
# 再补回配套的 @media (max-width:1240px){ .tools{max-width:none} } ——
# 1100 档落在 1240 断点内，max-width 被放开，flex-shrink:0 的工具条吃掉整条，
# 标题于是被压到 ~55px（这正是 P2 实测值）。
printf '===== 破坏 P2：标题 min-width 拿掉，工具条重新加 62%% 上限 =====\n'
mkdir -p "$TMP/p2/renderer"
cp -r "$RENDERER/." "$TMP/p2/renderer/"
"$NODE" -e '
  const fs = require("fs");
  const p = process.argv[1];
  let s = fs.readFileSync(p, "utf8");
  const before = s;
  s = s.replace(/(\.title-input\s*\{[^}]*?min-width:\s*)168px/, "$1" + "0px");
  const a1 = s !== before;
  const a2 = s;
  s = s.replace(/(\.tools\s*\{[^}]*?scrollbar-width:\s*none;)/, "$1\n  max-width: 62%;");
  const ok2 = s !== a2;
  const a3 = s;
  s = s + "\n@media (max-width: 1240px) {\n  .tools {\n    max-width: none;\n  }\n}\n";
  const ok3 = s !== a3;
  if (!(a1 && ok2 && ok3)) { console.error("P2 注入点没找全（min-width=" + a1 + " tools-cap=" + ok2 + " media=" + ok3 + "），负向测试本身失效"); process.exit(9); }
  fs.writeFileSync(p, s);
' "$TMP/p2/renderer/style.css" || exit 9
check_static "$TMP/p2/renderer" red "标题无下限 + 工具条百分比上限后静态护栏变红"
[ "$RUN_RUNTIME" = "1" ] && check_runtime "$TMP/p2/renderer" red "标题被挤扁时运行时探针变红"

printf '%s\n' "———————————————————————————————"
printf '负向测试：通过 %d 项，失败 %d 项\n' "$PASS" "$FAIL"
if [ "$FAIL" -ne 0 ]; then printf '护栏没能抓住退化，等于没装。\n'; exit 1; fi
printf '两个病灶都能被护栏抓住；恢复后全绿 —— 护栏有效\n'
