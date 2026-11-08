"use client";

import { useEffect, useRef } from "react";

// 涂鸦线描风趴姿小猫（参考「猫代班」插画）：细黑线描、慵懒趴平、前爪前伸、
// 半阖眼、一只耳朵深色斑块；主色为暖琥珀黄（非亮黄）。
// 巡逻用 rAF 时间轴驱动：起步/到站加减速、两端停稳后原地转身、
// 只有行走阶段才有身体起伏。

const INK = "#2A2620"; // 线描墨色
const FUR = "#F2B84B"; // 暖琥珀黄主色
const FUR_LIGHT = "#F9D99E"; // 肚皮浅色
const PATCH = "#B98A55"; // 耳朵深色斑块
const BLOB = "#F3E6C2"; // 背景色块

const DIST = 215; // 单程巡逻距离（px）
const WALK = 4.6; // 行走一段的时长（秒）
const PAUSE = 1.1; // 两端停顿（转身发生在停顿中段）
const CYCLE = 2 * (WALK + PAUSE);

function easeInOutSine(p: number) {
  return -(Math.cos(Math.PI * p) - 1) / 2;
}

export default function CartoonBuddy({
  className = "",
  size = 130,
}: {
  className?: string;
  size?: number;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pupilRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const mouse = { x: 0, y: 0 };
    const onMove = (e: MouseEvent) => {
      const el = outerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // 鼠标相对元素中心，归一化到 [-1, 1]
      mouse.x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
      mouse.y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
    };
    window.addEventListener("mousemove", onMove);

    let raf = 0;
    let tilt = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = ((now - start) / 1000) % CYCLE;
      let x = 0;
      let facing = 1; // 1=朝左（原始朝向），-1=朝右
      let bob = 0;
      if (t < PAUSE) {
        // 右端停稳，准备向左出发
        x = 0;
        facing = 1;
      } else if (t < PAUSE + WALK) {
        // 向左走
        const s = t - PAUSE;
        x = -DIST * easeInOutSine(s / WALK);
        facing = 1;
        bob = Math.abs(Math.sin(s * 7)) * 2.4 * Math.sin((Math.PI * s) / WALK);
      } else if (t < 2 * PAUSE + WALK) {
        // 左端停稳，停顿中段原地转身
        const s = t - PAUSE - WALK;
        x = -DIST;
        facing = s > PAUSE * 0.45 ? -1 : 1;
      } else {
        // 向右走
        const s = t - 2 * PAUSE - WALK;
        x = -DIST + DIST * easeInOutSine(s / WALK);
        facing = -1;
        bob = Math.abs(Math.sin(s * 7)) * 2.4 * Math.sin((Math.PI * s) / WALK);
      }

      const outer = outerRef.current;
      const inner = innerRef.current;
      const svg = svgRef.current;
      const pupils = pupilRef.current;
      if (outer) outer.style.transform = `translateX(${x.toFixed(2)}px) scaleX(${facing})`;
      // 身体朝向翻转时，倾斜与瞳孔方向同步补偿，保证始终"看向"鼠标
      tilt += (mouse.x * 3 * facing - tilt) * 0.06;
      if (inner) inner.style.transform = `rotate(${tilt.toFixed(2)}deg)`;
      if (svg) svg.style.transform = `translateY(${(-bob).toFixed(2)}px)`;
      if (pupils)
        pupils.style.transform = `translate(${(mouse.x * 3 * facing).toFixed(2)}px, ${(mouse.y * 2.5).toFixed(2)}px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={outerRef} className={className} style={{ willChange: "transform" }}>
      <div ref={innerRef} style={{ width: size, height: size }}>
        <svg ref={svgRef} viewBox="0 0 140 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          {/* 背景柔和色块 */}
          <path
            d="M14 62 q-10 -26 20 -34 q32 -9 58 4 q24 12 18 34 q-8 22 -44 24 q-44 3 -52 -28 z"
            fill={BLOB}
            opacity=".65"
          />

          {/* 地面阴影 */}
          <ellipse cx="66" cy="88" rx="52" ry="5" fill={INK} opacity=".12" />

          {/* 尾巴：从右侧卷起，尾尖深色 */}
          <path
            d="M112 66 q18 2 14 -12 q-2 -8 -10 -6"
            fill="none"
            stroke={INK}
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M112 66 q18 2 14 -12 q-2 -8 -10 -6"
            fill="none"
            stroke={FUR}
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          <circle cx="116" cy="48" r="3.2" fill={PATCH} />

          {/* 身体：趴平的长条 */}
          <path
            d="M46 78 C 44 62, 54 50, 72 48 C 92 46, 114 52, 118 64 C 121 74, 114 82, 100 83 L 60 83 C 50 83, 47 82, 46 78 Z"
            fill={FUR}
            stroke={INK}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {/* 肚皮 */}
          <path
            d="M58 78 C 58 64, 68 56, 82 55 C 96 54, 108 59, 110 67 C 111 73, 104 78, 94 78 Z"
            fill={FUR_LIGHT}
            opacity=".8"
          />
          {/* 后腿轮廓线 */}
          <path d="M104 74 q7 1 9 7" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />

          {/* 前爪：向前伸直的两条 */}
          <ellipse cx="20" cy="78" rx="13" ry="5.5" fill={FUR} stroke={INK} strokeWidth="2.2" />
          <ellipse cx="26" cy="85" rx="13" ry="5" fill={FUR} stroke={INK} strokeWidth="2.2" />
          {/* 爪子分趾线 */}
          <g stroke={INK} strokeWidth="1.4" strokeLinecap="round">
            <path d="M14 76 v4 M20 75.5 v4.5" />
            <path d="M20 83.5 v4 M26 83 v4.5" />
          </g>

          {/* 耳朵：左黄右深色斑块 */}
          <path d="M26 40 L22 24 L36 33 Z" fill={FUR} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M54 40 L58 24 L44 33 Z" fill={PATCH} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />

          {/* 头：低低地趴着 */}
          <circle cx="40" cy="54" r="20" fill={FUR} stroke={INK} strokeWidth="2.5" />
          {/* 额头斑块 */}
          <path d="M38 35 q7 -2 10 3 q-7 2 -10 -3 z" fill={PATCH} opacity=".9" />

          {/* 脸颊蓬松毛刺 */}
          <g stroke={INK} strokeWidth="1.4" strokeLinecap="round">
            <path d="M21 48 l-5 -2 M20 58 l-5 2" />
            <path d="M59 48 l5 -2 M60 58 l5 2" />
          </g>

          {/* 半阖眼：上眼睑线 + 小瞳孔（瞳孔组由 rAF 平移跟随鼠标） */}
          <g>
            <path d="M27 51 q4.5 -2.5 9 0" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
            <path d="M44 51 q4.5 -2.5 9 0" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
            <g ref={pupilRef}>
              <circle cx="31.5" cy="54.5" r="2.6" fill={INK} />
              <circle cx="32.4" cy="53.6" r="0.9" fill="#FFFCF3" />
              <circle cx="48.5" cy="54.5" r="2.6" fill={INK} />
              <circle cx="49.4" cy="53.6" r="0.9" fill="#FFFCF3" />
            </g>
          </g>

          {/* 腮红 */}
          <ellipse cx="26" cy="61" rx="3.4" ry="2.2" fill="#F49AA8" opacity=".7" />
          <ellipse cx="54" cy="61" rx="3.4" ry="2.2" fill="#F49AA8" opacity=".7" />

          {/* 小 ω 嘴 */}
          <path
            d="M36 60 q2 2 4 0.5 q2 1.5 4 -0.5"
            fill="none"
            stroke={INK}
            strokeWidth="1.6"
            strokeLinecap="round"
          />

          {/* 胡须（松弛下垂） */}
          <g stroke={INK} strokeWidth="1.3" strokeLinecap="round" opacity=".85">
            <path d="M23 55 L11 54 M22 59 L10 60 M23 63 L12 66" />
            <path d="M57 55 L69 54 M58 59 L70 60 M57 63 L68 66" />
          </g>
        </svg>
      </div>
    </div>
  );
}
