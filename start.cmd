@echo off
REM ============================================================
REM  CRM Prédictif IA — Script de démarrage rapide (Windows)
REM  Usage : double-cliquer ou : start.cmd
REM ============================================================

SET ROOT=%~dp0
SET PM2=%APPDATA%\npm\pm2.cmd

echo.
echo  ================================================
echo   CRM Predictif IA -- Demarrage PM2
echo  ================================================
echo.

REM ── Build frontend si dossier build absent ──────────────────
IF NOT EXIST "%ROOT%frontend\build" (
  echo  [1/3] Build du frontend React...
  cd "%ROOT%frontend"
  call npm run build
  cd "%ROOT%"
) ELSE (
  echo  [1/3] Build React existant -- OK
)

REM ── Stopper les anciens processus ───────────────────────────
echo  [2/3] Arret des anciens processus PM2...
call "%PM2%" delete all 2>nul

REM ── Demarrer les 3 services ─────────────────────────────────
echo  [3/3] Demarrage des 3 services...
call "%PM2%" start "%ROOT%ecosystem.config.js"
call "%PM2%" save

echo.
echo  OK  Tous les services sont demarres !
echo.
echo    Backend  API  --^>  http://localhost:3000
echo    Frontend CRM  --^>  http://localhost:3001
echo    ML Service    --^>  http://localhost:5001/docs
echo.
echo  Commandes utiles :
echo    pm2 list         -- etat des processus
echo    pm2 logs         -- logs en temps reel
echo    pm2 restart all  -- redemarrer tout
echo    pm2 stop all     -- arreter tout
echo.
pause
