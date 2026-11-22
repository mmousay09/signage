"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const icon = (path: ReactNode) => (
  <svg className="admin-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
    {path}
  </svg>
);

const SECTIONS = [
  {
    href: "/dashboard",
    label: "الشاشات",
    match: ["/dashboard", "/screens"],
    icon: icon(
      <>
        <rect x="7" y="2.5" width="10" height="16" rx="1.5" />
        <path d="M10 21.5h4M12 18.5v3" />
      </>,
    ),
  },
  {
    href: "/contracts",
    label: "العقود",
    match: ["/contracts"],
    icon: icon(
      <>
        <path d="M6 2.5h8.5L19 7v13.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1z" />
        <path d="M14 2.5V7h5M8.5 12h7M8.5 16h5" />
      </>,
    ),
  },
  {
    href: "/playlists",
    label: "القوائم",
    match: ["/playlists"],
    icon: icon(<path d="M4 6h11M4 12h11M4 18h7M18 14.5v6l4.5-3z" />),
  },
  {
    href: "/media",
    label: "الوسائط",
    match: ["/media"],
    icon: icon(
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="2" />
        <path d="m4 18 5-5 4 4 3-3 4 4" />
      </>,
    ),
  },
  {
    href: "/announcements",
    label: "الإعلانات",
    match: ["/announcements"],
    icon: icon(
      <>
        <path d="M3.5 10v4a1 1 0 0 0 1 1H7l7 4.5v-15L7 9H4.5a1 1 0 0 0-1 1z" />
        <path d="M17.5 9a4 4 0 0 1 0 6" />
      </>,
    ),
  },
];

// يظهر فور الضغط إلى أن تفتح الصفحة
function Pending() {
  const { pending } = useLinkStatus();
  return <span className="admin-nav-pending" data-pending={pending} aria-hidden="true" />;
}

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="أقسام لوحة التحكم">
      {SECTIONS.map((section) => {
        const active = section.match.some((path) => pathname === path || pathname.startsWith(`${path}/`));
        return (
          <Link key={section.href} href={section.href} aria-current={active ? "page" : undefined} prefetch>
            {section.icon}
            <span>{section.label}</span>
            <Pending />
          </Link>
        );
      })}
    </nav>
  );
}
