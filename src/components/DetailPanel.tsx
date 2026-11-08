"use client";

import { useEffect, useRef, useState } from "react";
import type { AiDirection, Complaint, ViewKey, WorkStatus } from "@/lib/types";
import { WORK_STATUS_LABEL } from "@/lib/types";
import { directionsFor } from "@/lib/rules/insights";
import ShareCard from "@/components/ShareCard";

interface Props {
  selected: Complaint | null;
  view: ViewKey;
  complaints: Complaint[];
  favorites: string[];
  notes: Record<string, string>;
  statuses: Record<string, WorkStatus>;
  llmAvailable: boolean;
  onFav: (id: string) => void;
  onNote: (id: string, text: string) => void;
  onStatus: (id: string, st: WorkStatus) => void;
  onOpenFromBench: (id: string) => void;
  /** 移动端抽屉关闭（清空选中） */
  onCloseDetail?: () => void;
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

function fmtClock(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 机会评分（推导值，非虚构）：
 * 热度 50% + 明确机会信号 20 分 + 评论活跃度 15 分 + 同品类讨论密度 15 分
 * 与「热度」区分：热度只反映讨论量，机会评分反映「转化为产品的潜力」
 */
export function oppScore(c: Complaint, sameCategoryCount: number): number {
  const s =
    c.heat * 0.5 +
    (c.opportunity ? 20 : 0) +
    Math.min(c.comments, 80) / 80 * 15 +
    Math.min(sameCategoryCount, 20) / 20 * 15;
  return Math.round(Math.min(100, Math.max(0, s)));
}

/** 五模块展开状态（P0：痛点/机会判断/产品构想默认展开，商业潜力收起示意可折叠） */
const DEFAULT_OPEN: Record<string, boolean> = {
  pain: true,
  opp: true,
  concept: true,
  mvp: true,
  business: false,
  competitor: false,
};

function ModuleHeader({
  n,
  title,
  en,
  tag,
  open,
  onToggle,
}: {
  n: string;
  title: string;
  en: string;
  tag?: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 border-b border-hair px-1 py-2 text-left transition-colors hover:bg-matcha-soft/40"
    >
      <span className="grid h-5 w-5 flex-none place-items-center rounded-md bg-matcha-soft font-mono text-[9px] font-bold text-matcha-deep">
        {n}
      </span>
      <span className="text-[12.5px] font-black text-ink">{title}</span>
      <span className="hidden font-mono text-[7.5px] tracking-widest text-ink-faint sm:inline">
        {en}
      </span>
      {tag && (
        <span className="rounded-full border border-hair bg-paper px-1.5 py-0.5 text-[8.5px] text-ink-faint">
          {tag}
        </span>
      )}
      <span
        className={`ml-auto font-mono text-[10px] text-ink-faint transition-transform duration-200 ${
          open ? "" : "rotate-180"
        }`}
      >
        ▴
      </span>
    </button>
  );
}

export default function DetailPanel({
  selected,
  view,
  complaints,
  favorites,
  notes,
  statuses,
  llmAvailable,
  onFav,
  onNote,
  onStatus,
  onOpenFromBench,
  onCloseDetail,
}: Props) {
  const [aiDirections, setAiDirections] = useState<AiDirection[]>([]);
  const [aiEngine, setAiEngine] = useState<"rule-engine" | "llm">("rule-engine");
  const [aiLoading, setAiLoading] = useState(false);
  const [analysisAt, setAnalysisAt] = useState(0);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(DEFAULT_OPEN);
  const [plan, setPlan] = useState("");
  const [planEngine, setPlanEngine] = useState<"rule-engine" | "llm">("rule-engine");
  const [planLoading, setPlanLoading] = useState(false);
  /** 生成方案时选中的构想方向（如有） */
  const [planDirection, setPlanDirection] = useState<string | null>(null);
  const planRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState("");
  const [expandQuote, setExpandQuote] = useState(false);
  // P3 分享卡片弹层
  const [shareOpen, setShareOpen] = useState(false);

  const selectedId = selected?.id ?? null;

  // 轻量操作反馈
  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2000);
  };

  const runInsights = () => {
    if (!selectedId) return;
    setAiLoading(true);
    setAnalysisAt(Date.now());
    fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [selectedId] }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.aiDirections?.length) {
          setAiDirections(d.aiDirections);
          setAiEngine(d.engine === "llm" ? "llm" : "rule-engine");
        }
      })
      .catch(() => {
        /* 保持本地规则方向 */
      })
      .finally(() => setAiLoading(false));
  };

  useEffect(() => {
    if (!selected) {
      setAiDirections([]);
      setAiEngine("rule-engine");
      setAiLoading(false);
      setAnalysisAt(0);
      setPlan("");
      return;
    }
    setOpenMap({ ...DEFAULT_OPEN });
    setPlan("");
    setPlanDirection(null);
    setExpandQuote(false);
    setAiDirections(directionsFor(selected.category));
    setAiEngine("rule-engine");
    runInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const generatePlan = async (direction?: string) => {
    if (!selectedId || planLoading) return;
    setPlanLoading(true);
    setPlan("");
    setPlanDirection(direction ?? null);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "plan",
          id: selectedId,
          ...(direction ? { direction } : {}),
        }),
        cache: "no-store",
      });
      const d = await res.json();
      setPlan(d.answer ?? "生成失败，请稍后再试。");
      setPlanEngine(d.engine === "llm" ? "llm" : "rule-engine");
      // 从「产品构想」入口触发时，滚动到下方方案展示区，让结果立即可见
      window.setTimeout(
        () => planRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        80
      );
    } catch {
      setPlan("产品方案生成失败，请稍后再试。");
    } finally {
      setPlanLoading(false);
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label}已复制`);
    } catch {
      showToast("复制失败，请手动选择");
    }
  };

  // 工作台视图：右侧展示调研汇总
  if (view === "bench") {
    return (
      <BenchPanel
        complaints={complaints}
        favorites={favorites}
        notes={notes}
        statuses={statuses}
        onStatus={onStatus}
        onOpen={onOpenFromBench}
        onNote={onNote}
      />
    );
  }

  if (!selected) {
    return (
      <aside className="flex min-h-0 flex-1 flex-col card-sticker-lg p-4">
        <div className="flex h-full flex-col rounded-xl border border-dashed border-hair p-4">
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="text-3xl opacity-40">📰</div>
            <div className="text-[12.5px] font-bold text-ink-soft">点击左侧卡片，展开详情</div>
            <div className="text-[11px] leading-relaxed text-ink-faint">
              选中后可查看 AI 产品机会分析
              <br />
              并把想法沉淀到调研速记
            </div>
          </div>
          <div className="mt-4 border-t border-hair pt-3">
            <div className="mono-tag mb-2">即将展示 / ANALYSIS MODULES</div>
            {[
              ["01", "用户痛点"],
              ["02", "机会判断"],
              ["03", "产品构想"],
              ["04", "MVP 功能"],
              ["05", "商业潜力"],
              ["06", "竞品与市场"],
            ].map(([n, t]) => (
              <div
                key={n}
                className="flex items-center gap-2 py-1 font-mono text-[10.5px] text-ink-faint"
              >
                <span className="grid h-4 w-4 flex-none place-items-center rounded bg-matcha-soft text-[8px] text-matcha-deep">
                  {n}
                </span>
                <span className="flex-1">{t}</span>
                <span className="opacity-60">待激活</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    );
  }

  const faved = favorites.includes(selected.id);
  const note = notes[selected.id] ?? "";
  const sameCategoryCount = complaints.filter((c) => c.category === selected.category).length;
  const oppScoreVal = oppScore(selected, sameCategoryCount);

  // 复制五模块分析为 Markdown（P1-5）
  const copyAnalysis = () => {
    const lines: string[] = [
      `# ${cleanText(selected.titleZh)}`,
      "",
      `- 品类：${selected.category}　来源：r/${selected.subreddit}`,
      `- 热度：${selected.heat}/100　机会评分（推导）：${oppScoreVal}/100　评论：${selected.comments}`,
      `- 原帖：${selected.url || "—"}`,
      "",
      "## 01 用户痛点",
      ...painPoints.map((p) => `- ${p}`),
      "",
      "## 02 机会判断（推断）",
      judgment,
      "",
      "## 03 产品构想",
      ...aiDirections.map((d) => `### ${d.title}\n定位：${d.desc}\n场景：${(d.scenarios ?? []).join("；")}`),
      "",
      "## 04 MVP 功能",
      ...aiDirections.flatMap((d) => (d.features ?? []).map((f) => `- ${f}`)),
      "",
      "## 05 商业潜力（待验证）",
      businessInference,
    ];
    copyText(lines.join("\n"), "分析报告");
  };

  // 01 用户痛点：真实字段 + 规则推导线索（此处 selected 必非空，直接计算）
  const painPoints: string[] = [];
  if (selected.opportunity)
    painPoints.push("用户以「希望有 / 为什么没有」句式提出需求，属于明确的待满足需求");
  if (selected.heat >= 70) painPoints.push("讨论热度较高，该困扰可能覆盖较广人群");
  if (selected.comments >= 30)
    painPoints.push("评论区活跃，用户持续补充细节，需求真实且反复出现");
  if (!painPoints.length) painPoints.push("常规社区抱怨，暂未出现明确的解决方案请求");

  // 02 机会判断（推断需标注）
  const judgment = (() => {
    if (!selected) return "";
    if (selected.opportunity && selected.heat >= 70)
      return "需求明确且热度高，存在可验证的机会缺口，建议优先深挖并生成产品方案。";
    if (selected.opportunity)
      return "需求方向明确，市场验证优先级中等偏上，建议补充用户访谈确认痛点频次。";
    if (selected.heat >= 70)
      return "热度支撑需求真实性，但缺少明确的方案请求，建议先小范围验证目标人群。";
    return "信号一般，建议观察或小范围验证后再投入。";
  })();

  // 05 商业潜力（规则推断，标注待验证）
  const businessInference = (() => {
    if (!selected) return "";
    if (selected.opportunity && selected.heat >= 70)
      return "若需求验证通过，目标人群付费意愿可能较高，可优先测试订阅制；建议先做 20 人访谈 + 预购验证。";
    if (selected.opportunity) return "值得进行 MVP 验证；先确认是否有人愿意为解决方案付费。";
    return "商业化信号尚不明显，建议先确认痛点频次与人群规模。";
  })();

  return (
    <aside className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto card-sticker-lg p-4">
      <div className="flex items-center justify-between font-mono text-[10px] tracking-widest text-ink-faint">
        <span>SELECTED / {selected.id.toUpperCase()}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-matcha-soft px-2 py-0.5 tracking-wider text-matcha-deep">
          <i className="inline-block h-1.5 w-1.5 rounded-full bg-matcha-deep" />
          已选中
        </span>
      </div>

      {/* 移动端关闭（小屏抽屉） */}
      {onCloseDetail && (
        <button
          onClick={onCloseDetail}
          className="mt-1.5 inline-flex h-7 items-center gap-1 self-start rounded-full border border-hair bg-paper px-2.5 font-mono text-[10.5px] text-ink-faint lg:hidden"
        >
          ✕ 收起详情
        </button>
      )}

      <h2 className="mt-2 font-serif text-[17px] font-black leading-relaxed text-ink">
        {cleanText(selected.titleZh)}
      </h2>
      <p
        onClick={() => setExpandQuote((v) => !v)}
        title={expandQuote ? "点击收起" : "点击查看完整原文摘要"}
        className={`mt-1.5 cursor-pointer rounded-r-lg border-l-2 border-matcha bg-paper/70 py-1.5 pl-3 pr-2 font-serif text-[11.5px] italic leading-relaxed text-ink-faint ${
          expandQuote ? "" : "max-h-[3.5em] overflow-hidden"
        }`}
      >
        “{expandQuote
          ? cleanText(selected.excerpt || selected.title || "")
          : cleanText(selected.excerpt || selected.title || "").slice(0, 130)}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {[
          ["品类", selected.category],
          ["来源", `r/${selected.subreddit}`],
          ["发布", timeAgo(selected.createdAt)],
          ["热度", `${selected.heat} / 100`],
          ["评论", `${selected.comments} 条`],
          ["状态", selected.opportunity ? "机会帖" : "普通抱怨"],
        ].map(([k, v], i) => (
          <div
            key={k}
            className="rounded-lg border border-hair bg-paper/80 px-2 py-1.5"
          >
            <div className="font-mono text-[8.5px] tracking-widest text-ink-faint">{k}</div>
            <div
              className={`mt-0.5 truncate font-mono text-[11.5px] font-bold ${
                i === 3 || i === 5 ? "text-persimmon" : "text-ink"
              }`}
            >
              {v}
            </div>
          </div>
        ))}
      </div>

      {/* P1-2 机会评分：热度（讨论量） vs 机会评分（转化潜力推导） */}
      <div className="mt-1.5 rounded-xl border border-hair bg-paper/80 px-2.5 py-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[8.5px] tracking-widest text-ink-faint">
            机会评分 / OPPORTUNITY SCORE（推导）
          </span>
          <span className="font-mono text-[15px] font-bold text-matcha-deep">{oppScoreVal}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hair/70">
          <i
            className="block h-1.5 rounded-full bg-matcha transition-all"
            style={{ width: `${oppScoreVal}%` }}
          />
        </div>
        <div className="mt-1 font-mono text-[8px] leading-relaxed text-ink-faint">
          = 热度50% + 机会信号20 + 评论活跃15 + 同品类密度15（基于真实字段推导，非市场数据）
        </div>
      </div>

      {/* ===== AI 产品机会分析（五模块） ===== */}
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-1 border-t-2 border-ink pt-3">
        <div className="text-[12.5px] font-black tracking-widest">
          AI 产品机会分析
          <span className="ml-1.5 rounded-full bg-persimmon/10 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-normal text-persimmon">
            {aiDirections.length} 条构想
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="mono-tag text-[8px]">
            {aiLoading
              ? "AI 生成中…"
              : aiEngine === "llm"
                ? `DeepSeek · 实时 · ${fmtClock(analysisAt)}`
                : llmAvailable
                  ? `规则引擎 · 可切 LLM · ${fmtClock(analysisAt)}`
                  : `规则引擎 · ${fmtClock(analysisAt)}`}
          </div>
          {/* P1-3 重新生成 / P1-5 复制 */}
          <button
            onClick={runInsights}
            disabled={aiLoading}
            title="重新生成 AI 分析"
            className="grid h-6 w-6 place-items-center rounded-full border border-hair bg-surface text-[11px] text-ink-soft transition-colors hover:bg-matcha-soft disabled:opacity-50"
          >
            ↻
          </button>
          <button
            onClick={copyAnalysis}
            title="复制分析报告（Markdown）"
            className="grid h-6 w-6 place-items-center rounded-full border border-hair bg-surface text-[11px] text-ink-soft transition-colors hover:bg-matcha-soft"
          >
            ⧉
          </button>
          {/* P3 分享卡片 */}
          <button
            onClick={() => setShareOpen(true)}
            title="生成分享卡片"
            className="grid h-6 w-6 place-items-center rounded-full border border-hair bg-surface text-[11px] text-ink-soft transition-colors hover:bg-matcha-soft"
          >
            ↗
          </button>
        </div>
      </div>

      {/* P3 分享卡片弹层 */}
      {shareOpen && selected && (
        <ShareCard
          complaint={selected}
          direction={aiDirections[0] ?? null}
          oppScore={oppScoreVal}
          sameCategoryCount={sameCategoryCount}
          onClose={() => setShareOpen(false)}
        />
      )}

      {/* 01 用户痛点 */}
      <div className="mt-1.5">
        <ModuleHeader
          n="01"
          title="用户痛点"
          en="PAIN POINTS"
          tag="规则推导"
          open={openMap.pain}
          onToggle={() => setOpenMap((m) => ({ ...m, pain: !m.pain }))}
        />
        {openMap.pain && (
          <div className="py-2.5">
            <div className="rounded-lg border-l-2 border-persimmon bg-paper/80 px-2.5 py-2">
              <div className="mono-tag mb-1">原始反馈 / ORIGINAL</div>
              <p className="font-serif text-[11.5px] italic leading-relaxed text-ink-soft">
                “{cleanText(selected.excerpt || selected.title || "").slice(0, 170)}”
              </p>
            </div>
            <ul className="mt-2 space-y-1.5">
              {painPoints.map((p) => (
                <li key={p} className="flex gap-1.5 text-[11.5px] leading-snug text-ink-soft">
                  <span className="flex-none text-matcha-deep">·</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <div className="mono-tag mt-1.5 text-[8px]">
              以上线索由规则引擎基于真实字段推导，非用户原文结论
            </div>
          </div>
        )}
      </div>

      {/* 02 机会判断 */}
      <div>
        <ModuleHeader
          n="02"
          title="机会判断"
          en="OPPORTUNITY ANALYSIS"
          tag="推断"
          open={openMap.opp}
          onToggle={() => setOpenMap((m) => ({ ...m, opp: !m.opp }))}
        />
        {openMap.opp && (
          <div className="py-2.5">
            <div className="grid grid-cols-2 gap-1.5">
              {[
                ["热度", `${selected.heat}/100`],
                ["评论", `${selected.comments} 条`],
                ["同品类讨论", `${sameCategoryCount} 条`],
                ["机会信号", selected.opportunity ? "✓ 明确" : "— 一般"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-hair bg-paper/80 px-2 py-1.5">
                  <div className="font-mono text-[8.5px] tracking-widest text-ink-faint">{k}</div>
                  <div className="mt-0.5 font-mono text-[12.5px] font-bold text-ink">{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 rounded-lg border border-matcha-deep/10 bg-matcha-soft/60 px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-soft">
              <b className="text-matcha-deep">规则判断：</b>
              {judgment}
            </div>
            <div className="mono-tag mt-1.5 text-[8px]">
              判断为规则引擎推断，非真实市场数据；无数据支撑的结论已标注
            </div>
          </div>
        )}
      </div>

      {/* 03 产品构想 */}
      <div>
        <ModuleHeader
          n="03"
          title="产品构想"
          en="PRODUCT CONCEPT"
          tag={aiEngine === "llm" ? "DeepSeek" : "规则引擎"}
          open={openMap.concept}
          onToggle={() => setOpenMap((m) => ({ ...m, concept: !m.concept }))}
        />
        {openMap.concept && (
          <div className="space-y-1.5 py-2.5">
            {aiDirections.map((d) => (
              <div key={d.title} className="rounded-xl border border-hair bg-paper/80 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-extrabold text-ink">{d.title}</span>
                  <span className="flex-none rounded-full bg-matcha-soft px-2 py-0.5 font-mono text-[8.5px] font-bold text-matcha-deep">
                    {d.source === "llm" ? "DeepSeek" : "规则引擎"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-ink-soft">定位：{d.desc}</p>
                {(d.scenarios?.length ?? 0) > 0 && (
                  <div className="mt-2">
                    <div className="font-mono text-[8px] font-bold tracking-widest text-matcha-deep">
                      ✦ 典型使用场景
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.scenarios!.map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-matcha-soft/80 px-2 py-0.5 text-[10px] text-matcha-deep"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => generatePlan(d.title)}
                  disabled={planLoading}
                  className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-full border-[1.5px] border-ink bg-ink px-2.5 py-1.5 text-[11px] font-extrabold text-paper transition-all hover:-translate-y-px disabled:opacity-60"
                >
                  {planLoading ? "✨ AI 撰写方案中…" : "✨ 基于此构想生成产品方案"}
                </button>
              </div>
            ))}
            {aiDirections.length === 0 && (
              <div className="py-4 text-center text-[11px] text-ink-faint">
                {aiLoading ? "AI 正在生成构想…" : "暂无构想，稍后再试"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 04 MVP 功能 */}
      <div>
        <ModuleHeader
          n="04"
          title="MVP 功能"
          en="MVP FEATURES"
          tag="AI 方向"
          open={openMap.mvp}
          onToggle={() => setOpenMap((m) => ({ ...m, mvp: !m.mvp }))}
        />
        {openMap.mvp && (
          <div className="space-y-2 py-2.5">
            {aiDirections.map((d) => (
              <div key={d.title}>
                <div className="text-[11.5px] font-bold text-ink">{d.title}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(d.features ?? []).map((f) => (
                    <span
                      key={f}
                      className="rounded-full border border-hair bg-paper/80 px-2 py-0.5 text-[10.5px] text-ink-soft"
                    >
                      {f}
                    </span>
                  ))}
                  {(d.features ?? []).length === 0 && (
                    <span className="text-[10.5px] text-ink-faint">—</span>
                  )}
                </div>
              </div>
            ))}
            <div className="mono-tag text-[8.5px]">
              功能点由 AI 方向生成；建议首版只做前 2–3 项核心功能，先验证价值
            </div>
          </div>
        )}
      </div>

      {/* 05 商业潜力 */}
      <div>
        <ModuleHeader
          n="05"
          title="商业潜力"
          en="BUSINESS POTENTIAL"
          tag="待验证"
          open={openMap.business}
          onToggle={() => setOpenMap((m) => ({ ...m, business: !m.business }))}
        />
        {openMap.business && (
          <div className="space-y-1.5 py-2.5">
            <div className="rounded-lg bg-paper/80 px-2.5 py-2 text-[11px] leading-snug text-ink-soft">
              <span className="font-mono text-[8.5px] tracking-widest text-ink-faint">事实 / FACT</span>
              <br />
              暂无真实竞品与市场规模数据；本站仅提供讨论热度与需求信号。
            </div>
            <div className="rounded-lg bg-matcha-soft/60 px-2.5 py-2 text-[11px] leading-snug text-ink-soft">
              <span className="font-mono text-[8.5px] tracking-widest text-matcha-deep">推断 / INFERENCE</span>
              <br />
              {businessInference}
            </div>
            <div className="rounded-lg border border-dashed border-hair px-2.5 py-2 text-[11px] leading-snug text-ink-soft">
              <span className="font-mono text-[8.5px] tracking-widest text-ink-faint">待验证假设 / HYPOTHESIS</span>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>目标人群是否愿意为解决方案付费？</li>
                <li>痛点出现频次是否足以支撑订阅制？</li>
                <li>已有免费替代方案是否构成强竞争？</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* 06 竞品与市场（P2-4：诚实标注，无真实联网数据不编造） */}
      <div>
        <ModuleHeader
          n="06"
          title="竞品与市场"
          en="COMPETITIVE LANDSCAPE"
          tag="无联网数据"
          open={openMap.competitor}
          onToggle={() => setOpenMap((m) => ({ ...m, competitor: !m.competitor }))}
        />
        {openMap.competitor && (
          <div className="space-y-1.5 py-2.5">
            <div className="rounded-lg border-l-2 border-persimmon bg-paper/80 px-2.5 py-2 text-[11px] leading-snug text-ink-soft">
              <span className="font-mono text-[8.5px] tracking-widest text-persimmon">
                数据状态 / DATA STATUS
              </span>
              <br />
              未接入真实竞品数据库（无联网数据源）。以下仅为建议调研方向，不包含任何竞品名称、定价或用户评价——
              如有需要请自行在 App Store / Product Hunt / 官网核实并记录到速记。
            </div>
            <div className="rounded-lg bg-matcha-soft/60 px-2.5 py-2 text-[11px] leading-snug text-ink-soft">
              <span className="font-mono text-[8.5px] tracking-widest text-matcha-deep">
                建议调研方向 / SUGGESTED CHECKS
              </span>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>围绕「{selected.category}」品类搜索现有免费/付费替代方案</li>
                <li>对比现有方案的核心功能是否覆盖该痛点的主路径</li>
                <li>记录至少 3 个候选竞品的定价与用户评价（待验证）</li>
              </ul>
            </div>
            <div className="mono-tag text-[8.5px]">
              生成时间 {fmtClock(analysisAt || Date.now())} · 信息来源：无（已诚实标注，未编造竞品数据）
            </div>
          </div>
        )}
      </div>

      {/* P1-4 生成完整产品方案 */}
      <div ref={planRef} className="mt-3 scroll-mt-3 border-t-2 border-ink pt-3">
        <div className="flex items-center justify-between">
          <div className="text-[12.5px] font-black tracking-widest">完整产品方案</div>
          {plan && (
            <span className="rounded-full bg-matcha-soft px-2 py-0.5 font-mono text-[8.5px] font-bold text-matcha-deep">
              {planEngine === "llm" ? "DeepSeek 生成" : "规则引擎骨架"}
            </span>
          )}
        </div>
        {planDirection && (
          <div className="mono-tag mt-1 text-[8.5px]">
            方向：{planDirection}
          </div>
        )}
        {!plan && (
          <button
            onClick={() => generatePlan()}
            disabled={planLoading}
            className="mt-2 w-full rounded-full border-[1.5px] border-ink bg-ink px-3 py-2.5 text-[12px] font-extrabold text-paper shadow-sticker transition-all hover:-translate-y-px disabled:opacity-60"
          >
            {planLoading ? "✨ AI 撰写方案中…（约 10-30s）" : "✨ 生成完整产品方案"}
          </button>
        )}
        {plan && (
          <div className="mt-2">
            <div className="max-h-72 overflow-y-auto scroll-thin whitespace-pre-wrap rounded-xl border border-hair bg-paper/80 p-3 text-[11px] leading-relaxed text-ink-soft">
              {plan}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <button
                onClick={() => copyText(plan, "产品方案")}
                className="flex-1 rounded-full border border-hair bg-surface px-2 py-1.5 font-mono text-[10px] font-bold text-ink-soft transition-colors hover:bg-matcha-soft"
              >
                ⧉ 复制方案
              </button>
              <button
                onClick={() => {
                  onNote(selected.id, (note ? note + "\n\n" : "") + "## 完整产品方案\n" + plan);
                  showToast("已存入调研速记");
                }}
                className="flex-1 rounded-full border border-hair bg-surface px-2 py-1.5 font-mono text-[10px] font-bold text-ink-soft transition-colors hover:bg-matcha-soft"
              >
                ✎ 存入速记
              </button>
              <button
                onClick={() => generatePlan(planDirection ?? undefined)}
                disabled={planLoading}
                title="重新生成"
                className="rounded-full border border-hair bg-surface px-2.5 py-1.5 font-mono text-[10px] text-ink-soft transition-colors hover:bg-matcha-soft disabled:opacity-50"
              >
                ↻
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 调研速记 */}
      <div className="mt-3 flex flex-1 flex-col border-t border-hair pt-2.5">
        <div className="mb-1.5 flex items-center justify-between font-mono text-[9.5px] tracking-widest text-ink-faint">
          <span className="tracking-wider text-ink-soft">✎ 调研速记 / NOTE</span>
          <span>自动保存</span>
        </div>
        <textarea
          value={note}
          onChange={(e) => onNote(selected.id, e.target.value)}
          placeholder="记下你的想法、待验证、风险…"
          className="min-h-[72px] flex-1 resize-none rounded-xl border border-hair bg-[repeating-linear-gradient(transparent_0_18px,rgba(41,40,32,.05)_18px_19px)] p-2.5 text-[12px] leading-[18px] text-ink-soft outline-none transition-colors focus:border-matcha"
        />
      </div>

      <div className="mt-auto flex items-center gap-2 pt-3">
        <button
          onClick={() => {
            onFav(selected.id);
            showToast(faved ? "已取消收藏" : "★ 已收藏，可在工作台查看");
          }}
          className={`h-9 flex-1 rounded-full border-[1.5px] border-ink text-[12.5px] font-extrabold tracking-wide shadow-sticker transition-all hover:-translate-y-px ${
            faved ? "bg-matcha-deep text-surface" : "bg-ink text-paper"
          }`}
        >
          {faved ? "★ 已收藏" : "☆ 收藏这条"}
        </button>
        <a
          href={selected.url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center justify-center rounded-full border border-hair bg-paper px-3.5 text-[12px] font-bold text-ink transition-colors hover:border-matcha hover:text-matcha-deep"
        >
          原帖 ↗
        </a>
      </div>

      {/* 操作反馈 toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[11.5px] font-bold text-paper shadow-soft-lg">
          {toast}
        </div>
      )}
    </aside>
  );
}

/** 工作台：统计卡 + 状态管理 + 调研清单 + 横向对比 + 一键初稿 + 导出 */
function BenchPanel({
  complaints,
  favorites,
  notes,
  statuses,
  onStatus,
  onOpen,
  onNote,
}: {
  complaints: Complaint[];
  favorites: string[];
  notes: Record<string, string>;
  statuses: Record<string, WorkStatus>;
  onStatus: (id: string, st: WorkStatus) => void;
  onOpen: (id: string) => void;
  onNote: (id: string, text: string) => void;
}) {
  const [compareSel, setCompareSel] = useState<string[]>([]);
  const [draft, setDraft] = useState<string>("");
  const [drafting, setDrafting] = useState(false);
  /** 每项独立方案生成状态：id → 生成中 */
  const [planning, setPlanning] = useState<Record<string, boolean>>({});
  const [planDone, setPlanDone] = useState<string | null>(null);

  const favItems = favorites.map((id) => {
    const c = complaints.find((x) => x.id === id);
    return {
      id,
      complaint: c ?? null,
      note: notes[id] ?? "",
      status: statuses[id] ?? ("todo" as WorkStatus),
    };
  });
  const withNote = favItems.filter((f) => f.note.trim().length > 0);
  const researching = favItems.filter((f) => f.status === "researching").length;

  const toggleCompare = (id: string) => {
    setCompareSel((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= 3
          ? prev
          : [...prev, id]
    );
  };
  const compareItems = compareSel
    .map((id) => favItems.find((x) => x.id === id)?.complaint ?? null)
    .filter((c): c is Complaint => !!c);

  /** 生成完整产品方案并存入速记（P2-5 孵化闭环：机会 → 方案 → 记录沉淀） */
  const generatePlanFor = async (id: string) => {
    if (planning[id]) return;
    setPlanning((p) => ({ ...p, [id]: true }));
    setPlanDone(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "plan", id }),
        cache: "no-store",
      });
      const d = await res.json();
      const planText = d.answer ?? "生成失败，请稍后再试。";
      const prev = notes[id] ?? "";
      onNote(id, (prev ? prev + "\n\n" : "") + "## 完整产品方案\n" + planText);
      setPlanDone(id);
    } catch {
      setPlanDone(null);
    } finally {
      setPlanning((p) => ({ ...p, [id]: false }));
    }
  };

  const generateDraft = async () => {
    if (drafting) return;
    setDrafting(true);
    setDraft("");
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draft", ids: favorites }),
        cache: "no-store",
      });
      const d = await res.json();
      setDraft(d.answer ?? "生成失败，请稍后再试。");
    } catch {
      setDraft("初稿生成失败，请稍后再试。");
    } finally {
      setDrafting(false);
    }
  };

  const exportMarkdown = () => {
    const lines: string[] = [
      "# 灵感雷达 · 调研工作台导出",
      "",
      `导出时间：${new Date().toLocaleString("zh-CN")}`,
      `收藏 ${favorites.length} 条 · 速记 ${withNote.length} 条`,
      "",
      "---",
      "",
    ];
    for (const f of favItems) {
      lines.push(`## ${f.complaint?.titleZh ?? f.id}`);
      lines.push("");
      lines.push(
        `- 品类：${f.complaint?.category ?? "—"}　热度：${f.complaint?.heat ?? "—"}　机会：${f.complaint?.opportunity ? "✓" : "✗"}`
      );
      lines.push(`- 状态：${WORK_STATUS_LABEL[f.status]}`);
      lines.push(`- 来源：r/${f.complaint?.subreddit ?? "—"}`);
      if (f.complaint?.url) lines.push(`- 原帖：${f.complaint.url}`);
      if (f.note.trim()) {
        lines.push("");
        lines.push(f.note.trim());
      }
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `idea-radar-workbench-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (favorites.length === 0) {
    return (
      <aside className="flex min-h-0 flex-1 flex-col card-sticker-lg p-4">
        <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-hair text-xs text-ink-faint">
          <div className="text-3xl opacity-40">🧰</div>
          <div className="text-[12.5px] font-bold text-ink-soft">工作台还是空的</div>
          <div className="text-[11px]">收藏一些机会，把调研笔记沉淀到这里</div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto card-sticker-lg p-4">
      <div className="flex items-center justify-between font-mono text-[10px] tracking-widest text-ink-faint">
        <span>WORKBENCH</span>
        <span className="rounded-full bg-matcha-soft px-2 py-0.5 text-matcha-deep">
          已收藏 {favorites.length} 条
        </span>
      </div>
      <h2 className="mt-2 font-serif text-[17px] font-black text-ink">我的调研台</h2>
      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft">
        收藏的机会和速记沉淀在这里：状态管理、横向对比、一键生成产品初稿。
      </p>

      {/* 统计卡 */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ["收藏", favorites.length, "text-ink"],
          ["在调研", researching, "text-persimmon"],
          ["速记", withNote.length, "text-matcha-deep"],
        ].map(([label, val, color]) => (
          <div key={label} className="rounded-xl border border-hair bg-paper/80 px-2 py-2 text-center">
            <div className={`font-mono text-[18px] font-bold leading-none ${color}`}>{val}</div>
            <div className="mt-1 font-mono text-[9px] tracking-widest text-ink-faint">{label}</div>
          </div>
        ))}
      </div>

      {/* 收藏清单 + 状态管理 */}
      <div className="mt-4 border-t-2 border-ink pt-3">
        <div className="mb-2 text-[12.5px] font-black tracking-widest">
          收藏清单
          <span className="ml-1.5 rounded-full bg-persimmon/10 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-normal text-persimmon">
            {favorites.length} 条
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {favItems.map((f) => (
            <div key={f.id} className="rounded-xl border border-hair bg-paper/80 p-2.5">
              <button onClick={() => onOpen(f.id)} className="w-full text-left">
                <div className="truncate text-[12px] font-extrabold text-ink">
                  {cleanText(f.complaint?.titleZh ?? f.id.toUpperCase())}
                </div>
                <div className="mt-0.5 truncate font-mono text-[10px] text-ink-faint">
                  {f.complaint?.category ?? "—"} · 热度 {f.complaint?.heat ?? "—"}
                </div>
              </button>
              {/* 状态切换 */}
              <div className="mt-2 flex gap-1">
                {(Object.keys(WORK_STATUS_LABEL) as WorkStatus[]).map((st) => (
                  <button
                    key={st}
                    onClick={() => onStatus(f.id, st)}
                    className={`h-6 flex-1 rounded-full font-mono text-[9px] font-bold transition-colors ${
                      f.status === st
                        ? st === "researching"
                          ? "bg-persimmon text-surface"
                          : st === "abandoned"
                            ? "bg-ink text-paper"
                            : "bg-matcha-deep text-surface"
                        : "bg-hair/35 text-ink-faint hover:bg-hair/70"
                    }`}
                  >
                    {WORK_STATUS_LABEL[st]}
                  </button>
                ))}
              </div>
              {/* P2-5 孵化：生成完整产品方案 → 存入速记 */}
              <div className="mt-1.5 flex items-center gap-1.5">
                <button
                  onClick={() => generatePlanFor(f.id)}
                  disabled={!!planning[f.id]}
                  className="h-6 flex-1 rounded-full border border-hair bg-surface px-2 font-mono text-[9px] font-bold text-ink-soft transition-colors hover:bg-matcha-soft disabled:opacity-50"
                >
                  {planning[f.id] ? "✨ 生成中…" : "✨ 生成完整方案"}
                </button>
                {planDone === f.id && (
                  <span className="font-mono text-[9px] font-bold text-matcha-deep">
                    ✓ 已存入速记
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 横向对比 */}
      <div className="mt-4 border-t border-hair pt-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[12.5px] font-black tracking-widest">横向对比</div>
          <span className="font-mono text-[9px] text-ink-faint">选 2-3 条</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {favItems.map((f) => (
            <button
              key={f.id}
              onClick={() => toggleCompare(f.id)}
              className={`rounded-full border px-2.5 py-1 text-[9.5px] font-bold transition-colors ${
                compareSel.includes(f.id)
                  ? "border-matcha-deep bg-matcha-soft text-matcha-deep"
                  : "border-hair bg-paper text-ink-soft hover:border-matcha"
              }`}
            >
              {cleanText(f.complaint?.titleZh?.slice(0, 6) ?? f.id.slice(0, 6))}
              {f.complaint?.opportunity ? " ★" : ""}
            </button>
          ))}
        </div>
        {compareItems.length >= 2 && (
          <div className="mt-2 overflow-hidden rounded-xl border border-hair">
            <div className="grid grid-cols-[64px_1fr_1fr_1fr] bg-matcha-soft px-2 py-1.5 font-mono text-[9px] font-bold text-matcha-deep">
              <span>维度</span>
              {compareItems.map((c) => (
                <span key={c.id} className="truncate px-1">{c.titleZh.slice(0, 8)}</span>
              ))}
            </div>
            {(
              [
                ["品类", (c: Complaint) => c.category],
                ["热度", (c: Complaint) => String(c.heat)],
                ["机会", (c: Complaint) => (c.opportunity ? "✓ 是" : "✗ 否")],
                ["来源", (c: Complaint) => `r/${c.subreddit}`],
              ] as [string, (c: Complaint) => string][]
            ).map(([label, get]) => (
              <div key={label} className="grid grid-cols-[64px_1fr_1fr_1fr] border-t border-hair px-2 py-1.5 text-[10.5px]">
                <span className="font-mono text-[9px] text-ink-faint">{label}</span>
                {compareItems.map((c) => (
                  <span key={c.id} className="truncate px-1 text-ink">{get(c)}</span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 一键生成产品方向初稿 */}
      <div className="mt-4 border-t border-hair pt-3">
        <button
          onClick={generateDraft}
          disabled={drafting}
          className="w-full rounded-full border-[1.5px] border-ink bg-matcha-deep px-3 py-2.5 text-[12px] font-extrabold text-surface shadow-sticker transition-all hover:-translate-y-px hover:bg-matcha disabled:opacity-60"
        >
          {drafting ? "✨ 生成中…" : "✨ 一键生成产品方向初稿"}
        </button>
        {draft && (
          <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-hair bg-paper/80 p-2.5 text-[11px] leading-relaxed text-ink-soft">
            {draft}
          </div>
        )}
      </div>

      {/* 导出 */}
      <div className="mt-3 flex gap-2">
        <button
          onClick={exportMarkdown}
          className="flex-1 rounded-full border-[1.5px] border-ink bg-paper px-3 py-2.5 text-[12px] font-bold text-ink shadow-sticker transition-all hover:-translate-y-px hover:bg-matcha-soft"
        >
          ⬇ 导出 Markdown
        </button>
      </div>

      <div className="mono-tag mt-4 border-t border-hair pb-1 pt-2.5">
        收藏 / 速记 / 状态经 API 保存在本地服务端 · 换设备可迁移
      </div>
    </aside>
  );
}
