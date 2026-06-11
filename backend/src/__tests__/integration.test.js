/**
 * Tests d'intégration — Flux HTTP principaux
 *
 * Couvre (§5.5.3 rapport PFE) :
 *   ✅ POST /api/auth/login  — identifiants valides → 200 + JWT
 *   ✅ POST /api/auth/login  — mauvais mot de passe → 401
 *   ✅ POST /api/auth/login  — utilisateur inexistant → 401
 *   ✅ GET  /api/leads       — sans token → 401
 *   ✅ GET  /api/leads       — avec token valide → 200 + tableau
 *   ✅ POST /api/leads       — création lead complet → 200
 *   ✅ PUT  /api/opportunities/:id/stage → 200 + 3 appels pool.query
 *
 * Note :
 *   • leadController.createLead renvoie res.json() (code 200)
 *   • updateOpportunityStage effectue exactement 3 appels DB :
 *       1. SELECT stage FROM opportunities      (ancien stage)
 *       2. UPDATE opportunities SET stage       (mise à jour)
 *       3. INSERT INTO pipeline_history         (historique)
 */

import {
  describe, test, expect,
  beforeAll, beforeEach,
  jest,
} from "@jest/globals";

// ── Mocks ES-module (avant tout import dynamique) ─────────────────────────────

jest.unstable_mockModule("../config/db.js", () => ({
  default: { query: jest.fn() },
}));

jest.unstable_mockModule("../services/schedulerService.js", () => ({
  startScheduler:   jest.fn(),
  runAutomationJob: jest.fn(),
}));

jest.unstable_mockModule("bcrypt", () => ({
  default: {
    compare:  jest.fn(),
    hash:     jest.fn(),
    genSalt:  jest.fn(),
  },
}));

// db.js est mocké → son dotenv.config() ne s'exécute jamais. On fixe donc
// explicitement le secret JWT pour que la signature (login) et la vérification
// (authMiddleware) utilisent la même clé pendant les tests.
process.env.JWT_SECRET = "secretkey";

// ── Imports dynamiques (après les mocks) ──────────────────────────────────────

let request, app, pool, bcrypt, jwt;

beforeAll(async () => {
  const supertest = await import("supertest");
  request         = supertest.default;

  pool            = (await import("../config/db.js")).default;
  bcrypt          = (await import("bcrypt")).default;
  jwt             = (await import("jsonwebtoken")).default;
  app             = (await import("../app.js")).default;
});

// Vide les files mockResolvedValueOnce ET les compteurs entre chaque test
beforeEach(() => {
  jest.resetAllMocks();
});

// ── Helper ────────────────────────────────────────────────────────────────────

function makeToken(payload = { id: "user-uuid-1", role: "admin" }) {
  return jwt.sign(payload, process.env.JWT_SECRET || "secretkey", {
    expiresIn: "1d",
  });
}

// ── 1. Authentification ───────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  test("identifiants valides → 200 + token JWT", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        id:       "user-uuid-1",
        email:    "admin@crm.com",
        password: "$2b$10$hashedpassword",
        role:     "admin",
        name:     "Admin",
      }],
    });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@crm.com", password: "Admin1234!" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(typeof res.body.token).toBe("string");
  });

  test("mauvais mot de passe → 400", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        id:       "user-uuid-1",
        email:    "admin@crm.com",
        password: "$2b$10$hashedpassword",
        role:     "admin",
      }],
    });
    bcrypt.compare.mockResolvedValueOnce(false);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@crm.com", password: "wrong" });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  test("utilisateur inexistant → 400", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@crm.com", password: "whatever" });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });
});

// ── 2. Leads ─────────────────────────────────────────────────────────────────

describe("GET /api/leads", () => {
  test("sans token Authorization → 401 Access denied", async () => {
    const res = await request(app).get("/api/leads");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Access denied" });
    // authMiddleware court-circuite avant d'atteindre le contrôleur
    expect(pool.query).not.toHaveBeenCalled();
  });

  test("avec token valide → 200 + données leads", async () => {
    // Appel 1 : COUNT(*) pour pagination
    pool.query.mockResolvedValueOnce({ rows: [{ count: "2" }] });
    // Appel 2 : SELECT leads
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: "lead-1", first_name: "Alice", last_name: "Dupont",
          email: "alice@test.com", status: "active",
          current_score: 75, conversion_probability: 0.6, source: "Web",
        },
        {
          id: "lead-2", first_name: "Bob", last_name: "Martin",
          email: "bob@test.com", status: "new",
          current_score: 40, conversion_probability: 0.25, source: "LinkedIn",
        },
      ],
    });

    const res = await request(app)
      .get("/api/leads")
      .set("Authorization", `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    // getLeads renvoie { data, total, page, ... } ; on tolère aussi { leads } ou un tableau brut
    const leads = res.body.data ?? res.body.leads ?? res.body;
    expect(Array.isArray(leads)).toBe(true);
    expect(leads.length).toBeGreaterThanOrEqual(1);
  });
});

describe("POST /api/leads", () => {
  test("lead complet → 200 avec l'objet créé", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        id:         "lead-new-1",
        first_name: "Carla",
        last_name:  "Bernard",
        email:      "carla@test.com",
        status:     "new",
        source:     "Event",
      }],
    });

    const res = await request(app)
      .post("/api/leads")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({
        first_name: "Carla",
        last_name:  "Bernard",
        email:      "carla@test.com",
        source:     "Event",
      });

    // leadController.createLead utilise res.json() → code 200
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
    expect(res.body.email).toBe("carla@test.com");
  });
});

// ── 3. Opportunités — changement de stage ─────────────────────────────────────

describe("PUT /api/opportunities/:id/stage", () => {
  test("changement de stage → 200 + exactement 3 appels DB", async () => {
    const oppId = "opp-uuid-1";

    // Appel 1 : SELECT stage (ancien stage)
    pool.query.mockResolvedValueOnce({
      rows: [{ stage: "prospecting" }],
    });
    // Appel 2 : UPDATE opportunities SET stage … RETURNING *
    pool.query.mockResolvedValueOnce({
      rows: [{ id: oppId, stage: "negotiation", lead_id: "lead-1" }],
    });
    // Appel 3 : INSERT INTO pipeline_history
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put(`/api/opportunities/${oppId}/stage`)
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ stage: "negotiation" });

    expect(res.status).toBe(200);
    expect(res.body.stage).toBe("negotiation");
    // Vérifie les 3 appels DB (SELECT + UPDATE + INSERT)
    expect(pool.query).toHaveBeenCalledTimes(3);
  });

  test("stage closed_won enregistré dans pipeline_history", async () => {
    const oppId = "opp-uuid-2";

    pool.query
      .mockResolvedValueOnce({ rows: [{ stage: "proposal" }] })
      .mockResolvedValueOnce({
        rows: [{ id: oppId, stage: "closed_won", lead_id: "lead-2" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put(`/api/opportunities/${oppId}/stage`)
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ stage: "closed_won" });

    expect(res.status).toBe(200);
    expect(res.body.stage).toBe("closed_won");

    // Le 3e appel doit être l'INSERT pipeline_history
    const thirdCall = pool.query.mock.calls[2];
    expect(thirdCall[0]).toMatch(/INSERT INTO pipeline_history/i);
    expect(thirdCall[1]).toEqual(
      expect.arrayContaining(["proposal", "closed_won"])
    );
  });
});
