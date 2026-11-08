import type { CategoryId } from "@/lib/types";

export const CATEGORY_RULES: { id: CategoryId; label: string; kws: string[] }[] = [
  {
    id: "数码科技",
    label: "数码科技",
    kws: [
      "phone", "laptop", "tech", "software", "ai", "computer", "smart",
      "headphone", "earbud", "app", "os", "linux", "windows", "mac",
      "iphone", "android", "充电", "笔记本", "手机", "电脑", "耳机", "屏幕",
    ],
  },
  {
    id: "食品饮料",
    label: "食品饮料",
    kws: [
      "food", "coffee", "tea", "drink", "beer", "pizza", "meal", "recipe",
      "can", "soup", "chili", "snack", "吃", "咖啡", "外卖", "汤", "菜",
    ],
  },
  {
    id: "效率工具",
    label: "效率工具",
    kws: [
      "tool", "workflow", "productivity", "calendar", "todo", "note", "tracker",
      "habit", "automation", "日程", "效率", "笔记", "工具",
    ],
  },
  {
    id: "出行交通",
    label: "出行交通",
    kws: [
      "car", "bike", "train", "transit", "commute", "airplane", "taxi",
      "gas", "highway", "traffic", "停车", "高速", "通勤", "车",
    ],
  },
  {
    id: "家居生活",
    label: "家居生活",
    kws: [
      "home", "kitchen", "bedroom", "clean", "laundry", "bath", "floor",
      "shower", "家具", "家居", "厨房",
    ],
  },
  {
    id: "健康身心",
    label: "健康身心",
    kws: [
      "health", "sleep", "workout", "mental", "breath", "stress",
      "meditation", "健身", "睡眠", "健康",
    ],
  },
  {
    id: "购物服务",
    label: "购物服务",
    kws: [
      "service", "delivery", "shopping", "online", "store", "warranty",
      "退款", "保修", "购物", "服务",
    ],
  },
];

/** 机会帖关键词（许愿句式）：非许愿版块里，必须像「请求」才判定 */
export const OPPORTUNITY_KW = [
  "wish", "make this", "invent", "exist", "somebody make", "someone make",
  "build me", "build this", "need a", "needs a", "would someone",
  "can someone", "why is", "why does", "why isn", "why can", "why has no",
  "why does no", "should exist",
  "希望有", "能不能有人", "为什么没有", "要是有人",
];

export function guessCategory(title: string, excerpt: string): CategoryId {
  const text = `${title} ${excerpt}`.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.kws.some((kw) => text.includes(kw))) return rule.id;
  }
  return "其他灵感";
}

export function isOpportunity(title: string, subreddit: string): boolean {
  if (subreddit === "SomebodyMakeThis") return true;
  const text = title.toLowerCase();
  return OPPORTUNITY_KW.some((kw) => text.includes(kw));
}

/** RSS 不给热度，用启发式估算 1-100 */
export function estimateHeat(
  title: string,
  excerpt: string,
  subreddit: string
): number {
  const text = `${title} ${excerpt}`.toLowerCase();
  let score = 32;
  if (subreddit === "SomebodyMakeThis") score += 12;
  if (isOpportunity(title, subreddit)) score += 8;
  score += Math.min(Math.floor(title.length / 3), 14);
  const mood = [
    "frustrat", "annoy", "infuri", "wish", "why", "impossible",
    "terrible", "awful", "never", "worst",
  ];
  for (const kw of mood) if (text.includes(kw)) score += 4;
  return Math.max(12, Math.min(99, score));
}

export const CATEGORY_COLORS: Record<CategoryId, string> = {
  数码科技: "#5C7A9B",
  食品饮料: "#D98A6B",
  效率工具: "#8FAE5F",
  出行交通: "#9B7AB8",
  家居生活: "#B89B6B",
  健康身心: "#6BB89B",
  购物服务: "#C98A6B",
  其他灵感: "#C9A23C",
};
