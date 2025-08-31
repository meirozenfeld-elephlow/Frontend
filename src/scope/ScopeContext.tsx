// src/scope/ScopeContext.tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, setDoc, updateDoc, type DocumentData } from "firebase/firestore";

type ScopeMode = "org";
export type AppScope = {
    mode: ScopeMode;       // always "org"
    orgId: string | null;  // null until selected
    orgName?: string | null;
};

export type MyOrg = {
    id: string;
    name: string;
    role: "owner" | "admin" | "member";
    joinedAt?: Date | null;
};

type Ctx = {
    scope: AppScope;
    setOrg: (orgId: string, orgName?: string | null) => Promise<void>;
    myOrgs: MyOrg[];
    loading: boolean;
    error?: string | null;
};

const ScopeContext = createContext<Ctx | null>(null);

export function ScopeProvider({ children }: { children: React.ReactNode }) {
    const [authUser, setAuthUser] = useState<User | null>(null);

    const [scope, setScope] = useState<AppScope>({ mode: "org", orgId: null, orgName: null });
    const [myOrgs, setMyOrgs] = useState<MyOrg[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 1) Auth
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => setAuthUser(u));
        return () => unsub();
    }, []);

    // 2) Persisted scope from users/{uid}.scope
    useEffect(() => {
        if (!authUser) {
            setScope({ mode: "org", orgId: null, orgName: null });
            return;
        }
        const userDocRef = doc(db, "users", authUser.uid);
        const unsub = onSnapshot(
            userDocRef,
            (snap) => {
                const d = snap.data() as DocumentData | undefined;
                const persisted = d?.scope;
                if (persisted?.mode === "org" && persisted?.orgId) {
                    setScope({ mode: "org", orgId: persisted.orgId, orgName: persisted.orgName ?? null });
                } else {
                    setScope({ mode: "org", orgId: null, orgName: null });
                }
            },
            (e) => setError(e.message)
        );
        return () => unsub();
    }, [authUser?.uid]);

    // 3) users/{uid}/orgMemberships → myOrgs
    useEffect(() => {
        if (!authUser) {
            setMyOrgs([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);

        const memCol = collection(db, "users", authUser.uid, "orgMemberships");
        const unsub = onSnapshot(
            memCol,
            async (snap) => {
                try {
                    const rows: MyOrg[] = await Promise.all(
                        snap.docs.map(async (d) => {
                            const { role, joinedAt } = (d.data() as any) || {};
                            const orgId = d.id;
                            const orgRef = doc(db, "orgs", orgId);
                            const orgSnap = await getDoc(orgRef);
                            const name = (orgSnap.exists() && (orgSnap.data() as any).name) || "Clinic";
                            return {
                                id: orgId,
                                name,
                                role: (role as MyOrg["role"]) || "member",
                                joinedAt: joinedAt?.toDate?.() ?? null,
                            };
                        })
                    );
                    setMyOrgs(rows);
                    setLoading(false);
                } catch (e: any) {
                    setError(e.message || "Failed loading org memberships");
                    setLoading(false);
                }
            },
            (e) => {
                setError(e.message);
                setLoading(false);
            }
        );
        return () => unsub();
    }, [authUser?.uid]);

    // 4) Auto-pick org if none selected but memberships exist
    useEffect(() => {
        if (!authUser) return;
        if (scope.orgId) return;       // already have a selection (from persisted scope)
        if (loading) return;
        if (myOrgs.length === 0) return;

        // Prefer most recently joined; fallback to alphabetical
        const sorted = [...myOrgs].sort((a, b) => {
            const at = a.joinedAt?.getTime?.() ?? 0;
            const bt = b.joinedAt?.getTime?.() ?? 0;
            if (bt !== at) return bt - at;
            return (a.name || "").localeCompare(b.name || "");
        });
        const pick = sorted[0];
        setOrg(pick.id, pick.name).catch(() => { /* ignore */ });
    }, [authUser?.uid, scope.orgId, loading, myOrgs.map(o => o.id).join(",")]);

    // API: select org (persist to users/{uid}.scope)
    const setOrg = useCallback(
        async (orgId: string, orgName?: string | null) => {
            if (!orgId) throw new Error("setOrg: missing orgId");
            setScope({ mode: "org", orgId, orgName: orgName ?? null });
            if (authUser) {
                try {
                    await updateDoc(doc(db, "users", authUser.uid), {
                        scope: { mode: "org", orgId, orgName: orgName ?? null },
                    });
                } catch {
                    // אם המסמך עדיין לא קיים מסיבה כלשהי
                    await setDoc(
                        doc(db, "users", authUser.uid),
                        { scope: { mode: "org", orgId, orgName: orgName ?? null } },
                        { merge: true }
                    );
                }
            }
        },
        [authUser?.uid]
    );

    const value = useMemo(() => ({ scope, setOrg, myOrgs, loading, error }), [scope, setOrg, myOrgs, loading, error]);
    return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope() {
    const ctx = useContext(ScopeContext);
    if (!ctx) throw new Error("useScope must be used within ScopeProvider");
    return ctx;
}
