# -*- coding: utf-8 -*-
"""cdp_file.py —— 从文件读 JS 表达式并交给 cdp_eval.py 求值（长表达式/中文免转义）。

cdp_eval.py 的 --file 因 argparse 的 required --expr 而不可独立使用（既有小缺陷），
本脚本以包装方式绕开：把文件内容作为 --expr 传入。

用法：
  python tools/cdp_file.py --file expr.js --match unit.html
  python tools/cdp_file.py --file expr.js --url http://... --read-timeout 240
"""
import subprocess, sys, os, argparse

ap = argparse.ArgumentParser()
ap.add_argument("--file", required=True)
ap.add_argument("--url")
ap.add_argument("--match")
ap.add_argument("--wait", type=float, default=1.5)
ap.add_argument("--read-timeout", type=float, default=30)
ap.add_argument("--no-close", action="store_true")
a = ap.parse_args()

here = os.path.dirname(os.path.abspath(__file__))
expr = open(a.file, encoding="utf-8").read()
cmd = [sys.executable, os.path.join(here, "cdp_eval.py"), "--expr", expr,
       "--wait", str(a.wait), "--read-timeout", str(a.read_timeout)]
if a.url:
    cmd += ["--url", a.url]
if a.match:
    cmd += ["--match", a.match]
if a.no_close:
    cmd += ["--no-close"]
sys.exit(subprocess.call(cmd))
