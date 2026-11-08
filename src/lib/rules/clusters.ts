import type { Complaint } from "@/lib/types";

/** 需求主题（痛点关联图谱的聚类单元） */
export interface ClusterTopic {
  id: string;
  name: string;
  /** 命中该主题的关键词 */
  keywords: string[];
  /** 聚合到的真实抱怨 */
  complaints: Complaint[];
  /** 来源分布 [subreddit, count] */
  sourceDist: [string, number][];
  /** 潜在产品方向（规则推导） */
  direction: string;
}

/**
 * 痛点关联图谱规则：基于真实字段（标题/原文/译文）的关键词聚类。
 * 同一抱怨可命中多个主题；未命中任何主题的抱怨不展示，避免生造主题。
 */
const CLUSTER_RULES: { id: string; name: string; kws: string[]; direction: string }[] = [
  {
    id: "eink-hardware",
    name: "极客硬件：电子墨水屏设备",
    kws: ["e-ink", "ink display", "墨水屏", "arm", "linux laptop", "低端", "电子墨水", "极客"],
    direction: "面向开发者/极客的低成本 E-ink 终端设备",
  },
  {
    id: "smart-home-care",
    name: "智能家居与安全监护",
    kws: ["smart floor", "smart home", "fall", "摔倒", "老人", "监护", "elderly", "pet", "宠物", "压力"],
    direction: "老人/宠物跌倒检测与居家安全提醒",
  },
  {
    id: "commute-transit",
    name: "通勤与出行优化",
    kws: ["commuter", "traffic", "commute", "highway", "通勤", "堵车", "地铁", "公交", "停车", "transit"],
    direction: "通勤路线/班次规划工具",
  },
  {
    id: "family-memory",
    name: "家庭私密记忆管理",
    kws: ["family", "child", "孩子", "家人", "记忆", "成长记录", "private", "私密", "sharing"],
    direction: "仅家人可见的私密成长记录 App",
  },
  {
    id: "meal-plan",
    name: "智能膳食与食材管理",
    kws: ["food waste", "meal", "recipe", "做饭", "食材", "浪费", "菜单", "膳食", "剩菜", "cook"],
    direction: "食材规划 + 每日膳食推荐",
  },
  {
    id: "passwordless",
    name: "无密码身份验证",
    kws: ["password", "login", "密码", "登录", "验证码", "auth", "2fa", "otp"],
    direction: "无密码 / 生物识别登录替代方案",
  },
  {
    id: "privacy-tools",
    name: "隐私保护工具",
    kws: ["privacy", "data", "track", "隐私", "数据", "泄露", "ad", "广告", "surveillance"],
    direction: "个人数据隐私保护 / 反追踪工具",
  },
  {
    id: "sleep-health",
    name: "睡眠健康管理",
    kws: ["sleep", "insomnia", "入睡", "睡眠", "失眠", "alarm", "闹钟", "nap", "睡觉"],
    direction: "睡眠记录与入睡引导工具",
  },
  {
    id: "focus-task",
    name: "专注与任务管理",
    kws: ["focus", "distract", "todo", "habit", "专注", "分心", "待办", "习惯", "procrast", "拖延"],
    direction: "专注计时 + 待办聚合工具",
  },
  {
    id: "home-storage",
    name: "家居收纳与空间规划",
    kws: ["storage", "clutter", "收纳", "空间", "杂乱", "organize", "整理", "closet"],
    direction: "家居收纳规划与清单工具",
  },
  {
    id: "charging-cables",
    name: "充电与线材管理",
    kws: ["charger", "cable", "充电", "线材", "数据线", "usb", "wireless"],
    direction: "统一充电 / 线材收纳方案",
  },
  {
    id: "noise-sound",
    name: "噪音与声音环境",
    kws: ["noise", "quiet", "噪音", "安静", "声音", "sound", "tinnitus", "耳鸣"],
    direction: "降噪 / 声音环境管理工具",
  },
];

/** 展示层清洗：还原转义实体，去 RSS 模板噪音 */
function cleanText(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/submitted by\s+\/u\/(\S+)/gi, "")
    .replace(/\[link\]\s*\[comments\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 基于真实抱怨构建需求主题（聚类） */
export function buildClusters(complaints: Complaint[]): ClusterTopic[] {
  const topics: ClusterTopic[] = [];
  for (const rule of CLUSTER_RULES) {
    const textOf = (c: Complaint) =>
      `${c.titleZh ?? ""} ${c.title ?? ""} ${c.excerpt ?? ""}`.toLowerCase();
    const hits = complaints.filter((c) => rule.kws.some((kw) => textOf(c).includes(kw.toLowerCase())));
    if (hits.length === 0) continue;
    const dist = new Map<string, number>();
    for (const c of hits) dist.set(c.subreddit, (dist.get(c.subreddit) ?? 0) + 1);
    topics.push({
      id: rule.id,
      name: rule.name,
      keywords: rule.kws,
      complaints: hits.sort((a, b) => b.heat - a.heat),
      sourceDist: [...dist.entries()].sort((a, b) => b[1] - a[1]),
      direction: rule.direction,
    });
  }
  return topics.sort((a, b) => b.complaints.length - a.complaints.length);
}

/** 供 UI 展示的原始反馈（清洗 + 截断） */
export function clusterExcerpt(c: Complaint, max = 70): string {
  const text = cleanText(c.excerpt || c.titleZh || c.title || "");
  return text.length > max ? text.slice(0, max) + "…" : text;
}
