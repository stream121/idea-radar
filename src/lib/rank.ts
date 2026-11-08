// 灵感雷达每日榜单：从当日抓取池（目标 ~200 条）筛选 TOP 70 上榜，
// 按日期持久化到 .data/rank.json，当天榜单保持稳定。
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Complaint, RankMeta } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const RANK_FILE = path.join(DATA_DIR, "rank.json");

export const RANK_SIZE = 70; // 每日榜单条数
export const MIN_POOL = 100; // 筛选池低于该值视为降级抓取，不覆盖当日已有榜单

interface RankFile {
  date: string; // YYYY-MM-DD
  from: number; // 当日筛选池总量
  items: Complaint[];
}

export function todayStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

async function readRankFile(): Promise<RankFile | null> {
  try {
    const raw = await fs.readFile(RANK_FILE, "utf8");
    return JSON.parse(raw) as RankFile;
  } catch {
    return null;
  }
}

/** 读取今日榜单（若无或日期过期返回 null） */
export async function loadTodayRank(): Promise<RankFile | null> {
  const f = await readRankFile();
  if (f && f.date === todayStr()) return f;
  return null;
}

export async function saveTodayRank(items: Complaint[], from: number) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(
      RANK_FILE,
      JSON.stringify({ date: todayStr(), from, items } satisfies RankFile)
    );
  } catch (e) {
    console.warn("[rank] save failed", (e as Error).message);
  }
}

/* ---------- 策展：筛选 TOP 70 ---------- */

function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
}

/**
 * 从抓取池筛选榜单：
 * 1. 按标题去重（保留热度高者）
 * 2. 打分 = 热度 + 机会加成 + 新鲜度加成
 * 3. 品类/版块多样性约束，避免大版块霸榜
 * 4. 赋 rank 1..N
 */
export function curateToRank(all: Complaint[], size = RANK_SIZE): Complaint[] {
  // 去重
  const seen = new Map<string, Complaint>();
  for (const c of all) {
    const key = normTitle(c.title);
    if (!key) continue;
    const prev = seen.get(key);
    if (!prev || c.heat > prev.heat) seen.set(key, c);
  }
  const now = Date.now() / 1000;
  const scored = [...seen.values()].map((c) => {
    const ageDays = (now - c.createdAt) / 86400;
    const recency = ageDays <= 2 ? 8 : ageDays <= 7 ? 4 : 0;
    return { c, score: c.heat + (c.opportunity ? 15 : 0) + recency };
  });
  scored.sort((a, b) => b.score - a.score);

  // 多样性约束：单品类 ≤ 16、单版块 ≤ 18
  const catCount = new Map<string, number>();
  const subCount = new Map<string, number>();
  const picked: Complaint[] = [];
  for (const { c } of scored) {
    if (picked.length >= size) break;
    if ((catCount.get(c.category) ?? 0) >= 16) continue;
    if ((subCount.get(c.subreddit) ?? 0) >= 18) continue;
    picked.push(c);
    catCount.set(c.category, (catCount.get(c.category) ?? 0) + 1);
    subCount.set(c.subreddit, (subCount.get(c.subreddit) ?? 0) + 1);
  }
  // 约束过严未满员时，按分补满（同样遵守配额，宁缺毋滥）
  if (picked.length < size) {
    for (const { c } of scored) {
      if (picked.length >= size) break;
      if (picked.includes(c)) continue;
      if ((catCount.get(c.category) ?? 0) >= 16) continue;
      if ((subCount.get(c.subreddit) ?? 0) >= 18) continue;
      picked.push(c);
      catCount.set(c.category, (catCount.get(c.category) ?? 0) + 1);
      subCount.set(c.subreddit, (subCount.get(c.subreddit) ?? 0) + 1);
    }
  }

  picked.forEach((c, i) => {
    c.rank = i + 1;
    c.ranked = true;
  });
  return picked;
}

/**
 * 把榜单排名回填到当前 complaints 上（保留未上榜的其余条目供「全部抱怨」查看）
 */
export function applyRankToPool(pool: Complaint[], rankItems: Complaint[]): Complaint[] {
  const rankMap = new Map(rankItems.map((c, i) => [c.id, i + 1]));
  for (const c of pool) {
    const r = rankMap.get(c.id);
    if (r) {
      c.rank = r;
      c.ranked = true;
    } else {
      c.rank = undefined;
      c.ranked = false;
    }
  }
  return pool;
}

export function toRankMeta(f: RankFile | null): RankMeta | null {
  if (!f) return null;
  return { date: f.date, size: f.items.length, from: f.from };
}
