/**
 * aiService.js — HTTP client for the Python ML microservice.
 *
 * Calls:
 *   POST http://localhost:5001/predict/score       → { score: 0-100 }
 *   POST http://localhost:5001/predict/conversion  → { conversion_probability: 0-1 }
 *
 * The ML service accepts "interactions" as a raw list so Node.js never
 * has to aggregate anything itself.
 */

const ML_URL = process.env.ML_SERVICE_URL || "http://localhost:5001";

async function callML(endpoint, payload) {
  const response = await fetch(`${ML_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`ML service responded with ${response.status}`);
  }

  return response.json();
}

/**
 * @param {string} leadId  - UUID of the lead
 * @param {string} source  - acquisition source ("LinkedIn", "Web", …)
 * @param {Array}  interactions - rows from the interactions table
 *   Each object: { type, channel, duration }
 * @returns {Promise<{score: number}>}
 */
export async function scoreLeadWithAI(leadId, source, interactions, createdAt = null) {
  return callML("/predict/score", {
    lead_id:    leadId,
    source,
    interactions,
    created_at: createdAt ? new Date(createdAt).toISOString() : null,
  });
}

/**
 * @returns {Promise<{conversion_probability: number}>}
 */
export async function convertLeadWithAI(leadId, source, interactions, createdAt = null) {
  return callML("/predict/conversion", {
    lead_id:    leadId,
    source,
    interactions,
    created_at: createdAt ? new Date(createdAt).toISOString() : null,
  });
}
