"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnomalyAlert, AssistantReply } from "@/lib/types";

interface Msg {
  q: string;
  a: string;
  engine: "llm" | "rule-engine";
  alerts?: AnomalyAlert[];
  pending?: boolean;
}

interface Props {
  /** 用于生成「今日建议」的上下文统计 */
  stats?: {
    total: number;
    opp: number;
    mode: string;
    favCount: number;
    topCategory?: string;
  };
}

const QUICK_QS = ["数据从哪来？", "怎么收藏？", "AI 方向怎么看？", "数据看板是什么？"];
const OPEN_EVENT = "idea-radar:open-assistant";

const LEVEL_COLOR: Record<AnomalyAlert["level"], string> = {
  alert: "#D9532B",
  warn: "#E0A93E",
  info: "#7C9A52",
};
const LEVEL_LABEL: Record<AnomalyAlert["level"], string> = {
  alert: "严重",
  warn: "关注",
  info: "提示",
};

function todaySuggestions(stats?: Props["stats"]): string[] {
  const out: string[] = [];
  if (!stats || stats.total === 0) return ["去工作台点「↻ 刷新」拉取最新抱怨数据。"];
  const oppRate = Math.round((stats.opp / stats.total) * 100);
  if (oppRate >= 20) {
    out.push(`机会密度不错（${oppRate}%），建议优先深挖${stats.topCategory ?? "机会最多的品类"}。`);
  } else {
    out.push(`机会占比 ${oppRate}%，可多看许愿式标题的帖子。`);
  }
  if (stats.mode === "seed") {
    out.push("当前是种子数据，点「刷新」可抓取真实 Reddit 源。");
  }
  if (stats.favCount === 0) {
    out.push("还没有收藏，收藏几条热帖后去「数据看板」看收藏统计。");
  }
  if (out.length === 0) out.push("保持刷新，机会会越来越多。");
  return out.slice(0, 3);
}

/** 三点思考动画 */
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-ink-faint"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

/** 轻量富文本渲染：小标题加粗、列表缩进、**粗体** */
function renderBold(line: string) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p
  );
}

function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="h-1.5" />;
        // 小标题：emoji 引导行或 markdown 标题
        if (/^(📊|🔥|📈|✅|📋|🌟|🚨|💡)/.test(t) || t.startsWith("#")) {
          return (
            <div key={i} className="mt-1.5 text-[13px] font-bold text-ink first:mt-0">
              {renderBold(t.replace(/^#+\s*/, ""))}
            </div>
          );
        }
        // 列表项
        if (/^([-·•]|\d+[.、])/.test(t)) {
          return (
            <div key={i} className="pl-1.5 leading-relaxed">
              {renderBold(t)}
            </div>
          );
        }
        return (
          <div key={i} className="leading-relaxed">
            {renderBold(t)}
          </div>
        );
      })}
    </>
  );
}

export default function AssistantPanel({ stats }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoRan = useRef(false);
  const [suggestions] = useState(() => todaySuggestions(stats));

  useEffect(() => {
    if (open && bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  // 打开面板时输入框自动聚焦
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  // ESC 关闭面板
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // 顶栏「我的 AI 助手」入口唤起
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  /** 执行动作类请求：生成周报 / 异常预警 */
  const runAction = useCallback(
    async (action: "weekly-report" | "anomaly") => {
      if (busy) return;
      setBusy(true);
      const label = action === "weekly-report" ? "📄 生成周报" : "🚨 异常预警";
      setMsgs((m) => [...m, { q: label, a: "", engine: "rule-engine", pending: true }]);
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
          cache: "no-store",
        });
        const d: AssistantReply = await res.json();
        setMsgs((m) => [
          ...m.slice(0, -1),
          { q: label, a: d.answer, engine: d.engine, alerts: d.alerts },
        ]);
        if (d.alerts) {
          setAlertCount(d.alerts.filter((x) => x.level !== "info").length);
        }
      } catch {
        setMsgs((m) => [
          ...m.slice(0, -1),
          { q: label, a: "助手暂时开小差，请稍后再试。", engine: "rule-engine" },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy]
  );

  // 首次打开面板时自动体检一次，异常数挂到入口按钮红点
  useEffect(() => {
    if (open && !autoRan.current) {
      autoRan.current = true;
      runAction("anomaly");
    }
  }, [open, runAction]);

  const ask = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setQ("");
    setMsgs((m) => [...m, { q: t, a: "", engine: "rule-engine", pending: true }]);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: t }),
        cache: "no-store",
      });
      const d: AssistantReply = await res.json();
      setMsgs((m) => [...m.slice(0, -1), { q: t, a: d.answer, engine: d.engine }]);
    } catch {
      setMsgs((m) => [
        ...m.slice(0, -1),
        { q: t, a: "助手暂时开小差，请稍后再试。", engine: "rule-engine" },
      ]);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  };

  const clearMsgs = () => {
    setMsgs([]);
  };

  return (
    <>
      {/* 浮动入口按钮（小型化，异常时挂红点计数） */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "收起 AI 助手" : "打开 AI 助手"}
        className={`fixed bottom-5 right-5 z-30 grid h-12 w-12 place-items-center rounded-full border-[1.5px] border-ink bg-surface shadow-sticker-lg transition-all hover:-translate-y-0.5 ${
          open ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        aria-label="AI 助手"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-matcha text-[16px] text-surface">
          ✦
        </span>
        {alertCount > 0 && !open && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-surface bg-persimmon px-1 font-mono text-[10px] font-bold text-surface">
            {alertCount}
          </span>
        )}
      </button>

      {/* 面板 */}
      {open && (
        <div className="card-sticker-lg fixed bottom-[84px] right-5 z-30 flex h-[480px] max-h-[calc(100vh-104px)] w-[360px] max-w-[calc(100vw-40px)] flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-hair bg-paper/40 px-3 py-2.5">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-matcha text-surface">
              ✦
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-black text-ink">AI 助手</div>
              <div className="font-mono text-[9.5px] tracking-[.16em] text-ink-faint">
                解答基础问题 · 双通道引擎
              </div>
            </div>
            {msgs.length > 0 && (
              <button
                onClick={clearMsgs}
                title="清空对话"
                className="grid h-7 w-7 place-items-center rounded-full border border-hair bg-surface font-mono text-[11px] text-ink-faint transition-colors hover:bg-matcha-soft"
              >
                🗑
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-full border border-hair bg-surface font-mono text-[12px] text-ink-faint transition-colors hover:bg-matcha-soft"
            >
              ✕
            </button>
          </div>

          {/* 今日建议 */}
          <div className="border-b border-hair px-3 py-2">
            <div className="mb-1.5 font-mono text-[10.5px] font-bold tracking-[.14em] text-persimmon">💡 今日建议</div>
            <ul className="space-y-1">
              {suggestions.map((s, i) => (
                <li key={i} className="flex gap-1.5 text-[13px] leading-snug text-ink-soft">
                  <span className="flex-none text-persimmon">·</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 消息区 */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {msgs.length === 0 && (
              <div className="pt-2 font-mono text-[12px] leading-relaxed text-ink-faint">
                你好，我是灵感雷达助手。可以问：数据来源、怎么收藏、AI 方向怎么生成；也可以点下方按钮生成周报或做异常体检。
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className="mb-2">
                <div className="flex justify-end">
                  <span className="max-w-[85%] rounded-xl rounded-tr-sm bg-ink px-2.5 py-1.5 text-[13px] leading-snug text-surface">
                    {m.q}
                  </span>
                </div>
                <div className="mt-1 flex justify-start">
                  <span className="max-w-[92%] rounded-xl rounded-tl-sm border border-hair bg-paper px-2.5 py-1.5 text-[13px] leading-snug text-ink">
                    {m.pending ? (
                      <TypingDots />
                    ) : m.a.includes("\n") ? (
                      <RichText text={m.a} />
                    ) : (
                      m.a
                    )}
                  </span>
                </div>
                {/* 异常预警列表 */}
                {m.alerts && m.alerts.length > 0 && (
                  <div className="mt-1.5 space-y-1 pl-1">
                    {m.alerts.map((al, j) => (
                      <div
                        key={j}
                        className="flex gap-2 rounded-lg border border-hair bg-paper px-2 py-1.5"
                      >
                        <span
                          className="mt-1 h-2 w-2 flex-none rounded-full"
                          style={{ background: LEVEL_COLOR[al.level] }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12px] font-bold text-ink">{al.title}</span>
                            <span
                              className="rounded-full px-1 font-mono text-[7px] font-bold text-surface"
                              style={{ background: LEVEL_COLOR[al.level] }}
                            >
                              {LEVEL_LABEL[al.level]}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11.5px] leading-snug text-ink-soft">{al.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!m.pending && (
                  <div className="mt-0.5 pl-1 font-mono text-[10px] text-ink-faint">
                    {m.engine === "llm" ? "· DeepSeek 实时" : "· 规则引擎"}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* 动作按钮：周报 / 预警 */}
          <div className="flex gap-1.5 border-t border-hair px-3 py-2">
            <button
              onClick={() => runAction("weekly-report")}
              disabled={busy}
              className="flex-1 rounded-full border border-matcha-deep/20 bg-matcha-soft px-2 py-1.5 font-mono text-[11px] font-bold text-matcha-deep transition-colors hover:bg-matcha-soft/70 disabled:opacity-50"
            >
              📄 生成周报
            </button>
            <button
              onClick={() => runAction("anomaly")}
              disabled={busy}
              className="flex-1 rounded-full border border-hair bg-paper px-2 py-1.5 font-mono text-[11px] font-bold text-persimmon transition-colors hover:border-persimmon/40 disabled:opacity-50"
            >
              🚨 异常预警
            </button>
          </div>

          {/* 快捷问题 */}
          <div className="flex flex-wrap gap-1.5 border-t border-hair px-3 py-2">
            {QUICK_QS.map((t) => (
              <button
                key={t}
                onClick={() => ask(t)}
                disabled={busy}
                className="rounded-full border border-hair bg-paper px-2.5 py-1 font-mono text-[10.5px] text-ink-soft transition-colors hover:bg-matcha-soft"
              >
                {t}
              </button>
            ))}
          </div>

          {/* 输入区 */}
          <div className="flex items-center gap-2 border-t border-hair bg-paper/40 px-3 py-2.5">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask(q)}
              placeholder="输入问题…（ESC 关闭）"
              disabled={busy}
              className="h-9 min-w-0 flex-1 rounded-full border border-hair bg-surface px-3.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-matcha"
            />
            <button
              onClick={() => ask(q)}
              disabled={busy || !q.trim()}
              className="h-9 flex-none rounded-full bg-matcha-deep px-3.5 font-mono text-[11.5px] font-bold text-surface shadow-soft transition-all hover:-translate-y-px hover:bg-matcha disabled:opacity-50"
            >
              发送
            </button>
          </div>
        </div>
      )}
    </>
  );
}
