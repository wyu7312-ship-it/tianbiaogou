# -*- coding: utf-8 -*-
"""通用 CDP 求值器（wsa-autofill 测试基建，可复用于任何 AI 浏览器自动化）
用法：
  python tools/cdp_eval.py --url http://localhost:8777/tests/unit.html --expr "window.__report()"
  python tools/cdp_eval.py --match unit.html --expr "1+1"        # 复用已开标签页
  python tools/cdp_eval.py --url ... --expr ... --no-close        # 保留标签页（连续操作时）
端口自动探测 9222/9223；输出 ASCII 转义 JSON（防 Bash 中文乱码）。
依赖：websocket-client（AI浏览器环境已装）。禁止在本文件放入任何真实个人信息。
"""
import json, sys, time, argparse, urllib.request, urllib.parse
import websocket

def http_json(url, method=None, timeout=5):
    req = urllib.request.Request(url, method=method or ("GET" if method is None else method))
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())

def find_port(force=None):
    ports = (force,) if force else (9222, 9223)
    for port in ports:
        try:
            # 要求 /json 也能返回有效列表，避免选中"僵尸端口"（能应答 version 却列不出目标）
            http_json(f"http://localhost:{port}/json/version")
            http_json(f"http://localhost:{port}/json")
            return port
        except Exception:
            continue
    print(json.dumps({"error": "浏览器未运行？双击 start-ai-browser.bat 或带 --remote-debugging-port 启动 Chrome；也可 --port 指定"}))
    sys.exit(2)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url"); ap.add_argument("--match"); ap.add_argument("--expr", required=True)
    ap.add_argument("--file", help="从文件读 JS 表达式（与 --expr 二选一）")
    ap.add_argument("--port", type=int, help="强制调试端口（活浏览器可能不在默认 9222）")
    ap.add_argument("--wait", type=float, default=1.5)
    ap.add_argument("--read-timeout", type=float, default=30,
                    help="Runtime.evaluate 等待上限（秒）。真实页面逐字段探测常需 >30s")
    ap.add_argument("--no-close", action="store_true")
    a = ap.parse_args()
    expr = a.expr or (open(a.file, encoding="utf-8").read() if a.file else "")
    port = find_port(a.port)

    pages = [p for p in http_json(f"http://localhost:{port}/json") if p["type"] == "page"]
    target, new_opened = None, False
    if a.match:
        target = next((p for p in pages if a.match in p["url"]), None)
        if not target:
            print(json.dumps({"error": f"没有 URL 含 {a.match} 的标签页"})); sys.exit(1)
    elif a.url:
        target = http_json("http://localhost:%d/json/new?%s" % (port, urllib.parse.quote(a.url, safe="")), method="PUT")
        new_opened = True
    else:
        print(json.dumps({"error": "需要 --url 或 --match"})); sys.exit(1)

    time.sleep(a.wait)
    ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=a.read_timeout)
    mid = 0
    def send(method, params=None):
        nonlocal mid
        mid += 1
        ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            resp = json.loads(ws.recv())
            if resp.get("id") == mid:
                return resp
    r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
    out = {"url": target["url"]}
    if "exceptionDetails" in r.get("result", {}):
        out["js_error"] = r["result"]["exceptionDetails"].get("text", "")[:300]
    res = r.get("result", {}).get("result", {})
    out["value"] = res.get("value", res.get("description"))
    ws.close()
    if new_opened and not a.no_close:
        try: http_json(f"http://localhost:{port}/json/close/{target['id']}")
        except Exception: pass
    print(json.dumps(out, ensure_ascii=True))

if __name__ == "__main__":
    main()
