"""
极简 Reddit 代理服务器（localhost:8787）
- 转发 Reddit RSS（走本机 HTTP 代理 127.0.0.1:7890）
- 解析 Atom XML → complaints JSON（和之前 Next.js /api/complaints 同结构）
- 10 分钟内存缓存
- 失败时返回内置 seed 数据，保证 SPA 离线可跑

启动: python3 proxy.py     (默认端口 8787)
SPA 侧 fetch: http://localhost:8787/api/complaints
"""
import http.server, socketserver, urllib.request, urllib.error, json, os, time, threading, re
from urllib.parse import urlparse, parse_qs
import xml.etree.ElementTree as ET

# --- 配置 ---
PORT = 8787
PROXY = os.environ.get("REDDIT_PROXY", "http://127.0.0.1:7890")
SUBS = ["SomebodyMakeThis", "mildlyinfuriating", "CrappyDesign"]
CACHE_TTL = 600  # 秒
USER_AGENT = "TraeBot/1.0 (by /u/test)"

# --- 分类与机会识别 ---
CATEGORY_RULES = [
    ("数码科技", ["phone", "laptop", "tech", "app", "software", "ai", "computer", "smart", "headphone", "earbud", "充电", "笔记本", "手机", "电脑", "耳机"]),
    ("食品饮料", ["food", "coffee", "tea", "drink", "beer", "pizza", "meal", "recipe", "can", "soup", "吃", "咖啡", "外卖", "汤"]),
    ("效率工具", ["tool", "workflow", "productivity", "calendar", "todo", "note", "tracker", "habit", "日程", "效率", "笔记"]),
    ("出行交通", ["car", "bike", "train", "transit", "commute", "airplane", "taxi", "gas", "停车", "高速"]),
    ("家居生活", ["home", "kitchen", "bedroom", "clean", "laundry", "bath", "floor", "shower", "家居"]),
    ("健康身心", ["health", "sleep", "workout", "mental", "breath", "stress", "meditation", "sleep", "健身", "睡眠"]),
    ("购物服务", ["service", "delivery", "delivery", "shopping", "online", "store", "warranty", "保修"]),
]

OPPORTUNITY_KW = ["why", "wish", "make", "invent", "exist", "someone", "somebody",
                  "希望有", "能不能有人", "wish there was", "why is there no"]


def guess_category(title, excerpt, subreddit):
    text = (title + " " + excerpt).lower()
    for cat, kws in CATEGORY_RULES:
        for kw in kws:
            if kw in text:
                return cat
    return "其他灵感"


def estimate_heat(title, excerpt, subreddit):
    """RSS 不给热度，用启发式估算 1-100"""
    text = (title + " " + excerpt).lower()
    score = 30
    if subreddit == "SomebodyMakeThis":
        score += 15
    if any(kw in text for kw in OPPORTUNITY_KW):
        score += 10
    score += min(len(title) // 3, 15)  # 标题越长可能越认真
    # 一些强情绪词加分
    for kw in ["frustrat", "annoy", "infuri", "wish", "why", "impossible"]:
        if kw in text:
            score += 5
    return max(10, min(99, score))


def is_opportunity(title, subreddit):
    if subreddit == "SomebodyMakeThis":
        return True
    text = title.lower()
    return any(kw in text for kw in OPPORTUNITY_KW)


# --- RSS 抓取 ---
_cache = {}
_cache_lock = threading.Lock()


def fetch_rss(subreddit):
    """通过代理抓单个版块的 RSS Atom"""
    url = f"https://www.reddit.com/r/{subreddit}/.rss?sort=new"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/atom+xml"})
    proxy_handler = urllib.request.ProxyHandler({"https": PROXY, "http": PROXY})
    opener = urllib.request.build_opener(proxy_handler)
    with opener.open(req, timeout=15) as resp:
        return resp.read()


def parse_atom(xml_bytes, subreddit):
    """Reddit 返回 Atom 格式，不是标准 RSS"""
    # 去除 HTML 片段里的可能问题字符
    data = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", xml_bytes.decode("utf-8", errors="replace"))
    try:
        tree = ET.fromstring(data)
    except ET.ParseError:
        return []
    ns = {"a": "http://www.w3.org/2005/Atom"}
    entries = tree.findall(".//a:entry", ns)
    out = []
    for i, e in enumerate(entries):
        title = (e.findtext("a:title", "", ns) or "").strip()
        if not title:
            continue
        # 跳过自动置顶的 Creator Showcase 之类
        if "AutoModerator" in (e.findtext("a:author/a:name", "", ns) or ""):
            continue
        link = (e.find("a:link[@rel='alternate']", ns) or {}).get("href") if e.find("a:link[@rel='alternate']", ns) is not None else ""
        if not link:
            link = e.findtext("a:id", "", ns) or ""
        content_html = e.findtext("a:content", "", ns) or ""
        published = e.findtext("a:published", "", ns) or ""
        # 纯文本 excerpt
        text = re.sub(r"<[^>]+>", "", content_html)
        text = re.sub(r"\s+", " ", text).strip()
        excerpt = text[:140] + ("…" if len(text) > 140 else "")

        try:
            created_at = int(time.mktime(time.strptime(published[:19], "%Y-%m-%dT%H:%M:%S")))
        except Exception:
            created_at = int(time.time()) - 86400 * 2

        out.append({
            "id": f"{subreddit}-{i}",
            "titleZh": title,
            "title": title,
            "excerpt": excerpt,
            "url": link,
            "subreddit": subreddit,
            "category": guess_category(title, excerpt, subreddit),
            "heat": estimate_heat(title, excerpt, subreddit),
            "comments": 0,
            "score": 0,
            "createdAt": created_at,
            "opportunity": is_opportunity(title, subreddit),
            "source": "reddit",
        })
    return out


def fetch_all(force=False):
    """串行抓所有版块，限流 + 缓存"""
    now = time.time()
    with _cache_lock:
        if not force and "data" in _cache and now - _cache.get("ts", 0) < CACHE_TTL:
            return _cache["data"], False

    all_items = []
    for sub in SUBS:
        try:
            raw = fetch_rss(sub)
            items = parse_atom(raw, sub)
            all_items.extend(items)
            time.sleep(2.5)  # 限流保护
        except urllib.error.HTTPError as e:
            print(f"[proxy] fetch r/{sub} HTTP {e.code}")
        except Exception as e:
            print(f"[proxy] fetch r/{sub} failed: {e}")

    # 按热度排序
    all_items.sort(key=lambda x: x["heat"], reverse=True)

    result = {
        "complaints": all_items[:80],  # 最多 80 条
        "live": True,
        "mode": "rss",
        "fetchedAt": int(time.time() * 1000),
        "subreddits": SUBS,
        "translateEngine": "free",
    }
    with _cache_lock:
        _cache["data"] = result
        _cache["ts"] = now
    return result, len(all_items) > 0


# --- 内置 seed（离线兜底）---
SEED = {
    "complaints": [
        {"id": "seed-1", "titleZh": "我想要一台小型、低端、ARM、能跑 Linux 的电子墨水屏笔记本", "title": "I would like a small, low-end, ARM based and linux capable laptop with an E-ink display", "excerpt": "为什么还没有人做这种东西呢？作为一个极客用户，我愿意为它付钱。", "url": "https://reddit.com/r/SomebodyMakeThis", "subreddit": "SomebodyMakeThis", "category": "数码科技", "heat": 95, "comments": 120, "score": 380, "createdAt": int(time.time()) - 86400 * 2, "opportunity": True, "source": "reddit"},
        {"id": "seed-2", "titleZh": "iPhone duo 折叠屏 75001 次折叠后碎屏", "title": "My iPhone duo screen broke after 75001 folds", "excerpt": "官方号称 30 万次，我才用了半年就碎了。", "url": "#", "subreddit": "mildlyinfuriating", "category": "数码科技", "heat": 88, "comments": 234, "score": 1200, "createdAt": int(time.time()) - 86400 * 3, "opportunity": False},
        {"id": "seed-3", "titleZh": "Zillow AI 展示幻觉出整扇不存在的窗", "title": "Zillow AI generated a window that doesn't exist", "excerpt": "看房时才发现照片里的窗户根本没有，AI 帮我脑补了一个。", "url": "#", "subreddit": "CrappyDesign", "category": "效率工具", "heat": 72, "comments": 89, "score": 450, "createdAt": int(time.time()) - 86400 * 4, "opportunity": False},
        {"id": "seed-4", "titleZh": "智能地板", "title": "Smart Floor — what is it made of and where can I get one?", "excerpt": "能感知脚步、测量压力的地板，给老人和宠物用。", "url": "#", "subreddit": "SomebodyMakeThis", "category": "家居生活", "heat": 68, "comments": 56, "score": 280, "createdAt": int(time.time()) - 86400 * 3, "opportunity": True},
        {"id": "seed-5", "titleZh": "自动驾驶通勤列车，能减少高速堵车吗？", "title": "Autonomous commuter trains that reduce highway traffic", "excerpt": "地铁化的通勤方案，每 2 分钟一班。", "url": "#", "subreddit": "SomebodyMakeThis", "category": "出行交通", "heat": 65, "comments": 112, "score": 320, "createdAt": int(time.time()) - 86400 * 5, "opportunity": True},
        {"id": "seed-6", "titleZh": "把孩子日常片段做成只给家人看的记忆 App", "title": "An app for sharing child moments only with family", "excerpt": "不想被 Facebook 的广告盯上，想有一个私域。", "url": "#", "subreddit": "SomebodyMakeThis", "category": "效率工具", "heat": 58, "comments": 67, "score": 210, "createdAt": int(time.time()) - 86400 * 4, "opportunity": True},
        {"id": "seed-7", "titleZh": "做成香奈儿 5 号瓶造型的威士忌醒酒器", "title": "A whiskey decanter shaped like a Chanel No.5 bottle", "excerpt": "收藏级的怪东西，用来招待朋友。", "url": "#", "subreddit": "SomebodyMakeThis", "category": "其他灵感", "heat": 52, "comments": 43, "score": 180, "createdAt": int(time.time()) - 86400 * 6, "opportunity": True},
        {"id": "seed-8", "titleZh": "卖罐头食品的自动售货机", "title": "A vending machine that sells canned food", "excerpt": "深夜想吃点东西，但便利店关门了。", "url": "#", "subreddit": "SomebodyMakeThis", "category": "食品饮料", "heat": 48, "comments": 38, "score": 145, "createdAt": int(time.time()) - 86400 * 7, "opportunity": True},
        {"id": "seed-9", "titleZh": "一家只送汤、炖菜和辣椒的外卖公司", "title": "A delivery company for soup, stew and chili only", "excerpt": "冬天的第一口热汤，给加班的人。", "url": "#", "subreddit": "SomebodyMakeThis", "category": "食品饮料", "heat": 42, "comments": 29, "score": 98, "createdAt": int(time.time()) - 86400 * 8, "opportunity": True},
        {"id": "seed-10", "titleZh": "一款呼吸训练器手机 App", "title": "Breathalyzer for your phone", "excerpt": "用麦克风检测呼吸节奏，引导冥想。", "url": "#", "subreddit": "SomebodyMakeThis", "category": "健康身心", "heat": 38, "comments": 22, "score": 76, "createdAt": int(time.time()) - 86400 * 9, "opportunity": True},
    ]
}


# --- HTTP 服务器 ---
class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[proxy] {self.address_string()} {fmt % args}")

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        if parsed.path == "/api/complaints":
            refresh = qs.get("refresh", ["0"])[0] == "1"
            try:
                data, ok = fetch_all(force=refresh)
                if not ok:
                    print("[proxy] real fetch empty, fallback to seed")
                    data = {**SEED, "live": False, "mode": "seed", "fetchedAt": int(time.time() * 1000), "subreddits": SUBS, "translateEngine": "none"}
            except Exception as e:
                print(f"[proxy] fetch error, fallback seed: {e}")
                data = {**SEED, "live": False, "mode": "seed", "fetchedAt": int(time.time() * 1000), "subreddits": SUBS, "translateEngine": "none"}

            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)

        elif parsed.path == "/api/insights":
            try:
                insights = self._compute_insights()
            except Exception as e:
                print(f"[proxy] insights error, fallback: {e}")
                insights = {"engine": "rule-engine", "aiDirections": [], "error": str(e)}
            body = json.dumps(insights, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)

        elif parsed.path in ("/", "/healthz"):
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"idea-radar proxy ok")

        else:
            self.send_response(404)
            self.end_headers()

    def _compute_insights(self):
        """规则引擎版 insights（不依赖 LLM）"""
        with _cache_lock:
            data = _cache.get("data", SEED)
        items = data.get("complaints", SEED["complaints"])
        # 品类分布
        cat_count = {}
        for it in items:
            cat_count[it.get("category", "其他灵感")] = cat_count.get(it.get("category", "其他灵感"), 0) + 1
        top_cats = sorted(cat_count.items(), key=lambda x: x[1], reverse=True)[:5]
        # 按品类给 AI 方向（规则）
        AI_IDEAS = {
            "数码科技": [("E-INK 写作本", "砍掉浏览器和视频，续航按周算的极简笔记本。"),
                         ("开源极客平板", "可换电池 + 开源固件，卖给 Linux 开发者与现场工程师。"),
                         ("纸感阅读终端", "10 英寸 + 订阅内容包，切进深度阅读和学术场景。")],
            "食品饮料": [("场景化外卖", "只做一个品类，切进通勤/夜宵/加班场景。"),
                         ("预制菜订阅盒", "每周 3 道菜 + 半成品，冷链直达。")],
            "效率工具": [("家庭记忆 App", "只有家人能看的私密相册 + 日记。"),
                         ("任务协作板", "把 Trello 简化 80%，只做家庭/小团队。")],
            "出行交通": [("最后一英里", "折叠电动车共享停靠点 + 社区地图。"),
                         ("通勤信息聚合", "一条消息告诉你今天地铁/高速状态。")],
            "家居生活": [("感知家居", "地板/门把手/床，能感知人、能提醒。"),
                         ("极简整理工具", "先帮你扔东西，再管理剩下的。")],
            "健康身心": [("呼吸训练器", "用麦克风 + 震动引导冥想。"),
                         ("睡眠数据面板", "别只说睡了多久，要说深睡在什么时候。")],
            "购物服务": [("保价助手", "下单 30 天内降价自动提醒 + 一键差价退款。"),
                         ("保修管家", "自动聚合所有设备的保修期 + 上门保养提醒。")],
            "其他灵感": [("轻量级创业", "先做最小可行版 + 低成本获客，两周上线。"),
                         ("订阅式服务", "把一个小体验做成月费订阅，给粉丝。"),
                         ("工具 + 社区", "先做工具解决问题，再聚拢同好。")],
        }
        lead = items[0] if items else None
        directions = []
        if lead:
            for title, desc in AI_IDEAS.get(lead.get("category", "其他灵感"), AI_IDEAS["其他灵感"]):
                directions.append({"title": title, "desc": desc, "source": "rule-engine"})
        return {
            "totalComplaints": len(items),
            "opportunityCount": sum(1 for i in items if i.get("opportunity")),
            "topCategories": [{"name": n, "count": c} for n, c in top_cats],
            "leadComplaint": lead,
            "aiDirections": directions,
            "engine": "rule-engine",
        }


class QuietServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--proxy", default=PROXY)
    ap.add_argument("--now", action="store_true", help="启动时立即抓一次")
    args = ap.parse_args()

    if args.now:
        fetch_all(force=True)

    srv = QuietServer(("127.0.0.1", args.port), Handler)
    print(f"[proxy] listening on http://127.0.0.1:{args.port}  proxy={args.proxy}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n[proxy] stopped")
