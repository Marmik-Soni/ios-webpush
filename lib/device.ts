// Pure functions — no React, no side effects at import time.

export interface EnvironmentInfo {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  innerWidth: number;
  innerHeight: number;
  navigatorStandalone: boolean | undefined;
  displayModeStandalone: boolean;
  isSecureContext: boolean;
  language: string;
  timeZone: string;
}

export function readEnvironment(): EnvironmentInfo {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    screenWidth: screen.width,
    screenHeight: screen.height,
    devicePixelRatio: window.devicePixelRatio,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    navigatorStandalone: navigator.standalone,
    displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
    isSecureContext: window.isSecureContext,
    language: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function isAppleMobile(): boolean {
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function context(): "Home Screen web app" | "Browser tab" {
  if (navigator.standalone === true) return "Home Screen web app";
  if (window.matchMedia("(display-mode: standalone)").matches) return "Home Screen web app";
  return "Browser tab";
}

export function iosVersionFromUA(ua: string): {
  value: string;
  source: string;
} {
  const safari = ua.match(/Version\/(\d+(?:\.\d+)?)/)?.[1];
  if (safari) return { value: safari, source: "Version/ token" };
  const os = ua.match(/OS (\d+)_(\d+)(?:_(\d+))?/);
  if (os)
    return {
      value: os.slice(1).filter(Boolean).join("."),
      source: "OS token (may be frozen)",
    };
  return { value: "unknown", source: "none" };
}

const MODELS: Record<string, string[]> = {
  // iPhone (portrait CSS px @ DPR)
  "440x956@3": ["iPhone 16 Pro Max", "iPhone 17 Pro Max"],
  "420x912@3": ["iPhone Air"],
  "402x874@3": ["iPhone 16 Pro", "iPhone 17", "iPhone 17 Pro"],
  "430x932@3": ["iPhone 14 Pro Max", "iPhone 15 Plus", "iPhone 15 Pro Max", "iPhone 16 Plus"],
  "393x852@3": ["iPhone 14 Pro", "iPhone 15", "iPhone 15 Pro", "iPhone 16"],
  "428x926@3": ["iPhone 12 Pro Max", "iPhone 13 Pro Max", "iPhone 14 Plus"],
  "390x844@3": [
    "iPhone 12",
    "iPhone 12 Pro",
    "iPhone 13",
    "iPhone 13 Pro",
    "iPhone 14",
    "iPhone 16e",
  ],
  "375x812@3": ["iPhone X", "iPhone XS", "iPhone 11 Pro", "iPhone 12 mini", "iPhone 13 mini"],
  "414x896@3": ["iPhone XS Max", "iPhone 11 Pro Max"],
  "414x896@2": ["iPhone XR", "iPhone 11"],
  "414x736@3": ["iPhone 6 Plus", "iPhone 6s Plus", "iPhone 7 Plus", "iPhone 8 Plus"],
  "375x667@2": [
    "iPhone 6",
    "iPhone 6s",
    "iPhone 7",
    "iPhone 8",
    "iPhone SE (2nd gen)",
    "iPhone SE (3rd gen)",
  ],
  // iPad
  "744x1133@2": ["iPad mini (6th gen)", "iPad mini (A17 Pro)"],
  "768x1024@2": ["iPad 9.7-inch (5th/6th gen)", "iPad mini 4/5", "iPad Air 2"],
  "810x1080@2": ["iPad 10.2-inch (7th-9th gen)"],
  "820x1180@2": ["iPad (10th gen)", "iPad Air (4th/5th gen)", "iPad Air 11-inch (M2 and newer)"],
  "834x1112@2": ["iPad Pro 10.5-inch", "iPad Air (3rd gen)"],
  "834x1194@2": ["iPad Pro 11-inch (1st-4th gen)"],
  "834x1210@2": ["iPad Pro 11-inch (M4 and newer)"],
  "1024x1366@2": ["iPad Pro 12.9-inch (1st-6th gen)", "iPad Air 13-inch (M2 and newer)"],
  "1032x1376@2": ["iPad Pro 13-inch (M4 and newer)"],
};

export interface ModelResult {
  key: string;
  candidates: string[];
  confidence: "unique" | "ambiguous" | "unknown";
}

export function modelCandidates(w: number, h: number, dpr: number): ModelResult {
  const minD = Math.min(w, h);
  const maxD = Math.max(w, h);
  const key = `${minD}x${maxD}@${dpr}`;
  const candidates = MODELS[key] ?? [];

  let confidence: ModelResult["confidence"];
  if (candidates.length === 0) confidence = "unknown";
  else if (candidates.length === 1) confidence = "unique";
  else confidence = "ambiguous";

  return { key, candidates, confidence };
}
