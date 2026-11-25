"""휴대폰 폭(360px)에서 화면을 열어 기본 사용성을 잰다. 실제 사용자 시험을 대신하지는 않는다.
- 가로 넘침(px), 44px보다 낮은 누르는 곳 수, 이름표 없는 입력칸, 13px보다 작은 글자 수
python tools/audit_ui.py [쪽 ...]   (playwright 필요, site/를 임시 서버로 띄움)
"""
import functools, http.server, json, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parents[1] / "site"
JS = """()=>{const de=document.documentElement,r={overflow:de.scrollWidth-de.clientWidth};
const skip=e=>e.closest('footer')||e.closest('.facts')||e.closest('p')&&!e.closest('.cl');
let low=[];document.querySelectorAll('button,a,select,input').forEach(e=>{const b=e.getBoundingClientRect();
 if(b.width>0&&b.height>0&&b.height<44&&!skip(e))low.push((e.textContent||e.id||'').trim().slice(0,14)+' '+Math.round(b.height))});
r.low=low.length;r.low_examples=low.slice(0,5);
r.nolabel=[...document.querySelectorAll('input,select')].filter(e=>!(e.labels&&e.labels.length)&&!e.getAttribute('aria-label')).length;
let tiny=0;document.querySelectorAll('body *').forEach(e=>{if(!e.children.length&&e.textContent.trim()&&e.getBoundingClientRect().height>0&&parseFloat(getComputedStyle(e).fontSize)<13)tiny++});
r.tiny=tiny;return r}"""


def main(pages):
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(SITE))
    http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    out = {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        for pg_ in pages:
            pg = b.new_page(viewport={"width": 360, "height": 740})
            pg.route("**/*jsdelivr*", lambda r: r.abort())
            pg.goto(f"http://127.0.0.1:{srv.server_port}/{pg_}")
            pg.wait_for_timeout(700)
            out[pg_] = pg.evaluate(JS)
        b.close()
    srv.shutdown()
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return out


if __name__ == "__main__":
    main(sys.argv[1:] or ["fit.html?open=수영", "gap.html"])
