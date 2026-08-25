"use client";

import { useEffect, useRef, type CSSProperties } from "react";

export type LunaAvatarState = "idle" | "listening" | "thinking";
export type LunaAvatarLayer = "complete" | "facets" | "network";

type LunaAvatarProps = {
  label?: string;
  layer?: LunaAvatarLayer;
  size?: number;
  state?: LunaAvatarState;
};

type NetworkNode = {
  angle: number;
  distance: number;
  phase: number;
  size: number;
};

type ColorStop = {
  at: number;
  color: [number, number, number];
};

const TAU = Math.PI * 2;
const COLOR_STOPS: ColorStop[] = [
  { at: 0, color: [54, 220, 222] },
  { at: .11, color: [89, 111, 238] },
  { at: .2, color: [183, 103, 235] },
  { at: .265, color: [104, 190, 238] },
  { at: .36, color: [244, 84, 101] },
  { at: .48, color: [250, 177, 48] },
  { at: .58, color: [190, 229, 73] },
  { at: .69, color: [45, 220, 169] },
  { at: .76, color: [73, 235, 222] },
  { at: .86, color: [139, 119, 241] },
  { at: 1, color: [54, 220, 222] },
];

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function colorAt(angle: number, alpha = 1, light = 0) {
  const normalized = ((angle / TAU) % 1 + 1) % 1;
  let left = COLOR_STOPS[0];
  let right = COLOR_STOPS[COLOR_STOPS.length - 1];
  for (let index = 1; index < COLOR_STOPS.length; index += 1) {
    if (normalized <= COLOR_STOPS[index].at) {
      left = COLOR_STOPS[index - 1];
      right = COLOR_STOPS[index];
      break;
    }
  }
  const progress = (normalized - left.at) / Math.max(.0001, right.at - left.at);
  const mixed = left.color.map((channel, index) => channel + (right.color[index] - channel) * progress);
  const lifted = mixed.map((channel) => Math.round(channel + (255 - channel) * light));
  return `rgba(${lifted[0]}, ${lifted[1]}, ${lifted[2]}, ${alpha})`;
}

function networkFade(distance: number) {
  const normalized = Math.max(0, Math.min(1, (1.34 - distance) / .48));
  return Math.pow(normalized, 1.45);
}

export function LunaAvatar({ label = "Luna", layer = "complete", size = 240, state = "idle" }: LunaAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const random = seededRandom(21031989);
    const nodes: NetworkNode[] = Array.from({ length: 336 }, () => ({
      angle: random() * TAU,
      distance: .53 + Math.pow(random(), .72) * .78,
      phase: random() * TAU,
      size: .34 + Math.pow(random(), 2) * 1.65,
    }));
    const networkLinks: Array<[number, number]> = [];
    for (let first = 0; first < nodes.length; first += 1) {
      const a = nodes[first];
      const ax = Math.cos(a.angle) * a.distance;
      const ay = Math.sin(a.angle) * a.distance;
      for (let second = first + 1; second < nodes.length; second += 1) {
        const b = nodes[second];
        const bx = Math.cos(b.angle) * b.distance;
        const by = Math.sin(b.angle) * b.distance;
        if (Math.hypot(ax - bx, ay - by) < .255) networkLinks.push([first, second]);
      }
    }
    const stars: NetworkNode[] = Array.from({ length: 420 }, () => ({
      angle: random() * TAU,
      distance: .66 + random() * .69,
      phase: random() * TAU,
      size: .22 + random() * .66,
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

    const drawNetwork = (centerX: number, centerY: number, radius: number, emptyRadius: number, time: number, energy: number) => {
      const positions = nodes.map((node, index) => {
        const drift = Math.sin(time * .35 + node.phase) * radius * .008;
        const orbital = node.angle + Math.sin(time * .14 + node.phase) * .012 + time * (index % 2 ? .0007 : -.00055);
        const nodeRadius = radius * node.distance + drift;
        return {
          x: centerX + Math.cos(orbital) * nodeRadius,
          y: centerY + Math.sin(orbital) * nodeRadius,
          angle: orbital,
          fade: networkFade(node.distance),
          size: node.size,
        };
      });

      context.save();
      context.beginPath();
      context.rect(0, 0, canvas.clientWidth, canvas.clientHeight);
      context.arc(centerX, centerY, emptyRadius, 0, TAU);
      context.clip("evenodd");
      context.globalCompositeOperation = "lighter";
      for (const [first, second] of networkLinks) {
        const a = positions[first];
        const b = positions[second];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const threshold = radius * .275;
        if (distance > threshold) continue;
        const opacity = (1 - distance / threshold) * .3 * energy * Math.min(a.fade, b.fade);
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.strokeStyle = colorAt((a.angle + b.angle) / 2, opacity);
        context.lineWidth = .48;
        context.stroke();
      }

      for (const star of stars) {
        const distance = radius * (star.distance + Math.sin(time * .24 + star.phase) * .003);
        const fade = networkFade(star.distance);
        const x = centerX + Math.cos(star.angle) * distance;
        const y = centerY + Math.sin(star.angle) * distance;
        const pulse = .7 + Math.sin(time * 1.25 + star.phase) * .22;
        context.beginPath();
        context.arc(x, y, star.size * pulse * energy, 0, TAU);
        context.fillStyle = colorAt(star.angle, .68 * energy * fade, .08);
        context.fill();
      }

      for (const point of positions) {
        const pulse = .76 + Math.sin(time * 1.45 + point.angle * 4) * .2;
        const size = point.size * pulse * energy;
        if (size > 1.18) {
          const glow = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, size * 4.4);
          glow.addColorStop(0, colorAt(point.angle, .62 * energy * point.fade, .28));
          glow.addColorStop(.28, colorAt(point.angle, .28 * energy * point.fade));
          glow.addColorStop(1, colorAt(point.angle, 0));
          context.fillStyle = glow;
          context.fillRect(point.x - size * 4.4, point.y - size * 4.4, size * 8.8, size * 8.8);
        }
        context.beginPath();
        context.arc(point.x, point.y, Math.max(.3, size), 0, TAU);
        context.fillStyle = colorAt(point.angle, .9 * energy * point.fade, .08);
        context.fill();
      }
      context.restore();
    };

    const drawFacets = (centerX: number, centerY: number, radius: number, coreRadius: number, time: number, energy: number) => {
      const glow = context.createRadialGradient(centerX, centerY, coreRadius * .92, centerX, centerY, radius * .86);
      glow.addColorStop(0, "rgba(255,255,255,0)");
      glow.addColorStop(.36, "rgba(220,244,236,.08)");
      glow.addColorStop(.72, "rgba(126,181,190,.025)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

      const facets = 42;
      const spacing = TAU / facets;
      const radialStretch = 1.14;
      context.save();
      for (let index = 0; index < facets; index += 1) {
        const angle = index * spacing;
        const shimmer = .95 + Math.sin(index * 1.83 + time * .38) * .05;
        const centerRadius = coreRadius + radius * .143;
        const centerPointX = centerX + Math.cos(angle) * centerRadius;
        const centerPointY = centerY + Math.sin(angle) * centerRadius;
        const radialX = Math.cos(angle);
        const radialY = Math.sin(angle);
        const neighborChord = 2 * centerRadius * Math.sin(spacing / 2);
        const radialHalfDiagonal = neighborChord * radialStretch;
        const clockwiseAngle = angle + spacing;
        const counterclockwiseAngle = angle - spacing;

        context.beginPath();
        context.moveTo(centerPointX - radialX * radialHalfDiagonal, centerPointY - radialY * radialHalfDiagonal);
        context.lineTo(centerX + Math.cos(clockwiseAngle) * centerRadius, centerY + Math.sin(clockwiseAngle) * centerRadius);
        context.lineTo(centerPointX + radialX * radialHalfDiagonal, centerPointY + radialY * radialHalfDiagonal);
        context.lineTo(centerX + Math.cos(counterclockwiseAngle) * centerRadius, centerY + Math.sin(counterclockwiseAngle) * centerRadius);
        context.closePath();
        context.fillStyle = colorAt(angle + Math.sin(time * .1) * .012, .32 * shimmer * energy);
        context.fill();
      }
      context.restore();
    };

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
      const speed = state === "thinking" ? 1.22 : state === "listening" ? .86 : .54;
      const energy = state === "thinking" ? 1.18 : state === "listening" ? 1.08 : 1;
      const time = elapsed * speed;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 2;
      const artRadius = radius * .76;
      const breath = Math.sin(time * TAU / 5.8) * .011 + Math.sin(time * TAU / 11.6 + .7) * .004;
      const coreRadius = artRadius * (.635 + breath);

      if (layer === "complete" || layer === "network") drawNetwork(centerX, centerY, artRadius, coreRadius, time, energy);
      if (layer === "complete" || layer === "facets") drawFacets(centerX, centerY, artRadius, coreRadius, time, energy);

      if (!reducedMotion) frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    const restart = () => { startedAt = performance.now(); if (reducedMotion) draw(startedAt); };
    restart();
    return () => {
      window.cancelAnimationFrame(frame);
      motion.removeEventListener("change", onMotionChange);
    };
  }, [layer, state]);

  return <span className="luna-avatar" data-state={state} role="img" aria-label={`${label} is ${state}`} style={{ "--luna-avatar-size": `${size}px` } as CSSProperties}><canvas ref={canvasRef} /></span>;
}
