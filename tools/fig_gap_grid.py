"""기획서 그림: 공백 지도 '누가, 언제 들을 수 있나' (올림픽공원 탭) 캡처. python tools/fig_gap_grid.py 출력.png"""
import functools, http.server, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parents[1] / "site"
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(SITE))
http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
threading.Thread(target=srv.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1000, "height": 2000}, device_scale_factor=2)
    pg.route("**/*jsdelivr*", lambda r: r.abort())
    pg.goto(f"http://127.0.0.1:{srv.server_port}/gap.html")
    pg.wait_for_timeout(800)
    box = pg.evaluate("""()=>{const a=document.getElementById('tabs').getBoundingClientRect(),z=document.getElementById('gm').getBoundingClientRect();
      return {x:Math.max(0,a.left-4),y:a.top+window.scrollY-4,w:Math.min(1000,z.right+4)-Math.max(0,a.left-4),h:z.bottom-a.top+8}}""")
    pg.screenshot(path=sys.argv[1], clip={"x": box["x"], "y": box["y"], "width": box["w"], "height": box["h"]})
    b.close()
srv.shutdown()
print(box)
