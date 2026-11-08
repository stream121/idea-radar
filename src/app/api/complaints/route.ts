import { NextRequest } from "next/server";
import { fetchComplaints, fetchCachedOrSeed } from "@/lib/reddit";
import { translateComplaints } from "@/lib/translate";
import { hasLLM } from "@/lib/llm/client";
import { recordSnapshot } from "@/lib/dashboard";
import {
  curateToRank,
  loadTodayRank,
  saveTodayRank,
  applyRankToPool,
  toRankMeta,
  todayStr,
} from "@/lib/rank";
import type { TranslateEngine } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 整体超时上限：真实抓取（并发 8 版块 + 翻译）正常 ~10s，最坏挂 45s 后降级返回缓存/种子，保证页面始终有内容 */
const COMPLAINTS_TIMEOUT_MS = 45_000;

/** 主链路：抓取 + 翻译 + 快照 + 定榜 */
async function loadComplaints(refresh: boolean) {
  const data = await fetchComplaints(refresh);
  let complaints = data.complaints;
  let translateEngine: TranslateEngine = "none";
  // 种子数据自带中文标题；RSS 数据才需要翻译
  if (data.mode === "rss") {
    const tr = await translateComplaints(complaints, { refresh });
    complaints = tr.complaints;
    translateEngine = tr.engine;
  }
  // 记录抓取快照（供数据看板趋势图）
  await recordSnapshot({
    ts: Math.floor(data.fetchedAt / 1000),
    total: complaints.length,
    opp: complaints.filter((c) => c.opportunity).length,
    live: data.live,
    mode: data.mode,
    translateEngine,
  });
  // 每日榜单：从抓取池筛选 TOP 70 并持久化。
  // 定榜规则：真实 RSS 抓取即可定榜；池子不小于已有榜单规模时才刷新当日榜单（防降级缩水覆盖）
  const ranked = curateToRank(complaints);
  let todayRank = await loadTodayRank();
  if (data.mode === "rss" && (!todayRank || complaints.length >= todayRank.from)) {
    await saveTodayRank(ranked, complaints.length);
    todayRank = { date: todayStr(), from: complaints.length, items: ranked };
  }
  const final = todayRank
    ? applyRankToPool(complaints, todayRank.items)
    : applyRankToPool(complaints, ranked);
  return {
    complaints: final,
    live: data.live,
    mode: data.mode,
    fetchedAt: data.fetchedAt,
    subreddits: data.subreddits,
    translateEngine,
    llmAvailable: hasLLM(),
    rankMeta: toRankMeta(
      todayRank ??
        (data.mode === "rss"
          ? { date: todayStr(), from: complaints.length, items: ranked }
          : null)
    ),
  };
}

/** 超时降级：返回磁盘缓存（忽略 TTL）或种子数据，跳过翻译/快照/定榜，保证结构一致 */
async function fallbackComplaints() {
  const d = await fetchCachedOrSeed();
  return {
    complaints: d.complaints,
    live: d.live,
    mode: d.mode,
    fetchedAt: d.fetchedAt,
    subreddits: d.subreddits,
    translateEngine: "none" as TranslateEngine,
    llmAvailable: hasLLM(),
    rankMeta: null,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`fetch complaints timed out after ${ms}ms`)),
        ms
      );
    }),
  ]).catch(async (e) => {
    console.warn("[api/complaints] timed out, fallback to cached/seed:", (e as Error).message);
    return fallback();
  });
}

export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  try {
    return Response.json(await withTimeout(loadComplaints(refresh), COMPLAINTS_TIMEOUT_MS, fallbackComplaints));
  } catch (e) {
    console.error("[api/complaints] error:", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
