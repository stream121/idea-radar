// AI 助手 · 周报模板与异常预警：规则通道兜底（无 LLM Key 时同样可用）。
import type { AnomalyAlert, DashboardData } from "@/lib/types";

/* ---------- 数据异常预警 ---------- */

export function checkAnomalies(d: DashboardData): AnomalyAlert[] {
  const out: AnomalyAlert[] = [];
  const { runtime, stats, trend } = d;

  // 1. 抓取降级：RSS 失败回落种子数据
  if (runtime.mode === "seed") {
    out.push({
      level: "alert",
      title: "抓取已降级为种子数据",
      detail: "Reddit 抓取失败（可能被限流），建议检查代理后手动「刷新」恢复实时数据。",
    });
  } else if (!runtime.live) {
    out.push({
      level: "warn",
      title: "非实时数据",
      detail: "本轮 RSS 抓取未成功，当前展示的是磁盘缓存数据。",
    });
  }

  // 2. 数据过期：距上次抓取超过 26 小时（每日 09:00 定时任务异常）
  const staleH = (Date.now() - runtime.lastFetchedAt) / 3600000;
  if (staleH > 26) {
    out.push({
      level: "warn",
      title: "数据超过一天未更新",
      detail: `距上次抓取已过 ${Math.floor(staleH)} 小时，每日 09:00 定时刷新任务可能未运行，请检查 refresh.log。`,
    });
  }

  // 3. 翻译异常
  if (runtime.mode !== "seed" && runtime.translateEngine === "none") {
    out.push({
      level: "warn",
      title: "标题翻译未生效",
      detail: "RSS 数据未产出中文标题，LLM 与免费机译通道可能均失败。",
    });
  } else if (runtime.mode !== "seed" && runtime.llmAvailable && runtime.translateEngine === "free") {
    out.push({
      level: "info",
      title: "翻译降级为免费机译",
      detail: "DeepSeek 已配置但本轮走了机译通道，可能 LLM 批量调用失败或超时。",
    });
  }

  // 4. 趋势异常：抓取量骤降 / 机会率过低
  if (trend.length >= 2) {
    const last = trend[trend.length - 1];
    const prev = trend[trend.length - 2];
    if (prev.total > 0 && last.total <= prev.total * 0.7) {
      out.push({
        level: "alert",
        title: "抓取量骤降",
        detail: `最近抓取 ${last.total} 条，较上次 ${prev.total} 条下降 ${Math.round(
          (1 - last.total / prev.total) * 100
        )}%，可能部分版块被限流。`,
      });
    }
    const oppRate = last.total > 0 ? last.opp / last.total : 0;
    if (last.total > 0 && oppRate < 0.15) {
      out.push({
        level: "warn",
        title: "机会密度偏低",
        detail: `最近抓取机会率仅 ${Math.round(oppRate * 100)}%，可多关注 r/SomebodyMakeThis 等许愿版块。`,
      });
    }
  } else {
    out.push({
      level: "info",
      title: "趋势数据不足",
      detail: "快照不足 2 天，暂无法做趋势比对；多点「刷新」或等每日任务积累数据。",
    });
  }

  // 5. 调研台冷启动
  if (stats.favCount === 0) {
    out.push({
      level: "info",
      title: "调研台尚无收藏",
      detail: "还没有收藏任何机会帖，收藏后可在工作台视图聚合沉淀。",
    });
  }

  if (out.length === 0) {
    out.push({ level: "info", title: "运行正常", detail: "抓取、翻译、趋势各项指标正常，未发现异常。" });
  }
  return out;
}

/* ---------- 周报规则模板（LLM 兜底） ---------- */

export function weeklyReportFallback(d: DashboardData): string {
  const { stats, categories, subreddits, topComplaints, runtime, trend } = d;
  const fmt = (ts: number) =>
    new Date(ts).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
  const end = Date.now();
  const start = end - 6 * 86400000;
  const oppRate = stats.total > 0 ? Math.round((stats.opp / stats.total) * 100) : 0;

  const lines: string[] = [];
  lines.push(`📋 灵感雷达 · 本周数据周报（${fmt(start)} – ${fmt(end)}）`);
  lines.push("");
  lines.push("📊 核心指标");
  lines.push(`· 抓取抱怨 ${stats.total} 条，机会 ${stats.opp} 条（机会率 ${oppRate}%）`);
  lines.push(`· 覆盖 ${stats.subredditCount} 个版块，平均热度 ${stats.avgHeat}`);
  lines.push(`· 调研台：收藏 ${stats.favCount} 条 · 速记 ${stats.noteCount} 条`);
  lines.push("");

  if (categories.length > 0) {
    lines.push("🔥 热点品类 TOP3");
    categories.slice(0, 3).forEach((c, i) => lines.push(`${i + 1}. ${c.name}（${c.count} 条）`));
    lines.push("");
  }

  if (topComplaints.length > 0) {
    lines.push("🌟 本周热帖");
    topComplaints.slice(0, 3).forEach((c, i) =>
      lines.push(`${i + 1}. 「${c.titleZh || c.title}」（热度 ${c.heat} · r/${c.subreddit}）`)
    );
    lines.push("");
  }

  lines.push("📈 趋势与运行");
  if (trend.length >= 2) {
    const first = trend[0];
    const last = trend[trend.length - 1];
    const delta = last.total - first.total;
    lines.push(
      `· 近 ${trend.length} 天抓取 ${first.total} → ${last.total} 条（${delta >= 0 ? "+" : ""}${delta}）`
    );
  } else {
    lines.push("· 快照较少，建议多「刷新」积累趋势数据");
  }
  const modeLabel = runtime.mode === "seed" ? "种子数据（降级）" : runtime.live ? "RSS 实时" : "RSS 缓存";
  const transLabel =
    runtime.translateEngine === "llm" ? "DeepSeek" : runtime.translateEngine === "free" ? "免费机译" : "未翻译";
  lines.push(`· 抓取：${modeLabel} · 翻译：${transLabel} · 大模型：${runtime.llmAvailable ? "已配置" : "未配置"}`);
  lines.push("");

  lines.push("✅ 下周建议");
  const tips: string[] = [];
  if (runtime.mode === "seed") tips.push("检查代理与限流状态，恢复 Reddit 实时抓取。");
  if (oppRate < 20 && stats.total > 0) tips.push("机会率偏低，可重点研读许愿式标题，人工补标机会。");
  if (stats.favCount < 5) tips.push("收藏量较少，建议每天挑 2-3 条高热度机会沉淀到工作台。");
  if (categories.length > 0) tips.push(`「${categories[0].name}」是当前最热品类，值得深挖其 AI 方向。`);
  if (tips.length === 0) tips.push("保持每日刷新节奏，持续观察趋势拐点。");
  tips.slice(0, 3).forEach((t, i) => lines.push(`${i + 1}. ${t}`));

  return lines.join("\n");
}
