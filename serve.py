#!/usr/bin/env python3
"""本地静态服务器（预览用）。

`python -m http.server` 在部分 Python / 系统环境下会把 .js 当作 text/plain 返回，
而浏览器对 <script type="module"> 强制 Strict MIME 检查，会报
"Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of text/plain"。

本脚本显式声明 .js / .mjs / .json / .bin 等资源的 Content-Type，避免该问题。
GitHub Pages 本身不会触发此问题，本脚本仅用于本地预览。

用法：
    python serve.py [端口]      # 默认 8123
然后浏览器访问 http://127.0.0.1:端口/
"""
import http.server
import socketserver
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123

class Handler(http.server.SimpleHTTPRequestHandler):
    # 显式覆盖扩展名 -> MIME 映射，确保模块脚本与数据资源类型正确
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js':   'text/javascript',
        '.mjs':  'text/javascript',
        '.json': 'application/json',
        '.bin':  'application/octet-stream',
        '.css':  'text/css',
        '.html': 'text/html',
        '.svg':  'image/svg+xml',
    }

if __name__ == '__main__':
    root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('127.0.0.1', PORT), Handler) as httpd:
        print(f'本地预览已启动：http://127.0.0.1:{PORT}/')
        print(f'根目录：{root}')
        print('按 Ctrl+C 停止。')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n已停止。')
