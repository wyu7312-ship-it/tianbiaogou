#!/usr/bin/env bash
# 全历史隐私扫描（AGENTS.md §2.2）——比 pii_check.sh 更严的一层：
#   ① 通用正则：手机号 / 邮箱 / 证件号
#   ② private/pii-patterns.txt 精确禁词（真实手机号、邮箱、姓名等）
#   ③ 常见真实姓名姓氏名单（可选 private/name-tokens.txt）——
#      文件被 gitignore，永不提交；用于抓住"真实姓名出现在文档/注释"这类
#      通用正则抓不到、而 pii-patterns.txt 又容易漏的情况。
#
# 用法：bash tools/pii_scan.sh          （正常输出 ✅ 表示可 push）
# 退出码：0 = 干净；1 = 有命中（禁止 push）
set -u
REPO_ROOT="$(git rev-parse --show-toplevel)"; cd "$REPO_ROOT" || exit 2

SAFE='example\.com|example\.org|138xxxx0000|张三|李四|xxx|某公司|某人|某某'
PATTERNS='1[3-9][0-9]{9}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(com|cn|net|org)|[0-9]{17}[0-9Xx]'
found=0

# 注意：不要把 rev-list 的全部 hash 一次塞给 git grep（在 Git for Windows 上
# 可能静默返回空，导致"扫了但没扫到"的假绿）。改为逐 commit 扫描，结果最可靠。
#
# $3 = 是否套白名单：
#   Y —— 通用正则用。一行里既有真实 PII 又有替身写法时放行（避免误报），
#        但这也意味着"真实姓名 + 替身写法同框"会被放过（曾经的真实漏报点）。
#   N —— 精确禁词/姓名 token 用。**必须精确**：身份标识类信息绝不能因为
#        同一行恰好有替身写法就被放行。曾因白名单含"某公司"而漏掉真实姓名。
scan_history() {   # $1=模式  $2=E|F  $3=Y|N（是否套白名单）
  local pat="$1" mode="$2" safemode="$3"
  local c out
  for c in $(git rev-list --all); do
    if [ "$mode" = "F" ]; then
      out=$(git grep -I -n -F -e "$pat" "$c" -- . ':!private' 2>/dev/null)
    else
      out=$(git grep -I -n -E -e "$pat" "$c" -- . ':!private' 2>/dev/null)
    fi
    [ -z "$out" ] && continue
    if [ "$safemode" = "Y" ]; then out=$(printf '%s\n' "$out" | grep -vE "$SAFE"); fi
    if [ -n "$out" ]; then printf '%s\n' "$out" | head -5; return 0; fi
  done
  return 1
}

echo "== ① 通用正则（手机号/邮箱/证件号）=="
if hits=$(scan_history "$PATTERNS" E Y) && [ -n "$hits" ]; then
  echo "❌ 命中："; echo "$hits"; found=1
else
  echo "   ok"
fi

if [ -f private/pii-patterns.txt ]; then
  echo "== ② 精确禁词（private/pii-patterns.txt）=="
  bad=0
  while IFS= read -r p <&3; do
    [ -z "$p" ] && continue; case "$p" in \#*) continue;; esac
    p=$(printf '%s' "$p" | tr -d '\r')
    [ -z "$p" ] && continue
    if hits=$(scan_history "$p" F N) && [ -n "$hits" ]; then
      echo "❌ 禁词命中 [$p]："; echo "$hits"; found=1; bad=1
    fi
  done 3< private/pii-patterns.txt
  [ "$bad" -eq 0 ] && echo "   ok"
fi

if [ -f private/name-tokens.txt ]; then
  echo "== ③ 真实姓名/机构 token（private/name-tokens.txt）=="
  bad=0
  while IFS= read -r p <&3; do
    [ -z "$p" ] && continue; case "$p" in \#*) continue;; esac
    p=$(printf '%s' "$p" | tr -d '\r')
    [ -z "$p" ] && continue
    if hits=$(scan_history "$p" F N) && [ -n "$hits" ]; then
      echo "❌ 真实姓名/机构命中 [$p]："; echo "$hits"; found=1; bad=1
    fi
  done 3< private/name-tokens.txt
  [ "$bad" -eq 0 ] && echo "   ok"
else
  echo "== ③ 跳过：未配置 private/name-tokens.txt（建议配置，见 AGENTS.md）=="
fi

if [ "$found" -eq 0 ]; then
  echo "✅ 未命中任何 PII 特征，可以 push"
else
  echo "⛔ 有命中——停止 push，向用户报告！"
fi
exit $found
