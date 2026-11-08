import { NextRequest } from "next/server";
import { hasLLM, chatCompletion } from "@/lib/llm/client";
import { answerBasic } from "@/lib/rules/assistant";
import { checkAnomalies, weeklyReportFallback } from "@/lib/rules/report";
import { getDashboardData } from "@/lib/dashboard";
import type { AssistantReply } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_ASSISTANT = `你是「灵感雷达」的产品助手。用户在体验一个把 Reddit 抱怨转成产品灵感的工具，
可能问你产品怎么用、数据怎么来的、功能含义等问题。请用简洁中文（80 字内）直接回答，
语气友好，可用 1-2 条 bullet。不要编造不存在的功能。
只输出 JSON：{"answer":"..."}`;

const SYSTEM_DRAFT = `你是「灵感雷达」的产品策划。用户从调研工作台里选了一批收藏的机会帖（JSON 数组，
每项含 titleZh 中文标题、category 品类、heat 热度、opportunity 是否机会、subreddit 来源）。
请基于这批真实材料，写一份 250 字内的《产品方向初稿》，用 markdown 小标题组织：
🎯 机会聚焦（提炼 1 个最有价值的统一方向） / 📋 候选拆分（按不同诉求列出 2-3 个候选产品）
/ 🛠 最小验证（每个候选给 1 条最轻的验证动作，如 5 人访谈、落地页）。
只基于材料内的事实，不编造数字。直接输出正文，不要 JSON 包装。`;

const SYSTEM_WEEKLY = `你是「灵感雷达」的数据分析师。基于用户给的 JSON 数据写一份简洁的中文数据周报（300 字内）。
用 markdown 小标题组织：📊 核心指标 / 🔥 热点观察 / 📈 趋势解读 / ✅ 下周建议。
只使用数据里的事实，不编造数字；语言干练，给出 1-2 条有洞察的解读。
直接输出周报正文，不要 JSON 包装。`;

const SYSTEM_ANOMALY_SUMMARY = `基于给定的系统异常预警 JSON（level: alert/warn/info），用 80 字内中文写一段体检总结：
整体是否健康、最需要关注哪一项。直接输出总结文字，不要 JSON 包装。`;

const SYSTEM_PLAN = `你是「灵感雷达」的资深产品经理。基于用户提供的真实社区帖子线索（中文标题/原文摘要/品类/热度/评论数/来源），
输出一份《完整产品方案》，必须包含以下六节，用 markdown 二级小标题组织（## 一、产品定位 等）：
1. 产品定位：产品名称建议 + 一句话定位；
2. 用户画像：目标用户是谁、典型场景、现有替代方案的缺陷；
3. 核心功能：3-5 个功能点，标注 P0/P1 优先级；
4. MVP 开发计划：2-4 周的最小版本范围与里程碑；
5. 商业模式：可能的收费方式与定价假设（标注为待验证假设）；
6. 验证方案：落地页/访谈/预售等最小验证动作与通过标准。
若请求里带有「方向建议」（用户从产品构想中挑选的具体方向），产品定位与核心功能应优先围绕该方向展开，并可在用户画像中补充该方向的典型用户。
要求：只基于所给材料推导，数字与市场规模不做虚构，无数据支撑处明确标注「待验证」。
总字数 500 字内，直接输出正文，不要 JSON 包装。`;

/** 生成周报：LLM 撰写（有 Key），规则模板兜底 */
async function weeklyReport(): Promise<Response> {
  const d = await getDashboardData();
  if (hasLLM()) {
    try {
      const payload = {
        stats: d.stats,
        categories: d.categories.slice(0, 5),
        subreddits: d.subreddits.slice(0, 5),
        trend: d.trend.slice(-7),
        topComplaints: d.topComplaints
          .slice(0, 3)
          .map((c) => ({ title: c.titleZh || c.title, heat: c.heat, sub: c.subreddit })),
        runtime: d.runtime,
      };
      const text = await chatCompletion(
        [
          { role: "system", content: SYSTEM_WEEKLY },
          { role: "user", content: JSON.stringify(payload) },
        ],
        { maxTokens: 900, temperature: 0.5, timeoutMs: 30000 }
      );
      if (text.trim()) {
        const reply: AssistantReply = {
          action: "weekly-report",
          answer: text.trim(),
          engine: "llm",
        };
        return Response.json(reply);
      }
    } catch (e) {
      console.warn("[api/assistant] weekly LLM failed, fallback:", (e as Error).message);
    }
  }
  const reply: AssistantReply = {
    action: "weekly-report",
    answer: weeklyReportFallback(d),
    engine: "rule-engine",
  };
  return Response.json(reply);
}

/** 异常预警：规则检测为主，LLM 补一段体检总结 */
async function anomalyCheck(): Promise<Response> {
  const d = await getDashboardData();
  const alerts = checkAnomalies(d);
  let engine: AssistantReply["engine"] = "rule-engine";
  let answer = "";
  if (hasLLM()) {
    try {
      const text = await chatCompletion(
        [
          { role: "system", content: SYSTEM_ANOMALY_SUMMARY },
          { role: "user", content: JSON.stringify(alerts) },
        ],
        { maxTokens: 200, temperature: 0.4, timeoutMs: 20000 }
      );
      if (text.trim()) {
        answer = text.trim();
        engine = "llm";
      }
    } catch (e) {
      console.warn("[api/assistant] anomaly summary LLM failed:", (e as Error).message);
    }
  }
  if (!answer) {
    const bad = alerts.filter((a) => a.level !== "info").length;
    answer =
      bad === 0
        ? "体检完成：未发现异常，各项指标正常。"
        : `体检完成：发现 ${bad} 项需要关注的问题，详情见下方列表。`;
  }
  const reply: AssistantReply = { action: "anomaly", answer, alerts, engine };
  return Response.json(reply);
}

/** 一键产品方向初稿：基于收藏机会帖生成（LLM 撰写，规则兜底） */
async function draftFromFavorites(ids: string[]): Promise<Response> {
  const d = await getDashboardData();
  const idSet = new Set(ids);
  const { fetchComplaints } = await import("@/lib/reddit");
  const { translateComplaints } = await import("@/lib/translate");
  const raw = await fetchComplaints(false);
  let pool = raw.complaints;
  if (raw.mode === "rss") {
    const tr = await translateComplaints(pool, { refresh: false });
    pool = tr.complaints;
  }
  const byId = new Map(pool.map((c) => [c.id, c]));
  const materials = ids
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .slice(0, 8);
  const fallback = materials.length > 0 ? materials : d.topComplaints.slice(0, 3);

  if (hasLLM()) {
    try {
      const payload = fallback.map((c) => ({
        titleZh: c.titleZh || c.title,
        category: c.category,
        heat: c.heat,
        opportunity: c.opportunity,
        subreddit: c.subreddit,
      }));
      const text = await chatCompletion(
        [
          { role: "system", content: SYSTEM_DRAFT },
          { role: "user", content: JSON.stringify(payload) },
        ],
        { maxTokens: 700, temperature: 0.6, timeoutMs: 30000 }
      );
      if (text.trim()) {
        return Response.json({ action: "draft", answer: text.trim(), engine: "llm" });
      }
    } catch (e) {
      console.warn("[api/assistant] draft LLM failed:", (e as Error).message);
    }
  }
  // 规则引擎兜底：结构化输出候选
  const lines: string[] = ["🎯 机会聚焦", ""];
  const cats = new Map<string, number>();
  for (const c of fallback) cats.set(c.category, (cats.get(c.category) ?? 0) + 1);
  const topCat = [...cats.entries()].sort((a, b) => b[1] - a[1])[0];
  lines.push(topCat
    ? `收藏帖集中在「${topCat[0]}」（${topCat[1]} 条），是当前最值得深挖的方向。`
    : "暂无收藏，先去机会流收藏几条再生成初稿。");
  lines.push("", "📋 候选拆分", "");
  fallback.slice(0, 3).forEach((c, i) => {
    lines.push(`${i + 1}. 「${c.titleZh || c.title}」→ 围绕“${c.category}”做一款轻量工具。`);
  });
  lines.push("", "🛠 最小验证", "");
  lines.push("- 找 5 位目标用户做 10 分钟访谈，验证痛点频率。");
  lines.push("- 用一页落地页描述价值，看点击率是否 >3%。");
  const reply: AssistantReply = { action: "draft", answer: lines.join("\n"), engine: "rule-engine" };
  return Response.json(reply);
}

/** 单条机会的完整产品方案：LLM 撰写，规则模板兜底。direction 为用户选定的产品构想方向 */
async function planForComplaint(id: string, direction?: string): Promise<Response> {
  const { fetchComplaints } = await import("@/lib/reddit");
  const { translateComplaints } = await import("@/lib/translate");
  const raw = await fetchComplaints(false);
  let pool = raw.complaints;
  if (raw.mode === "rss") {
    const tr = await translateComplaints(pool, { refresh: false });
    pool = tr.complaints;
  }
  const target = pool.find((c) => c.id === id) ?? null;

  if (target && hasLLM()) {
    try {
      const payload = {
        titleZh: target.titleZh || target.title,
        title: target.title,
        excerpt: (target.excerpt || "").slice(0, 300),
        category: target.category,
        heat: target.heat,
        comments: target.comments,
        subreddit: target.subreddit,
        opportunity: target.opportunity,
        // 用户从「产品构想」选定的方向建议
        direction: direction ?? null,
        // 同品类线索供参考，避免方案脱离真实语境
        sameCategory: pool
          .filter((c) => c.category === target.category && c.id !== target.id)
          .slice(0, 5)
          .map((c) => c.titleZh || c.title),
      };
      const text = await chatCompletion(
        [
          { role: "system", content: SYSTEM_PLAN },
          { role: "user", content: JSON.stringify(payload) },
        ],
        { maxTokens: 1200, temperature: 0.6, timeoutMs: 40000 }
      );
      if (text.trim()) {
        const reply: AssistantReply = { action: "plan", answer: text.trim(), engine: "llm" };
        return Response.json(reply);
      }
    } catch (e) {
      console.warn("[api/assistant] plan LLM failed, fallback rule:", (e as Error).message);
    }
  }

  // 规则引擎兜底：基于真实字段生成结构化方案骨架
  const t = target;
  const title = t ? t.titleZh || t.title : "（未找到该机会，可能缓存已刷新）";
  const cat = t?.category ?? "—";
  const directionLine = direction ? `，优先围绕构想方向「${direction.slice(0, 24)}」` : "";
  const lines: string[] = [
    "## 一、产品定位",
    `围绕「${title.slice(0, 30)}」的痛点，做一款面向${cat}场景的轻量工具${directionLine}。`,
    "",
    "## 二、用户画像",
    `在 r/${t?.subreddit ?? "—"} 表达该诉求的社区用户；具体画像待用户访谈验证。`,
    "",
    "## 三、核心功能",
    "- [P0] 解决帖子描述的核心痛点（待拆解）",
    "- [P0] 最小可用的主流程闭环",
    "- [P1] 历史记录与回顾",
    "",
    "## 四、MVP 开发计划",
    "- 第 1 周：核心流程原型",
    "- 第 2 周：5 位目标用户可用性测试",
    "- 第 3-4 周：迭代并发布落地页",
    "",
    "## 五、商业模式",
    "待验证假设：订阅制或一次性买断；先验证付费意愿再定定价。",
    "",
    "## 六、验证方案",
    `- 在原帖社区（r/${t?.subreddit ?? "—"}）回访 5 位评论用户`,
    "- 落地页 + 预约名单，转化率 >3% 视为有效信号",
  ];
  const reply: AssistantReply = { action: "plan", answer: lines.join("\n"), engine: "rule-engine" };
  return Response.json(reply);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body?.action ?? "chat");

    if (action === "weekly-report") return await weeklyReport();
    if (action === "anomaly") return await anomalyCheck();
    if (action === "draft") return await draftFromFavorites(Array.isArray(body?.ids) ? body.ids : []);
    if (action === "plan") {
      return await planForComplaint(
        String(body?.id ?? ""),
        body?.direction ? String(body.direction).slice(0, 60) : undefined
      );
    }

    const q = String(body?.q ?? "").trim().slice(0, 200);
    if (!q) {
      return Response.json({ answer: "请描述你的问题，比如「怎么收藏？」", engine: "rule-engine" });
    }

    // 通道一：真实 LLM（配 Key 时）
    if (hasLLM()) {
      try {
        const content = await chatCompletion(
          [
            { role: "system", content: SYSTEM_ASSISTANT },
            { role: "user", content: q },
          ],
          { maxTokens: 256, temperature: 0.4, timeoutMs: 20000 }
        );
        const json = content.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(json) as { answer?: string };
        if (parsed.answer) {
          const reply: AssistantReply = { answer: parsed.answer, engine: "llm" };
          return Response.json(reply);
        }
      } catch (e) {
        console.warn("[api/assistant] LLM failed, fallback rule:", (e as Error).message);
      }
    }

    // 通道二：规则引擎降级
    return Response.json(answerBasic(q));
  } catch (e) {
    return Response.json(
      { answer: "助手暂时开小差，请稍后再试。", engine: "rule-engine" },
      { status: 500 }
    );
  }
}
