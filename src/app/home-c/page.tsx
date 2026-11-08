"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ComplaintsResponse } from "@/lib/types";

/** 风格 C 首页：治愈系柔和（水彩插画 + 圆角留白 + 低饱和暖色） */
export default function HomeC() {
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
    <div
      className="mx-auto flex h-screen max-w-[1440px] flex-col px-14"
      style={{
        background: "linear-gradient(160deg,#FBF4E6 0%,#F6EFE3 45%,#F3EBD9 100%)",
        color: "#4A4638",
      }}
    >
      {/* 刊头 */}
      <header className="flex h-[78px] flex-none items-center gap-4 border-b-[1.5px] border-[#E2D8BE]">
        <div
          className="grid h-[42px] w-[42px] flex-none place-items-center text-lg"
          style={{
            borderRadius: "50%",
            background: "linear-gradient(135deg,#F3E7C8,#A8C08E)",
            boxShadow: "0 6px 16px rgba(74,70,56,.12)",
          }}
        >
          ◎
        </div>
        <div>
          <h1 className="font-serif text-[26px] font-bold tracking-wide">灵感雷达</h1>
          <p className="font-mono text-[10px] tracking-[.26em] text-[#7A745F]">
            IDEA RADAR · EDITORIAL WORKBENCH
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2.5 font-mono text-[12px] tracking-wide text-[#7A745F]">
          <Link
            href="/"
            className="rounded-full px-4 py-[7px] font-semibold transition-colors"
            style={{ background: "rgba(255,253,247,.85)", boxShadow: "0 3px 10px rgba(74,70,56,.06)" }}
            title="切换风格 A（纸感杂志）预览"
          >
            ⇄ 风格 A
          </Link>
          {[`${dateStr} · 周${week}`, `${total ?? "—"} 条抱怨`, `${oppCount ?? "—"} 条机会`, engine].map((t) => (
            <span
              key={t}
              className="rounded-full px-4 py-[7px] font-semibold"
              style={{
                background: "rgba(255,253,247,.85)",
                boxShadow: "0 3px 10px rgba(74,70,56,.06)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </header>

      {/* Hero */}
      <div className="grid flex-none grid-cols-[470px_1fr] items-center gap-10 py-[52px]">
        <div className="relative h-[380px] w-[470px]">
          {/* C 风格：水彩插画 */}
          <svg viewBox="0 0 470 380" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="soft">
                <feGaussianBlur stdDeviation="1.4" />
              </filter>
            </defs>
            <rect x="30" y="60" width="410" height="270" rx="30" fill="#F3E7C8" transform="rotate(-2 235 195)" />
            <g transform="rotate(-6 235 195)" filter="url(#soft)">
              <circle cx="235" cy="195" r="88" fill="#EEF2E0" />
              <circle cx="235" cy="195" r="60" fill="rgba(168,192,142,.6)" />
              <circle cx="235" cy="195" r="30" fill="rgba(124,154,82,.7)" />
            </g>
            <path d="M235 195 L306 130" stroke="#E08A5C" strokeWidth="5" strokeLinecap="round" />
            <circle cx="306" cy="130" r="10" fill="#F6DFC8" stroke="#E08A5C" strokeWidth="2" />
            <g transform="rotate(8 100 120)" filter="url(#soft)">
              <circle cx="100" cy="120" r="28" fill="#F3E7C8" />
              <circle cx="100" cy="120" r="18" fill="#A8C08E" />
            </g>
            <g transform="rotate(-5 372 96)" filter="url(#soft)">
              <rect x="330" y="70" width="86" height="52" rx="18" fill="#EEF2E0" />
              <line x1="344" y1="90" x2="402" y2="90" stroke="#A8C08E" strokeWidth="3" strokeLinecap="round" />
              <line x1="344" y1="104" x2="390" y2="104" stroke="#A8C08E" strokeWidth="3" strokeLinecap="round" opacity=".7" />
            </g>
            <path d="M400 300 l9 20 22 3 -16 16 4 22 -19 -10 -19 10 4 -22 -16 -16 22 -3 z" fill="#E08A5C" opacity=".85" />
            <g transform="rotate(-10 66 292)" filter="url(#soft)">
              <circle cx="66" cy="292" r="24" fill="#F6DFC8" />
              <circle cx="66" cy="290" r="14" fill="#A8C08E" />
            </g>
            <g transform="rotate(6 300 330)" filter="url(#soft)">
              <circle cx="288" cy="308" r="8" fill="#A8C08E" />
              <circle cx="312" cy="308" r="8" fill="#A8C08E" />
              <circle cx="300" cy="330" r="7" fill="#F3E7C8" />
            </g>
          </svg>
        </div>

        <div>
          <span
            className="inline-flex items-center gap-2 rounded-full px-4 py-[7px] font-mono text-[12px] font-semibold tracking-[.18em]"
            style={{
              background: "#EEF2E0",
              color: "#7C9A52",
              boxShadow: "0 3px 10px rgba(124,154,82,.12)",
            }}
          >
            AI PRODUCT INSPIRATION
          </span>
          <h2 className="font-serif mt-5 text-[42px] font-bold leading-[1.25]">
            把全世界的抱怨，
            <br />
            变成你的<span style={{ color: "#D9532B" }}>下一个产品</span>
          </h2>
          <p className="mt-3 max-w-[520px] text-[16px] leading-8 text-[#7A745F]">
            灵感雷达每天从 Reddit 抓取人们真正发愁的小事，识别「值得被做出来」的机会，再用 AI
            生成产品方向。3 秒扫完 {total ?? 73} 条真实抱怨，找到今天最该做的那一个。
          </p>
          <div className="mt-7 flex items-center gap-4">
            <Link
              href="/workbench"
              className="inline-flex h-[50px] items-center gap-2 rounded-[18px] px-8 text-[16px] font-bold text-[#FFFDF7] transition-transform hover:-translate-y-0.5"
              style={{
                background: "linear-gradient(135deg,#E08A5C,#D9532B)",
                boxShadow: "0 8px 20px rgba(217,83,43,.25)",
              }}
            >
              进入工作台 →
            </Link>
            <Link
              href="/workbench"
              className="inline-flex h-[50px] items-center gap-2 rounded-[18px] px-8 text-[16px] font-bold transition-transform hover:-translate-y-0.5"
              style={{ background: "rgba(255,253,247,.9)", boxShadow: "0 6px 16px rgba(74,70,56,.1)" }}
            >
              看看今日头条
            </Link>
            <span className="font-mono text-[11px] text-[#A39B82]">
              {live ? "RSS 实时" : "本地"} · 10 分钟缓存
            </span>
          </div>
        </div>
      </div>

      {/* 三步流程 */}
      <div className="grid flex-none grid-cols-3 gap-[22px]">
        {[
          ["01 · GRAB", "抓取抱怨", "Reddit 热门版块实时抓取，跳过自动置顶，逐条打分热度。", "#F3E7C8"],
          ["02 · SPOT", "识别机会", "许愿句式 + 机会版块双重判定，标出「值得被做出来」的帖子。", "#EEF2E0"],
          ["03 · IDEA", "AI 产品方向", "DeepSeek 结合抱怨上下文实时生成产品建议，失败自动降级规则引擎。", "#F6DFC8"],
        ].map(([num, title, desc, bg]) => (
          <div
            key={num}
            className="rounded-[22px] p-[22px]"
            style={{ background: bg, boxShadow: "0 10px 24px rgba(74,70,56,.08)" }}
          >
            <div className="font-mono text-[13px] font-bold tracking-[.08em] text-[#7C9A52]">{num}</div>
            <div className="font-serif mt-2.5 text-[17px] font-bold">{title}</div>
            <div className="mt-1.5 text-[13px] leading-[2] text-[#7A745F]">{desc}</div>
          </div>
        ))}
      </div>

      {/* 工作台预览 */}
      <div
        className="mt-[26px] flex-none rounded-[22px] p-[18px]"
        style={{ background: "rgba(255,253,247,.85)", boxShadow: "0 10px 24px rgba(74,70,56,.08)" }}
      >
        <div className="flex items-center justify-between font-mono text-[11px] tracking-[.1em] text-[#A39B82]">
          <span>工作台 WORKBENCH · 左栏索引 / 中栏机会流 / 右栏调研</span>
          <span>收藏 · 速记 · 排序</span>
        </div>
        <div className="mt-2.5 grid grid-cols-[170px_1fr_150px] gap-2.5">
          <div className="flex h-[118px] flex-col gap-[5px] rounded-[14px] p-2.5" style={{ background: "#F6EFE3", boxShadow: "inset 0 2px 6px rgba(74,70,56,.06)" }}>
            <span className="font-mono text-[9px] tracking-[.1em] text-[#A39B82]">左栏 · 品类索引</span>
            <span className="truncate text-[12px] font-bold">数码科技 16</span>
            <span className="truncate text-[9.5px] text-[#7A745F]">食品饮料 12</span>
            <span className="truncate text-[9.5px] text-[#7A745F]">效率工具 11</span>
            <span className="self-start rounded-full bg-[#EEF2E0] px-2 py-[2px] text-[8.5px] font-bold text-[#7C9A52]">机会 18</span>
          </div>
          <div className="flex h-[118px] flex-col gap-[5px] rounded-[14px] p-2.5" style={{ background: "#F6EFE3", boxShadow: "inset 0 2px 6px rgba(74,70,56,.06)" }}>
            <span className="font-mono text-[9px] tracking-[.1em] text-[#A39B82]">中栏 · 机会流</span>
            <span className="truncate text-[12px] font-bold">有什么发明能真正提升生活质量？</span>
            <span className="truncate text-[9.5px] text-[#7A745F]">r/SomebodyMakeThis · 数码科技</span>
            <span className="flex items-center justify-between">
              <span className="self-start rounded-full bg-[#F6DFC8] px-2 py-[2px] text-[8.5px] font-bold text-[#D9532B]">机会帖</span>
              <span className="font-mono text-[9px] font-bold text-[#E08A5C]">HEAT 92</span>
            </span>
          </div>
          <div className="flex h-[118px] flex-col gap-[5px] rounded-[14px] p-2.5" style={{ background: "#F6EFE3", boxShadow: "inset 0 2px 6px rgba(74,70,56,.06)" }}>
            <span className="font-mono text-[9px] tracking-[.1em] text-[#A39B82]">右栏 · 调研速记</span>
            <span className="truncate text-[12px] font-bold">AI 方向：3 条</span>
            <span className="truncate text-[9.5px] text-[#7A745F]">✎ 速记已保存 2 条</span>
            <span className="self-start rounded-full bg-[#A8C08E] px-2 py-[2px] text-[8.5px] font-bold text-[#FFFDF7]">收藏 5</span>
          </div>
        </div>
      </div>

      <footer className="mt-auto flex flex-none items-center gap-4 border-t border-[#E2D8BE] py-2.5 font-mono text-[10px] tracking-wide text-[#A39B82]">
        <span>数据源：r/SomebodyMakeThis · r/mildlyinfuriating · r/CrappyDesign</span>
        <span>·</span>
        <span>AI 方向：DeepSeek 实时生成 · 无 Key 降级规则引擎</span>
        <span>·</span>
        <span>收藏 / 速记存 localStorage</span>
      </footer>
    </div>
  );
}
