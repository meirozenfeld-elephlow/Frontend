// src/utils/emailIndex.ts
// Global email → userId index, independent from org scoping.
// We keep this top-level so that invites/lookup by email remain efficient.
// NOTE: This does NOT store PII beyond what is necessary for UX.

import { setDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export async function upsertEmailIndex(user: {
  uid: string;
  email?: string | null;
  firstName?: string;
  lastName?: string;
}) {
  if (!user.email) return;
  const key = user.email.trim().toLowerCase();
  await setDoc(
    doc(db, "emailIndex", key),
    {
      userId: user.uid,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
