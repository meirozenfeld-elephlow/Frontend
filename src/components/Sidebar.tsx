import { useEffect, type Dispatch, type ReactNode, type SetStateAction } from "react";

export type NavItem = {
    label: string;
    path?: string;
    icon: ReactNode;
};

type SidebarProps = {
    userEmail?: string | null;
    nav: NavItem[];
    collapsed: boolean;
    setCollapsed: Dispatch<SetStateAction<boolean>>;
    mobileOpen: boolean;
    setMobileOpen: Dispatch<SetStateAction<boolean>>;
    onNavigate: (path: string) => void;
    onLogout: () => void;
    currentPath: string;
};

export default function Sidebar({
    userEmail,
    nav,
    collapsed,
    setCollapsed,
    mobileOpen,
    setMobileOpen,
    onNavigate,
    onLogout,
    currentPath,
}: SidebarProps) {
    // Registers Escape key handler to close the mobile drawer, with cleanup on unmount
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [setMobileOpen]);

    return (
        <>
            {/* Mobile: floating opener button (shown only when drawer is closed)*/}
            {!mobileOpen && (
                <button
                    type="button"
                    onClick={() => setMobileOpen(true)}
                    aria-label="Open menu"
                    aria-controls="mobile-sidebar"
                    className="md:hidden fixed left-4 top-4 z-50 grid h-10 w-10 place-items-center rounded-xl border border-white/60 bg-white/80 text-slate-700 shadow-lg backdrop-blur transition hover:bg-white"
                >
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
            )}

            {/* Mobile: backdrop overlay and slide-in drawer */}
            {mobileOpen && (
                <button
                    className="md:hidden fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
                    aria-label="Close menu overlay"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            <aside
                id="mobile-sidebar"
                className={
                    "md:hidden fixed inset-y-0 left-0 z-50 w-64 transform border border-white/60 bg-white/90 shadow-xl backdrop-blur transition-transform " +
                    (mobileOpen ? "translate-x-0" : "-translate-x-full")
                }
            >
                <div className="px-4 py-4 border-b border-white/60">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow">
                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 12s2-5 9-5 9 5 9 5-2 5-9 5-9-5-9-5z" />
                                    <path d="M12 8l1.5 3h3L13 15l-1.5-3h-3L12 8z" />
                                </svg>
                            </div>
                            <div>
                                <p className="font-semibold leading-none">Psy Web-App</p>
                                {userEmail && <p className="text-xs text-slate-500">{userEmail}</p>}
                            </div>
                        </div>

                        {/* Mobile drawer close button (top-right) */}
                        <button
                            type="button"
                            onClick={() => setMobileOpen(false)}
                            aria-label="Close menu"
                            className="grid h-10 w-10 place-items-center rounded-lg border border-white/60 bg-white/70 text-slate-700 shadow-sm backdrop-blur transition hover:bg-white"
                        >
                            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 6h16M4 12h16M4 18h16" />
                                <path d="M6 6l12 12M18 6L6 18" />
                            </svg>
                        </button>
                    </div>
                </div>

                <nav className="flex-1 px-2 py-3">
                    <ul className="space-y-1.5">
                        {nav.map((item) => {
                            const isActive = item.path
                                ? (item.path === "/" ? currentPath === "/" : currentPath.startsWith(item.path))
                                : false;
                            const classes =
                                "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition " +
                                (isActive ? "bg-sky-100 text-sky-800 ring-1 ring-sky-200" : "text-slate-700 hover:bg-sky-50 hover:text-sky-800");
                            return (
                                <li key={item.label}>
                                    {item.path ? (
                                        <button
                                            className={classes}
                                            onClick={() => { setMobileOpen(false); onNavigate(item.path!); }}
                                        >
                                            <span className="text-slate-500 group-hover:text-sky-700">{item.icon}</span>
                                            <span>{item.label}</span>
                                        </button>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                <div className="px-2 pb-3 pt-2 border-t border-white/60">
                    <button
                        onClick={() => { setMobileOpen(false); onLogout(); }}
                        className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-50 hover:text-rose-800 transition"
                    >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeWidth="2" d="M15 3h4a2 2 0 0 1 2 2v4M10 17l5-5-5-5M15 12H3" />
                        </svg>
                        <span>Log out</span>
                    </button>
                </div>
            </aside>

            {/* Desktop: collapsible sidebar (expanded or collapsed) */}
            <aside
                id="desktop-sidebar"
                className={
                    "hidden md:flex flex-col rounded-2xl border border-white/60 bg-white/80 shadow-lg backdrop-blur transition-all " +
                    (collapsed ? "w-20" : "w-64")
                }
            >
                <div className={"relative px-4 py-4 border-b border-white/60 " + (collapsed ? "px-3" : "px-4")}>
                    <div className={"flex items-center " + (collapsed ? "justify-center" : "justify-between")}>
                        {/* Brand block: logo, app name, and optional user email */}
                        <div className={"flex items-center " + (collapsed ? "gap-0" : "gap-3")}>
                            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow">
                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 12s2-5 9-5 9 5 9 5-2 5-9 5-9-5-9-5z" />
                                    <path d="M12 8l1.5 3h3L13 15l-1.5-3h-3L12 8z" />
                                </svg>
                            </div>
                            {!collapsed && (
                                <div className="ml-2">
                                    <p className="font-semibold leading-none">Psy Web-App</p>
                                    {userEmail && <p className="text-xs text-slate-500">{userEmail}</p>}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Desktop-only collapse/expand toggle, positioned in header */}
                    <button
                        type="button"
                        onClick={() => setCollapsed((c) => !c)}
                        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        title={collapsed ? "Expand" : "Collapse"}
                        className={
                            "hidden md:grid h-9 w-9 place-items-center rounded-lg border border-white/60 bg-white/70 text-slate-700 shadow-sm backdrop-blur transition hover:bg-white absolute top-2 " +
                            (collapsed ? "right-0 translate-x-1/2 transform" : "right-2")
                        }
                    >
                        {collapsed ? (
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 6l6 6-6 6" />
                            </svg>
                        ) : (
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M15 6l-6 6 6 6" />
                            </svg>
                        )}
                    </button>
                </div>

                <nav className="flex-1 px-2 py-3">
                    <ul className="space-y-1.5">
                        {nav.map((item) => {
                            const isActive = item.path
                                ? (item.path === "/" ? currentPath === "/" : currentPath.startsWith(item.path))
                                : false;
                            const base =
                                "group flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition " +
                                (isActive ? "bg-sky-100 text-sky-800 ring-1 ring-sky-200" : "text-slate-700 hover:bg-sky-50 hover:text-sky-800");
                            return (
                                <li key={item.label}>
                                    {item.path ? (
                                        <button
                                            className={
                                                base +
                                                " " +
                                                (collapsed ? "justify-center gap-0" : "gap-3") +
                                                " " +
                                                (collapsed ? "w-12 mx-auto" : "w-full text-left")
                                            }
                                            onClick={() => onNavigate(item.path!)}
                                            title={item.label}
                                        >
                                            <span className="text-slate-500 group-hover:text-sky-700">{item.icon}</span>
                                            {!collapsed && <span>{item.label}</span>}
                                        </button>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                <div className={"border-t border-white/60 " + (collapsed ? "px-1 py-2" : "px-2 pb-3 pt-2")}>
                    <button
                        onClick={onLogout}
                        className={
                            "flex items-center rounded-xl text-sm font-medium text-rose-700 hover:bg-rose-50 hover:text-rose-800 transition " +
                            (collapsed ? "h-10 w-10 justify-center mx-auto" : "w-full gap-3 px-3 py-2.5")
                        }
                        title="Log out"
                    >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeWidth="2" d="M15 3h4a2 2 0 0 1 2 2v4M10 17l5-5-5-5M15 12H3" />
                        </svg>
                        {!collapsed && <span>Log out</span>}
                    </button>
                </div>
            </aside>
        </>
    );
}
