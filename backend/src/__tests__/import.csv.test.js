/**
 * Tests unitaires — Import CSV
 *
 * Couvre :
 *   ✅ Fichier valide → toutes les lignes importées
 *   ✅ Lignes sans email → ignorées
 *   ✅ Lignes sans first_name → ignorées
 *   ✅ Fichier entièrement invalide → 0 importés
 *   ✅ Doublons → gérés par ON CONFLICT (non bloquants)
 *   ✅ Fichier mixte (valide + invalide) → seules les valides passent
 */

import { describe, test, expect } from "@jest/globals";

// ── Row validation logic (mirrors importController.js) ────────────────────────

function isRowValid(row) {
  return !!(row.email && String(row.email).trim() &&
            row.first_name && String(row.first_name).trim());
}

function simulateImport(rows) {
  const valid   = [];
  const skipped = [];

  for (const row of rows) {
    if (isRowValid(row)) valid.push(row);
    else                  skipped.push(row);
  }

  // Simulate ON CONFLICT (email) DO NOTHING — dedup by email
  const seen    = new Set();
  const inserted = [];
  const duplicates = [];

  for (const row of valid) {
    if (seen.has(row.email)) duplicates.push(row);
    else { seen.add(row.email); inserted.push(row); }
  }

  return {
    total:      rows.length,
    valid:      valid.length,
    inserted:   inserted.length,
    duplicates: duplicates.length,
    skipped:    skipped.length,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Import CSV — validation et traitement des lignes", () => {

  test("fichier valide — toutes les lignes insérées", () => {
    const rows = [
      { first_name: "Alice", last_name: "Dupont",  email: "alice@test.com", source: "Web" },
      { first_name: "Bob",   last_name: "Martin",  email: "bob@test.com",   source: "LinkedIn" },
      { first_name: "Carla", last_name: "Bernard", email: "carla@test.com", source: "Event" },
    ];
    const result = simulateImport(rows);
    expect(result.inserted).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.duplicates).toBe(0);
  });

  test("lignes sans email → ignorées", () => {
    const rows = [
      { first_name: "Alice", last_name: "Dupont", email: "" },
      { first_name: "Bob",   last_name: "Martin", email: "bob@test.com" },
    ];
    const result = simulateImport(rows);
    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(1);
  });

  test("lignes sans first_name → ignorées", () => {
    const rows = [
      { first_name: "",      last_name: "Dupont", email: "alice@test.com" },
      { first_name: "Bob",   last_name: "Martin", email: "bob@test.com" },
    ];
    const result = simulateImport(rows);
    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(1);
  });

  test("fichier entièrement invalide → 0 insérés", () => {
    const rows = [
      { first_name: "",  email: "" },
      { first_name: "",  email: "" },
      { first_name: "X", email: "" },
    ];
    const result = simulateImport(rows);
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(3);
  });

  test("doublon email → dédupliqué (ON CONFLICT DO NOTHING)", () => {
    const rows = [
      { first_name: "Alice", email: "alice@test.com" },
      { first_name: "Alice", email: "alice@test.com" }, // doublon
    ];
    const result = simulateImport(rows);
    expect(result.valid).toBe(2);       // les deux passent la validation de ligne
    expect(result.inserted).toBe(1);    // mais un seul inséré (ON CONFLICT)
    expect(result.duplicates).toBe(1);
  });

  test("fichier mixte — seules les lignes valides passent", () => {
    const rows = [
      { first_name: "Alice", email: "alice@test.com" },  // ✅
      { first_name: "",      email: "" },                  // ❌
      { first_name: "Bob",   email: "bob@test.com"   },  // ✅
      { first_name: "Carla", email: "" },                  // ❌ sans email
      { first_name: "",      email: "x@test.com"     },  // ❌ sans first_name
    ];
    const result = simulateImport(rows);
    expect(result.inserted).toBe(2);
    expect(result.skipped).toBe(3);
  });
});
