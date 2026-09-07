"use client";

import { useMobileSidebar } from "@/context/mobile-sidebar-context";

export function MobileMenuButton() {
  const { toggle } = useMobileSidebar();

  return (
    <button
      onClick={toggle}
      className="lg:hidden fixed top-[calc(0.75rem+var(--viewas-h,0px))] left-3 z-[60] w-8 h-8 flex flex-col items-center justify-center gap-1 rounded-md bg-card/90 shadow-md border border-border1"
      aria-label="Toggle menu"
    >
      <span className="block w-3.5 h-[2px] bg-[#333] rounded-full" />
      <span className="block w-3.5 h-[2px] bg-[#333] rounded-full" />
      <span className="block w-3.5 h-[2px] bg-[#333] rounded-full" />
    </button>
  );
}
