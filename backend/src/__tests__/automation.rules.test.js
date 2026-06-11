/**
 * Tests unitaires — Règles d'automatisation marketing
 *
 * Couvre :
 *   ✅ Garde anti-spam 24h (alreadyNotified)
 *   ✅ Déclenchement règle seuil de score
 *   ✅ Non-déclenchement si lead converti
 *   ✅ Score exactement égal au seuil → déclenche
 *   ✅ Déclenchement règle inactivité
 *   ✅ Lead sans interaction → inactivité détectée
 *   ✅ Lead actif récemment → pas d'inactivité
 */

import { describe, test, expect } from "@jest/globals";

// ── alreadyNotified (mirrors schedulerService.js logic) ───────────────────────

function alreadyNotified(notifications, leadId, ruleId) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago
  return notifications.some(
    (n) =>
      n.lead_id === leadId &&
      n.rule_id === ruleId &&
      new Date(n.created_at) > cutoff
  );
}

// ── Score threshold rule ───────────────────────────────────────────────────────

function shouldTriggerScoreRule(lead, rule) {
  return (
    parseFloat(lead.current_score) >= rule.threshold &&
    lead.status !== "converted"
  );
}

// ── Inactivity rule ───────────────────────────────────────────────────────────

function shouldTriggerInactivityRule(lastInteractionDate, inactivityDays) {
  if (!lastInteractionDate) return true; // jamais eu d'interaction
  const diffMs   = Date.now() - new Date(lastInteractionDate).getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= inactivityDays;
}

// ── Tests : garde anti-spam ───────────────────────────────────────────────────

describe("Garde anti-spam 24h — alreadyNotified", () => {
  test("notification récente (1 sec) → déjà notifié", () => {
    const notifs = [{
      lead_id:    "lead-1",
      rule_id:    "rule-1",
      created_at: new Date(Date.now() - 1000).toISOString(),
    }];
    expect(alreadyNotified(notifs, "lead-1", "rule-1")).toBe(true);
  });

  test("notification ancienne (25h) → pas encore notifié", () => {
    const notifs = [{
      lead_id:    "lead-1",
      rule_id:    "rule-1",
      created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    }];
    expect(alreadyNotified(notifs, "lead-1", "rule-1")).toBe(false);
  });

  test("même règle mais lead différent → pas notifié", () => {
    const notifs = [{
      lead_id:    "lead-2",
      rule_id:    "rule-1",
      created_at: new Date().toISOString(),
    }];
    expect(alreadyNotified(notifs, "lead-1", "rule-1")).toBe(false);
  });

  test("même lead mais règle différente → pas notifié", () => {
    const notifs = [{
      lead_id:    "lead-1",
      rule_id:    "rule-99",
      created_at: new Date().toISOString(),
    }];
    expect(alreadyNotified(notifs, "lead-1", "rule-1")).toBe(false);
  });

  test("aucune notification existante → pas notifié", () => {
    expect(alreadyNotified([], "lead-1", "rule-1")).toBe(false);
  });
});

// ── Tests : règle seuil de score ──────────────────────────────────────────────

describe("Règle type score_threshold", () => {
  test("score > seuil, lead actif → déclenche", () => {
    const lead = { current_score: 80, status: "active" };
    const rule = { threshold: 70 };
    expect(shouldTriggerScoreRule(lead, rule)).toBe(true);
  });

  test("score exactement égal au seuil → déclenche", () => {
    const lead = { current_score: 70, status: "active" };
    const rule = { threshold: 70 };
    expect(shouldTriggerScoreRule(lead, rule)).toBe(true);
  });

  test("score < seuil → ne déclenche pas", () => {
    const lead = { current_score: 50, status: "active" };
    const rule = { threshold: 70 };
    expect(shouldTriggerScoreRule(lead, rule)).toBe(false);
  });

  test("score >= seuil mais lead déjà converti → ne déclenche pas", () => {
    const lead = { current_score: 90, status: "converted" };
    const rule = { threshold: 70 };
    expect(shouldTriggerScoreRule(lead, rule)).toBe(false);
  });

  test("score 0 et seuil 0 → déclenche", () => {
    const lead = { current_score: 0, status: "new" };
    const rule = { threshold: 0 };
    expect(shouldTriggerScoreRule(lead, rule)).toBe(true);
  });

  test("score null → ne déclenche pas (NaN < threshold)", () => {
    const lead = { current_score: null, status: "active" };
    const rule = { threshold: 50 };
    expect(shouldTriggerScoreRule(lead, rule)).toBe(false);
  });
});

// ── Tests : règle inactivité ──────────────────────────────────────────────────

describe("Règle type inactivity", () => {
  test("aucune interaction enregistrée → déclenche toujours", () => {
    expect(shouldTriggerInactivityRule(null, 7)).toBe(true);
  });

  test("inactif depuis 10j, règle 7j → déclenche", () => {
    const tenDaysAgo = new Date(
      Date.now() - 10 * 24 * 60 * 60 * 1000
    ).toISOString();
    expect(shouldTriggerInactivityRule(tenDaysAgo, 7)).toBe(true);
  });

  test("interagi il y a 3j, règle 7j → ne déclenche pas", () => {
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000
    ).toISOString();
    expect(shouldTriggerInactivityRule(threeDaysAgo, 7)).toBe(false);
  });

  test("inactif exactement depuis N jours → déclenche (borne incluse)", () => {
    const exactlyNDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    expect(shouldTriggerInactivityRule(exactlyNDaysAgo, 7)).toBe(true);
  });

  test("interagi aujourd'hui → ne déclenche pas même avec règle 1j", () => {
    const justNow = new Date(Date.now() - 60 * 1000).toISOString(); // 1 min ago
    expect(shouldTriggerInactivityRule(justNow, 1)).toBe(false);
  });

  test("règle 30j, inactif depuis 45j → déclenche", () => {
    const fortyFiveDaysAgo = new Date(
      Date.now() - 45 * 24 * 60 * 60 * 1000
    ).toISOString();
    expect(shouldTriggerInactivityRule(fortyFiveDaysAgo, 30)).toBe(true);
  });
});
