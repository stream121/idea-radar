import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // IDEA RADAR 2.0 色板：温暖复古纸张配色（对齐参考图：暖米纸 + 橄榄绿单强调 + 深棕文字）
        paper: "#F6EDD8", // 背景米白（参考图 #fcf1da）
        surface: "#FAF4E4", // 卡片浅米白（参考图面板「浅半档」暖米）
        ink: "#332C24", // 暖深棕墨（参考图深棕文字 #504030）
        "ink-soft": "#57503F", // 次级文本
        "ink-faint": "#8A7E68", // 辅助灰
        matcha: "#57763F", // 橄榄绿（正常/优质机会，参考图 #507030）
        "matcha-deep": "#435B35", // 深橄榄绿
        "matcha-soft": "#E9EED8", // 橄榄绿浅底
        persimmon: "#D95B36", // 强调橙（热点/高优先级）
        hair: "#D8CEB4", // 分割线
        backdrop: "#E3D5B6",
      },
      fontFamily: {
        serif: ['"Songti SC"', '"STSong"', '"Noto Serif SC"', "serif"],
        sans: ['"PingFang SC"', '"Heiti SC"', '"Hiragino Sans GB"', "sans-serif"],
        mono: ['"SF Mono"', '"Menlo"', '"Courier New"', "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
