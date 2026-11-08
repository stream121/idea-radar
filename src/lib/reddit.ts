import { createConnection, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Complaint, FetchMode } from "@/lib/types";
import {
  guessCategory,
  isOpportunity,
  estimateHeat,
} from "@/lib/rules/classify";
import { SEED_COMPLAINTS } from "@/lib/data/seed";

// 8 个版块，每版块 RSS 约 25 条 → 全量成功约 200 条，供「每日榜单」筛选
export const SUBS = [
  "SomebodyMakeThis",
  "mildlyinfuriating",
  "CrappyDesign",
  "assholedesign",
  "softwaregore",
  "Lightbulb",
  "tifu",
  "DoesAnybodyElse",
] as const;
const PROXY = process.env.REDDIT_PROXY || "http://127.0.0.1:7890";
const UA = "IdeaRadarBot/1.0 (demo)";
const TTL = 10 * 60 * 1000; // 10 分钟缓存
const DATA_DIR = path.join(process.cwd(), ".data");

/* ---------- 通过本机 HTTP 代理建立 CONNECT 隧道 + 手动 TLS ---------- */

function proxyParts() {
  const u = new URL(PROXY);
  return { host: u.hostname, port: Number(u.port || 7890) };
}

function tunnel(hostname: string, port: number, timeoutMs = 12000): Promise<Socket> {
  const { host, port: pport } = proxyParts();
  return new Promise((resolve, reject) => {
    const sock = createConnection({ host, port: pport }, () => {
      sock.write(
        `CONNECT ${hostname}:${port} HTTP/1.1\r\nHost: ${hostname}:${port}\r\nUser-Agent: ${UA}\r\n\r\n`
      );
    });
    let buffered = "";
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error(`proxy CONNECT timeout ${hostname}:${port}`));
    }, timeoutMs);
    sock.on("data", (chunk) => {
      buffered += chunk.toString("utf8");
      const idx = buffered.indexOf("\r\n\r\n");
      if (idx === -1) return;
      clearTimeout(timer);
      const head = buffered.slice(0, idx);
      if (!/^HTTP\/1\.1 200/i.test(head)) {
        sock.destroy();
        reject(new Error(`proxy CONNECT failed: ${head.split("\r\n")[0]}`));
        return;
      }
      const rest = buffered.slice(idx + 4);
      if (rest.length > 0) sock.unshift(Buffer.from(rest, "utf8"));
      sock.removeAllListeners("data");
      resolve(sock);
    });
    sock.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function tlsViaProxy(
  hostname: string,
  port: number,
  timeoutMs: number
): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    tunnel(hostname, port, timeoutMs)
      .then((raw) => {
        const sock = tlsConnect({ socket: raw, servername: hostname }, () => {
          sock.removeListener("error", onErr);
          resolve(sock);
        });
        const onErr = (e: Error) => {
          sock.destroy();
          reject(e);
        };
        sock.once("error", onErr);
      })
      .catch(reject);
  });
}

function decodeChunked(buf: Buffer): Buffer {
  const out: Buffer[] = [];
  let i = 0;
  while (i < buf.length) {
    const eol = buf.indexOf("\r\n", i);
    if (eol === -1) break;
    const size = parseInt(buf.slice(i, eol).toString("utf8"), 16);
    if (Number.isNaN(size) || size === 0) break;
    out.push(buf.slice(eol + 2, eol + 2 + size));
    i = eol + 2 + size + 2;
  }
  return Buffer.from(Buffer.concat(out));
}

export function getViaProxy(url: string, timeoutMs = 15000): Promise<Buffer> {
  const u = new URL(url);
  const port = Number(u.port || 443);
  return new Promise((resolve, reject) => {
    tlsViaProxy(u.hostname, port, timeoutMs)
      .then((sock) => {
        let buf = Buffer.alloc(0);
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          sock.destroy();
          reject(new Error(`timeout ${url}`));
        }, timeoutMs);

        sock.on("data", (d: Buffer) => {
          buf = Buffer.from(Buffer.concat([buf, d]));
        });
        sock.on("end", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const headEnd = buf.indexOf("\r\n\r\n");
          if (headEnd === -1) {
            reject(new Error(`bad response for ${url}`));
            return;
          }
          const head = buf.slice(0, headEnd).toString("utf8");
          const statusLine = head.split("\r\n")[0];
          const status = Number(statusLine.split(" ")[1] ?? 0);
          let body = buf.slice(headEnd + 4);
          if (status !== 200) {
            reject(new Error(`HTTP ${status} for ${url}`));
            return;
          }
          if (/transfer-encoding:\s*chunked/i.test(head)) {
            body = Buffer.from(decodeChunked(body));
          }
          resolve(body);
        });
        sock.on("error", (e: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(e);
        });

        sock.write(
          `GET ${u.pathname + u.search} HTTP/1.1\r\n` +
            `Host: ${u.hostname}\r\n` +
            `User-Agent: ${UA}\r\n` +
            `Accept: application/atom+xml\r\n` +
            `Accept-Encoding: identity\r\n` +
            `Connection: close\r\n\r\n`
        );
      })
      .catch(reject);
  });
}

/* ---------- Atom 解析（正则，无依赖） ---------- */

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    // RSS 内容常见二次转义的数字实体（如 &amp;#32; → &#32;），统一还原
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAtom(xml: string, subreddit: string): Complaint[] {
  const out: Complaint[] = [];
  const entryRe = /<entry>[\s\S]*?<\/entry>/g;
  const titleRe = /<title>([\s\S]*?)<\/title>/;
  const contentRe = /<content[\s\S]*?>([\s\S]*?)<\/content>/;
  const publishedRe = /<published>([^<]+)<\/published>/;
  const linkRe = /<link rel="alternate" href="([^"]+)"/;
  const authorRe = /<author>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/author>/;

  const entries = xml.match(entryRe) ?? [];
  entries.forEach((e, i) => {
    const mTitle = e.match(titleRe);
    const title = mTitle ? decodeXml(mTitle[1]).trim() : "";
    if (!title) return;
    // 跳过自动置顶帖
    const mAuth = e.match(authorRe);
    const author = mAuth ? mAuth[1] : "";
    if (author === "/u/AutoModerator") return;

    const mContent = e.match(contentRe);
    const rawContent = mContent ? decodeXml(mContent[1]) : "";
    const plain = stripHtml(rawContent);
    const excerpt = plain.length > 120 ? plain.slice(0, 120) + "…" : plain;

    const mLink = e.match(linkRe);
    const url = mLink ? decodeXml(mLink[1]) : "";

    const mPub = e.match(publishedRe);
    let createdAt = Date.now() / 1000 - 86400 * 2;
    if (mPub) {
      const t = Date.parse(mPub[1]);
      if (!Number.isNaN(t)) createdAt = t / 1000;
    }

    out.push({
      id: `${subreddit}-${i}`,
      titleZh: title,
      title,
      excerpt,
      url,
      subreddit,
      category: guessCategory(title, excerpt),
      heat: estimateHeat(title, excerpt, subreddit),
      comments: 0,
      score: 0,
      createdAt,
      opportunity: isOpportunity(title, subreddit),
      source: "reddit",
    });
  });
  return out;
}

/* ---------- Hacker News 数据源（Ask HN，经 Algolia API） ---------- */

interface HnHit {
  objectID: string;
  title?: string;
  points?: number;
  num_comments?: number;
  created_at_i?: number;
}

/** 抓取 Ask HN 高分帖子：默认按相关度返回历史经典 Ask HN（如 FCC 提案等），与旧版数据一致 */
async function fetchHackerNews(): Promise<Complaint[]> {
  try {
    const buf = await getViaProxy(
      "https://hn.algolia.com/api/v1/search?tags=ask_hn&hitsPerPage=100",
      12000
    );
    const data = JSON.parse(buf.toString("utf8"));
    const hits: HnHit[] = data?.hits ?? [];
    return hits
      .filter((h) => h && h.title && h.title.trim().length > 0)
      .map((h) => {
        const title = h.title!.trim();
        const score = h.points || 0;
        const comments = h.num_comments || 0;
        // 热度：结合 HN 分数/评论数的对数估算，高分帖 ≈100
        const heat = Math.min(100, 30 + Math.round(Math.log10(score + comments + 1) * 22));
        return {
          id: `hn-${h.objectID}`,
          titleZh: title,
          title,
          excerpt: title.length > 120 ? title.slice(0, 120) + "…" : title,
          url: `https://news.ycombinator.com/item?id=${h.objectID}`,
          subreddit: "Hacker News",
          category: guessCategory(title, title),
          heat,
          comments,
          score,
          createdAt: h.created_at_i ?? Math.floor(Date.now() / 1000),
          opportunity: isOpportunity(title, "Hacker News"),
          source: "reddit" as const,
        };
      });
  } catch (e) {
    console.warn("[reddit] hacker news failed:", (e as Error).message);
    return [];
  }
}

/* ---------- 抓取 + 缓存 ---------- */

interface CacheFile {
  ts: number;
  mode: FetchMode;
  live: boolean;
  subreddits: string[];
  complaints: Complaint[];
}

let memCache: CacheFile | null = null;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readDiskCache(ignoreTtl = false): Promise<CacheFile | null> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, "cache.json"), "utf8");
    const data = JSON.parse(raw) as CacheFile;
    if (ignoreTtl || Date.now() - data.ts < TTL) return data;
  } catch {
    /* 无缓存 */
  }
  return null;
}

async function writeDiskCache(data: CacheFile) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(path.join(DATA_DIR, "cache.json"), JSON.stringify(data));
  } catch (e) {
    console.warn("[reddit] cache write failed", (e as Error).message);
  }
}

/**
 * 尽力降级：读取磁盘缓存（忽略 TTL），无缓存则返回种子数据。
 * 用于 /api/complaints 整体超时保护，保证接口最迟在规定时间内返回可用内容。
 */
export async function fetchCachedOrSeed(): Promise<{
  complaints: Complaint[];
  live: boolean;
  mode: FetchMode;
  fetchedAt: number;
  subreddits: string[];
}> {
  const disk = await readDiskCache(true);
  if (disk?.complaints?.length) {
    memCache = disk;
    return {
      complaints: disk.complaints,
      live: disk.live,
      mode: disk.mode,
      fetchedAt: disk.ts,
      subreddits: disk.subreddits,
    };
  }
  const seed: CacheFile = {
    ts: Date.now(),
    mode: "seed",
    live: false,
    subreddits: [...SUBS],
    complaints: SEED_COMPLAINTS,
  };
  memCache = seed;
  await writeDiskCache(seed);
  return {
    complaints: seed.complaints,
    live: false,
    mode: "seed",
    fetchedAt: seed.ts,
    subreddits: seed.subreddits,
  };
}

export async function fetchComplaints(
  refresh = false
): Promise<{ complaints: Complaint[]; live: boolean; mode: FetchMode; fetchedAt: number; subreddits: string[] }> {
  if (!refresh && memCache && Date.now() - memCache.ts < TTL) {
    return { ...memCache, fetchedAt: memCache.ts };
  }
  let prev: CacheFile | null = null;
  if (!refresh) {
    const disk = await readDiskCache();
    if (disk && Date.now() - disk.ts < TTL) {
      memCache = disk;
      return { ...disk, fetchedAt: disk.ts };
    }
    prev = disk;
  } else {
    // refresh 也读旧缓存用于合并，避免限流刷新把数据池缩小
    prev = await readDiskCache(true);
  }
  if (memCache && Date.now() - memCache.ts < 6 * 60 * 1000) prev = memCache;
  const all: Complaint[] = [];
  let okCount = 0;
  const failed: string[] = [];
  // 并发抓取（限 2 并发，避免同一 IP 同时多请求触发 429 雪崩）：
  // 8 版块分 4 批，批间 sleep 600ms，目标是把全量抓取压进 ~15s 内；
  // 单请求超时 6s 快速失败，429 重试一次（等 2s），尽量在时限内拿到 ≥2 版块真实数据
  const CONCURRENCY = 2;
  const SLEEP_MS = 600;
  for (let i = 0; i < SUBS.length; i += CONCURRENCY) {
    const batch = SUBS.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (sub) => {
        const one = async () => {
          const buf = await getViaProxy(`https://www.reddit.com/r/${sub}/.rss?limit=50&sort=new`, 6000);
          const items = parseAtom(buf.toString("utf8"), sub);
          return items;
        };
        try {
          const items = await one();
          if (items.length > 0) okCount++;
          return items;
        } catch (e) {
          const msg = (e as Error).message;
          // 429 限流：等 2 秒重试一次
          if (/429|Too Many/.test(msg)) {
            try {
              await sleep(2000);
              const items = await one();
              if (items.length > 0) okCount++;
              return items;
            } catch (e2) {
              failed.push(sub);
              console.warn(`[reddit] r/${sub} retry failed: ${(e2 as Error).message}`);
              return [] as Complaint[];
            }
          }
          failed.push(sub);
          console.warn(`[reddit] r/${sub} failed: ${msg}`);
          return [] as Complaint[];
        }
      })
    );
    for (const items of results) all.push(...items);
    // 批间限流保护
    if (i + CONCURRENCY < SUBS.length) await sleep(SLEEP_MS);
  }

  // Hacker News 数据源（Ask HN）：与 Reddit 并行补充，失败不影响主链路
  const hnItems = await fetchHackerNews();
  const hnOk = hnItems.length > 0;
  if (hnOk) {
    all.push(...hnItems);
    okCount += 1;
  }
  const subreddits = hnOk ? [...SUBS, "Hacker News"] : [...SUBS];

  // 部分失败时与旧缓存合并，保证覆盖面
  if (okCount > 0 && failed.length > 0 && prev?.complaints?.length) {
    const seen = new Set(all.map((c) => c.id));
    for (const c of prev.complaints) {
      if (!seen.has(c.id)) all.push(c);
    }
  }

  if (okCount === 0) {
    // 全部失败 → 降级种子
    const data: CacheFile = {
      ts: Date.now(),
      mode: "seed",
      live: false,
      subreddits: [...SUBS],
      complaints: SEED_COMPLAINTS,
    };
    memCache = data;
    await writeDiskCache(data);
    return { complaints: data.complaints, live: false, mode: "seed", fetchedAt: data.ts, subreddits: data.subreddits };
  }

  all.sort((a, b) => b.heat - a.heat);
  const data: CacheFile = {
    ts: Date.now(),
    mode: "rss",
    live: true,
    subreddits,
    complaints: all.slice(0, 200),
  };
  memCache = data;
  await writeDiskCache(data);
  return { complaints: data.complaints, live: true, mode: "rss", fetchedAt: data.ts, subreddits: data.subreddits };
}
