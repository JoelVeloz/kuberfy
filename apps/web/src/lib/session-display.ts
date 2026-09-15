import { Desktop, DeviceMobile, DeviceTablet } from "@phosphor-icons/react";
import { UAParser } from "ua-parser-js";

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const deviceIconByType = { mobile: DeviceMobile, tablet: DeviceTablet } as const;

export function describeDevice(userAgent: string | null) {
  if (!userAgent) return { label: "Unknown device", Icon: Desktop };
  const { browser, os, device } = UAParser(userAgent);
  const label = [browser.name, os.name].filter(Boolean).join(" on ") || userAgent;
  const Icon = deviceIconByType[device.type as keyof typeof deviceIconByType] ?? Desktop;
  return { label, Icon };
}
