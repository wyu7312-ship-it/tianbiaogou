#!/usr/bin/env bash
# 推送前全历史隐私扫描（AGENTS.md 隐私红线 §2.2 的落地工具）
# 用法：bash tools/pii_check.sh   —— 扫描所有 commit 的全部内容，正常应输出"✅ 未命中"
set -u
REPO_ROOT="$(git rev-parse --show-toplevel)"; cd "$REPO_ROOT" || exit 2
SAFE='example\.com|example\.org|138xxxx0000|张三|李四|pii_check|pre-commit|hooks-src|AGENTS'
PATTERNS='1[3-9][0-9]{9}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(com|cn|net|org)|[0-9]{17}[0-9Xx]'
found=0

echo "== 扫描全部历史（正则：手机号/邮箱/证件号）=="
if commits=$(git rev-list --all); then
  if hits=$(git grep -I -n -E "$PATTERNS" $commits -- . ':!private' 2>/dev/null | grep -vE "$SAFE" | head -20) && [ -n "$hits" ]; then
    echo "❌ 历史命中："; echo "$hits"; found=1
  fi
fi

if [ -f private/pii-patterns.txt ]; then
  echo "== 扫描全部历史（精确禁词 private/pii-patterns.txt）=="
  while IFS= read -r p; do
    [ -z "$p" ] && continue; case "$p" in \#*) continue;; esac
    if hits=$(git grep -I -n -F -- "$p" $(git rev-list --all) -- 2>/dev/null | head -5) && [ -n "$hits" ]; then
      echo "❌ 禁词命中 [$p]："; echo "$hits"; found=1
    fi
  done < private/pii-patterns.txt
fi

[ "$found" -eq 0 ] && echo "✅ 未命中任何 PII 特征，可以 push" || echo "⛔ 停止 push，向用户报告！"
exit $found
