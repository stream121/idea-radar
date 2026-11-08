import { CATEGORY_COLORS } from "@/lib/rules/classify";

/**
 * 抽象图形插画：细线稿手绘描边风（零依赖 SVG）。
 * 品类主题色 + 按 seed 确定性生成徒手构图（圆 / 三角 / 方 / 拱门 + 排线、星光、箭头、螺旋），
 * 同一帖子刷新后构图稳定，不闪烁。
 */
interface Props {
  category: string;
  /** seed：一般为帖子 id，保证同一帖子的插画稳定 */
  seed?: string;
  className?: string;
}

const INK = "#292820";
const ACCENT = "#D95B36";

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 确定性伪随机（mulberry32）：同一 seed 生成同一序列 */
function rngFrom(seedNum: number): () => number {
  let a = seedNum >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];
const f = (n: number) => Math.round(n * 10) / 10;

/** 过点平滑闭合路径（中点二次贝塞尔）：徒手线条感的关键 */
function smoothClosed(pts: Pt[]): string {
  if (!pts.length) return "";
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i <= pts.length; i++) {
    const prev = pts[i - 1];
    const p = pts[i % pts.length];
    d += ` Q${f(prev[0])} ${f(prev[1])} ${f((prev[0] + p[0]) / 2)} ${f((prev[1] + p[1]) / 2)}`;
  }
  return `${d} Z`;
}

/** 徒手圆：半径带抖动 */
function wobbleCircle(cx: number, cy: number, r: number, rng: () => number, jitter = 2.4): string {
  const n = 9;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const rr = r + (rng() - 0.5) * jitter * 2;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return smoothClosed(pts);
}

/** 徒手矩形：每边 3 段抖动 */
function wobbleRect(x: number, y: number, w: number, h: number, rng: () => number, jitter = 2): string {
  const corners: Pt[] = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  const pts: Pt[] = [];
  for (let c = 0; c < 4; c++) {
    const [ax, ay] = corners[c];
    const [bx, by] = corners[(c + 1) % 4];
    for (let s = 0; s < 3; s++) {
      const t = s / 3;
      pts.push([
        ax + (bx - ax) * t + (rng() - 0.5) * jitter * 2,
        ay + (by - ay) * t + (rng() - 0.5) * jitter * 2,
      ]);
    }
  }
  return smoothClosed(pts);
}

/** 四角星光：手绘小星星 */
function sparkle(x: number, y: number, s: number): string {
  const q = s * 0.32;
  return `M${f(x)} ${f(y - s)} Q${f(x + q)} ${f(y - q)} ${f(x + s)} ${f(y)} Q${f(x + q)} ${f(y + q)} ${f(x)} ${f(y + s)} Q${f(x - q)} ${f(y + q)} ${f(x - s)} ${f(y)} Q${f(x - q)} ${f(y - q)} ${f(x)} ${f(y - s)} Z`;
}

/** 渐开螺旋 */
function spiral(cx: number, cy: number, r: number): string {
  let d = `M${f(cx)} ${f(cy)}`;
  const steps = 16;
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2 * 2.2 - Math.PI / 2;
    const rr = (r * i) / steps;
    d += ` L${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`;
  }
  return d;
}

/** 弯曲箭头杆（手绘笔触） */
function curvedArrow(x1: number, y1: number, x2: number, y2: number, bend: number): string {
  const mx = (x1 + x2) / 2 + bend;
  const my = (y1 + y2) / 2 - bend;
  return `M${f(x1)} ${f(y1)} Q${f(mx)} ${f(my)} ${f(x2)} ${f(y2)}`;
}

export default function AbstractArt({ category, seed = "", className }: Props) {
  const color = (CATEGORY_COLORS as Record<string, string>)[category] ?? "#647E48";
  const rng = rngFrom(hash(seed || category));

  // 底：大块徒手色斑（品类色，低透明）
  const wash = wobbleCircle(72 + (rng() - 0.5) * 12, 50 + (rng() - 0.5) * 8, 33 + rng() * 6, rng, 4);
  const variant = Math.floor(rng() * 4);
  const tilt = Math.round((rng() - 0.5) * 10);
  const hatchX = 46 + Math.round(rng() * 10);
  const sp1 = { x: 26 + rng() * 12, y: 22 + rng() * 8, s: 4 + rng() * 2 };
  const sp2 = { x: 112 + rng() * 10, y: 70 + rng() * 10, s: 3 + rng() * 2 };
  const useArrow = rng() > 0.5;

  return (
    <svg viewBox="0 0 140 100" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      {/* 底色斑 */}
      <path d={wash} fill={color} opacity={0.14} stroke={color} strokeWidth={1.2} />

      {/* 主体：徒手描边形状（细墨线） */}
      <g
        fill="none"
        stroke={INK}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={`rotate(${tilt} 70 50)`}
      >
        {variant === 0 && (
          <>
            <path d={wobbleCircle(70, 46, 21, rng)} />
            <circle cx={70} cy={46} r={7.5} fill={ACCENT} stroke="none" opacity={0.9} />
          </>
        )}
        {variant === 1 && (
          <>
            <path d={`M${f(48)} 68 L${f(70)} 26 L${f(93)} 68 Z`} />
            <path d={wobbleCircle(70, 55, 9, rng, 1.6)} />
            <path d={`M${f(58)} 72 h${f(25)}`} strokeDasharray="2 3" />
          </>
        )}
        {variant === 2 && (
          <>
            <path d={wobbleRect(50, 28, 40, 40, rng)} />
            <path d={`M${f(50)} 48 h40 M70 28 v40`} strokeWidth={1.1} opacity={0.75} />
          </>
        )}
        {variant === 3 && (
          <>
            {/* 拱门 */}
            <path d={`M${f(50)} 68 v-16 a20 20 0 0 1 40 0 v16`} />
            <path d={`M${f(44)} 72 h52`} strokeDasharray="3 3" />
            <path d={spiral(70, 44, 8)} strokeWidth={1.2} />
          </>
        )}
        {/* 排线影调 */}
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1={hatchX + i * 4}
            y1={76 + (i % 2)}
            x2={hatchX + 14 + i * 4}
            y2={86 - (i % 2)}
            strokeWidth={1.05}
            opacity={0.5}
          />
        ))}
      </g>

      {/* 强调色手绘波浪 */}
      <path
        d={`M${f(22)} ${f(90)} Q ${f(34)} ${f(84)} ${f(46)} ${f(90)} T ${f(70)} ${f(90)} T ${f(94)} ${f(90)} T ${f(118)} ${f(90)}`}
        fill="none"
        stroke={ACCENT}
        strokeWidth={1.8}
        strokeLinecap="round"
      />

      {/* 装饰：星光 + 箭头/螺旋 + 点 */}
      <path d={sparkle(sp1.x, sp1.y, sp1.s)} fill={INK} opacity={0.55} />
      <path d={sparkle(sp2.x, sp2.y, sp2.s)} fill="none" stroke={INK} strokeWidth={1.1} opacity={0.6} />
      {useArrow ? (
        <g stroke={INK} strokeWidth={1.2} fill="none" opacity={0.6} strokeLinecap="round">
          <path d={curvedArrow(20, 34, 32, 24, 3)} />
          <path d="M32 24 l-5.5 -0.5 M32 24 l-0.5 5.5" />
        </g>
      ) : (
        <path d={spiral(24, 28, 6)} fill="none" stroke={INK} strokeWidth={1.1} opacity={0.55} />
      )}
      {[100, 108, 116].map((x, i) => (
        <circle key={x} cx={x + (i % 2) * 2} cy={16 + i * 2} r={1.4} fill={INK} opacity={0.4} />
      ))}
    </svg>
  );
}
