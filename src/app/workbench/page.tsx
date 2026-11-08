"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import Rail from "@/components/Rail";
import Stream from "@/components/Stream";
import DetailPanel from "@/components/DetailPanel";
import AssistantPanel from "@/components/AssistantPanel";
import ClusterPanel from "@/components/ClusterPanel";
import BriefPanel from "@/components/BriefPanel";
import { SEED_COMPLAINTS } from "@/lib/data/seed";
import type {
  CategoryId,
  Complaint,
  ComplaintsResponse,
  FetchMode,
  NotesData,
  SortKey,
  StreamFilter,
  TranslateEngine,
  ViewKey,
  WorkStatus,
} from "@/lib/types";

const LS_FAV = "idea-radar:favorites";
const LS_NOTES = "idea-radar:notes";
const LS_STATUS = "idea-radar:statuses";
const LS_IGNORED = "idea-radar:ignored";

function readArray(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function readNotes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LS_NOTES) ?? "{}") ?? {};
  } catch {
    return {};
  }
}
function readStatuses(): Record<string, WorkStatus> {
  try {
    return JSON.parse(localStorage.getItem(LS_STATUS) ?? "{}") ?? {};
  } catch {
    return {};
  }
}
function writeLsFav(list: string[]) {
  try {
    localStorage.setItem(LS_FAV, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
function writeLsNotes(map: Record<string, string>) {
  try {
    localStorage.setItem(LS_NOTES, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
function writeLsStatus(map: Record<string, WorkStatus>) {
  try {
    localStorage.setItem(LS_STATUS, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
function writeArray(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
/** 收藏/速记走服务端 API（失败时回退 localStorage，保证离线可用） */
async function loadNotesFromApi(): Promise<NotesData | null> {
  try {
    const res = await fetch("/api/notes", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as NotesData;
  } catch {
    return null;
  }
}
async function saveNotesToApi(data: NotesData) {
  try {
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      cache: "no-store",
    });
  } catch {
    /* 服务端不可用时忽略，localStorage 已兜底 */
  }
}

export default function Home() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [live, setLive] = useState(false);
  const [mode, setMode] = useState<FetchMode>("seed");
  const [fetchedAt, setFetchedAt] = useState(0);
  const [subreddits, setSubreddits] = useState<string[]>([]);
  const [translateEngine, setTranslateEngine] = useState<TranslateEngine>("none");
  const [llmAvailable, setLlmAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  // 刷新中：不清空列表（避免闪白/卡顿），仅按钮转圈反馈
  const [refreshing, setRefreshing] = useState(false);

  const [view, setView] = useState<ViewKey>("opp");
  const [sort, setSort] = useState<SortKey>("heat");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 左栏筛选 + 中栏筛选 + 忽略 + 移动端抽屉
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [streamFilter, setStreamFilter] = useState<StreamFilter>("all");
  const [ignored, setIgnored] = useState<string[]>(() => readArray(LS_IGNORED));
  const [railOpen, setRailOpen] = useState(false);

  const [favorites, setFavorites] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, WorkStatus>>({});

  const load = useCallback(async (refresh = false) => {
    // 首屏显示全屏 loading；刷新则保留旧列表，仅按钮转圈
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(
        `/api/complaints${refresh ? "?refresh=1" : ""}`,
        { cache: refresh ? "no-store" : "no-store" }
      );
      const data: ComplaintsResponse = await res.json();
      setComplaints(data.complaints ?? []);
      setLive(data.live);
      setMode(data.mode);
      setFetchedAt(data.fetchedAt);
      setSubreddits(data.subreddits ?? []);
      setTranslateEngine(data.translateEngine ?? "none");
      setLlmAvailable(!!data.llmAvailable);
    } catch (e) {
      console.warn("[page] fetch failed, fallback seed:", (e as Error).message);
      setComplaints(SEED_COMPLAINTS);
      setLive(false);
      setMode("seed");
      setFetchedAt(Date.now());
      setSubreddits(["SomebodyMakeThis", "mildlyinfuriating", "CrappyDesign"]);
      setTranslateEngine("none");
      setLlmAvailable(false);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 收藏/速记：优先服务端 API，无则回退 localStorage
    loadNotesFromApi().then((d) => {
      if (d) {
        setFavorites(d.favorites);
        setNotes(d.notes);
        setStatuses(d.statuses ?? {});
        writeLsFav(d.favorites);
        writeLsNotes(d.notes);
        writeLsStatus(d.statuses ?? {});
      } else {
        setFavorites(readArray(LS_FAV));
        setNotes(readNotes());
        setStatuses(readStatuses());
      }
    });
    load();
  }, [load]);

  const presentIds = useMemo(() => new Set(complaints.map((c) => c.id)), [complaints]);

  const selected = useMemo(
    () => complaints.find((c) => c.id === selectedId) ?? null,
    [complaints, selectedId]
  );

  const toggleFav = useCallback(
    (id: string) => {
      setFavorites((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        writeLsFav(next);
        saveNotesToApi({ favorites: next, notes, statuses });
        return next;
      });
    },
    [notes, statuses]
  );

  const updateNote = useCallback((id: string, text: string) => {
    setNotes((prev) => {
      const next = { ...prev, [id]: text };
      writeLsNotes(next);
      saveNotesToApi({ favorites, notes: next, statuses });
      return next;
    });
  }, [favorites, statuses]);

  const setStatus = useCallback((id: string, st: WorkStatus) => {
    setStatuses((prev) => {
      const next = { ...prev, [id]: st };
      writeLsStatus(next);
      saveNotesToApi({ favorites, notes, statuses: next });
      return next;
    });
  }, [favorites, notes]);

  const openFromBench = useCallback((id: string) => {
    setSelectedId(id);
    setView("fav");
  }, []);

  const toggleIgnore = useCallback((id: string) => {
    setIgnored((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeArray(LS_IGNORED, next);
      return next;
    });
  }, []);

  const oppCount = useMemo(
    () => complaints.filter((c) => c.opportunity).length,
    [complaints]
  );

  const topCategoryName = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of complaints) m.set(c.category, (m.get(c.category) ?? 0) + 1);
    let best: { name: string; count: number } | null = null;
    for (const [name, count] of m) {
      if (!best || count > best.count) best = { name, count };
    }
    return best?.name;
  }, [complaints]);

  return (
    <div className="paper-dot mx-auto flex h-screen max-w-[1440px] flex-col bg-paper px-4 sm:px-6">
      <Header
        live={live}
        mode={mode}
        fetchedAt={fetchedAt}
        total={complaints.length}
        oppCount={oppCount}
        loading={loading}
        refreshing={refreshing}
        llmAvailable={llmAvailable}
        onRefresh={() => load(true)}
        view={view}
        onNavView={(v) => {
          setView(v);
          if (v === "bench") setSelectedId(null);
        }}
        railOpen={railOpen}
        onToggleRail={() => setRailOpen((v) => !v)}
      />

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_360px] gap-0 py-3">
        {/* 左栏筛选中心：lg+ 内联，小屏为抽屉 */}
        <div
          className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col bg-paper px-3 pt-3 shadow-sticker-lg transition-transform lg:contents lg:shadow-none lg:transition-none ${
            railOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Rail
            complaints={complaints}
            view={view}
            onView={(v) => {
              setView(v);
              if (v === "bench") setSelectedId(null);
            }}
            favCount={favorites.length}
            live={live}
            mode={mode}
            llmAvailable={llmAvailable}
            category={categoryFilter}
            onCategory={setCategoryFilter}
            source={sourceFilter}
            onSource={setSourceFilter}
            onClose={() => setRailOpen(false)}
          />
        </div>
        {railOpen && (
          <div
            className="fixed inset-0 z-[35] bg-ink/25 lg:hidden"
            onClick={() => setRailOpen(false)}
          />
        )}

        {view === "clusters" ? (
          <ClusterPanel
            complaints={complaints}
            onOpen={(id) => {
              setSelectedId(id);
              setView("opp");
            }}
          />
        ) : view === "brief" ? (
          <BriefPanel
            complaints={complaints}
            onOpen={(id) => {
              setSelectedId(id);
              setView("opp");
            }}
          />
        ) : (
          <Stream
            complaints={complaints}
            favorites={favorites}
            view={view}
            sort={sort}
            onSort={setSort}
            filter={streamFilter}
            onFilter={setStreamFilter}
            category={categoryFilter}
            source={sourceFilter}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
            onFav={toggleFav}
            ignored={ignored}
            onIgnore={toggleIgnore}
            loading={loading}
          />
        )}

        {/* 右栏 AI 分析中心：xl+ 内联，小屏为独立详情面板 */}
        <div
          className={`fixed inset-y-0 right-0 z-40 flex h-full w-[min(92vw,400px)] flex-col bg-surface shadow-sticker-lg transition-transform xl:contents xl:shadow-none xl:transition-none ${
            selected ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <DetailPanel
            selected={selected}
            view={view}
            complaints={complaints}
            favorites={favorites}
            notes={notes}
            statuses={statuses}
            llmAvailable={llmAvailable}
            onFav={toggleFav}
            onNote={updateNote}
            onStatus={setStatus}
            onOpenFromBench={openFromBench}
            onCloseDetail={() => setSelectedId(null)}
          />
        </div>
        {selected && (
          <div className="fixed inset-0 z-[35] bg-ink/20 xl:hidden" onClick={() => setSelectedId(null)} />
        )}
      </main>

      <AssistantPanel
        stats={{
          total: complaints.length,
          opp: oppCount,
          mode,
          favCount: favorites.length,
          topCategory: topCategoryName,
        }}
      />

      <footer className="flex flex-none flex-wrap items-center gap-2 border-t border-hair px-3 py-1.5 font-mono text-[10.5px] tracking-wide text-ink-faint">
        <span>数据源：</span>
        <span className="inline-flex h-[18px] items-center rounded-full bg-matcha-soft px-2 text-[10px] font-bold text-matcha-deep">
          {live ? "RSS 实时" : "种子数据"}
        </span>
        <span>
          <b className="font-normal text-ink-soft">
            {subreddits.length ? subreddits.map((s) => `r/${s}`).join(" · ") : "—"}
          </b>
          {live ? " （本机代理）" : ""}
        </span>
        <span>·</span>
        <span>
          {llmAvailable
            ? "AI 方向：DeepSeek 实时生成 · 标题译·DeepSeek"
            : "AI 方向：规则引擎（配 Key 可切 LLM）"}
        </span>
        <span>·</span>
        <span>收藏 / 速记存本地服务端（回退 localStorage）</span>
      </footer>
    </div>
  );
}
