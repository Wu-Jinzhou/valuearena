"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Leaderboard", href: "/" },
  { label: "Battle", href: "/battle" },
  { label: "Study", href: "/study" },
];

const recentThreads = [
  {
    label: "What do you think about wealth inequality?",
    href: "/battle",
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 flex-none border-r border-slate-200 bg-white/90 px-5 py-6 lg:flex lg:flex-col">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Value
          </span>
          <span className="text-lg font-semibold text-slate-900">Arena</span>
        </div>
        <button className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
          Login
        </button>
      </div>

      <nav className="mt-8 flex flex-col gap-8 text-sm">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Main
          </p>
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-2xl px-3 py-2 font-semibold ${
                  active
                    ? "bg-slate-900/90 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Today
          </p>
          {recentThreads.map((thread) => (
            <Link
              key={thread.label}
              href={thread.href}
              className="flex items-center justify-between rounded-2xl border border-slate-200 px-3 py-2 text-left text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
            >
              <span className="text-sm">{thread.label}</span>
              <span className="text-xs text-slate-400">→</span>
            </Link>
          ))}
        </div>
      </nav>

      <div className="mt-auto rounded-2xl border border-slate-200 px-3 py-4 text-xs text-slate-500">
        <p className="font-semibold text-slate-900">Take your chats anywhere</p>
        <p className="mt-1">
          Create an account to save EigenBench battles and ratings across devices.
        </p>
      </div>
    </aside>
  );
}
