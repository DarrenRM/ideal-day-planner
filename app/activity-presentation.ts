import type { AppIcon } from "./icons";
import { BedDouble, BicepsFlexed, Brain, CookingPot, Droplet, Dumbbell, Film, Footprints, Hammer, Heart, HeartPulse, Package, Palette, PersonStanding, Pill, ShoppingBasket, ShowerHead, Sparkles, Sun, SunMedium, Utensils, Vibrate, Waves } from "./icons";

export type ActivityCategory = "Light" | "Recharge" | "Training" | "Fuel" | "Care" | "Logistics" | "Creativity" | "Spirit";

export const CATEGORY_ORDER: ActivityCategory[] = ["Training", "Fuel", "Light", "Recharge", "Care", "Logistics", "Creativity", "Spirit"];
export const CATEGORY_OPTIONS: ActivityCategory[] = ["Care", "Training", "Fuel", "Recharge", "Light", "Logistics", "Creativity", "Spirit"];
export const CATEGORY_META: Record<ActivityCategory, { icon: string; color: string }> = {
  Care: { icon: "✦", color: "#d58db5" },
  Training: { icon: "◆", color: "#a8c96d" },
  Fuel: { icon: "◒", color: "#d59662" },
  Recharge: { icon: "◌", color: "#67b7ce" },
  Light: { icon: "☼", color: "#e8b75f" },
  Logistics: { icon: "↗", color: "#7ba6c9" },
  Creativity: { icon: "✺", color: "#b58ad6" },
  Spirit: { icon: "✧", color: "#9a8ed8" },
};

const CATEGORY_ICONS: Record<ActivityCategory, AppIcon> = {
  Care: Heart,
  Training: Dumbbell,
  Fuel: Utensils,
  Recharge: Waves,
  Light: Sun,
  Logistics: Package,
  Creativity: Palette,
  Spirit: Sparkles,
};

export function activityIconFor(item: { title: string; category: ActivityCategory }): AppIcon {
  const title = item.title.toLowerCase();
  if (/chin-up|pull-up|hang/.test(title)) return BicepsFlexed;
  if (/kettlebell|\blift\b|weight/.test(title)) return Dumbbell;
  if (/cardio|run|cycle|bike/.test(title)) return HeartPulse;
  if (/walk/.test(title)) return Footprints;
  if (/stretch|yoga/.test(title)) return PersonStanding;
  if (/shower/.test(title)) return ShowerHead;
  if (/skin/.test(title)) return Sparkles;
  if (/hair|serum/.test(title)) return Droplet;
  if (/red light/.test(title)) return SunMedium;
  if (/shake|supplement/.test(title)) return Pill;
  if (/breakfast|lunch|dinner|meal/.test(title)) return Utensils;
  if (/massage|vibe/.test(title)) return Vibrate;
  if (/sun|tan/.test(title)) return Sun;
  if (/food prep|cook/.test(title)) return CookingPot;
  if (/bed|sleep/.test(title)) return BedDouble;
  if (/meditat/.test(title)) return Brain;
  if (/entertain|consume|watch/.test(title)) return Film;
  if (/resupply|shop|grocery/.test(title)) return ShoppingBasket;
  if (/build|create|make/.test(title)) return Hammer;
  return CATEGORY_ICONS[item.category];
}

export function normalizeCategory(value: unknown): ActivityCategory | null {
  if (value === "Reset") return "Recharge";
  return CATEGORY_OPTIONS.includes(value as ActivityCategory) ? value as ActivityCategory : null;
}
