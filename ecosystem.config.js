/**
 * PM2 Ecosystem — CRM Prédictif IA
 *
 * 3 processus :
 *   1. crm-backend   — API Express/Node.js        (port 3000)
 *   2. crm-frontend  — Build React servi par serve (port 3001)
 *   3. crm-ml        — FastAPI/uvicorn             (port 5001)
 *
 * Démarrage :
 *   pm2 start ecosystem.config.js
 *
 * Autres commandes :
 *   pm2 list                  → état des processus
 *   pm2 logs                  → logs en temps réel (tous)
 *   pm2 logs crm-backend      → logs d'un seul service
 *   pm2 restart all           → redémarre tout
 *   pm2 stop all              → arrête tout
 *   pm2 delete all            → supprime de PM2
 *   pm2 save                  → sauvegarde la liste (pour pm2 startup)
 */

const path = require("path");

const ROOT = __dirname;

module.exports = {
  apps: [
    // ── 1. Backend Node.js ──────────────────────────────────────────────────
    {
      name: "crm-backend",
      script: path.join(ROOT, "backend", "src", "server.js"),
      cwd: path.join(ROOT, "backend"),
      interpreter: "node",
      interpreter_args: "--experimental-vm-modules",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV:    "production",
        PORT:        "3000",
        DB_USER:     "postgres",
        DB_HOST:     "localhost",
        DB_NAME:     "crm_predictif_db",
        DB_PORT:     "5432",
        ML_URL:      "http://localhost:5001",
        // Les secrets (JWT_SECRET, DB_PASSWORD) ne sont pas définis ici :
        // ils sont chargés depuis backend/.env via dotenv, afin de ne jamais
        // les versionner en clair dans le dépôt Git.
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: path.join(ROOT, "logs", "backend-error.log"),
      out_file:   path.join(ROOT, "logs", "backend-out.log"),
      merge_logs: true,
    },

    // ── 2. Frontend React (build statique) ──────────────────────────────────
    // Sur Windows, `serve` est un .cmd — on lance son JS directement via node
    {
      name: "crm-frontend",
      script: path.join(
        process.env.APPDATA || "C:\\Users\\haithem\\AppData\\Roaming",
        "npm", "node_modules", "serve", "build", "main.js"
      ),
      args: ["-s", path.join(ROOT, "frontend", "build"), "-l", "3001"],
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: path.join(ROOT, "logs", "frontend-error.log"),
      out_file:   path.join(ROOT, "logs", "frontend-out.log"),
      merge_logs: true,
    },

    // ── 3. ML Microservice FastAPI/uvicorn ──────────────────────────────────
    {
      name: "crm-ml",
      script: path.join(ROOT, "ml-service", "app.py"),
      interpreter: "python",
      cwd: path.join(ROOT, "ml-service"),
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        ML_PORT: "5001",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: path.join(ROOT, "logs", "ml-error.log"),
      out_file:   path.join(ROOT, "logs", "ml-out.log"),
      merge_logs: true,
    },
  ],
};
