"use client";

/**
 * THG-OMS-068: nav item dạng dropdown xổ con (collapsible). Dùng chung cho
 * Hub sidebar + Seller Portal sidebar. Parent là nút toggle (KHÔNG điều hướng);
 * con là Link thụt lề.
 *
 * - Chevron ▸ (đóng) / ▾ (mở).
 * - Auto-expand + highlight đúng con khi F5/deep-link (đọc usePathname): nếu
 *   pathname khớp 1 con → mở sẵn + con đó active, parent highlight.
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { NavItem } from "@/lib/navigation";
import { COLORS } from "@/lib/constants";

function matchActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/") || pathname.startsWith(href + "?");
}

interface CollapsibleNavItemProps {
  item: NavItem;
  /** Gọi khi click 1 con — đóng mobile sidebar. */
  onNavigate?: () => void;
}

export function CollapsibleNavItem({ item, onNavigate }: CollapsibleNavItemProps) {
  const pathname = usePathname();
  const children = item.children ?? [];
  const hasActiveChild = children.some((c) => matchActive(pathname, c.href));
  // Derived state (không dùng effect): mặc định mở theo route active (F5/deep-link
  // tự mở + highlight). User toggle thì manualOpen override. Mỗi lần F5 = mount
  // mới → manualOpen=null → bám theo hasActiveChild.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const expanded = manualOpen ?? hasActiveChild;

  return (
    <div>
      {/* Parent trigger — chỉ toggle, không navigate */}
      <button
        type="button"
        onClick={() => setManualOpen(!expanded)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] transition-all bg-transparent border-none cursor-pointer"
        style={{
          fontWeight: hasActiveChild ? 700 : 500,
          background: hasActiveChild ? COLORS.accentLight : "transparent",
          color: hasActiveChild ? COLORS.accent : COLORS.text1,
        }}
      >
        <span className="text-[12px] w-4 text-center">{item.icon}</span>
        <span className="flex-1 text-left">{item.label}</span>
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>

      {/* Children */}
      {expanded && (
        <div className="mt-0.5 space-y-0.5">
          {children.map((child) => {
            const isActive = matchActive(pathname, child.href);
            return (
              <Link
                key={child.id}
                href={child.href}
                onClick={onNavigate}
                prefetch={false}
                className="w-full flex items-center gap-1.5 pl-7 pr-2.5 py-1.5 rounded-full text-[11px] transition-all no-underline"
                style={{
                  fontWeight: isActive ? 700 : 500,
                  background: isActive ? COLORS.accent : "transparent",
                  color: isActive ? "#ffffff" : COLORS.text1,
                }}
              >
                <span className="text-[12px] w-4 text-center">{child.icon}</span>
                <span className="flex-1">{child.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
