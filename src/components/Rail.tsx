"use client";

import type { CategoryId, Complaint, ViewKey } from "@/lib/types";
import { CATEGORY_COLORS } from "@/lib/rules/classify";
import { directionsFor } from "@/lib/rules/insights";

interface Props {
  complaints: Complaint[];
  view: ViewKey;
  onView: (v: ViewKey) => void;
  favCount: number;
  live: boolean;
  mode: "rss" | "seed";
  llmAvailable: boolean;
  /** 分类筛选（null = 全部） */
  category: CategoryId | null;
  onCategory: (c: CategoryId | null) => void;
  /** 数据源筛选（null = 全部） */
  source: string | null;
  onSource: (s: string | null) => void;
  /** 移动端抽屉关闭 */
  onClose?: () => void;
}

export default function Rail({
  complaints,
  view,
  onView,
  favCount,
  live,
  mode,
  llmAvailable,
  category,
  onCategory,
  source,
  onSource,
  onClose,
}: Props) {
  const oppCount = complaints.filter((c) => c.opportunity).length;
  const rankedCount = complaints.filter((c) => c.ranked).length;

  // 品类分布
  const catMap = new Map<CategoryId, { opp: number; total: number }>();
  for (const c of complaints) {
    const cur = catMap.get(c.category) ?? { opp: 0, total: 0 };
    cur.total++;
    if (c.opportunity) cur.opp++;
    catMap.set(c.category, cur);
  }
  const cats = [...catMap.entries()].sort((a, b) => b[1].total - a[1].total);

  // 来源分布
  const srcMap = new Map<string, number>();
  for (const c of complaints) srcMap.set(c.subreddit, (srcMap.get(c.subreddit) ?? 0) + 1);
  const srcs = [...srcMap.entries()].sort((a, b) => b[1] - a[1]);

  // 今日流水线：全部来自真实数据
  //  AI 方向库 = 现有品类规则方向总数（规则引擎内置，非虚构）
  const aiDirectionCount = (() => {
    const seen = new Set<CategoryId>();
    let n = 0;
    for (const c of complaints) {
      if (!seen.has(c.category)) {
        seen.add(c.category);
        n += directionsFor(c.category).length;
      }
    }
    return n;
  })();

  const tabs: { key: ViewKey; label: string; n: number }[] = [
    { key: "opp", label: "机会", n: oppCount },
    { key: "all", label: "全部抱怨", n: complaints.length },
    { key: "rank", label: "今日榜单", n: rankedCount },
    { key: "clusters", label: "痛点图谱", n: 0 },
    { key: "brief", label: "情报简报", n: 0 },
    { key: "fav", label: "收藏", n: favCount },
    { key: "bench", label: "工作台", n: 0 },
  ];

  const oppPct = complaints.length ? Math.round((oppCount / complaints.length) * 100) : 0;

  return (
    <aside className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto border-r border-hair pr-4">
      {/* 移动端抽屉头部 */}
      {onClose && (
        <div className="mb-2 flex items-center justify-between lg:hidden">
          <span className="mono-tag">筛选中心</span>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-full border border-hair bg-surface font-mono text-[12px] text-ink-faint"
            aria-label="关闭筛选"
          >
            ✕
          </button>
        </div>
      )}

      <SectionLabel text="快捷导航 / QUICK NAV" first />
      {tabs.map((t) => {
        const active = view === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onView(t.key)}
            className={`mb-1 flex h-8 items-center justify-between radius-rough-sm px-2.5 text-left text-[12.5px] transition-colors ${
              active
                ? "border-[1.5px] border-ink bg-matcha-soft font-bold text-ink shadow-sticker"
                : "font-semibold text-ink-soft hover:bg-matcha-soft/50"
            }`}
          >
            <span className="flex items-center gap-1.5">
              {active && <i className="h-1 w-1 rounded-full bg-matcha-deep" />}
              {t.label}
            </span>
            {t.key !== "bench" && (
              <b
                className={`min-w-[24px] rounded-full px-1.5 py-px text-right font-mono text-[10.5px] font-normal ${
                  active ? "bg-surface/70 text-matcha-deep" : "bg-surface/60 text-ink-faint"
                }`}
              >
                {t.n}
              </b>
            )}
          </button>
        );
      })}

      <SectionLabel text="分类筛选 / BY CATEGORY" />
      <button
        onClick={() => onCategory(null)}
        className={`mb-1 flex h-7 w-full items-center gap-2 radius-rough-sm px-2 text-left text-[12.5px] transition-colors ${
          category === null
            ? "border-[1.5px] border-ink bg-matcha-soft font-bold text-ink"
            : "text-ink-soft hover:bg-matcha-soft/50"
        }`}
      >
        <i className="dot" style={{ background: "#647E48" }} />
        <span className="min-w-0 flex-1 truncate">全部品类</span>
        <b className="font-mono text-[10.5px] font-normal text-ink-faint">{complaints.length}</b>
      </button>
      {cats.map(([name, v]) => (
        <button
          key={name}
          onClick={() => onCategory(category === name ? null : name)}
          className={`mb-1 flex h-7 w-full items-center gap-2 radius-rough-sm px-2 text-left text-[12.5px] transition-colors ${
            category === name
              ? "border-[1.5px] border-ink bg-matcha-soft font-bold text-ink"
              : "text-ink-soft hover:bg-matcha-soft/50"
          }`}
        >
          <i className="dot" style={{ background: CATEGORY_COLORS[name] ?? "#647E48" }} />
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <b className="font-mono text-[10.5px] font-normal text-ink-faint">
            {v.total}
            {v.opp > 0 && <i className="ml-1 not-italic text-matcha-deep">★{v.opp}</i>}
          </b>
        </button>
      ))}

      <SectionLabel text="数据来源 / SOURCES" />
      <button
        onClick={() => onSource(null)}
        className={`mb-1 flex h-7 w-full items-center justify-between radius-rough-sm px-2 text-left text-[12.5px] transition-colors ${
          source === null
            ? "border-[1.5px] border-ink bg-matcha-soft font-bold text-ink"
            : "text-ink-soft hover:bg-matcha-soft/50"
        }`}
      >
        <span>全部来源</span>
        <b className="font-mono text-[10.5px] font-normal text-ink-faint">{srcs.length}</b>
      </button>
      {srcs.map(([src, n]) => (
        <button
          key={src}
          onClick={() => onSource(source === src ? null : src)}
          className={`mb-1 flex h-7 w-full items-center justify-between gap-2 radius-rough-sm px-2 text-left text-[12.5px] transition-colors ${
            source === src
              ? "border-[1.5px] border-ink bg-matcha-soft font-bold text-ink"
              : "text-ink-soft hover:bg-matcha-soft/50"
          }`}
        >
          <span className="truncate">r/{src}</span>
          <b className="font-mono text-[10.5px] font-normal text-ink-faint">{n}</b>
        </button>
      ))}

      {/* 今日流水线：系统状态面板（真实数据） */}
      <div className="card-sticker mt-4 p-3">
        <div className="flex items-center justify-between">
          <span className="mono-tag">今日流水线 / PIPELINE</span>
          <span className="font-mono text-[10px] font-bold text-matcha-deep">
            机会 {oppPct}%
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-hair/70">
          <i
            className="block h-1 rounded-full bg-matcha transition-all"
            style={{ width: `${Math.max(oppPct, 2)}%` }}
          />
        </div>
        {(
          [
            ["抓取抱怨", String(complaints.length), "text-ink"],
            ["识别机会", String(oppCount), "text-ink"],
            ["AI 方向库", String(aiDirectionCount), "text-ink"],
            ["榜单入选", `${rankedCount} 条`, "text-persimmon"],
          ] as [string, string, string][]
        ).map(([k, v, color]) => (
          <div
            key={k}
            className="mt-1.5 flex items-baseline justify-between font-mono text-[11.5px] text-ink-soft"
          >
            <span>{k}</span>
            <b className={`text-[14px] ${color}`}>{v}</b>
          </div>
        ))}
        <div className="mt-2 flex items-center gap-1.5 border-t border-hair pt-2 font-mono text-[9.5px] tracking-wide text-ink-faint">
          <i
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              live ? "bg-persimmon" : "bg-ink-faint"
            }`}
          />
          {live ? "运行中 · RSS 实时同步" : "待机 · 种子数据"}
        </div>
      </div>

      <div className="mono-tag mt-auto border-t border-dashed border-ink/25 pb-1 pt-3 leading-[1.9]">
        引擎：{llmAvailable ? "DeepSeek LLM" : "规则引擎 · 可切 LLM"}
        <br />
        模式：{live ? "RSS" : "SEED"} · 缓存 10min
      </div>
    </aside>
  );
}

/** 左栏区块标题：等宽小字 + 细分隔线 */
function SectionLabel({ text, first }: { text: string; first?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${first ? "mt-1" : "mt-4"} mb-2`}>
      <span className="mono-tag whitespace-nowrap">{text}</span>
      <span className="flex-1 border-t border-dashed border-ink/30" />
    </div>
  );
}
