---
description: "Restart the Resume Suite dev servers — kills any running node/vite processes, ensures dev Postgres is up, then starts the Express API server and Vite dev server."
name: "dev-restart-servers"
agent: agent
tools: [run_in_terminal, get_terminal_output, send_to_terminal, kill_terminal]
---

Restart the WEB-Resume development environment. Work from `k:\PDS_AutomationSuite\WEB-Resume\ResumeServer`.

## Steps

### 1. Stop existing processes on dev ports

Kill anything bound to ports 38291 (Express) and 5173 (Vite):

```powershell
@(38291, 5173) | ForEach-Object {
  $port = $_
  $pids = netstat -ano | Select-String ":$port\s" | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
  $pids | Where-Object { $_ -match '^\d+$' } | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue; Write-Host "Killed PID $_ on :$port" }
}
```

### 2. Ensure dev Postgres is running

```powershell
cd k:\PDS_AutomationSuite\WEB-Resume\ResumeServer
docker compose -f docker-compose.dev.yml up -d
```

Wait ~2 seconds, then verify: `docker ps --filter name=resumeserver-db`.

### 3. Start the Express API server (async)

```powershell
cd k:\PDS_AutomationSuite\WEB-Resume\ResumeServer
node server/server.js
```

Run this **async** so the terminal stays open. Wait for the line:
`[server] Resume-Suite listening on port 38291` (the app name in the log is unchanged)

If startup fails, show the error and stop.

### 4. Start the Vite dev server (async)

```powershell
cd k:\PDS_AutomationSuite\WEB-Resume\ResumeServer\client
npm run dev
```

Run this **async**. Wait for the line:
`Local:   http://localhost:5173/`

### 5. Confirm

Print a summary:
```
✓ Postgres   — localhost:5433
✓ API server — http://localhost:38291
✓ Vite dev   — http://localhost:5173
```
