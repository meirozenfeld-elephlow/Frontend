// src/scope/path.ts
// Org-only scoped path helpers for Firestore.
// All collections/docs must live under orgs/{orgId}/... . If orgId is missing,
// we throw a descriptive error to fail fast and avoid accidental writes to
// the wrong location.

import {
    collection,
    doc,
    type CollectionReference,
    type DocumentReference,
    type Firestore,
} from "firebase/firestore";
import { useScope } from "./ScopeContext";

type ScopedFns = {
    /** collection under current org scope: orgs/{orgId}/{sub} */
    collection: (db: Firestore, sub: string) => CollectionReference;
    /** doc under current org scope: orgs/{orgId}/{sub}/{id} */
    doc: (db: Firestore, sub: string, id: string) => DocumentReference;
    /** root org doc: orgs/{orgId} (useful for org-level prefs) */
    rootDoc: (db: Firestore) => DocumentReference;
};

export function useScopedRefs(): ScopedFns {
    const { scope } = useScope();

    function ensureOrg(): string {
        if (!scope.orgId) {
            // Security-minded message: developers must select org before querying/writing.
            throw new Error(
                "Scoped path requires an orgId, but none is selected. Ensure the user picks a clinic first."
            );
        }
        return scope.orgId;
    }

    function collectionScoped(db: Firestore, sub: string): CollectionReference {
        const orgId = ensureOrg();
        return collection(db, "orgs", orgId, sub);
    }

    function docScoped(db: Firestore, sub: string, id: string): DocumentReference {
        const orgId = ensureOrg();
        return doc(db, "orgs", orgId, sub, id);
    }

    function rootDoc(db: Firestore): DocumentReference {
        const orgId = ensureOrg();
        return doc(db, "orgs", orgId);
    }

    return { collection: collectionScoped, doc: docScoped, rootDoc };
}
