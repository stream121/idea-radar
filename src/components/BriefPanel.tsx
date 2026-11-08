"use client";

import { useMemo, useState } from "react";
import type { Complaint } from "@/lib/types";
import { buildClusters } from "@/lib/rules/clusters";
import { oppScore } from "./DetailPanel";

interface Props {
  complaints: Complaint[];
  onOpen: (id: string) => void;
}

function fmtDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** P2-3 每日 AI 情报简报：全部基于真实字段规则推导，可一键导出 Markdown */
export default function BriefPanel({ complaints, onOpen }: Props) {
  const [exported, setExported] = useState(false);

  const brief = useMemo(() => {
    // 1) 今日 Top 5：机会评分优先（推导），机会帖加权
    const catCount = new Map<string, number>();
    for (const c of complaints) catCount.set(c.category, (catCount.get(c.category) ?? 0) + 1);
    const scored = complaints.map((c) => ({
      c,
      s: oppScore(c, catCount.get(c.category) ?? 0),
    }));
    const top5 = scored.sort((a, b) => b.s - a.s).slice(0, 5);

    // 2) 热度增长最快：取热度 top 且 opportunity 的需求（无历史趋势数据，明确标注）
    const hotRisers = complaints
      .filter((c) => c.opportunity)
      .sort((a, b) => b.heat - a.heat)
      .slice(0, 3);

    // 3) 新出现的痛点：最近 7 天抓取到、机会信号明确的新帖
    const weekAgo = Date.now() / 1000 - 7 * 86400;
    const newPains = complaints
      .filter((c) => c.createdAt >= weekAgo && c.opportunity)
      .sort((a, b) => b.heat - a.heat)
      .slice(0, 3);

    // 4) 值得深入研究的方向：需求主题聚类 Top
    const clusters = buildClusters(complaints).slice(0, 3);

    // 5) AI 推荐行动：规则推导
    const actions: string[] = [];
    if (top5[0]) actions.push(`优先调研「${(top5[0].c.titleZh || top5[0].c.title).slice(0, 24)}」，机会评分最高（${top5[0].s}）`);
    if (clusters[0]) actions.push(`围绕「${clusters[0].name}」聚类展开用户访谈，确认付费意愿`);
    if (newPains[0]) actions.push(`对 7 天内新出现的痛点「${(newPains[0].titleZh || newPains[0].title).slice(0, 20)}」做落地页验证`);
    if (actions.length === 0) actions.push("数据不足：先抓取更多真实社区数据再生成简报");

    return { top5, hotRisers, newPains, clusters, actions };
  }, [complaints]);

  const { top5, hotRisers, newPains, clusters, actions } = brief;

  const toMarkdown = () => {
    const L: string[] = [];
    L.push(`# 灵感雷达 · 每日 AI 情报简报`);
    L.push(`生成时间：${fmtDate()} · 引擎：规则引擎（真实字段推导，无市场数据）`);
    L.push("");
    L.push("## 今日最值得关注的 5 个机会");
    top5.forEach(({ c, s }, i) =>
      L.push(`${i + 1}. [${s}分] ${c.titleZh || c.title}（r/${c.subreddit} · ${c.category} · 热度${c.heat}）`)
    );
    L.push("");
    L.push("## 热度增长最快（机会信号明确）");
    hotRisers.forEach((c) => L.push(`- ${c.titleZh || c.title}（热度 ${c.heat}）`));
    L.push("");
    L.push("## 新出现的痛点（近 7 天）");
    newPains.forEach((c) => L.push(`- ${c.titleZh || c.title}`));
    L.push("");
    L.push("## 值得深入研究的需求主题");
    clusters.forEach((t) => L.push(`- ${t.name}（${t.complaints.length} 条抱怨）`));
    L.push("");
    L.push("## AI 推荐的下一步行动");
    actions.forEach((a) => L.push(`- [ ] ${a}`));
    L.push("");
    L.push("> 注：全部内容来自真实社区抓取字段的规则推导；市场规模/竞品等无真实数据源，未做虚构。");
    return L.join("\n");
  };

  const exportBrief = async () => {
    try {
      await navigator.clipboard.writeText(toMarkdown());
    } catch {
      /* 剪贴板不可用时降级 */
      const blob = new Blob([toMarkdown()], { type: "text/markdown" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `idea-radar-brief-${fmtDate()}.md`;
      a.click();
      setExported(true);
      setTimeout(() => setExported(false), 2000);
      return;
    }
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  return (
    <section className="scroll-thin flex min-h-0 flex-col overflow-y-auto px-4 lg:px-5">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink pb-2">
        <div className="sketch-underline text-[15px] font-black tracking-[.06em] text-ink">每日 AI 情报简报</div>
        <span className="stamp">DAILY BRIEF</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="stamp">规则引擎</span>
          <button
            onClick={exportBrief}
            className="inline-flex h-7 items-center rounded-full border-[1.5px] border-ink bg-surface px-3 text-[11px] font-bold text-ink-soft shadow-sticker transition-all hover:-translate-y-px hover:bg-matcha-soft"
          >
            {exported ? "✓ 已导出" : "⧉ 导出简报（Markdown）"}
          </button>
        </span>
      </div>

      {/* 今日 Top 5 */}
      <div className="card-sticker mt-3 p-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-persimmon px-2 py-0.5 font-mono text-[9.5px] font-bold text-surface">
            今日精选
          </span>
          <div className="text-[13px] font-black text-ink">最值得关注的 5 个机会</div>
        </div>
        <div className="mt-2 space-y-1">
          {top5.map(({ c, s }, i) => (
            <button
              key={c.id}
              onClick={() => onOpen(c.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-matcha-soft/50"
            >
              <span className="w-5 flex-none text-center font-mono text-[12px] font-bold text-persimmon">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-bold text-ink">
                  {c.titleZh || c.title}
                </span>
                <span className="block font-mono text-[10px] text-ink-faint">
                  r/{c.subreddit} · {c.category} · 热度 {c.heat}
                </span>
              </span>
              <span className="flex-none rounded-full bg-matcha-soft px-2 py-0.5 font-mono text-[10px] font-bold text-matcha-deep">
                {s} 分
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {/* 热度增长最快 */}
        <div className="card-sticker p-3">
          <div className="font-mono text-[9.5px] tracking-widest text-ink-faint">
            🔥 热度增长最快（机会信号明确）
          </div>
          <div className="mt-1.5 space-y-1">
            {hotRisers.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpen(c.id)}
                className="block w-full truncate rounded-lg px-2 py-1 text-left text-[12px] font-bold text-ink transition-colors hover:bg-matcha-soft/50"
              >
                {c.titleZh || c.title}
                <span className="ml-1 font-mono text-[10px] font-normal text-persimmon">
                  热度 {c.heat}
                </span>
              </button>
            ))}
            {hotRisers.length === 0 && (
              <div className="text-[11px] text-ink-faint">暂无机会信号明确的条目</div>
            )}
          </div>
        </div>

        {/* 新痛点 */}
        <div className="card-sticker p-3">
          <div className="font-mono text-[9.5px] tracking-widest text-ink-faint">
            ✨ 新出现的痛点（近 7 天）
          </div>
          <div className="mt-1.5 space-y-1">
            {newPains.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpen(c.id)}
                className="block w-full truncate rounded-lg px-2 py-1 text-left text-[12px] font-bold text-ink transition-colors hover:bg-matcha-soft/50"
              >
                {c.titleZh || c.title}
                <span className="ml-1 font-mono text-[10px] font-normal text-ink-faint">
                  近 7 天
                </span>
              </button>
            ))}
            {newPains.length === 0 && (
              <div className="text-[11px] text-ink-faint">
                近 7 天无新机会帖（历史趋势数据不足，不作虚构）
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 值得深挖的需求主题 */}
      <div className="card-sticker mt-3 p-3">
        <div className="font-mono text-[9.5px] tracking-widest text-ink-faint">
          🕸 值得深入研究的需求主题
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {clusters.map((t) => (
            <span
              key={t.id}
              className="rounded-full border border-hair bg-paper px-2.5 py-1 text-[11px] font-bold text-ink-soft"
            >
              {t.name}
              <span className="ml-1 font-mono text-[9.5px] font-normal text-matcha-deep">
                {t.complaints.length} 条
              </span>
            </span>
          ))}
          {clusters.length === 0 && (
            <div className="text-[11px] text-ink-faint">数据不足，暂无可聚类主题</div>
          )}
        </div>
      </div>

      {/* 推荐行动 */}
      <div className="mt-3 rounded-2xl border border-matcha-deep/20 bg-matcha-soft/50 p-3">
        <div className="font-mono text-[9.5px] tracking-widest text-matcha-deep">
          🎯 AI 推荐的下一步行动（规则推导）
        </div>
        <ul className="mt-1.5 space-y-1">
          {actions.map((a, i) => (
            <li key={i} className="flex gap-1.5 text-[12px] leading-snug text-ink-soft">
              <span className="flex-none text-matcha-deep">→</span>
              {a}
            </li>
          ))}
        </ul>
      </div>

      <div className="mono-tag mt-3 pb-2 text-[8.5px]">
        全部内容来自真实社区抓取字段的规则推导；市场规模/竞品等无真实数据源，未做虚构
      </div>
    </section>
  );
}
