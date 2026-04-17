import React, { useEffect, useRef } from "react";
import { cn } from "./ui/utils";

export interface CanvasBackgroundProps {
  colors?: number[][];
  opacities?: number[];
  dotSize?: number;
  totalSize?: number;
  containerClassName?: string;
  showGradient?: boolean;
}

interface DotState {
  opacity: number;
  targetOpacity: number;
  colorIndex: number;
  timer: number;
  interval: number;
}

export const CanvasBackground: React.FC<CanvasBackgroundProps> = ({
  colors = [[255, 255, 255]],
  opacities = [0.01, 0.01, 0.02, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08],
  dotSize = 1.0,
  totalSize = 18,
  containerClassName,
  showGradient = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const dotsRef = useRef<DotState[][]>([]);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeObserver = new ResizeObserver(() => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      initDots();
    });

    const parent = canvas.parentElement;
    if (parent) {
      resizeObserver.observe(parent);
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }

    function initDots() {
      const cols = Math.ceil(canvas!.width / totalSize) + 1;
      const rows = Math.ceil(canvas!.height / totalSize) + 1;
      const grid: DotState[][] = [];
      for (let r = 0; r < rows; r++) {
        grid[r] = [];
        for (let c = 0; c < cols; c++) {
          const baseOpacity = opacities[Math.floor(Math.random() * opacities.length)];
          grid[r][c] = {
            opacity: 0,
            targetOpacity: baseOpacity,
            colorIndex: Math.floor(Math.random() * colors.length),
            timer: Math.random() * 5000,
            interval: 3000 + Math.random() * 4000,
          };
        }
      }
      dotsRef.current = grid;
    }

    initDots();

    function drawFrame() {
      if (!canvas || !ctx) return;
      const now = Date.now();
      const elapsed = now - startTimeRef.current;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const grid = dotsRef.current;
      if (!grid.length) return;

      const cols = grid[0].length;
      const rows = grid.length;

      const offsetX = Math.floor(((canvas.width % totalSize) - dotSize) / 2);
      const offsetY = Math.floor(((canvas.height % totalSize) - dotSize) / 2);

      const centerCol = canvas.width / 2 / totalSize;
      const centerRow = canvas.height / 2 / totalSize;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const dot = grid[r][c];

          const dc = c - centerCol;
          const dr = r - centerRow;
          const dist = Math.sqrt(dc * dc + dr * dr);
          const introDelay = dist * 60;
          const introProgress = Math.max(0, Math.min(1, (elapsed - introDelay) / 800));

          dot.timer += 16.67;
          if (dot.timer >= dot.interval) {
            dot.timer = 0;
            dot.interval = 3000 + Math.random() * 4000;
            dot.targetOpacity = opacities[Math.floor(Math.random() * opacities.length)];
            dot.colorIndex = Math.floor(Math.random() * colors.length);
          }

          dot.opacity += (dot.targetOpacity - dot.opacity) * 0.05;
          const finalOpacity = dot.opacity * introProgress;
          if (finalOpacity < 0.005) continue;

          const color = colors[dot.colorIndex];
          ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${finalOpacity})`;

          const x = c * totalSize + offsetX;
          const y = r * totalSize + offsetY;
          ctx.beginPath();
          ctx.arc(x + dotSize / 2, y + dotSize / 2, dotSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    }

    rafRef.current = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
    };
  }, [colors, opacities, dotSize, totalSize]);

  return (
    <div className={cn("absolute inset-0 h-full w-full", containerClassName)}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: "block" }}
      />
      {showGradient && (
        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
      )}
    </div>
  );
};