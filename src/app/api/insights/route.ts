import { NextRequest } from "next/server";
import { fetchComplaints } from "@/lib/reddit";
import { directionsFor } from "@/lib/rules/insights";
import { hasLLM, chatJSON } from "@/lib/llm/client";
import type { AiDirection, Complaint } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_INSIGHTS = `你是资深产品经理，擅长从用户抱怨中提炼可落地的产品机会，尤其擅长把痛点转成具体可 AI 化的产品。
基于提供的 Reddit 帖子线索（中文标题 + 原文 + 品类），提炼 3 个产品方向。
每个方向必须给出：
1. title：4-12 个字概括产品形态（如「E-INK 写作本」）；
2. desc：40-70 字中文，说明目标用户、解决什么痛点、为什么有机会；
3. scenarios：2-3 个该产品"可 AI 化"的具体场景（每条 10-20 字，如「语音口述草稿转结构化大纲」「按阅读习惯自动排版」）；
4. features：3-5 个落地产品功能点（每条 6-16 字，如「AI 摘要」「关键词高亮」「历史对比」）。
要求方向具体、有差异化，适合小团队或独立开发者切入。
只输出 JSON：{"directions":[{"title":"...","desc":"...","scenarios":["..."],"features":["..."]}]}`;

export async function POST(req: NextRequest) {
  try {
    let ids: string[] = [];
    try {
      const body = await req.json();
      ids = (body?.ids ?? []) as string[];
    } catch {
      ids = [];
    }

    const data = await fetchComplaints(false);
    let pool = data.complaints;
    if (ids.length > 0) {
      pool = pool.filter((c) => ids.includes(c.id));
    }
    if (pool.length === 0) pool = data.complaints;

    const lead = pool.length > 0 ? pool[0] : null;
    const topCats = new Map<string, number>();
    for (const c of pool) {
      topCats.set(c.category, (topCats.get(c.category) ?? 0) + 1);
    }

    const base = {
      totalComplaints: data.complaints.length,
      opportunityCount: data.complaints.filter((c) => c.opportunity).length,
      topCategories: [...topCats.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      leadComplaint: lead,
    };

    // 通道一：真实 LLM（配 Key 时）
    if (hasLLM() && lead) {
      try {
        const poolForLLM: { id: string; titleZh: string; title: string; category: string; excerpt: string }[] =
          [...pool]
            .sort((a, b) => b.heat - a.heat)
            .slice(0, 25)
            .map((c: Complaint) => ({
              id: c.id,
              titleZh: c.titleZh || c.title,
              title: c.title,
              category: c.category,
              excerpt: (c.excerpt || "").slice(0, 80),
            }));
        const res = await chatJSON<{
          directions: { title: string; desc: string; scenarios?: string[]; features?: string[] }[];
        }>(
          SYSTEM_INSIGHTS,
          JSON.stringify(poolForLLM),
          { maxTokens: 2048, temperature: 0.8, timeoutMs: 40000 }
        );
        const aiDirections: AiDirection[] = (res.directions ?? [])
          .slice(0, 3)
          .map((d) => ({
            title: d.title,
            desc: d.desc,
            scenarios: d.scenarios ?? [],
            features: d.features ?? [],
            source: "llm" as const,
          }));
        if (aiDirections.length > 0) {
          return Response.json({ ...base, aiDirections, engine: "llm" });
        }
      } catch (e) {
        console.warn("[api/insights] LLM failed, fallback rule-engine:", (e as Error).message);
      }
    }

    // 通道二：规则引擎降级
    return Response.json({
      ...base,
      aiDirections: lead ? directionsFor(lead.category) : [],
      engine: "rule-engine" as const,
    });
  } catch (e) {
    return Response.json(
      { error: (e as Error).message, engine: "rule-engine" },
      { status: 500 }
    );
  }
}
