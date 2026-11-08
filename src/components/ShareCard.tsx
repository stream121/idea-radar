"use client";

/**
 * P3-1 分享卡片：手绘风「吐槽 → 产品点子」海报
 * - 纯前端生成：内联 SVG（无图片依赖），可直接转 PNG 下载分享
 * - 内容全部来自真实字段：抱怨标题/热度/品类 + 规则或 LLM 推导的产品构想（标注推导）
 */
import { useState } from "react";
import type { AiDirection, Complaint } from "@/lib/types";

interface ShareCardProps {
  complaint: Complaint;
  /** 产品构想（优先第一条 AI 方向） */
  direction?: AiDirection | null;
  /** 机会评分（推导值，与详情面板一致） */
  oppScore: number;
  /** 同品类讨论条数 */
  sameCategoryCount: number;
  onClose: () => void;
}

/* ---------- 文本截断辅助（SVG 内中文换行） ---------- */

function cut(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---------- 导出：SVG → Canvas → PNG 下载 ---------- */

async function exportPng(svgEl: SVGSVGElement, filename: string) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.style.width = "720px";
  clone.style.height = "960px";
  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = url;
    });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = 720 * scale;
    canvas.height = 960 * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#F3EBD4";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------- 海报 SVG ---------- */

function CardSvg({ complaint, direction, oppScore, sameCategoryCount }: Omit<ShareCardProps, "onClose">) {
  const W = 720;
  const H = 960;
  const ink = "#23211C";
  const paper = "#F3EBD4";
  const matcha = "#5E7A3C";
  const matchaSoft = "#E6EDD6";
  const persimmon = "#D95B36";
  const faint = "#8C8577";

  const title = direction?.title?.trim() || complaint.titleZh || complaint.title || "产品机会";
  const desc = direction?.desc?.trim() || "";
  const pain = cut(
    (complaint.excerpt || complaint.titleZh || complaint.title || "").trim(),
    96
  );
  const sub = complaint.subreddit ?? "reddit";
  const cat = complaint.category ?? "其他灵感";
  const isOpp = !!complaint.opportunity;
  const today = new Date().toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="share-card-svg h-auto w-full"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
    >
      {/* 纸面底色 */}
      <rect x="0" y="0" width={W} height={H} fill={paper} />
      {/* 徒手外框（手绘风） */}
      <path
        d="M28 20 C 210 14, 520 26, 692 18 C 702 190, 694 500, 702 700 C 700 800, 700 880, 694 942 C 520 948, 210 940, 30 944 C 20 800, 26 480, 24 200 C 24 120, 22 60, 28 20 Z"
        fill="none"
        stroke={ink}
        strokeWidth="3"
      />
      {/* 左上角品牌 + 雷达图标 */}
      <g transform="translate(56 58)">
        <circle cx="12" cy="12" r="11" fill={matchaSoft} stroke={ink} strokeWidth="1.6" transform="rotate(-3 12 12)" />
        <path d="M12 12 L19 5" stroke={matcha} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M12 12 a4.5 4.5 0 0 0 4.5 4.5" stroke={matcha} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <circle cx="12" cy="12" r="1.8" fill={persimmon} stroke="none" />
        <text x="30" y="9" fontSize="17" fontFamily="'Georgia', serif" fontWeight="800" fill={ink} letterSpacing="2">
          IDEA RADAR
        </text>
        <text x="30" y="24" fontSize="9.5" fontFamily="monospace" fill={faint} letterSpacing="4">
          灵感雷达 · 产品机会捕获
        </text>
      </g>

      {/* 和纸胶带 */}
      <rect x="250" y="86" width="210" height="34" fill="rgba(240,214,160,0.85)" transform="rotate(1.5 355 103)" />

      {/* 大标题（产品构想） */}
      <text
        x="58"
        y="190"
        fontSize="34"
        fontFamily="'PingFang SC', 'Helvetica Neue', serif"
        fontWeight="900"
        fill={ink}
      >
        {esc(cut(title, 12))}
      </text>
      <text
        x="58"
        y="230"
        fontSize="16"
        fontFamily="'PingFang SC', serif"
        fill="#4A453C"
      >
        {esc(cut(desc, 44))}
      </text>
      {/* 手绘波浪线 */}
      <path
        d="M58 250 q 12 -7 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0"
        fill="none"
        stroke={persimmon}
        strokeWidth="2.6"
        strokeLinecap="round"
      />

      {/* 痛点引语卡 */}
      <g transform="translate(58 292)">
        <rect x="0" y="0" width="600" height="176" rx="14" fill="#FFFCF3" stroke={ink} strokeWidth="1.6" />
        <rect x="8" y="12" width="5" height="152" rx="2.5" fill={persimmon} />
        <text x="26" y="26" fontSize="10" fontFamily="monospace" fill={faint} letterSpacing="3">
          用户原声 · PAIN
        </text>
        <text x="26" y="60" fontSize="17" fontFamily="'PingFang SC', serif" fontStyle="italic" fill="#3B362E">
          “{esc(pain)}”
        </text>
        <text x="26" y="152" fontSize="10.5" fontFamily="monospace" fill={faint}>
          r/{esc(sub)} · {esc(cat)}
        </text>
      </g>

      {/* 数据徽章 */}
      <g transform="translate(58 520)">
        {[
          ["热度", `${complaint.heat}/100`, matcha],
          ["机会评分", `${oppScore}/100`, persimmon],
          ["同品类讨论", `${sameCategoryCount} 条`, ink],
        ].map(([k, v, color], i) => {
          const x = i * 205;
          return (
            <g key={k} transform={`translate(${x} 0)`}>
              <rect width="190" height="92" rx="10" fill="#FFFCF3" stroke={ink} strokeWidth="1.4" />
              <text x="14" y="24" fontSize="9.5" fontFamily="monospace" fill={faint} letterSpacing="3">
                {String(k).toUpperCase()}
              </text>
              <text x="14" y="64" fontSize="26" fontFamily="monospace" fontWeight="800" fill={color}>
                {esc(String(v))}
              </text>
            </g>
          );
        })}
        <text x="0" y="128" fontSize="9.5" fontFamily="monospace" fill={faint}>
          机会评分 = 热度 50% + 机会信号 20 + 评论 15 + 品类密度 15（规则推导）
        </text>
      </g>

      {/* 底部 CTA + 印章 */}
      <g transform="translate(58 760)">
        <text x="0" y="20" fontSize="19" fontFamily="'PingFang SC', serif" fontWeight="700" fill={ink}>
          {isOpp ? "把这条抱怨，变成你的下一个产品。" : "这个日常烦恼里，可能藏着产品机会。"}
        </text>
        <path
          d="M0 44 q 16 -8 32 0 t 32 0 t 32 0 t 32 0 t 32 0 t 32 0 t 32 0 t 32 0 t 32 0 t 32 0 t 32 0 t 32 0 t 32 0 t 32 0 t 32 0 t 32 0 t 32 0 t 32 0"
          fill="none"
          stroke={matcha}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <text x="0" y="82" fontSize="10.5" fontFamily="monospace" fill={faint} letterSpacing="3">
          IDEA RADAR · 发现真实需求 · 生成产品方向　|　{`${today}`} 抓取
        </text>
      </g>

      {/* 机会印章 */}
      {isOpp && (
        <g transform="rotate(-8 616 196)">
          <circle cx="616" cy="196" r="52" fill="none" stroke={persimmon} strokeWidth="2.4" />
          <circle cx="616" cy="196" r="44" fill="none" stroke={persimmon} strokeWidth="0.8" strokeDasharray="3 3" />
          <text x="616" y="192" textAnchor="middle" fontSize="13" fontFamily="monospace" fontWeight="800" fill={persimmon}>
            机会
          </text>
          <text x="616" y="210" textAnchor="middle" fontSize="7.5" fontFamily="monospace" fill={persimmon}>
            OPPORTUNITY
          </text>
        </g>
      )}
    </svg>
  );
}

/* ---------- 弹层：预览 + 下载 ---------- */

export default function ShareCard({
  complaint,
  direction,
  oppScore,
  sameCategoryCount,
  onClose,
}: ShareCardProps) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyText = async () => {
    const text = [
      `【IDEA RADAR · 产品机会】`,
      `${direction?.title || complaint.titleZh || complaint.title}`,
      direction?.desc ? `定位：${direction.desc}` : "",
      `痛点原声：“${(complaint.excerpt || complaint.titleZh || complaint.title).slice(0, 96)}”`,
      `热度 ${complaint.heat}/100 · 机会评分 ${oppScore}/100 · r/${complaint.subreddit}`,
      `把这条抱怨，变成你的下一个产品。`,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 剪贴板不可用时静默失败 */
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="radius-rough-lg max-h-[92vh] w-full max-w-[380px] overflow-y-auto bg-paper p-4 shadow-sticker-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="font-serif text-[15px] font-black text-ink">分享卡片</span>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center radius-rough-sm border-[1.5px] border-ink bg-surface text-[12px] text-ink shadow-sticker transition-colors hover:bg-matcha-soft"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="radius-rough overflow-hidden border-[1.5px] border-ink">
          <CardSvg
            complaint={complaint}
            direction={direction}
            oppScore={oppScore}
            sameCategoryCount={sameCategoryCount}
          />
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => {
              setBusy(true);
              exportPng(document.querySelector<SVGSVGElement>(".share-card-svg")!, `idea-radar-${complaint.id}.png`).finally(() => setBusy(false));
            }}
            disabled={busy}
            className="radius-rough inline-flex h-10 flex-1 items-center justify-center gap-1.5 border-[1.5px] border-ink bg-persimmon px-4 text-[13px] font-extrabold text-surface shadow-sticker-lg transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            {busy ? "生成中…" : "↓ 下载 PNG"}
          </button>
          <button
            onClick={copyText}
            disabled={busy}
            className="radius-rough inline-flex h-10 flex-1 items-center justify-center border-[1.5px] border-ink bg-surface px-4 text-[13px] font-extrabold text-ink shadow-sticker transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            {copied ? "✓ 已复制" : "复制文案"}
          </button>
        </div>
        <p className="mt-2 font-mono text-[9.5px] leading-relaxed text-ink-faint">
          * 卡片内容来自真实抓取字段与 AI 规则推导，未虚构市场数据；竖版海报适合分享到社媒/演示。
        </p>
      </div>
    </div>
  );
}
