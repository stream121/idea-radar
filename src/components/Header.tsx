"use client";

import Link from "next/link";
import type { FetchMode, ViewKey } from "@/lib/types";

interface Props {
  live: boolean;
  mode: FetchMode;
  fetchedAt: number;
  total: number;
  oppCount: number;
  loading: boolean;
  refreshing?: boolean;
  llmAvailable: boolean;
  onRefresh: () => void;
  /** 当前视图，用于导航激活态 */
  view: ViewKey;
  onNavView: (v: ViewKey) => void;
  /** 移动端筛选抽屉开关 */
  railOpen: boolean;
  onToggleRail: () => void;
}

function fmtDateShort(ts: number): string {
  // ts=0（尚未抓取）时输出稳定占位，避免服务端/客户端时间差导致水合不一致
  if (!ts) return "-- · --";
  const d = new Date(ts);
  const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} · 周${week}`;
}

function fmtTime(ts: number): string {
  if (!ts) return "--:--";
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Header({
  live,
  mode,
  fetchedAt,
  total,
  oppCount,
  loading,
  refreshing = false,
  llmAvailable,
  onRefresh,
  view,
  onNavView,
  railOpen,
  onToggleRail,
}: Props) {
  const label = live ? "RSS 实时" : mode === "seed" ? "离线 · 种子数据" : "本地";
  // 机会流相关视图（机会/全部/榜单/收藏）都视为「机会流」导航激活
  const streamActive = ["opp", "all", "rank", "fav"].includes(view);

  return (
    <header className="flex-none border-b-[1.5px] border-ink">
      {/* 第一层：品牌 + 系统状态 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 pb-2 pt-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="radius-rough-circle grid h-10 w-10 flex-none place-items-center border-[1.5px] border-ink bg-matcha-soft shadow-sticker">
            <svg
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke="#292820"
              strokeWidth="1.6"
            >
              <path d="M12 12l7-7" stroke="#435B35" strokeWidth="2" />
              <path d="M12 12a4 4 0 0 0 4 4" stroke="#435B35" strokeWidth="2" />
              <circle cx="12" cy="12" r="1.6" fill="#D95B36" stroke="none" />
              <path d="M4 20a12 12 0 0 1 16-16" stroke="#292820" strokeWidth="1.2" opacity=".45" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="font-serif text-[21px] font-black leading-none tracking-[.02em] text-ink">
                灵感雷达
              </h1>
              <span className="font-mono text-[9.5px] tracking-[.24em] text-ink-soft">
                IDEA RADAR
              </span>
            </div>
            <p className="mt-1 font-mono text-[10px] tracking-wide text-ink-faint">
              发现真实需求 · 捕捉下一个产品机会
            </p>
          </div>
        </div>

        {/* 系统状态：贴纸胶囊 */}
        <div className="ml-auto flex flex-wrap items-center gap-2 whitespace-nowrap font-mono text-[10.5px] tracking-wide text-ink-faint">
          <span className="radius-rough-pill inline-flex h-6 items-center gap-1.5 border-[1.5px] border-ink bg-surface px-2.5 font-bold text-ink-soft shadow-sticker">
            <i
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                live ? "bg-persimmon shadow-[0_0_0_3px_rgba(217,91,54,.13)]" : "bg-ink-faint"
              }`}
            />
            {loading ? "同步中…" : label}
          </span>
          <span
            className={`radius-rough-pill inline-flex h-6 items-center gap-1.5 border-[1.5px] px-2.5 font-bold shadow-sticker ${
              llmAvailable
                ? "border-matcha-deep bg-matcha-soft text-matcha-deep"
                : "border-ink bg-surface text-ink-soft"
            }`}
          >
            <i
              className={`h-1 w-1 rounded-full ${llmAvailable ? "bg-matcha-deep" : "bg-ink-faint"}`}
            />
            {llmAvailable ? "AI · DeepSeek" : "AI · 规则引擎"}
          </span>
          <span className="hidden h-3.5 w-px bg-hair md:inline-block" />
          <span className="hidden md:inline">{fmtDateShort(fetchedAt)}</span>
          <span className="hidden sm:inline">
            <b className="font-normal text-ink-soft">{fmtTime(fetchedAt)}</b> 更新
          </span>
          <span className="hidden h-3.5 w-px bg-hair lg:inline-block" />
          <span className="hidden lg:inline">
            <b className="font-normal text-ink-soft">{total}</b> 条抱怨 ·{" "}
            <b className="font-normal text-ink-soft">{oppCount}</b> 条机会
          </span>
          <button
            onClick={onRefresh}
            disabled={loading || refreshing}
            className={`radius-rough-pill inline-flex h-7 items-center gap-1 border-[1.5px] border-ink bg-surface px-3 text-[11px] font-bold text-ink shadow-sticker transition-all hover:-translate-y-px hover:bg-matcha-soft ${
              loading || refreshing ? "cursor-wait opacity-60" : ""
            }`}
          >
            <i className={`not-italic ${refreshing ? "animate-spin" : ""}`}>↻</i> 刷新
            {refreshing ? "中" : ""}
          </button>
        </div>
      </div>

      {/* 第二层：主要功能导航 */}
      <nav className="scroll-thin flex items-center gap-1 overflow-x-auto border-t border-ink px-1 py-1.5">
        <button
          onClick={onToggleRail}
          aria-label="筛选中心"
          className="radius-rough-pill inline-flex h-7 flex-none items-center border-[1.5px] border-ink bg-surface px-2.5 font-mono text-[11px] text-ink-soft shadow-sticker transition-colors hover:bg-matcha-soft lg:hidden"
        >
          {railOpen ? "✕ 关闭" : "☰ 筛选"}
        </button>
        <Link
          href="/"
          className="inline-flex h-7 flex-none items-center rounded-full px-2.5 font-mono text-[10.5px] text-ink-faint transition-colors hover:bg-matcha-soft hover:text-ink"
        >
          ← 首页
        </Link>
        <span className="mx-0.5 h-4 w-px flex-none bg-ink/30" />
        <button
          onClick={() => onNavView("opp")}
          className={`inline-flex h-7 flex-none items-center radius-rough-pill border-[1.5px] px-3.5 text-[12px] font-bold transition-all${
            streamActive
              ? "border-ink bg-matcha-deep text-surface shadow-sticker"
              : "border-transparent text-ink-soft hover:bg-matcha-soft/70"
          }`}
        >
          机会流
        </button>
        <Link
          href="/dashboard"
          className="inline-flex h-7 flex-none items-center rounded-full border-[1.5px] border-transparent px-3.5 text-[12px] font-bold text-ink-soft transition-colors hover:bg-matcha-soft/70"
        >
          数据看板
        </Link>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("idea-radar:open-assistant"))}
          className="inline-flex h-7 flex-none items-center rounded-full border-[1.5px] border-transparent px-3.5 text-[12px] font-bold text-ink-soft transition-colors hover:bg-matcha-soft/70"
        >
          ✦ 我的 AI 助手
        </button>
        <button
          onClick={() => onNavView("bench")}
          className={`inline-flex h-7 flex-none items-center radius-rough-pill border-[1.5px] px-3.5 text-[12px] font-bold transition-all${
            view === "bench"
              ? "border-ink bg-matcha-deep text-surface shadow-sticker"
              : "border-transparent text-ink-soft hover:bg-matcha-soft/70"
          }`}
        >
          工作台
        </button>
      </nav>
    </header>
  );
}
