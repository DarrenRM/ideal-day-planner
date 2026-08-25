"use client";

import { useEffect, useRef, type CSSProperties } from "react";

export type LunaAvatarState = "idle" | "listening" | "thinking";

type LunaAvatarProps = {
  label?: string;
  size?: number;
  state?: LunaAvatarState;
};

type NetworkNode = {
  angle: number;
  distance: number;
  phase: number;
  size: number;
};

const PALETTE = ["#a893f3", "#7cc6e4", "#ef7b76", "#efb765", "#b8dc78", "#68dfcf", "#e3fbff", "#b9aaf4"];

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function colorAt(angle: number) {
  const normalized = ((angle / (Math.PI * 2)) % 1 + 1) % 1;
  return PALETTE[Math.floor(normalized * PALETTE.length) % PALETTE.length];
}

export function LunaAvatar({ label = "Luna", size = 240, state = "idle" }: LunaAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const random = seededRandom(21031989);
    const nodes: NetworkNode[] = Array.from({ length: 132 }, () => ({
      angle: random() * Math.PI * 2,
      distance: .36 + random() * .56,
      phase: random() * Math.PI * 2,
      size: .45 + random() * 1.25,
    }));
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motion.matches;
    let frame = 0;
    let startedAt = performance.now();
    const onMotionChange = (event: MediaQueryListEvent) => {
      const wasReduced = reducedMotion;
      reducedMotion = event.matches;
      if (wasReduced && !reducedMotion) frame = window.requestAnimationFrame(draw);
    };
    motion.addEventListener("change", onMotionChange);

    const draw = (now: number) => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const nextWidth = Math.round(width * pixelRatio);
      const nextHeight = Math.round(height * pixelRatio);
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      const elapsed = reducedMotion ? 1.8 : (now - startedAt) / 1000;
      const speed = state === "thinking" ? 1.32 : state === "listening" ? .88 : .56;
      const energy = state === "thinking" ? 1.24 : state === "listening" ? 1.1 : 1;
      const time = elapsed * speed;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 2;
      const breath = Math.sin(time * Math.PI) * .014 + Math.sin(time * Math.PI * .5 + .7) * .006;
      const coreRadius = radius * (.43 + breath);

      const atmosphere = context.createRadialGradient(centerX, centerY, coreRadius * .7, centerX, centerY, radius);
      atmosphere.addColorStop(0, "rgba(3,5,7,0)");
      atmosphere.addColorStop(.46, "rgba(7,11,14,.08)");
      atmosphere.addColorStop(.78, "rgba(13,19,22,.38)");
      atmosphere.addColorStop(1, "rgba(5,7,9,0)");
      context.fillStyle = atmosphere;
      context.fillRect(0, 0, width, height);

      const positions = nodes.map((node, index) => {
        const drift = Math.sin(time * .42 + node.phase) * radius * .012;
        const orbital = node.angle + Math.sin(time * .19 + node.phase) * .025 + time * (index % 2 ? .0018 : -.0014);
        const nodeRadius = radius * node.distance + drift;
        return {
          x: centerX + Math.cos(orbital) * nodeRadius,
          y: centerY + Math.sin(orbital) * nodeRadius,
          angle: orbital,
          size: node.size,
        };
      });

      context.save();
      context.globalCompositeOperation = "lighter";
      for (let first = 0; first < positions.length; first += 1) {
        for (let second = first + 1; second < positions.length; second += 1) {
          const a = positions[first];
          const b = positions[second];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          const threshold = radius * .275;
          if (distance > threshold) continue;
          const opacity = (1 - distance / threshold) * .36 * energy;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.strokeStyle = `${colorAt((a.angle + b.angle) / 2)}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`;
          context.lineWidth = .58;
          context.stroke();
        }
      }
      for (const point of positions) {
        const pulse = .72 + Math.sin(time * 1.7 + point.angle * 3) * .25;
        context.beginPath();
        context.arc(point.x, point.y, point.size * pulse * energy, 0, Math.PI * 2);
        context.fillStyle = `${colorAt(point.angle)}${state === "thinking" ? "dc" : "a4"}`;
        context.fill();
      }

      const facets = 56;
      for (let layer = 0; layer < 5; layer += 1) {
        const inner = coreRadius * (.995 + layer * .065);
        const outer = inner + radius * (.155 - layer * .012);
        const rotation = time * (layer % 2 ? -.018 : .014) + layer * .032;
        for (let index = 0; index < facets; index += 1) {
          const start = rotation + index / facets * Math.PI * 2;
          const end = rotation + (index + 1.55) / facets * Math.PI * 2;
          const wobble = Math.sin(index * 1.71 + time * .6 + layer) * radius * .014;
          const outerWobble = Math.sin(index * 2.13 - time * .34 + layer * 1.7) * radius * .026;
          context.beginPath();
          context.moveTo(centerX + Math.cos(start) * (inner + wobble), centerY + Math.sin(start) * (inner + wobble));
          context.lineTo(centerX + Math.cos(start) * (outer + outerWobble), centerY + Math.sin(start) * (outer + outerWobble));
          context.lineTo(centerX + Math.cos(end) * (outer - outerWobble), centerY + Math.sin(end) * (outer - outerWobble));
          context.lineTo(centerX + Math.cos(end) * (inner - wobble), centerY + Math.sin(end) * (inner - wobble));
          context.closePath();
          const opacity = Math.round((.105 + (4 - layer) * .026) * energy * 255).toString(16).padStart(2, "0");
          context.fillStyle = `${colorAt(start + layer * .16)}${opacity}`;
          context.fill();
        }
      }
      context.restore();

      context.save();
      context.shadowColor = state === "thinking" ? "rgba(181,215,125,.2)" : "rgba(104,213,205,.12)";
      context.shadowBlur = radius * .09;
      context.beginPath();
      const corePoints = 44;
      for (let index = 0; index <= corePoints; index += 1) {
        const angle = index / corePoints * Math.PI * 2;
        const contour = 1 + Math.sin(angle * 5 + time * .38) * .018 + Math.sin(angle * 9 - time * .24) * .01;
        const currentRadius = coreRadius * contour;
        const x = centerX + Math.cos(angle) * currentRadius;
        const y = centerY + Math.sin(angle) * currentRadius;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.closePath();
      context.fillStyle = "#030405";
      context.fill();
      context.restore();

      if (!reducedMotion) frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    const restart = () => { startedAt = performance.now(); if (reducedMotion) draw(startedAt); };
    restart();
    return () => {
      window.cancelAnimationFrame(frame);
      motion.removeEventListener("change", onMotionChange);
    };
  }, [state]);

  return <span className="luna-avatar" data-state={state} role="img" aria-label={`${label} is ${state}`} style={{ "--luna-avatar-size": `${size}px` } as CSSProperties}><canvas ref={canvasRef} /><i aria-hidden="true" /></span>;
}
