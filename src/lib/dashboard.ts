// 数据看板后端支撑：抓取快照持久化 + 趋势聚合 + 收藏/速记服务端存储。
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  DashboardData,
  FetchMode,
  NotesData,
  SnapshotPoint,
  TranslateEngine,
  TrendPoint,
} from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const SNAPSHOT_FILE = path.join(DATA_DIR, "snapshots.json");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");

const MAX_SNAPSHOTS = 200; // 最多保留 200 条快照，控制文件体积

/* ---------- 快照持久化 ---------- */

async function readSnapshots(): Promise<SnapshotPoint[]> {
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE, "utf8");
    const arr = JSON.parse(raw) as SnapshotPoint[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** 抓取完成后追加一条快照；同一分钟内重复不写（避免刷新刷屏） */
export async function recordSnapshot(s: SnapshotPoint) {
  try {
    const list = await readSnapshots();
    const last = list[list.length - 1];
    if (last && Math.abs(s.ts - last.ts) < 60 * 1000) return;
    list.push(s);
    const trimmed = list.slice(-MAX_SNAPSHOTS);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(SNAPSHOT_FILE, JSON.stringify(trimmed));
  } catch (e) {
    console.warn("[dashboard] snapshot write failed", (e as Error).message);
  }
}

/** 读取最近 N 条快照（时间正序） */
export async function getSnapshots(n = 60): Promise<SnapshotPoint[]> {
  const list = await readSnapshots();
  return list.slice(-n);
}

/** 按天聚合快照：取每天最后一次抓取作为该日代表点 */
export function aggregateByDay(points: SnapshotPoint[]): TrendPoint[] {
  const dayMap = new Map<string, SnapshotPoint>();
  for (const p of points) {
    const key = new Date(p.ts * 1000).toISOString().slice(0, 10);
    dayMap.set(key, p); // 后者覆盖 = 取当日最后一条
  }
  return [...dayMap.entries()].map(([key, p]) => ({
    label: key.slice(5).replace("-", "/"), // MM/DD
    ts: p.ts,
    total: p.total,
    opp: p.opp,
    live: p.live,
  }));
}

/* ---------- 收藏 / 速记服务端持久化 ---------- */

export async function readNotes(): Promise<NotesData> {
  try {
    const raw = await fs.readFile(NOTES_FILE, "utf8");
    const d = JSON.parse(raw) as NotesData;
    return {
      favorites: Array.isArray(d.favorites) ? d.favorites : [],
      notes: d.notes ?? {},
      statuses: d.statuses ?? {},
    };
  } catch {
    return { favorites: [], notes: {}, statuses: {} };
  }
}

export async function writeNotes(data: NotesData) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(NOTES_FILE, JSON.stringify(data));
}

/** 当前翻译引擎快照（供记录快照用） */
export function engineLabel(e: TranslateEngine): TranslateEngine {
  return e;
}

export type { FetchMode };

/* ---------- 看板数据聚合（/api/dashboard 与 AI 助手共用） ---------- */

/** 汇总当前缓存数据的统计、分布、运行状态与趋势，供看板页 / 周报 / 预警复用 */
export async function getDashboardData(): Promise<DashboardData> {
  const { fetchComplaints } = await import("@/lib/reddit");
  const { translateComplaints } = await import("@/lib/translate");
  const { hasLLM } = await import("@/lib/llm/client");

  const data = await fetchComplaints(false);
  let complaints = data.complaints;
  let translateEngine: TranslateEngine = "none";
  if (data.mode === "rss") {
    const tr = await translateComplaints(complaints, { refresh: false });
    complaints = tr.complaints;
    translateEngine = tr.engine;
  }

  const opp = complaints.filter((c) => c.opportunity).length;
  const avgHeat =
    complaints.length > 0
      ? Math.round(complaints.reduce((s, c) => s + (c.heat || 0), 0) / complaints.length)
      : 0;

  const catMap = new Map<string, number>();
  for (const c of complaints) catMap.set(c.category, (catMap.get(c.category) ?? 0) + 1);
  const categories = [...catMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const subMap = new Map<string, number>();
  for (const c of complaints) subMap.set(c.subreddit, (subMap.get(c.subreddit) ?? 0) + 1);
  const subreddits = [...subMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const topComplaints = [...complaints].sort((a, b) => b.heat - a.heat).slice(0, 5);

  const notesData = await readNotes();
  const snaps = await getSnapshots(100);
  const trend = aggregateByDay(snaps).slice(-90);

  return {
    stats: {
      total: complaints.length,
      opp,
      favCount: notesData.favorites.length,
      noteCount: Object.keys(notesData.notes).length,
      subredditCount: subreddits.length,
      avgHeat,
    },
    categories,
    subreddits,
    topComplaints,
    runtime: {
      mode: data.mode,
      live: data.live,
      translateEngine,
      llmAvailable: hasLLM(),
      lastFetchedAt: data.fetchedAt,
      proxy: (process.env.REDDIT_PROXY || "http://127.0.0.1:7890").replace(/^https?:\/\//, ""),
    },
    trend,
  };
}
