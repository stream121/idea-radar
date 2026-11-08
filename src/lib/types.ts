export type CategoryId =
  | "数码科技"
  | "食品饮料"
  | "效率工具"
  | "出行交通"
  | "家居生活"
  | "健康身心"
  | "购物服务"
  | "其他灵感";

export type FetchMode = "rss" | "seed";

export interface Complaint {
  id: string;
  titleZh: string;
  title: string;
  excerpt: string;
  url: string;
  subreddit: string;
  category: CategoryId;
  heat: number; // 0-100
  comments: number;
  score: number;
  createdAt: number; // unix seconds
  opportunity: boolean;
  source: "reddit" | "seed";
  /** 今日榜单排名（1-70），未上榜为 undefined */
  rank?: number;
  /** 是否入选今日榜单 */
  ranked?: boolean;
}

export type TranslateEngine = "llm" | "free" | "none";

/** 今日榜单元信息 */
export interface RankMeta {
  date: string; // YYYY-MM-DD
  size: number; // 榜单条数（目标 70）
  from: number; // 当日筛选池总量（目标 ~200）
}

export interface ComplaintsResponse {
  complaints: Complaint[];
  live: boolean;
  mode: FetchMode;
  fetchedAt: number;
  subreddits: string[];
  translateEngine: TranslateEngine;
  llmAvailable: boolean;
  rankMeta: RankMeta | null;
}

export interface AiDirection {
  title: string;
  desc: string;
  /** 可 AI 化的具体场景 */
  scenarios?: string[];
  /** 建议落地为哪些产品功能点 */
  features?: string[];
  source: "rule-engine" | "llm";
}

export interface InsightResult {
  totalComplaints: number;
  opportunityCount: number;
  topCategories: { name: string; count: number }[];
  leadComplaint: Complaint | null;
  aiDirections: AiDirection[];
  engine: "rule-engine" | "llm";
}

export type ViewKey = "opp" | "all" | "fav" | "bench" | "rank" | "clusters" | "brief";
export type SortKey = "heat" | "new" | "comments" | "score";
/** 机会流工具栏筛选：全部 / 高潜力（机会帖）/ 高热度（heat>=70） */
export type StreamFilter = "all" | "opp" | "hot";

/** 抓取快照（每次抓取成功后记录一条，用于趋势图） */
export interface SnapshotPoint {
  ts: number;
  total: number;
  opp: number;
  live: boolean;
  mode: FetchMode;
  translateEngine: TranslateEngine;
}

/** 趋势图数据点（按次 / 按天聚合） */
export interface TrendPoint {
  label: string;
  ts: number;
  total: number;
  opp: number;
  live: boolean;
}

/** 看板：内容统计 + 运行状态 + 趋势 */
export interface DashboardData {
  stats: {
    total: number;
    opp: number;
    favCount: number;
    noteCount: number;
    subredditCount: number;
    avgHeat: number;
  };
  categories: { name: string; count: number }[];
  subreddits: { name: string; count: number }[];
  topComplaints: Complaint[];
  runtime: {
    mode: FetchMode;
    live: boolean;
    translateEngine: TranslateEngine;
    llmAvailable: boolean;
    lastFetchedAt: number;
    proxy: string;
  };
  trend: TrendPoint[];
}

/** 收藏 / 速记服务端持久化（调研台数据走 API） */
export interface NotesData {
  favorites: string[];
  notes: Record<string, string>;
  /** 调研状态：想做的 / 在调研 / 已放弃 */
  statuses: Record<string, WorkStatus>;
}

/** 工作台调研状态 */
export type WorkStatus = "todo" | "researching" | "abandoned";

export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  todo: "想做的",
  researching: "在调研",
  abandoned: "已放弃",
};

/** 异常预警项 */
export interface AnomalyAlert {
  level: "alert" | "warn" | "info";
  title: string;
  detail: string;
}

export type AssistantAction = "chat" | "weekly-report" | "anomaly" | "draft" | "plan";

/** AI 助手回复 */
export interface AssistantReply {
  answer: string;
  engine: "llm" | "rule-engine";
  suggestions?: string[];
  action?: AssistantAction;
  alerts?: AnomalyAlert[];
}
