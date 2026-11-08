// DeepSeek LLM 客户端（OpenAI 兼容接口）
// 有 DEEPSEEK_API_KEY 时可用；无 Key 时调用方降级到规则引擎 / 免费机译

const BASE_URL = "https://api.deepseek.com";
const MODEL = "deepseek-chat";

export function hasLLM(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}

interface Msg {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOpts {
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  timeoutMs?: number;
}

/** 单次对话补全，返回纯文本 */
export async function chatCompletion(
  messages: Msg[],
  opts: ChatOpts = {}
): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 40000);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 1024,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek empty response");
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}

/** 请求 JSON 输出（DeepSeek 支持 json_object response_format），解析失败抛错由调用方降级 */
export async function chatJSON<T>(
  system: string,
  user: string,
  opts: ChatOpts = {}
): Promise<T> {
  const raw = await chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { ...opts, json: true }
  );
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as T;
}
