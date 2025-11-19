'use client';

import { Tv, Film, Clapperboard, Settings, LogOut, Menu } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import clsx from 'clsx';
import { useState } from 'react';

const NAV_ITEMS = [
    { icon: Tv, label: 'Live TV', id: 'live' },
    { icon: Film, label: 'Movies', id: 'movies' },
    { icon: Clapperboard, label: 'Series', id: 'series' },
    { icon: Settings, label: 'Settings', id: 'settings' },
];

export default function Sidebar() {
    const { logout } = useAuthStore();
    const [collapsed, setCollapsed] = useState(true);

    return (
        <div
            className={clsx(
                "fixed left-0 top-0 z-50 flex h-screen flex-col bg-black/90 backdrop-blur-xl transition-all duration-300 border-r border-white/10",
                collapsed ? "w-20" : "w-64"
            )}
            onMouseEnter={() => setCollapsed(false)}
            onMouseLeave={() => setCollapsed(true)}
        >
            <div className="flex h-20 items-center justify-center border-b border-white/10">
                <div className="flex items-center gap-3 text-red-600">
                    <Tv size={32} />
                    <span className={clsx("font-bold text-xl text-white transition-opacity duration-300", collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100")}>
                        IPTV
                    </span>
                </div>
            </div>

            <nav className="flex-1 space-y-2 p-4">
                {NAV_ITEMS.map((item) => (
                    <button
                        key={item.id}
                        className="flex w-full items-center gap-4 rounded-lg p-3 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                    >
                        <item.icon size={24} />
                        <span className={clsx("whitespace-nowrap transition-all duration-300", collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100")}>
                            {item.label}
                        </span>
                    </button>
                ))}
            </nav>

            <div className="p-4 border-t border-white/10">
                <button
                    onClick={logout}
                    className="flex w-full items-center gap-4 rounded-lg p-3 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-500"
                >
                    <LogOut size={24} />
                    <span className={clsx("whitespace-nowrap transition-all duration-300", collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100")}>
                        Logout
                    </span>
                </button>
            </div>
        </div>
    );
}
