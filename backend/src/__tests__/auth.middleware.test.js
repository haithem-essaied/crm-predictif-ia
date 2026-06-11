/**
 * Tests unitaires — Middleware JWT
 *
 * Couvre :
 *   ✅ Token valide → next() appelé
 *   ✅ Aucun header → 401
 *   ✅ Token expiré → 401
 *   ✅ Token malformé → 401
 *   ✅ Mauvais secret → 401
 */

import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import authMiddleware from "../middleware/authMiddleware.js";

const SECRET = "secretkey";
// authMiddleware vérifie le token avec process.env.JWT_SECRET : on aligne
// l'environnement de test sur le même secret que celui utilisé pour signer.
process.env.JWT_SECRET = SECRET;

describe("Middleware JWT — authMiddleware", () => {
  let mockRes, mockNext;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json:   jest.fn(),
    };
    mockNext = jest.fn();
  });

  // ── Tests positifs ────────────────────────────────────────────────────────

  test("token valide → next() appelé et req.user défini", () => {
    const token = jwt.sign({ id: "user-1", role: "admin" }, SECRET, {
      expiresIn: "1d",
    });
    const req = { headers: { authorization: `Bearer ${token}` } };

    authMiddleware(req, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe("user-1");
    expect(req.user.role).toBe("admin");
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  // ── Tests négatifs ────────────────────────────────────────────────────────

  test("aucun header Authorization → 401 Access denied", () => {
    const req = { headers: {} };

    authMiddleware(req, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: "Access denied" });
    expect(mockNext).not.toHaveBeenCalled();
  });

  test("token expiré → 400 Invalid token", () => {
    // expiresIn: 0 crée un token immédiatement expiré
    const token = jwt.sign({ id: "user-1" }, SECRET, { expiresIn: 0 });
    const req = { headers: { authorization: `Bearer ${token}` } };

    authMiddleware(req, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: "Invalid token" });
    expect(mockNext).not.toHaveBeenCalled();
  });

  test("token malformé (chaîne aléatoire) → 400 Invalid token", () => {
    const req = {
      headers: { authorization: "Bearer this.is.not.a.valid.jwt.token" },
    };

    authMiddleware(req, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test("mauvais secret de signature → 400 Invalid token", () => {
    const token = jwt.sign({ id: "user-1" }, "wrong_secret_key");
    const req = { headers: { authorization: `Bearer ${token}` } };

    authMiddleware(req, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  test("header sans 'Bearer' prefix → 400", () => {
    const token = jwt.sign({ id: "user-1" }, SECRET);
    // Envoi direct sans le préfixe "Bearer "
    const req = { headers: { authorization: token } };

    authMiddleware(req, mockRes, mockNext);

    // jwt.verify reçoit undefined (split(" ")[1]) → erreur JWT
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });
});
