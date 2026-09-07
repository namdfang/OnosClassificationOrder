"use client";

import { useMobileSidebar } from "@/context/mobile-sidebar-context";

export function SidebarBackdrop() {
  const { isOpen, close } = useMobileSidebar();

  if (!isOpen) return null;

  return (
    <div
      className="lg:hidden fixed inset-0 bg-black/50 z-40"
      onClick={close}
      aria-hidden="true"
    />
  );
}
