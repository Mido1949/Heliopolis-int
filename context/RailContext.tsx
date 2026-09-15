'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/** One in-page section the rail can filter the current page by. */
export interface RailSection {
  id: string;
  label: string;
  labelAr: string;
  icon: React.ReactNode;
}

export interface RailRing {
  /** 0–100. */
  progress: number;
  caption: string;
}

/**
 * What a page contributes to the app rail: its own sections (rendered above the
 * app's page links) and an optional progress ring pinned to the bottom.
 */
export interface RailConfig {
  sections: RailSection[];
  activeId: string;
  onSelect: (id: string) => void;
  ring?: RailRing | null;
  /** Group heading above the sections. Defaults to the current page's name. */
  groupLabel?: string;
  groupLabelAr?: string;
}

interface RailContextValue {
  config: RailConfig | null;
  setConfig: (config: RailConfig | null) => void;
}

const RailContext = createContext<RailContextValue | null>(null);

export function RailProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<RailConfig | null>(null);
  const value = useMemo(() => ({ config, setConfig }), [config]);
  return <RailContext.Provider value={value}>{children}</RailContext.Provider>;
}

/** Read the rail config — only the rail itself needs this. */
export function useRailConfig(): RailConfig | null {
  return useContext(RailContext)?.config ?? null;
}

/**
 * Publish this page's sections into the app rail, clearing them on unmount so a
 * page never leaves its sections behind on the next one.
 *
 * `sections` and `onSelect` must be referentially stable (module constant /
 * useMemo / useCallback) — they are effect dependencies.
 */
export function useRegisterRailSections(config: RailConfig | null) {
  const ctx = useContext(RailContext);
  const setConfig = ctx?.setConfig;

  const sections = config?.sections;
  const activeId = config?.activeId;
  const onSelect = config?.onSelect;
  const ringProgress = config?.ring?.progress;
  const ringCaption = config?.ring?.caption;
  const groupLabel = config?.groupLabel;
  const groupLabelAr = config?.groupLabelAr;

  // Rebuilt from primitives so a fresh object literal at the call site doesn't
  // re-fire the effect on every render.
  const stable = useCallback((): RailConfig | null => {
    if (!sections || !activeId || !onSelect) return null;
    return {
      sections,
      activeId,
      onSelect,
      ring: ringProgress === undefined ? null : { progress: ringProgress, caption: ringCaption ?? '' },
      groupLabel,
      groupLabelAr,
    };
  }, [sections, activeId, onSelect, ringProgress, ringCaption, groupLabel, groupLabelAr]);

  useEffect(() => {
    if (!setConfig) return;
    setConfig(stable());
    return () => setConfig(null);
  }, [setConfig, stable]);
}
