"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ComplaintsResponse } from "@/lib/types";

export default function Home() {
  const [total, setTotal] = useState<number | null>(null);
  const [oppCount, setOppCount] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const [engine, setEngine] = useState("译·DeepSeek");

  useEffect(() => {
    fetch("/api/complaints", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: ComplaintsResponse) => {
        if (Array.isArray(d.complaints)) {
          setTotal(d.complaints.length);
          setOppCount(d.complaints.filter((c) => c.opportunity).length);
          setLive(!!d.live);
          setEngine(
            d.translateEngine === "llm"
              ? "译·DeepSeek"
              : d.translateEngine === "free"
                ? "译·机译"
                : "译·原文"
          );
        }
      })
      .catch(() => {});
  }, []);

  const today = new Date();
  const week = ["日", "一", "二", "三", "四", "五", "六"][today.getDay()];
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(
    today.getDate()
  ).padStart(2, "0")}`;

  return (
    <div className="paper-dot mx-auto flex h-screen max-w-[1440px] flex-col bg-paper px-5 sm:px-10 md:px-14">
      {/* 刊头 */}
      <header className="flex min-h-[78px] flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b-[1.5px] border-ink">
        <div className="radius-rough-circle grid h-10 w-10 flex-none place-items-center border-[1.5px] border-ink bg-matcha-soft shadow-sticker -rotate-3">
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="#292820" strokeWidth="1.6">
            <path d="M12 12l7-7" stroke="#435B35" strokeWidth="2" />
            <path d="M12 12a4 4 0 0 0 4 4" stroke="#435B35" strokeWidth="2" />
            <circle cx="12" cy="12" r="1.6" fill="#D95B36" stroke="none" />
            <path d="M4 20a12 12 0 0 1 16-16" stroke="#292820" strokeWidth="1.2" opacity=".45" />
          </svg>
        </div>
        <div>
          <h1 className="font-serif text-[26px] font-black tracking-wide text-ink">灵感雷达</h1>
          <p className="font-mono text-[10px] tracking-[.26em] text-ink-soft">
            IDEA RADAR · EDITORIAL WORKBENCH
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 font-mono text-[12px] tracking-wide sm:gap-2.5">
          <Link
            href="/home-c"
            className="chip text-matcha-deep transition-colors hover:bg-matcha-soft"
            title="切换风格 C（治愈系柔和）预览"
          >
            风格 C ⇄
          </Link>
          <span className="chip">{dateStr} · 周{week}</span>
          <span className="chip">{total ?? "—"} 条抱怨</span>
          <span className="chip">{oppCount ?? "—"} 条机会</span>
          <span className="chip">{engine}</span>
        </div>
      </header>

      {/* Hero */}
      <div className="grid flex-none grid-cols-1 items-center gap-8 py-9 lg:grid-cols-[470px_1fr] lg:gap-10">
        <div className="relative mx-auto h-[300px] w-full max-w-[470px] lg:mx-0 lg:h-[380px] lg:w-[470px]">
          {/* A 风格：低饱和线稿插画 */}
          <svg viewBox="0 0 470 380" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
            <rect x="30" y="60" width="410" height="270" rx="26" fill="#EDE6D2" stroke="#8C8577" strokeWidth="1.5" transform="rotate(-2 235 195)" />
            <g transform="rotate(-6 235 195)">
              <circle cx="235" cy="195" r="82" fill="#E6EDD6" stroke="#5C574C" strokeWidth="1.5" />
              <circle cx="235" cy="195" r="54" fill="none" stroke="#5C574C" strokeWidth="1.2" opacity=".5" />
              <circle cx="235" cy="195" r="28" fill="none" stroke="#5C574C" strokeWidth="1.2" opacity=".5" />
              <path d="M235 195 L306 130" stroke="#D9532B" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="306" cy="130" r="8" fill="#D9532B" />
              <circle cx="235" cy="195" r="10" fill="#7C9A52" />
            </g>
            <g transform="rotate(8 100 120)" fill="none" stroke="#5C574C" strokeWidth="1.5">
              <circle cx="100" cy="120" r="24" />
              <line x1="87" y1="144" x2="113" y2="144" strokeLinecap="round" />
              <line x1="93" y1="153" x2="107" y2="153" strokeLinecap="round" />
            </g>
            <g transform="rotate(-5 372 96)">
              <rect x="330" y="70" width="86" height="52" rx="12" fill="#D9CDB0" stroke="#5C574C" strokeWidth="1.5" />
              <line x1="344" y1="90" x2="402" y2="90" stroke="#FFFCF3" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="344" y1="104" x2="390" y2="104" stroke="#FFFCF3" strokeWidth="1.8" strokeLinecap="round" opacity=".8" />
            </g>
            <path d="M400 300 l9 20 22 3 -16 16 4 22 -19 -10 -19 10 4 -22 -16 -16 22 -3 z" fill="#E0A93E" stroke="#5C574C" strokeWidth="1.4" />
            <g transform="rotate(-10 66 292)">
              <circle cx="66" cy="292" r="22" fill="#E6EDD6" stroke="#5C574C" strokeWidth="1.5" />
              <line x1="66" y1="278" x2="66" y2="294" stroke="#D9532B" strokeWidth="2.4" strokeLinecap="round" />
            </g>
          </svg>
        </div>

        <div>
          <span className="radius-rough-pill inline-flex items-center gap-2 border-[1.5px] border-ink bg-matcha-soft px-3 py-1 font-mono text-[12px] font-bold tracking-[.18em] text-matcha-deep shadow-sticker">
            AI PRODUCT INSPIRATION
          </span>
          <h2 className="font-serif mt-4 text-[32px] font-black leading-[1.18] text-ink sm:text-[44px]">
            把全世界的抱怨，
            <br />
            变成你的
            <em className="not-italic rounded-md bg-matcha-soft px-1.5 text-persimmon">下一个产品</em>
          </h2>
          <p className="mt-3 max-w-[520px] text-[16px] leading-7 text-ink-soft">
            灵感雷达每天从 Reddit 抓取人们真正发愁的小事，识别「值得被做出来」的机会，再用 AI
            生成产品方向。3 秒扫完 {total ?? 73} 条真实抱怨，找到今天最该做的那一个。
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Link
              href="/workbench"
              className="radius-rough inline-flex h-12 items-center gap-2 border-[1.5px] border-ink bg-persimmon px-7 text-[16px] font-extrabold tracking-wide text-surface shadow-sticker-lg transition-transform hover:-translate-y-0.5"
            >
              进入工作台 →
            </Link>
            <Link
              href="/workbench"
              className="radius-rough inline-flex h-12 items-center gap-2 border-[1.5px] border-ink bg-surface px-7 text-[16px] font-extrabold tracking-wide text-ink shadow-sticker transition-transform hover:-translate-y-0.5"
            >
              看看今日头条
            </Link>
            <span className="font-mono text-[11px] tracking-wide text-ink-faint">
              {live ? "RSS 实时" : "本地"} · 10 分钟缓存
            </span>
          </div>
        </div>
      </div>

      {/* 三步流程 */}
      <div className="grid flex-none grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
        <div className="card-sticker-lg p-4">
          <div className="grid h-8 w-10 place-items-center radius-rough-sm border-[1.2px] border-ink/75 bg-paper font-mono text-[18px] font-bold text-ink">
            01
          </div>
          <div className="mt-2 text-[16px] font-extrabold text-ink">抓取抱怨</div>
          <div className="mt-1.5 text-[13px] leading-6 text-ink-soft">
            Reddit 热门版块实时抓取，跳过自动置顶，逐条打分热度。
          </div>
        </div>
        <div className="card-sticker-lg p-4">
          <div className="grid h-8 w-10 place-items-center radius-rough-sm border-[1.2px] border-ink/75 bg-paper font-mono text-[18px] font-bold text-ink">
            02
          </div>
          <div className="mt-2 text-[16px] font-extrabold text-ink">识别机会</div>
          <div className="mt-1.5 text-[13px] leading-6 text-ink-soft">
            许愿句式 + 机会版块双重判定，标出「值得被做出来」的帖子。
          </div>
        </div>
        <div className="card-sticker-lg p-4">
          <div className="grid h-8 w-10 place-items-center radius-rough-sm border-[1.2px] border-ink/75 bg-paper font-mono text-[18px] font-bold text-ink">
            03
          </div>
          <div className="mt-2 text-[16px] font-extrabold text-ink">AI 产品方向</div>
          <div className="mt-1.5 text-[13px] leading-6 text-ink-soft">
            DeepSeek 结合抱怨上下文实时生成产品建议，失败自动降级规则引擎。
          </div>
        </div>
      </div>

      {/* 工作台预览（具体文字点缀） */}
      <div className="relative mt-6 flex-none card-sticker-lg p-4">
        <span className="tape -top-2 left-10 rotate-[2deg]" aria-hidden />
        <div className="flex flex-wrap items-center justify-between gap-y-1 font-mono text-[11px] tracking-[.14em] text-ink-faint">
          <span>工作台 WORKBENCH · 左栏索引 / 中栏机会流 / 右栏调研</span>
          <span>收藏 · 速记 · 排序</span>
        </div>
        <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-[170px_1fr_150px]">
          <div className="flex h-[118px] flex-col gap-[5px] radius-rough-sm border-[1.2px] border-ink/75 bg-paper p-2.5">
            <span className="font-mono text-[9px] tracking-[.1em] text-ink-faint">左栏 · 品类索引</span>
            <span className="truncate text-[12px] font-extrabold text-ink">数码科技 16</span>
            <span className="truncate text-[9.5px] text-ink-soft">食品饮料 12</span>
            <span className="truncate text-[9.5px] text-ink-soft">效率工具 11</span>
            <span className="self-start rounded-sm bg-matcha-soft px-1.5 text-[8.5px] font-bold text-matcha-deep">机会 18</span>
          </div>
          <div className="flex h-[118px] flex-col gap-[5px] radius-rough-sm border-[1.2px] border-ink/75 bg-surface p-2.5">
            <span className="font-mono text-[9px] tracking-[.1em] text-ink-faint">中栏 · 机会流</span>
            <span className="truncate text-[12px] font-extrabold text-ink">有什么发明能真正提升生活质量？</span>
            <span className="truncate text-[9.5px] text-ink-soft">r/SomebodyMakeThis · 数码科技</span>
            <span className="flex items-center justify-between">
              <span className="self-start rounded-sm bg-persimmon/10 px-1.5 text-[8.5px] font-bold text-persimmon">机会帖</span>
              <span className="font-mono text-[9px] font-bold text-persimmon">HEAT 92</span>
            </span>
          </div>
          <div className="flex h-[118px] flex-col gap-[5px] radius-rough-sm border-[1.2px] border-ink/75 bg-paper p-2.5">
            <span className="font-mono text-[9px] tracking-[.1em] text-ink-faint">右栏 · 调研速记</span>
            <span className="truncate text-[12px] font-extrabold text-ink">AI 方向：3 条</span>
            <span className="truncate text-[9.5px] text-ink-soft">✎ 速记已保存 2 条</span>
            <span className="self-start rounded-sm bg-matcha px-1.5 text-[8.5px] font-bold text-surface">收藏 5</span>
          </div>
        </div>
      </div>

      <footer className="mt-auto flex flex-none flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed border-ink/25 py-2.5 font-mono text-[10px] tracking-wide text-ink-faint">
        <span>数据源：r/SomebodyMakeThis · r/mildlyinfuriating · r/CrappyDesign</span>
        <span>·</span>
        <span>AI 方向：DeepSeek 实时生成 · 无 Key 降级规则引擎</span>
        <span>·</span>
        <span>收藏 / 速记存 localStorage</span>
      </footer>
    </div>
  );
}
