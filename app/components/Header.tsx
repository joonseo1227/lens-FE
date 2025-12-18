"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";

export default function Header() {
    const pathname = usePathname();

    const getLinkClass = (path: string) => {
        const isActive = pathname === path;
        return isActive
            ? "text-white font-semibold"
            : "hover:text-white transition-colors";
    };

    return (
        <header className="flex-none w-full border-b border-zinc-800 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                        <div
                            className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-900/40">L
                        </div>
                        <h1 className="font-bold text-xl tracking-tight text-white">LensCorrect</h1>
                    </Link>
                </div>

                <nav className="flex gap-6 text-sm font-medium text-zinc-400">
                    <Link href="/" className={getLinkClass("/")}>Home</Link>
                    <Link href="/panorama" className={getLinkClass("/panorama")}>Panorama Tool</Link>
                    <Link href="/how-it-works" className={getLinkClass("/how-it-works")}>How it works</Link>
                    <Link href="/privacy" className={getLinkClass("/privacy")}>Privacy</Link>
                    <a href="https://github.com/joonseo1227"
                       className="text-zinc-100 hover:text-blue-400 transition-colors" target="_blank"
                       rel="noopener noreferrer">GitHub</a>
                </nav>
            </div>
        </header>
    );
}
