import type { Db } from "./db.js";

// Seed a couple of examples so the ZIP lookup is usable immediately. Operators add real
// non-emergency dispatch numbers for the areas they cover. 911 is the universal fallback.
export function seedDispatch(db: Db): void {
  if (db.listDispatch().length > 0) return;
  db.upsertDispatch({ zip: "00000", agency: "Emergency (fallback)", phone: "911", notes: "Universal emergency number" });
  db.upsertDispatch({ zip: "63130", agency: "University City Police (non-emergency)", phone: "314-725-2211", notes: "St. Louis / WashU area - verify before relying" });
}
