"use client";

import type { Complaint, SortKey, StreamFilter, ViewKey } from "@/lib/types";
import { CATEGORY_COLORS } from "@/lib/rules/classify";
import { oppScore } from "./DetailPanel";
import AbstractArt from "./AbstractArt";
import ShareCard from "./ShareCard";
import { directionsFor } from "@/lib/rules/insights";
import { useState } from "react";

interface Props {
  complaints: Complaint[];
  favorites: string[];
  view: ViewKey;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  filter: StreamFilter;
  onFilter: (f: StreamFilter) => void;
  /** 左栏分类筛选（来自 Rail，需与机会流联动） */
  category: string | null;
  /** 左栏数据源筛选 */
  source: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onFav: (id: string) => void;
  /** 已忽略机会 id 列表 */
  ignored: string[];
  onIgnore: (id: string) => void;
  loading: boolean;
}

function timeAgo(unixSec: number): string {
  const d = Math.max(0, Math.floor((Date.now() / 1000 - unixSec) / 86400));
  if (d === 0) return "今天";
  if (d === 1) return "昨天";
  if (d < 7) return `${d} 天前`;
  return `${Math.floor(d / 7)} 周前`;
}

/** 展示层清洗：还原 RSS 中残留的二次转义实体，并去掉订阅源模板噪音 */
function cleanText(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/submitted by\s+\/u\/(\S+)/gi, "由 u/$1 发布")
    .replace(/\[link\]\s*\[comments\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 需求强度（由真实热度派生） */
function demandLabel(heat: number): string {
  if (heat >= 75) return "强";
  if (heat >= 55) return "中";
  return "弱";
}

/** AI 推荐理由：基于真实字段的规则推导，不虚构 */
function aiReason(c: Complaint): string {
  const parts: string[] = [];
  if (c.opportunity) parts.push("用户以「希望有/为什么没有」句式提出需求，属明确可产品化的信号");
  if (c.heat >= 75) parts.push("讨论热度高，痛点覆盖人群较广");
  if (c.comments >= 30) parts.push("评论区活跃，需求被反复补充讨论");
  if (!parts.length) parts.push("来自真实社区抱怨，可作为需求线索跟进");
  return parts.slice(0, 2).join("；");
}

/** 建议行动：规则推导 */
function suggestAction(c: Complaint): string {
  if (c.opportunity && c.heat >= 70) return "生成产品方案 · 做市场验证";
  if (c.opportunity) return "加入工作台深挖 · 生成产品方案";
  return "观察热度 · 暂缓投入";
}

/** 视图层筛选（不含工具栏 chips 与排序） */
function viewList(
  complaints: Complaint[],
  favorites: string[],
  view: ViewKey,
  ignored: string[],
  category: string | null,
  source: string | null
): Complaint[] {
  let list = complaints.slice();
  if (category) list = list.filter((c) => c.category === category);
  if (source) list = list.filter((c) => c.subreddit === source);
  if (view === "opp") list = list.filter((c) => c.opportunity);
  else if (view === "fav") list = list.filter((c) => favorites.includes(c.id));
  else if (view === "rank")
    list = list.filter((c) => c.ranked).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  // 忽略仅在发现类视图生效（收藏/工作台不受影响）
  if (view === "opp" || view === "all" || view === "rank")
    list = list.filter((c) => !ignored.includes(c.id));
  return list;
}

/** 工具栏筛选 + 排序 */
function applyFilterSort(
  list: Complaint[],
  filter: StreamFilter,
  sort: SortKey,
  scoreFn: (c: Complaint) => number
): Complaint[] {
  let out = list.slice();
  if (filter === "opp") out = out.filter((c) => c.opportunity);
  else if (filter === "hot") out = out.filter((c) => c.heat >= 70);
  if (sort === "heat") out.sort((a, b) => b.heat - a.heat);
  else if (sort === "new") out.sort((a, b) => b.createdAt - a.createdAt);
  else if (sort === "score") out.sort((a, b) => scoreFn(b) - scoreFn(a));
  else out.sort((a, b) => b.comments - a.comments);
  return out;
}

export default function Stream({
  complaints,
  favorites,
  view,
  sort,
  onSort,
  filter,
  onFilter,
  selectedId,
  onSelect,
  onFav,
  ignored,
  onIgnore,
  loading,
  category,
  source,
}: Props) {
  const titleMap: Partial<Record<ViewKey, [string, string]>> = {
    opp: ["机会流", "OPPORTUNITY STREAM"],
    all: ["全部抱怨", "ALL COMPLAINTS"],
    rank: ["今日榜单", "TOP 70 · DAILY RANK"],
    fav: ["我的收藏", "FAVORITES"],
    bench: ["工作台 · 今日调研", "WORKBENCH"],
  };
  const [title, sub] = titleMap[view] ?? titleMap.opp ?? ["机会流", "OPPORTUNITY STREAM"];
  // P3 分享卡片弹层（精选机会卡直达）
  const [shareLead, setShareLead] = useState<Complaint | null>(null);

  const base = viewList(complaints, favorites, view, ignored, category, source);
  // 品类计数缓存：机会评分的「同品类密度」因子需要
  const catCount = new Map<string, number>();
  for (const c of complaints) catCount.set(c.category, (catCount.get(c.category) ?? 0) + 1);
  const scoreOf = (c: Complaint) => oppScore(c, catCount.get(c.category) ?? 0);
  const list = applyFilterSort(base, filter, sort, scoreOf);
  const oppBaseCount = base.filter((c) => c.opportunity).length;
  const hotBaseCount = base.filter((c) => c.heat >= 70).length;

  if (loading && complaints.length === 0) {
    return (
      <section className="flex min-h-0 flex-col overflow-hidden px-4 lg:px-5">
        <StreamHead title={title} sub={sub} />
        <Toolbar
          filter={filter}
          onFilter={onFilter}
          sort={sort}
          onSort={onSort}
          total={0}
          grandTotal={0}
          oppBase={0}
          hotBase={0}
        />
        <div className="radius-rough mt-3 flex h-52 flex-col items-center justify-center gap-2.5 border border-dashed border-ink/35 bg-surface/50">
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-ink-faint">
            抓取真实 Reddit 数据中
            <i className="h-2 w-2 animate-pulse rounded-full bg-matcha" />
          </div>
          <div className="text-[10.5px] text-ink-faint">请稍候，抓取完成后会自动展示</div>
        </div>
      </section>
    );
  }

  if (list.length === 0) {
    return (
      <section className="flex min-h-0 flex-col overflow-hidden px-4 lg:px-5">
        <StreamHead title={title} sub={sub} />
        <Toolbar
          filter={filter}
          onFilter={onFilter}
          sort={sort}
          onSort={onSort}
          total={0}
          grandTotal={base.length}
          oppBase={oppBaseCount}
          hotBase={hotBaseCount}
        />
        <div className="radius-rough mt-3 flex flex-col items-center justify-center gap-2 border border-dashed border-ink/35 bg-surface/50 py-16 text-center">
          <div className="text-3xl opacity-40">🔍</div>
          <div className="max-w-[320px] text-[12px] leading-relaxed text-ink-faint">
            {view === "fav"
              ? "还没有收藏的机会，先去机会流里收藏几条"
              : filter === "hot"
                ? "当前没有高热度（≥70）的机会，试试别的筛选"
                : view === "opp" && base.length > 0
                  ? "本次抓取未识别到机会帖（Reddit 限流可能导致版块不完整），已展示的抱怨仍可查看"
                  : "这个视图下还没有条目，换个视图试试"}
          </div>
          {view === "opp" && base.length > 0 && (
            <button
              onClick={() => onFilter("all")}
              className="radius-rough-pill inline-flex h-8 items-center border border-ink/40 bg-surface px-3.5 text-[11.5px] font-bold text-ink-soft shadow-sticker transition-all hover:-translate-y-px hover:bg-matcha-soft"
            >
              查看全部抱怨（{base.length} 条）→
            </button>
          )}
        </div>
      </section>
    );
  }

  const lead = list[0];
  const rest = list.slice(1);

  return (
    <section className="flex min-h-0 flex-col overflow-y-auto px-4 sm:overflow-hidden lg:px-5">
      <StreamHead title={title} sub={sub} />
      <Toolbar
        filter={filter}
        onFilter={onFilter}
        sort={sort}
        onSort={onSort}
        total={list.length}
        grandTotal={base.length}
        oppBase={oppBaseCount}
        hotBase={hotBaseCount}
      />

      {/* 精选机会 */}
      {view !== "bench" && (
        <article
          onClick={() => onSelect(lead.id)}
          className={`group mt-3 grid cursor-pointer grid-cols-1 overflow-hidden radius-rough-lg border-[1.5px] border-ink bg-surface shadow-sticker-lg transition-all hover:-translate-y-0.5 hover:shadow-[4px_4px_0_rgba(41,40,32,.13)] sm:grid-cols-[150px_minmax(0,1fr)_140px] ${
            selectedId === lead.id
              ? "ring-2 ring-matcha/30"
              : ""
          }`}
        >
          {/* 配图：抽象图形插画（细线稿描边风） */}
          <div className="relative overflow-hidden border-b border-ink/20 bg-paper/60 sm:border-b-0 sm:border-r">
            <AbstractArt
              category={lead.category}
              seed={lead.id}
              className="h-28 w-full sm:h-full"
            />
            <span className="tape bottom-2 right-2 rotate-[6deg]" aria-hidden />
            <span className="stamp stamp-tilt absolute left-2 top-2">
              {lead.category}
            </span>
          </div>
          <div className="min-w-0 p-4">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] tracking-wide text-ink-soft">
              <span className="inline-flex h-5 items-center rounded-full border-[1.5px] border-ink bg-matcha-deep px-2.5 text-[9.5px] font-extrabold tracking-widest text-surface">
                今日精选
              </span>
              <span className="flex items-center gap-1 font-bold text-ink-soft">
                <i
                  className="dot"
                  style={{ background: CATEGORY_COLORS[lead.category] ?? "#647E48" }}
                />
                {lead.category}
              </span>
              <span className="text-ink-faint">r/{lead.subreddit}</span>
              <span className="text-ink-faint">·</span>
              <span className="text-ink-faint">{timeAgo(lead.createdAt)}</span>
              {lead.opportunity && (
                <span className="font-bold text-persimmon">机会帖</span>
              )}
            </div>
            <h2 className="mt-1.5 font-serif text-[19px] font-black leading-snug tracking-wide text-ink">
              {cleanText(lead.titleZh)}
            </h2>
            <p className="mt-1 line-clamp-2 font-serif text-[11.5px] italic leading-relaxed text-ink-faint">
              “{cleanText(lead.excerpt || lead.title || "").slice(0, 110)}”
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-ink-soft">
              <span>
                需求强度：<b className="text-persimmon">{demandLabel(lead.heat)}</b>
              </span>
              <span>
                评论 <b className="font-normal text-ink">{lead.comments}</b>
              </span>
              {lead.ranked && (
                <span className="font-bold text-persimmon">今日榜单 #{lead.rank}</span>
              )}
            </div>
            <div className="radius-rough-sm mt-2 border border-dashed border-ink/30 bg-paper/70 px-2.5 py-1.5 font-mono text-[10.5px] leading-relaxed text-ink-faint">
              <div className="truncate">
                <span className="font-bold text-matcha-deep">AI 推荐</span>：{aiReason(lead)}
              </div>
              <div className="mt-0.5">
                <span className="font-bold text-matcha-deep">建议行动</span>：{suggestAction(lead)}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-hair bg-paper/40 px-4 py-2.5 sm:flex-col sm:items-stretch sm:justify-between sm:border-l sm:border-t-0 sm:p-3.5">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:block">
              <div className="mono-tag whitespace-nowrap text-[9px]">HEAT / 100</div>
              <div className="font-mono text-[24px] font-bold leading-none tracking-tight text-persimmon sm:mt-0.5 sm:text-[32px]">
                {lead.heat}
              </div>
              <div className="h-1 min-w-[40px] flex-1 overflow-hidden rounded-full bg-hair/70 sm:mt-2 sm:flex-none">
                <i
                  className="block h-1 rounded-full bg-persimmon"
                  style={{ width: `${lead.heat}%` }}
                />
              </div>
            </div>
            <div className="flex-none whitespace-nowrap text-[10.5px] font-bold text-matcha-deep transition-colors group-hover:text-ink">
              AI 分析 →
              <span className="hidden sm:inline"> 右侧 </span>
              <span className="sm:hidden">▸</span>
              <span className="hidden sm:inline">▸</span>
            </div>
            {/* P3 分享直达（不触发选中打开详情） */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShareLead(lead);
              }}
              title="生成分享卡片"
              className="radius-rough-sm inline-flex items-center gap-1 border-[1.2px] border-ink/60 bg-paper px-2 py-1 font-mono text-[10px] font-bold text-ink-soft shadow-sticker transition-colors hover:bg-matcha-soft hover:text-ink"
            >
              ↗ 分享
            </button>
          </div>
        </article>
      )}

      {/* P3 分享卡片弹层（精选机会卡） */}
      {shareLead && (
        <ShareCard
          complaint={shareLead}
          direction={directionsFor(shareLead.category)[0] ?? null}
          oppScore={oppScore(shareLead, catCount.get(shareLead.category) ?? 1)}
          sameCategoryCount={catCount.get(shareLead.category) ?? 1}
          onClose={() => setShareLead(null)}
        />
      )}

      {/* 机会列表 */}
      <div className="scroll-thin mt-2 flex-none space-y-1 overflow-visible pb-2 pr-0.5 sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
        {rest.map((c, i) => {
          const faved = favorites.includes(c.id);
          return (
            <article
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`group grid grid-cols-[26px_46px_minmax(0,1fr)_72px] items-center gap-3 radius-rough-sm border px-2.5 py-2 transition-all ${
                selectedId === c.id
                  ? "border-[1.5px] border-ink bg-matcha-soft/40 shadow-sticker"
                  : "border-transparent hover:border-[1.5px] hover:border-ink hover:bg-surface"
              }`}
            >
              <div className="font-mono text-[11px] text-ink-faint">
                {view === "rank"
                  ? String(c.rank ?? i + 2).padStart(2, "0")
                  : String(i + 2).padStart(2, "0")}
              </div>
              {/* 缩略图：抽象图形插画 */}
              <div className="radius-rough-sm h-10 w-12 flex-none overflow-hidden border border-ink/40 bg-paper/60">
                <AbstractArt category={c.category} seed={c.id} className="h-full w-full" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] tracking-wide text-ink-faint">
                  {c.ranked && (
                    <span className="rounded-full bg-persimmon/10 px-1.5 font-bold text-persimmon">
                      #{c.rank}
                    </span>
                  )}
                  <span className="flex items-center gap-1 font-bold text-ink-soft">
                    <i
                      className="dot"
                      style={{ background: CATEGORY_COLORS[c.category] ?? "#647E48" }}
                    />
                    {c.category}
                  </span>
                  <span>r/{c.subreddit}</span>
                  <span>·</span>
                  <span>{timeAgo(c.createdAt)}</span>
                  {c.opportunity && (
                    <span className="font-bold text-persimmon">机会帖</span>
                  )}
                  {faved && <span className="text-persimmon">★</span>}
                </div>
                <h3 className="mt-0.5 truncate text-[15px] font-bold leading-snug text-ink">
                  {cleanText(c.titleZh)}
                </h3>
                <p className="mt-0.5 min-h-[14px] truncate text-[10.5px] leading-snug text-ink-faint">
                  {cleanText(c.excerpt || c.title || "").slice(0, 80)}
                </p>
              </div>
              <div className="text-right">
                <b
                  className={`font-mono text-[16px] leading-none ${
                    c.heat >= 75 ? "text-persimmon" : "text-ink-soft"
                  }`}
                >
                  {c.heat}
                </b>
                <span
                  className="ml-1 font-mono text-[9.5px] text-matcha-deep"
                  title="机会评分（推导）"
                >
                  {scoreOf(c)}
                </span>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-hair/70">
                  <i
                    className="block h-1 rounded-full bg-persimmon/80"
                    style={{ width: `${c.heat}%` }}
                  />
                </div>
                {/* 悬浮操作：收藏 / 忽略 */}
                <div className="mt-1.5 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFav(c.id);
                    }}
                    title={faved ? "取消收藏" : "收藏 / 加入工作台"}
                    className={`grid h-6 w-6 place-items-center rounded-full border text-[11px] transition-colors ${
                      faved
                        ? "border-persimmon bg-persimmon text-surface"
                        : "border-hair bg-surface text-ink-soft hover:border-matcha hover:text-matcha-deep"
                    }`}
                  >
                    {faved ? "★" : "☆"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onIgnore(c.id);
                    }}
                    title="忽略该机会"
                    className="grid h-6 w-6 place-items-center rounded-full border border-hair bg-surface text-[11px] text-ink-faint transition-colors hover:border-persimmon hover:text-persimmon"
                  >
                    ×
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StreamHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="sketch-line-b flex flex-wrap items-center gap-2">
      <div className="sketch-underline text-[15px] font-black tracking-[.06em] text-ink">{title}</div>
      <span className="stamp">
        {sub}
      </span>
    </div>
  );
}

/** 筛选工具栏：机会筛选 chips + 排序 */
function Toolbar({
  filter,
  onFilter,
  sort,
  onSort,
  total,
  grandTotal,
  oppBase,
  hotBase,
}: {
  filter: StreamFilter;
  onFilter: (f: StreamFilter) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  total: number;
  grandTotal: number;
  oppBase: number;
  hotBase: number;
}) {
  const chips: { key: StreamFilter; label: string; n: number }[] = [
    { key: "all", label: "全部机会", n: total },
    { key: "opp", label: "高潜力机会", n: oppBase },
    { key: "hot", label: "高热度机会", n: hotBase },
  ];
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-b border-dashed border-ink/35 pb-2">
      {chips.map((ch) => {
        const active = filter === ch.key;
        return (
          <button
            key={ch.key}
            onClick={() => onFilter(ch.key)}
            className={`radius-rough-pill inline-flex h-7 items-center gap-1.5 px-3 text-[11.5px] font-bold transition-all ${
              active
                ? "border-[1.5px] border-ink bg-matcha-deep text-surface shadow-sticker"
                : "border-[1.5px] border-ink/25 bg-surface text-ink-soft hover:bg-matcha-soft/60"
            }`}
          >
            {ch.label}
            <span
              className={`rounded-full px-1.5 py-px font-mono text-[9.5px] font-normal ${
                active ? "bg-surface/20 text-surface" : "bg-paper text-ink-faint"
              }`}
            >
              {ch.n}
            </span>
          </button>
        );
      })}
      <div className="ml-auto flex items-center gap-2 font-mono text-[10.5px] tracking-wide text-ink-faint">
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          className="radius-rough-pill h-7 cursor-pointer border-[1.5px] border-ink bg-surface px-2.5 text-[10.5px] text-ink-soft shadow-sticker outline-none transition-colors hover:bg-matcha-soft"
        >
          <option value="heat">按热度</option>
          <option value="new">按最新</option>
          <option value="comments">按评论</option>
          <option value="score" title="基于真实字段推导的机会评分">
            按机会评分
          </option>
          <option value="__growth" disabled title="暂无历史趋势数据">
            按需求增长（数据不足）
          </option>
        </select>
        <span className="hidden sm:inline">
          {total} / {grandTotal}
        </span>
      </div>
    </div>
  );
}
