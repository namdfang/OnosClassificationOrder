"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEVICE_COOKIE, DEVICE_MOBILE } from "@/lib/device";

interface DeviceContextType {
  isMobile: boolean;
  isDesktop: boolean;
}

const DeviceContext = createContext<DeviceContextType>({ isMobile: false, isDesktop: true });

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function DeviceProvider({ children }: { children: ReactNode }) {
  const device = getCookie(DEVICE_COOKIE);
  const isMobile = device === DEVICE_MOBILE;

  return (
    <DeviceContext.Provider value={{ isMobile, isDesktop: !isMobile }}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  return useContext(DeviceContext);
}
