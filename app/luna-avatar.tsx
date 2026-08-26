"use client";

import { useEffect, useRef, type CSSProperties } from "react";

export type LunaAvatarState = "idle" | "listening" | "thinking";
export type LunaAvatarLayer = "complete" | "facets" | "network";

type LunaAvatarProps = {
  label?: string;
  layer?: LunaAvatarLayer;
  size?: number;
  state?: LunaAvatarState;
  facetTuning?: Partial<LunaFacetTuning>;
  facetRows?: ReadonlyArray<Partial<LunaFacetTuning>>;
};

export type LunaFacetTuning = {
  facetCount: number;
  artScale: number;
  innerTipPosition: number;
  sideTipPosition: number;
  outerTipPosition: number;
  angularSpan: number;
  innerConvexity: number;
  outerConvexity: number;
  edgeSteps: number;
  facetOpacity: number;
  colorRotation: number;
  colorRotationSpeed: number;
  colorLift: number;
  shimmerAmount: number;
  shimmerSpeed: number;
  motionSpeed: number;
  breathInward: number;
  breathOutward: number;
  breathPeriod: number;
  colorDriftAmount: number;
  colorDriftSpeed: number;
};

export const DEFAULT_LUNA_FACET_TUNING: LunaFacetTuning = {
  facetCount: 40,
  artScale: .76,
  innerTipPosition: .645,
  sideTipPosition: .778,
  outerTipPosition: .898,
  angularSpan: 1,
  innerConvexity: 1,
  outerConvexity: 1,
  edgeSteps: 6,
  facetOpacity: .32,
  colorRotation: 0,
  colorRotationSpeed: 30,
  colorLift: 0,
  shimmerAmount: .18,
  shimmerSpeed: 1.01,
  motionSpeed: 1,
  breathInward: 3,
  breathOutward: 3,
  breathPeriod: 5.8,
  colorDriftAmount: .7,
  colorDriftSpeed: .1,
};

export const DEFAULT_LUNA_INNER_FACET_TUNING: LunaFacetTuning = {
  ...DEFAULT_LUNA_FACET_TUNING,
  innerTipPosition: .56,
  sideTipPosition: .645,
  outerTipPosition: .778,
  facetOpacity: .5,
  colorLift: .35,
  shimmerAmount: .09,
  shimmerSpeed: .63,
};

export const DEFAULT_LUNA_FACET_ROWS: ReadonlyArray<LunaFacetTuning> = [
  DEFAULT_LUNA_INNER_FACET_TUNING,
  DEFAULT_LUNA_FACET_TUNING,
];

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

const LUNA_FIELD = (() => {
  const random = seededRandom(21031989);
  const nodes: NetworkNode[] = Array.from({ length: 336 }, () => ({
    angle: random() * TAU,
    distance: .53 + Math.pow(random(), .72) * .78,
    phase: random() * TAU,
    size: .34 + Math.pow(random(), 2) * 1.65,
  }));
  const links: Array<[number, number]> = [];
  for (let first = 0; first < nodes.length; first += 1) {
    const a = nodes[first];
    const ax = Math.cos(a.angle) * a.distance;
    const ay = Math.sin(a.angle) * a.distance;
    for (let second = first + 1; second < nodes.length; second += 1) {
      const b = nodes[second];
      const bx = Math.cos(b.angle) * b.distance;
      const by = Math.sin(b.angle) * b.distance;
      if (Math.hypot(ax - bx, ay - by) < .255) links.push([first, second]);
    }
  }
  const stars: NetworkNode[] = Array.from({ length: 420 }, () => ({
    angle: random() * TAU,
    distance: .66 + random() * .69,
    phase: random() * TAU,
    size: .22 + random() * .66,
  }));
  return { links, nodes, stars };
})();

export function LunaAvatar({ label = "Luna", layer = "complete", size = 240, state = "idle", facetTuning, facetRows }: LunaAvatarProps) {
  const shellRef = useRef<HTMLSpanElement>(null);
  const networkCanvasRef = useRef<HTMLCanvasElement>(null);
  const facetCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const shell = shellRef.current;
    const networkCanvas = networkCanvasRef.current;
    const facetCanvas = facetCanvasRef.current;
    if (!shell || !networkCanvas || !facetCanvas) return;
    const networkContext = networkCanvas.getContext("2d");
    const facetContext = facetCanvas.getContext("2d");
    if (!networkContext || !facetContext) return;
    const requestedRows = facetRows?.length ? facetRows : facetTuning ? [facetTuning] : DEFAULT_LUNA_FACET_ROWS;
    const facetConfigs = requestedRows.map((row) => ({ ...DEFAULT_LUNA_FACET_TUNING, ...row }));

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motion.matches;
    let frame = 0;
    let timer = 0;
    const startedAt = performance.now();
    let lastFacetFrame = Number.NEGATIVE_INFINITY;
    let lastNetworkFrame = Number.NEGATIVE_INFINITY;
    let visible = true;
    let width = 1;
    let height = 1;
    let pixelRatio = 1;
    let needsResize = true;
    let activeNodeCount = LUNA_FIELD.nodes.length;
    let activeStarCount = LUNA_FIELD.stars.length;
    let activeLinks = LUNA_FIELD.links;
    let fieldScale = 1;

    const resizeCanvases = () => {
      const bounds = shell.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      pixelRatio = Math.min(window.devicePixelRatio || 1, width < 144 ? 1.5 : 2);
      const nextWidth = Math.round(width * pixelRatio);
      const nextHeight = Math.round(height * pixelRatio);
      for (const canvas of [networkCanvas, facetCanvas]) {
        if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
          canvas.width = nextWidth;
          canvas.height = nextHeight;
        }
      }
      networkContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      facetContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const compactComplexity = Math.max(.16, Math.pow(Math.min(width, height) / 180, 2));
      const complexity = Math.min(1, compactComplexity);
      activeNodeCount = Math.max(42, Math.floor(LUNA_FIELD.nodes.length * complexity));
      activeStarCount = Math.max(54, Math.floor(LUNA_FIELD.stars.length * complexity));
      activeLinks = complexity === 1
        ? LUNA_FIELD.links
        : LUNA_FIELD.links.filter(([first, second]) => first < activeNodeCount && second < activeNodeCount);
      fieldScale = Math.min(1, Math.max(.8, Math.min(width, height) / 220));
      needsResize = false;
      lastFacetFrame = Number.NEGATIVE_INFINITY;
      lastNetworkFrame = Number.NEGATIVE_INFINITY;
    };

    const drawNetwork = (centerX: number, centerY: number, radius: number, emptyRadius: number, time: number, energy: number) => {
      const fieldEnergy = energy * fieldScale;
      const blinkRate = state === "thinking" ? 2.8 : state === "listening" ? 1.35 : 1;
      const positions = LUNA_FIELD.nodes.slice(0, activeNodeCount).map((node, index) => {
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

      networkContext.clearRect(0, 0, width, height);
      networkContext.save();
      networkContext.beginPath();
      networkContext.rect(0, 0, width, height);
      networkContext.arc(centerX, centerY, emptyRadius, 0, TAU);
      networkContext.clip("evenodd");
      networkContext.globalCompositeOperation = "lighter";
      for (const [first, second] of activeLinks) {
        const a = positions[first];
        const b = positions[second];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const threshold = radius * .275;
        if (distance > threshold) continue;
        const opacity = (1 - distance / threshold) * .3 * fieldEnergy * Math.min(a.fade, b.fade);
        networkContext.beginPath();
        networkContext.moveTo(a.x, a.y);
        networkContext.lineTo(b.x, b.y);
        networkContext.strokeStyle = colorAt((a.angle + b.angle) / 2, opacity);
        networkContext.lineWidth = .48;
        networkContext.stroke();
      }

      for (let index = 0; index < activeStarCount; index += 1) {
        const star = LUNA_FIELD.stars[index];
        const distance = radius * (star.distance + Math.sin(time * .24 + star.phase) * .003);
        const fade = networkFade(star.distance);
        const x = centerX + Math.cos(star.angle) * distance;
        const y = centerY + Math.sin(star.angle) * distance;
        const pulse = .7 + Math.sin(time * 1.25 * blinkRate + star.phase) * .22;
        networkContext.beginPath();
        networkContext.arc(x, y, star.size * pulse * fieldEnergy, 0, TAU);
        networkContext.fillStyle = colorAt(star.angle, .68 * fieldEnergy * fade, .08);
        networkContext.fill();
      }

      for (const point of positions) {
        const pulse = .76 + Math.sin(time * 1.45 * blinkRate + point.angle * 4) * .2;
        const pointSize = point.size * pulse * fieldEnergy;
        if (pointSize > 1.18) {
          const glow = networkContext.createRadialGradient(point.x, point.y, 0, point.x, point.y, pointSize * 4.4);
          glow.addColorStop(0, colorAt(point.angle, .62 * fieldEnergy * point.fade, .28));
          glow.addColorStop(.28, colorAt(point.angle, .28 * fieldEnergy * point.fade));
          glow.addColorStop(1, colorAt(point.angle, 0));
          networkContext.fillStyle = glow;
          networkContext.fillRect(point.x - pointSize * 4.4, point.y - pointSize * 4.4, pointSize * 8.8, pointSize * 8.8);
        }
        networkContext.beginPath();
        networkContext.arc(point.x, point.y, Math.max(.24, pointSize), 0, TAU);
        networkContext.fillStyle = colorAt(point.angle, .9 * fieldEnergy * point.fade, .08);
        networkContext.fill();
      }
      networkContext.restore();
    };

    const drawFacets = (centerX: number, centerY: number, radius: number, time: number, energy: number, breathReach: number) => {
      facetContext.clearRect(0, 0, width, height);
      facetContext.save();
      facetContext.globalCompositeOperation = "lighter";
      for (const config of facetConfigs) {
        const facetTime = time * config.motionSpeed;
        const breathWave = Math.sin(facetTime * TAU / config.breathPeriod) * .011 + Math.sin(facetTime * TAU / (config.breathPeriod * 2) + .7) * .004;
        const breathProgress = Math.max(0, Math.min(1, .5 + breathWave / .03));
        const inwardBreath = .015 * config.breathInward * breathProgress * breathReach;
        const outwardBreath = .015 * config.breathOutward * breathProgress * breathReach;
        const artRadius = radius * config.artScale;
        const colorRotation = (config.colorRotation + time * config.colorRotationSpeed) / 360 * TAU;
        const tunedColorAt = (angle: number, alpha = 1, light = 0) => colorAt(angle + colorRotation, alpha, light);
        const facets = Math.max(12, Math.round(config.facetCount));
        const spacing = TAU / facets;
        const centerRadius = artRadius * config.sideTipPosition;
        const inwardRadius = artRadius * (config.innerTipPosition - inwardBreath);
        const outwardRadius = artRadius * (config.outerTipPosition + outwardBreath);
        const innerHalfDiagonal = centerRadius - inwardRadius;
        const outerHalfDiagonal = outwardRadius - centerRadius;
        const edgeSteps = Math.max(1, Math.round(config.edgeSteps));
        const innerShapePower = 2 / config.innerConvexity;
        const outerShapePower = 2 / config.outerConvexity;
        const mapPolarPoint = (angle: number, mappedRadius: number) => ({
          x: centerX + Math.cos(angle) * mappedRadius,
          y: centerY + Math.sin(angle) * mappedRadius,
        });
        const traceFacetQuarter = (
          angle: number,
          fromTurn: number,
          toTurn: number,
          shapePower: number,
          radialHalfDiagonal: number,
        ) => {
          for (let step = 1; step <= edgeSteps; step += 1) {
            const turn = fromTurn + (toTurn - fromTurn) * (step / edgeSteps);
            const cosine = Math.cos(turn);
            const sine = Math.sin(turn);
            const angularOffset = spacing * config.angularSpan * Math.sign(cosine) * Math.pow(Math.abs(cosine), shapePower);
            const radialOffset = radialHalfDiagonal * Math.sign(sine) * Math.pow(Math.abs(sine), shapePower);
            const point = mapPolarPoint(angle + angularOffset, centerRadius + radialOffset);
            facetContext.lineTo(point.x, point.y);
          }
        };
        for (let index = 0; index < facets; index += 1) {
          const angle = index * spacing;
          const shimmer = 1 + Math.sin(index * 1.83 + facetTime * TAU * config.shimmerSpeed) * config.shimmerAmount;
          const inwardTip = mapPolarPoint(angle, inwardRadius);

          facetContext.beginPath();
          facetContext.moveTo(inwardTip.x, inwardTip.y);
          traceFacetQuarter(angle, -Math.PI / 2, 0, innerShapePower, innerHalfDiagonal);
          traceFacetQuarter(angle, 0, Math.PI / 2, outerShapePower, outerHalfDiagonal);
          traceFacetQuarter(angle, Math.PI / 2, Math.PI, outerShapePower, outerHalfDiagonal);
          traceFacetQuarter(angle, Math.PI, Math.PI * 1.5, innerShapePower, innerHalfDiagonal);
          facetContext.closePath();
          const colorDrift = Math.sin(facetTime * config.colorDriftSpeed) * config.colorDriftAmount / 360 * TAU;
          facetContext.fillStyle = tunedColorAt(angle + colorDrift, config.facetOpacity * shimmer * energy, config.colorLift);
          facetContext.fill();
        }
      }
      facetContext.restore();
    };

    function draw(now: number) {
      if (!visible || document.hidden) return;
      if (needsResize) resizeCanvases();
      const elapsed = reducedMotion ? 1.8 : (now - startedAt) / 1000;
      const stateSpeed = state === "thinking" ? 1.22 : state === "listening" ? .86 : .54;
      const energy = 1;
      const networkTime = elapsed * stateSpeed;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 2;
      const breathReach = state === "thinking" ? 2.3 : state === "listening" ? 1.3 : 1;
      const networkArtRadius = radius * .76;
      const networkBreath = (Math.sin(networkTime * TAU / 5.8) * .011 + Math.sin(networkTime * TAU / 11.6 + .7) * .004) * breathReach;
      const networkCoreRadius = networkArtRadius * (.635 + networkBreath);
      const compact = Math.min(width, height) < 144;
      const facetInterval = reducedMotion ? Number.POSITIVE_INFINITY : 1000 / (compact ? 18 : 30);
      const networkInterval = reducedMotion
        ? Number.POSITIVE_INFINITY
        : state === "thinking"
          ? compact ? 600 : 250
          : state === "listening"
            ? compact ? 800 : 450
            : compact ? 1000 : 750;
      const usesNetwork = layer === "complete" || layer === "network";
      const usesFacets = layer === "complete" || layer === "facets";

      if (usesNetwork && now - lastNetworkFrame >= networkInterval) {
        drawNetwork(centerX, centerY, networkArtRadius, networkCoreRadius, networkTime, energy);
        lastNetworkFrame = now;
      }
      if (usesFacets && now - lastFacetFrame >= facetInterval) {
        drawFacets(centerX, centerY, radius, networkTime, energy, breathReach);
        lastFacetFrame = now;
      }

      if (reducedMotion) return;
      const nextNetwork = usesNetwork ? lastNetworkFrame + networkInterval : Number.POSITIVE_INFINITY;
      const nextFacet = usesFacets ? lastFacetFrame + facetInterval : Number.POSITIVE_INFINITY;
      const delay = Math.max(8, Math.min(nextNetwork, nextFacet) - performance.now());
      timer = window.setTimeout(() => { frame = window.requestAnimationFrame(draw); }, delay);
    }

    function requestDraw(resetFrames = true) {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      if (resetFrames) {
        lastFacetFrame = Number.NEGATIVE_INFINITY;
        lastNetworkFrame = Number.NEGATIVE_INFINITY;
      }
      if (visible && !document.hidden) frame = window.requestAnimationFrame(draw);
    }

    const onMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      requestDraw();
    };
    const onVisibilityChange = () => requestDraw(false);
    const resizeObserver = new ResizeObserver(() => {
      needsResize = true;
      requestDraw();
    });
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      requestDraw(false);
    }, { rootMargin: "80px" });

    networkContext.clearRect(0, 0, networkCanvas.width, networkCanvas.height);
    facetContext.clearRect(0, 0, facetCanvas.width, facetCanvas.height);
    motion.addEventListener("change", onMotionChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    resizeObserver.observe(shell);
    visibilityObserver.observe(shell);
    requestDraw();

    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      motion.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
    };
  }, [facetRows, facetTuning, layer, state]);

  return <span ref={shellRef} className="luna-avatar" data-state={state} role="img" aria-label={`${label} is ${state}`} style={{ "--luna-avatar-size": `${size}px` } as CSSProperties}><canvas aria-hidden="true" className="luna-avatar-network" ref={networkCanvasRef} /><canvas aria-hidden="true" className="luna-avatar-facets" ref={facetCanvasRef} /></span>;
}
