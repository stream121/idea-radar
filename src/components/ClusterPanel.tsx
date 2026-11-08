"use client";

import { useMemo, useState } from "react";
import type { Complaint } from "@/lib/types";
import { buildClusters, clusterExcerpt } from "@/lib/rules/clusters";
import { CATEGORY_COLORS } from "@/lib/rules/classify";

interface Props {
  complaints: Complaint[];
  onOpen: (id: string) => void;
}

/** P2-2 痛点关联图谱：将不同来源的相似抱怨聚成需求主题 */
export default function ClusterPanel({ complaints, onOpen }: Props) {
  const topics = useMemo(() => buildClusters(complaints), [complaints]);
  const [openId, setOpenId] = useState<string | null>(topics[0]?.id ?? null);

  if (topics.length === 0) {
    return (
      <section className="flex min-h-0 flex-col px-4 lg:px-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink pb-2">
          <div className="sketch-underline text-[15px] font-black tracking-[.06em] text-ink">痛点关联图谱</div>
          <span className="stamp">PAIN CLUSTERS</span>
        </div>
        <div className="mt-3 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-hair bg-surface/50 py-16 text-center">
          <div className="text-3xl opacity-40">🕸</div>
          <div className="text-[12px] text-ink-faint">暂无可聚类主题，抓取更多数据后自动生成</div>
        </div>
      </section>
    );
  }

  const maxCount = Math.max(...topics.map((t) => t.complaints.length));

  return (
    <section className="scroll-thin flex min-h-0 flex-col overflow-y-auto px-4 lg:px-5">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink pb-2">
        <div className="sketch-underline text-[15px] font-black tracking-[.06em] text-ink">痛点关联图谱</div>
        <span className="stamp">PAIN CLUSTERS</span>
        <span className="ml-auto font-mono text-[10px] text-ink-faint">
          {topics.length} 个需求主题 · {complaints.length} 条抱怨
        </span>
      </div>

      {/* 主题概览条 */}
      <div className="scroll-thin mt-3 flex gap-2 overflow-x-auto pb-1">
        {topics.map((t) => {
          const active = openId === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setOpenId(active ? null : t.id)}
              className={`flex-none rounded-xl border-[1.5px] border-ink px-3 py-2 text-left shadow-sticker transition-all ${
                active
                  ? "bg-matcha-soft"
                  : "bg-surface hover:bg-matcha-soft/40"
              }`}
            >
              <div className="text-[12.5px] font-extrabold text-ink">{t.name}</div>
              <div className="mt-0.5 font-mono text-[10px] text-ink-faint">
                {t.complaints.length} 条 · {t.sourceDist.length} 来源
              </div>
              <div className="mt-1.5 h-1 w-32 overflow-hidden rounded-full bg-hair/70">
                <i
                  className="block h-1 rounded-full bg-matcha"
                  style={{ width: `${(t.complaints.length / maxCount) * 100}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* 主题详情（可多选展开，展示原始反馈/来源/方向） */}
      <div className="mt-3 space-y-2 pb-2">
        {topics.map((t) => {
          const open = openId === t.id;
          if (!open) return null;
          return (
            <div key={t.id} className="card-sticker p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[14px] font-black text-ink">{t.name}</div>
                <span className="rounded-full bg-persimmon/10 px-2 py-0.5 font-mono text-[9.5px] font-bold text-persimmon">
                  {t.complaints.length} 条抱怨
                </span>
              </div>

              {/* 关键词 */}
              <div className="mt-2 flex flex-wrap gap-1">
                {t.keywords.map((k) => (
                  <span
                    key={k}
                    className="rounded-full border border-hair bg-paper px-2 py-0.5 font-mono text-[9.5px] text-ink-faint"
                  >
                    {k}
                  </span>
                ))}
              </div>

              {/* 来源分布 */}
              <div className="mt-2 flex flex-wrap gap-1">
                {t.sourceDist.map(([sub, n]) => (
                  <span
                    key={sub}
                    className="rounded-full bg-matcha-soft px-2 py-0.5 font-mono text-[9.5px] font-bold text-matcha-deep"
                  >
                    r/{sub} × {n}
                  </span>
                ))}
              </div>

              {/* 潜在产品方向 */}
              <div className="mt-2 rounded-lg border-l-2 border-persimmon bg-paper/80 px-2.5 py-1.5 font-mono text-[10.5px] text-ink-soft">
                <span className="font-bold text-persimmon">潜在产品方向</span>：{t.direction}
                <span className="ml-1 text-ink-faint">（规则推导）</span>
              </div>

              {/* 原始反馈列表 */}
              <div className="mt-2 border-t border-hair pt-2">
                <div className="mono-tag mb-1">原始反馈 / ORIGINAL POSTS</div>
                <div className="space-y-1">
                  {t.complaints.slice(0, 4).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onOpen(c.id)}
                      className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-matcha-soft/50"
                    >
                      <i
                        className="dot mt-1 flex-none"
                        style={{ background: CATEGORY_COLORS[c.category] ?? "#647E48" }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-bold text-ink">
                          {c.titleZh || c.title}
                        </span>
                        <span className="block truncate text-[10.5px] text-ink-faint">
                          {clusterExcerpt(c, 60)} · 热度 {c.heat}
                        </span>
                      </span>
                      <span className="flex-none font-mono text-[9.5px] text-ink-faint">
                        r/{c.subreddit}
                      </span>
                    </button>
                  ))}
                </div>
                {t.complaints.length > 4 && (
                  <div className="pt-1 text-center font-mono text-[9.5px] text-ink-faint">
                    还有 {t.complaints.length - 4} 条相关抱怨…
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
