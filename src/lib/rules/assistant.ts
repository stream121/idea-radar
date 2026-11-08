// AI 助手 · 规则引擎通道：无 LLM Key 时按关键词回答基础问题。
import type { AssistantReply } from "@/lib/types";

interface Rule {
  keys: string[];
  answer: string;
}

const RULES: Rule[] = [
  {
    keys: ["怎么用", "如何使用", "怎么用", "教程", "操作", "帮助", "guide"],
    answer: "左栏选品类 → 中栏看机会流 → 右栏看详情、AI 方向并记调研速记；点 ❤ 收藏后可在「工作台视图」聚合。",
  },
  {
    keys: ["收藏", "收藏夹", "fav"],
    answer: "在帖子卡片点 ❤ 即可收藏，收藏内容汇总在工作台视图里；收藏数据通过 API 保存在本地。",
  },
  {
    keys: ["速记", "笔记", "调研", "note"],
    answer: "在右侧详情面板的「调研速记」里记想法，会自动保存（服务端持久化），工作台视图可回看。",
  },
  {
    keys: ["数据来源", "数据哪里", "哪里来的", "reddit", "reddit", "来源", "抓取", "source"],
    answer: "数据来自 Reddit 公开源（r/SomebodyMakeThis、mildlyinfuriating、CrappyDesign），本机经代理抓取；抓取失败自动降级为内置种子数据。",
  },
  {
    keys: ["翻译", "标题", "中文", "translate", "翻译引擎"],
    answer: "标题翻译走双通道：配置 DeepSeek Key 时用大模型翻译，无 Key 自动用免费机译，译文按帖子持久化缓存。",
  },
  {
    keys: ["ai方向", "ai 方向", "建议", "方向", "insight", "灵感", "洞察"],
    answer: "AI 方向基于选中品类的抱怨聚类，给 3 个可落地的产品方向（含可 AI 化场景与功能点）；配 Key 时由 DeepSeek 实时生成，否则用规则引擎。",
  },
  {
    keys: ["机会", "opportunity", "产品灵感", "灵感"],
    answer: "「产品灵感」= 带机会标记的帖子：r/SomebodyMakeThis 全部 + 其他版块的许愿句式，识别逻辑见分类规则。",
  },
  {
    keys: ["刷新", "更新", "新数据", "refresh"],
    answer: "点顶栏「↻ 刷新」会重新抓取 Reddit；每次抓取成功会记录一条快照，在数据看板里可看趋势。",
  },
  {
    keys: ["数据看板", "看板", "后台", "dashboard", "统计", "趋势"],
    answer: "「数据看板」页展示统计（总量/机会/收藏/速记）、品类与版块分布、运行状态与抓取趋势折线图。",
  },
  {
    keys: ["deepseek", "key", "大模型", "llm", "api key"],
    answer: "在项目 .env 里填 DEEPSEEK_API_KEY 即启用大模型翻译与 AI 方向；没填自动降级规则引擎，演示始终可用。",
  },
  {
    keys: ["品类", "分类", "category", "左栏"],
    answer: "左栏按 8 个品类（数码科技/食品饮料/效率工具等）索引，来自标题与摘要的关键词分类规则。",
  },
];

const FALLBACK =
  "我还不太确定这个问题的答案。可以试试问：怎么收藏？数据来源？AI 方向怎么生成？刷新有什么用？";

export function answerBasic(q: string): AssistantReply {
  const lower = q.toLowerCase();
  const hit = RULES.find((r) => r.keys.some((k) => lower.includes(k)));
  const suggestions = hit
    ? RULES.slice(0, 4).map((r) => r.keys[0])
    : RULES.map((r) => r.keys[0]).slice(0, 5);
  return {
    answer: hit?.answer ?? FALLBACK,
    engine: "rule-engine",
    suggestions: suggestions.slice(0, 4),
  };
}
