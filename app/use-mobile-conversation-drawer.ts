"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "idealized-day-mobile-drawer-v1";

type DrawerMessage = { id: string; author: "user" | "luna" };
type DrawerPreference = { open: boolean; lastSeenLunaMessageId: string | null };

function readPreference(activityId: string): DrawerPreference {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, Partial<DrawerPreference>>;
    return {
      open: saved[activityId]?.open !== false,
      lastSeenLunaMessageId: typeof saved[activityId]?.lastSeenLunaMessageId === "string"
        ? saved[activityId].lastSeenLunaMessageId
        : null,
    };
  } catch {
    return { open: true, lastSeenLunaMessageId: null };
  }
}

function savePreference(activityId: string, preference: DrawerPreference) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, Partial<DrawerPreference>>;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, [activityId]: preference }));
  } catch {
    // Device-local drawer memory is helpful, but never blocks an activity.
  }
}

export function useMobileConversationDrawer({
  activityId,
  canCollapse,
  messages,
}: {
  activityId: string;
  canCollapse: boolean;
  messages: DrawerMessage[];
}) {
  const [preferredOpen, setPreferredOpen] = useState(true);
  const [hasUnreadLuna, setHasUnreadLuna] = useState(false);
  const preferenceReadyRef = useRef(false);
  const preferredOpenRef = useRef(true);
  const latestLunaMessageIdRef = useRef<string | null>(null);
  const lastSeenLunaMessageIdRef = useRef<string | null>(null);
  const pointerStartRef = useRef<number | null>(null);
  const gestureRef = useRef(false);
  const isOpen = canCollapse ? preferredOpen : true;

  useEffect(() => {
    preferenceReadyRef.current = false;
    const preference = readPreference(activityId);
    preferredOpenRef.current = preference.open;
    lastSeenLunaMessageIdRef.current = preference.lastSeenLunaMessageId;
    const frame = window.requestAnimationFrame(() => {
      setPreferredOpen(preference.open);
      const latestMessageId = latestLunaMessageIdRef.current;
      setHasUnreadLuna(Boolean(canCollapse && !preference.open && latestMessageId && latestMessageId !== preference.lastSeenLunaMessageId));
      preferenceReadyRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activityId, canCollapse]);

  useEffect(() => {
    const latestMessageId = [...messages].reverse().find((message) => message.author === "luna")?.id ?? null;
    latestLunaMessageIdRef.current = latestMessageId;
    const frame = window.requestAnimationFrame(() => {
      if (!preferenceReadyRef.current) return;
      if (isOpen) {
        lastSeenLunaMessageIdRef.current = latestMessageId;
        setHasUnreadLuna(false);
        savePreference(activityId, { open: preferredOpenRef.current, lastSeenLunaMessageId: latestMessageId });
      } else if (latestMessageId && latestMessageId !== lastSeenLunaMessageIdRef.current) {
        setHasUnreadLuna(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activityId, isOpen, messages]);

  function setOpen(open: boolean) {
    if (!window.matchMedia("(max-width: 680px)").matches) return;
    if (!open && !canCollapse) return;
    preferredOpenRef.current = open;
    setPreferredOpen(open);
    if (open) {
      lastSeenLunaMessageIdRef.current = latestLunaMessageIdRef.current;
      setHasUnreadLuna(false);
    }
    savePreference(activityId, {
      open,
      lastSeenLunaMessageId: open ? latestLunaMessageIdRef.current : lastSeenLunaMessageIdRef.current,
    });
  }

  function toggle() {
    if (gestureRef.current) {
      gestureRef.current = false;
      return;
    }
    setOpen(!isOpen);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    pointerStartRef.current = event.clientY;
    gestureRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (start === null) return;
    const distance = event.clientY - start;
    if (Math.abs(distance) < 36) return;
    gestureRef.current = true;
    setOpen(distance < 0);
  }

  function handlePointerCancel() {
    pointerStartRef.current = null;
  }

  return {
    handlePointerCancel,
    handlePointerDown,
    handlePointerUp,
    hasUnreadLuna,
    isOpen,
    setOpen,
    toggle,
  };
}
