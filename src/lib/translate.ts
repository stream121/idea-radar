// 标题翻译双通道：有 DeepSeek Key 走 LLM 批量翻译，无 Key 走免费机译（经代理），
// 译文按帖子 id 持久化在 .data/translations.json，避免每次请求重复翻译。
import type { Complaint, TranslateEngine } from "@/lib/types";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getViaProxy } from "@/lib/reddit";
import { hasLLM, chatJSON } from "@/lib/llm/client";

const DATA_DIR = path.join(process.cwd(), ".data");
const CACHE_FILE = path.join(DATA_DIR, "translations.json");
const MAX_FREE_PER_RUN = 48; // 免费机译按热度取前 N 条；调大单轮配额，让全量标题尽快收敛为中文
const LLM_BATCH = 10;

interface TransCacheFile {
  engine: TranslateEngine;
  map: Record<string, string>; // id -> 中文标题
}

async function loadCache(): Promise<TransCacheFile> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const data = JSON.parse(raw) as TransCacheFile;
    return { engine: data.engine ?? "none", map: data.map ?? {} };
  } catch {
    return { engine: "none", map: {} };
  }
}

async function saveCache(file: TransCacheFile) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(file));
  } catch (e) {
    console.warn("[translate] cache write failed", (e as Error).message);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractGoogle(data: unknown): string {
  try {
    const rows = (data as any)?.[0] ?? [];
    return rows.map((x: any) => x?.[0] ?? "").join("").trim();
  } catch {
    return "";
  }
}

async function translateFree(title: string): Promise<string> {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=" +
    encodeURIComponent(title);
  const buf = await getViaProxy(url, 10000);
  return extractGoogle(JSON.parse(buf.toString("utf8")));
}

const SYSTEM_LLM_TRANSLATE = `你是专业的英文标题翻译。把用户的 Reddit 英文帖子标题翻译成简洁、口语化的中文标题。
要求：忠实原意，保留语气与信息量，不超过 40 字；不要直译腔，读起来像中文用户自己写的标题。
只输出 JSON，格式：{"<帖子 id>": "<中文标题>"}。`;

/** 给抱怨列表补齐中文标题 titleZh，返回实际使用的翻译引擎 */
export async function translateComplaints(
  complaints: Complaint[],
  _opts: { refresh?: boolean } = {}
): Promise<{ complaints: Complaint[]; engine: TranslateEngine }> {
  const file = await loadCache();
  // 需要翻译的：reddit 来源且无缓存译文
  const need = complaints.filter(
    (c) => c.source === "reddit" && !file.map[c.id] && c.title.trim().length > 0
  );

  if (need.length === 0) {
    // 全部命中缓存：把缓存译文回填到 titleZh
    const filled = complaints.map((c) => ({
      ...c,
      titleZh: c.source === "seed" ? c.titleZh : file.map[c.id] ?? c.title,
    }));
    return {
      complaints: filled,
      engine: file.engine !== "none" ? file.engine : hasLLM() ? "llm" : "none",
    };
  }

  let usedLLM = false;
  let usedFree = false;

  // 通道一：LLM 批量翻译
  if (hasLLM()) {
    for (let i = 0; i < need.length; i += LLM_BATCH) {
      const batch = need.slice(i, i + LLM_BATCH);
      try {
        const map = await chatJSON<Record<string, string>>(
          SYSTEM_LLM_TRANSLATE,
          JSON.stringify(
            batch.map((c) => ({ id: c.id, title: c.title }))
          ),
          { maxTokens: 2048, temperature: 0.3, timeoutMs: 30000 }
        );
        for (const b of batch) {
          const zh = (map[b.id] ?? "").trim();
          if (zh) {
            file.map[b.id] = zh;
            usedLLM = true;
          }
        }
      } catch (e) {
        console.warn("[translate] LLM batch failed, fallback:", (e as Error).message);
        break;
      }
    }
  }

  // 通道二：免费机译兜底（按热度取前 N 条，3 并发）
  const stillNeed = complaints
    .filter((c) => c.source === "reddit" && !file.map[c.id])
    .sort((a, b) => b.heat - a.heat)
    .slice(0, MAX_FREE_PER_RUN);

  if (stillNeed.length > 0) {
    let idx = 0;
    async function worker() {
      while (idx < stillNeed.length) {
        const c = stillNeed[idx++];
        try {
          const zh = await translateFree(c.title);
          if (zh) {
            file.map[c.id] = zh;
            usedFree = true;
          }
        } catch {
          /* 单条失败跳过 */
        }
        await sleep(120);
      }
    }
    await Promise.all([worker(), worker(), worker()]);
  }

  const engine: TranslateEngine = usedLLM ? "llm" : usedFree ? "free" : "none";
  if (engine !== "none") file.engine = engine;
  await saveCache(file);

  const filled = complaints.map((c) => ({
    ...c,
    titleZh: c.source === "seed" ? c.titleZh : file.map[c.id] ?? c.title,
  }));

  return { complaints: filled, engine };
}
