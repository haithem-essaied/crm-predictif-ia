#!/bin/bash
# ============================================================
#  CRM Prédictif IA — Script de démarrage rapide
#  Usage : bash start.sh
# ============================================================

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
PM2="$APPDATA/npm/pm2"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   CRM Prédictif IA — Démarrage PM2       ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Build frontend si nécessaire ──────────────────────────
if [ ! -d "$ROOT/frontend/build" ]; then
  echo "📦  Build du frontend React..."
  cd "$ROOT/frontend" && npm run build
  cd "$ROOT"
fi

# ── 2. Stopper les anciens processus ─────────────────────────
echo "🔄  Arrêt des anciens processus PM2..."
"$PM2" delete all 2>/dev/null || true

# ── 3. Démarrer les 3 services ───────────────────────────────
echo "🚀  Démarrage des services..."
"$PM2" start "$ROOT/ecosystem.config.js"

# ── 4. Sauvegarder l'état ────────────────────────────────────
"$PM2" save

echo ""
echo "✅  Tous les services sont démarrés !"
echo ""
echo "  📡  Backend  API  → http://localhost:3000"
echo "  🌐  Frontend CRM  → http://localhost:3001"
echo "  🤖  ML Service    → http://localhost:5001/docs"
echo ""
echo "  Commandes utiles :"
echo "    pm2 list          — état des processus"
echo "    pm2 logs          — logs en temps réel"
echo "    pm2 restart all   — redémarrer tout"
echo "    pm2 stop all      — arrêter tout"
echo ""
