"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DashboardData, TranslateEngine } from "@/lib/types";

function fmtTime(ts: number): string {
  if (!ts) return "--:--";
  return new Date(ts).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 简单 SVG 折线图（无依赖） */
function LineChart({ points }: { points: { label: string; total: number; opp: number }[] }) {
  if (points.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center font-mono text-[13px] text-ink-faint">
        快照不足，去工作台点「刷新」多抓几次
      </div>
    );
  }
  const W = 640;
  const H = 150;
  const padX = 34;
  const padY = 18;
  const max = Math.max(10, ...points.map((p) => p.total));
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const x = (i: number) => padX + (i / (points.length - 1)) * innerW;
  const y = (v: number) => padY + innerH - (v / max) * innerH;

  const totalPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(" ");
  const oppPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.opp).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" xmlns="http://www.w3.org/2000/svg">
      {/* 网格线 */}
      {[0, 1, 2, 3].map((i) => {
        const gy = padY + (innerH / 3) * i;
        return (
          <line
            key={i}
            x1={padX}
            y1={gy}
            x2={W - padX}
            y2={gy}
            stroke="#23211C"
            strokeWidth="0.6"
            opacity="0.12"
          />
        );
      })}
      {/* 总条数线 */}
      <path d={totalPath} fill="none" stroke="#5E7A3C" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {/* 机会线 */}
      <path d={oppPath} fill="none" stroke="#D9532B" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {/* 数据点 + 标签 */}
      {points.map((p, i) => (
        <g key={p.label}>
          <circle cx={x(i)} cy={y(p.total)} r="3" fill="#FFFCF3" stroke="#5E7A3C" strokeWidth="1.6" />
          <circle cx={x(i)} cy={y(p.opp)} r="3" fill="#FFFCF3" stroke="#D9532B" strokeWidth="1.6" />
          <text x={x(i)} y={H - 3} textAnchor="middle" fontSize="8" fill="#8C8577" fontFamily="monospace">
            {p.label}
          </text>
        </g>
      ))}
      {/* 图例 */}
      <text x={W - 120} y={12} fontSize="9" fill="#5E7A3C" fontFamily="monospace">
        ─ 总条数
      </text>
      <text x={W - 60} y={12} fontSize="9" fill="#D9532B" fontFamily="monospace">
        ─ 机会
      </text>
    </svg>
  );
}

function BarRow({ name, count, max, color }: { name: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 flex-none truncate text-right font-mono text-[12px] text-ink-soft">{name}</span>
      <div className="h-4 flex-1 overflow-hidden rounded-sm bg-hair/40">
        <div
          className="h-full rounded-sm transition-all"
          style={{ width: `${Math.max(3, pct)}%`, background: color }}
        />
      </div>
      <span className="w-9 flex-none text-right font-mono text-[12px] font-bold text-ink">{count}</span>
    </div>
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className="card-sticker px-4 py-3">
      <div className="font-mono text-[11px] tracking-[.14em] text-ink-faint">{label}</div>
      <div className={`mt-1 text-2xl font-black tabular-nums ${accent ? "text-persimmon" : "text-ink"}`}>{value}</div>
      {sub && <div className="mt-0.5 font-mono text-[11px] text-ink-faint">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<7 | 30 | 90>(7);

  useEffect(() => {
    fetch("/api/dashboard", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: DashboardData) => {
        setData(d);
        setError("");
      })
      .catch((e) => {
        console.warn("[dashboard] fetch failed:", (e as Error).message);
        setError((e as Error).message);
      })
      .finally(() => setLoading(false));
  }, []);

  const rt: DashboardData["runtime"] | null = data?.runtime ?? null;
  const allTrend = (data?.trend ?? []).map((t) => ({ label: t.label, total: t.total, opp: t.opp }));
  // P2-1 需求趋势时间轴：7 / 30 / 90 天切换（真实快照，数据不足时不虚构）
  const trend = allTrend.slice(-range);
  const catMax = Math.max(1, ...(data?.categories.map((c) => c.count) ?? [1]));
  const subMax = Math.max(1, ...(data?.subreddits.map((c) => c.count) ?? [1]));

  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col bg-paper px-4 sm:px-8">
      {/* 顶部导航 */}
      <header className="flex min-h-[64px] flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b-[1.5px] border-ink py-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link
            href="/workbench"
            className="radius-rough-pill shadow-sticker inline-flex h-6 flex-none items-center gap-1 border-[1.5px] border-ink bg-paper px-2.5 font-mono text-[11px] text-ink transition-colors hover:bg-matcha-soft"
          >
            ← 返回工作台
          </Link>
          <Link
            href="/"
            className="radius-rough-pill shadow-sticker inline-flex h-6 flex-none items-center gap-1 border-[1.2px] border-ink/60 bg-paper px-2.5 font-mono text-[11px] text-ink-soft transition-colors hover:bg-matcha-soft"
          >
            ← 返回首页
          </Link>
          <div>
            <h1 className="font-serif text-2xl font-black leading-none tracking-wide text-ink">
              数据看板
            </h1>
            <p className="mt-1 font-mono text-[10px] tracking-[.24em] text-ink-soft">
              IDEA RADAR · DASHBOARD
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-ink-soft">
          <span className="chip">
            {rt ? `${rt.mode === "seed" ? "种子数据" : "RSS 实时"} · ${fmtTime(rt.lastFetchedAt)}` : "加载中…"}
          </span>
          <span className="chip">{loading ? "读取中" : "已更新"}</span>
        </div>
      </header>

      {error && (
        <div className="radius-rough-sm mt-6 border-[1.2px] border-persimmon bg-persimmon/10 px-4 py-3 font-mono text-[13px] text-persimmon">
          看板加载失败：{error}
        </div>
      )}

      {!data && !error && (
        <div className="mt-20 text-center font-mono text-[14px] text-ink-faint">数据加载中…</div>
      )}

      {data && (
        <main className="flex-1 py-6">
          {/* 统计卡 */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="抱怨总量" value={data.stats.total} sub="抓取总数" />
            <StatCard label="产品机会" value={data.stats.opp} sub="机会标记" accent />
            <StatCard label="收藏数" value={data.stats.favCount} sub="调研台收藏" />
            <StatCard label="速记数" value={data.stats.noteCount} sub="调研笔记" />
            <StatCard label="来源版块" value={data.stats.subredditCount} sub="subreddit" />
            <StatCard label="平均热度" value={data.stats.avgHeat} sub="0-100" />
          </section>

          {/* 趋势 + 分布 */}
          <section className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
            <div className="card-sticker-lg p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="sketch-line-b font-serif text-[15px] font-bold text-ink">需求趋势时间轴</h2>
                <div className="flex items-center gap-1">
                  {([7, 30, 90] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setRange(d)}
                      className={`h-6 radius-rough-pill px-2.5 font-mono text-[10.5px] font-bold transition-colors ${
                        range === d
                          ? "border-[1.2px] border-ink bg-matcha-deep text-surface shadow-sticker"
                          : "border-[1.2px] border-ink/50 bg-paper text-ink-soft hover:bg-matcha-soft"
                      }`}
                    >
                      近 {d} 天
                    </button>
                  ))}
                  <span className="ml-1 font-mono text-[11px] text-ink-faint">
                    当前 {trend.length} / 共 {allTrend.length} 天
                  </span>
                </div>
              </div>
              <LineChart points={trend} />
            </div>

            <div className="flex flex-col gap-5">
              <div className="card-sticker-lg p-4">
                <h2 className="sketch-line-b mb-3 font-serif text-[15px] font-bold text-ink">品类分布</h2>
                <div className="flex flex-col gap-2">
                  {data.categories.map((c) => (
                    <BarRow key={c.name} name={c.name} count={c.count} max={catMax} color="#7C9A52" />
                  ))}
                </div>
              </div>
              <div className="card-sticker-lg p-4">
                <h2 className="sketch-line-b mb-3 font-serif text-[15px] font-bold text-ink">版块分布</h2>
                <div className="flex flex-col gap-2">
                  {data.subreddits.map((s) => (
                    <BarRow key={s.name} name={`r/${s.name}`} count={s.count} max={subMax} color="#D9532B" />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 运行状态 + 热度 Top */}
          <section className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.6fr]">
            <div className="card-sticker-lg p-4">
              <h2 className="sketch-line-b mb-3 font-serif text-[15px] font-bold text-ink">运行状态</h2>
              <dl className="space-y-2.5 font-mono text-[13px]">
                {(
                  [
                    ["抓取模式", rt?.mode === "seed" ? "种子数据（降级）" : "Reddit RSS"],
                    ["实时抓取", rt?.live ? "✓ 在线" : "✗ 离线"],
                    ["翻译引擎", rt ? transLabel(rt.translateEngine) : "—"],
                    ["大模型", rt?.llmAvailable ? "DeepSeek 已配置" : "未配置（规则引擎）"],
                    ["抓取代理", rt?.proxy ?? "—"],
                    ["最近更新", rt ? fmtTime(rt.lastFetchedAt) : "—"],
                  ] as [string, string][]
                ).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border-b border-dashed border-ink/20 pb-1.5">
                    <dt className="text-ink-faint">{k}</dt>
                    <dd className="font-bold text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="card-sticker-lg p-4">
              <h2 className="sketch-line-b mb-3 font-serif text-[15px] font-bold text-ink">热度 TOP 5</h2>
              <div className="space-y-2">
                {data.topComplaints.map((c, i) => (
                  <a
                    key={c.id}
                    href={c.url || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="radius-rough-sm flex items-center gap-3 px-2 py-1.5 transition-colors hover:bg-matcha-soft"
                  >
                    <span className="w-5 flex-none text-center font-mono text-[12px] font-bold text-persimmon">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium text-ink">
                        {c.titleZh || c.title}
                      </div>
                      <div className="font-mono text-[11px] text-ink-faint">
                        r/{c.subreddit} · {c.category}
                      </div>
                    </div>
                    <span className="flex-none font-mono text-[13px] font-bold tabular-nums text-ink-soft">
                      {c.heat}
                    </span>
                  </a>
                ))}
                {data.topComplaints.length === 0 && (
                  <div className="font-mono text-[13px] text-ink-faint">暂无数据</div>
                )}
              </div>
            </div>
          </section>
        </main>
      )}

      <footer className="flex flex-none flex-wrap items-center gap-x-2 gap-y-1 border-t border-dashed border-ink/25 px-2 py-2 font-mono text-[10.5px] text-ink-faint">
        <span>数据看板 · 统计来自当前缓存，趋势来自抓取快照（.data/snapshots.json）</span>
      </footer>
    </div>
  );
}

function transLabel(e: TranslateEngine): string {
  if (e === "llm") return "DeepSeek";
  if (e === "free") return "免费机译";
  return "未翻译";
}
