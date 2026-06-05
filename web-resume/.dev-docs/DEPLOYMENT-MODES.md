# Deployment Modes — Resume Suite

**Last Updated**: 2026-06-03

This document explains the three deployment modes available for Resume Suite and when to use each.

---

## Quick Reference

| Mode | URL | Access | Setup Time | TLS |
|------|-----|--------|-----------|-----|
| **Local** | http://localhost:5173 | Localhost only | < 2 min | None |
| **LAN** | https://192.168.1.80 | LAN + optional forwarding | ~ 5 min | Self-signed |
| **Production** | https://pds-resume-suite.mywire.org | Public internet | ~ 30 min | Let's Encrypt |
| **Railway** | https://pds-resume-suite.railway.app | Public internet | Cloud-managed | Let's Encrypt |

---

## Mode 1: Local Development

### Purpose
Development on your machine. No network access needed.

### How to Start
```powershell
cd K:\PDS-Master-001\WEB-Resume\ResumeServer
./start-dev-modes.ps1 -Mode local
```

Or interactively:
```powershell
./start-dev-modes.ps1
# Choose: 1
```

### What Runs
- **PostgreSQL**: `docker-compose.dev.yml` (exposed on `localhost:5433`)
- **Express Server**: `npm run dev` (port 38291)
- **Vite Client**: `npm run dev` (port 5173)
- **Caddy**: Not used

### URLs
- Client (dev): **http://localhost:5173**
- API (direct): **http://localhost:38291**
- Database: **postgres://localhost:5433**

### Environment
- `.env` → `DEPLOY_MODE=local`
- `NODE_ENV=development`
- Database: local dev defaults (user: `resumesuite`, password: `devpassword`)

### Logs
Terminal windows show live output. Ctrl+C to stop all services.

### When to Use
- Daily development
- Testing new features
- Debugging client/server interaction

---

## Mode 2: LAN / Pseudo-Production

### Purpose
Share your app with a few people on the same network with HTTPS (self-signed).

### Prerequisites
- LAN IP address (e.g., `192.168.1.80`)
- OpenSSL or Windows 2016+ for cert generation
- Optional: Port forwarding on router for external access

### How to Start
```powershell
cd K:\PDS-Master-001\WEB-Resume\ResumeServer
./start-dev-modes.ps1 -Mode lan
```

### What Runs
- **PostgreSQL**: Docker service
- **Express Server**: Docker container (port 38291)
- **Vite Client**: Optional (client/dist mounted into container)
- **Caddy**: Reverse proxy with self-signed HTTPS on port 443

### URLs
- **https://192.168.1.80** (self-signed cert)
- Optionally: **https://resumesuite.local** (if hostname is added to hosts file)

### TLS Certificate
- Generated automatically on first run: `certs/cert.pem`, `certs/key.pem`
- 365-day validity
- Browser shows security warning (click "Advanced" → "Proceed")

### Environment
- `.env` → `DEPLOY_MODE=lan`
- `NODE_ENV=production`
- `LAN_IP=192.168.1.80`
- Self-signed cert location: `certs/cert.pem`, `certs/key.pem`

### External Access (Optional)
To allow external access from the internet:

1. **Port Forward on Router**
   - Open `http://192.168.1.1` (or your router admin panel)
   - Add port forward: `External 443 → 192.168.1.80:443`
   - Add port forward: `External 80 → 192.168.1.80:80` (Caddy HTTP redirect)

2. **Share Public IP**
   - Your public IP: Check on [whatismyipaddress.com](https://whatismyipaddress.com)
   - Share: `https://<your-public-ip>` with limited people
   - Note: IP changes if your ISP uses dynamic IPs (use DDNS for stability)

### Logs
```bash
docker compose logs -f app       # App logs
docker compose logs -f caddy     # Caddy logs
docker compose logs -f db        # Database logs
```

### When to Use
- Demo to a small group on LAN
- Testing against "production-like" environment
- Pre-production validation before going full public

---

## Mode 3: Production (DDNS + Let's Encrypt)

### Purpose
Public internet deployment with automatic HTTPS certificate.

### Prerequisites
- Dynu DDNS account (free tier available)
- Public IP address (usually dynamic via ISP)
- Ports 80 + 443 forwarded on router
- Domain name (Dynu provides free .mywire.org domains)

### Setup Steps

#### 1. Get Dynu Credentials
```
1. Go to https://www.dynu.com (sign up free)
2. Add a DDNS domain or use existing (e.g., pds-resume-suite.mywire.org)
3. Get API token from: https://www.dynu.com/ControlPanel/DynamicDNS/API
```

#### 2. Update .env
```
DEPLOY_MODE=production
DDNS_DOMAIN=pds-resume-suite.mywire.org
DYNU_TOKEN=<your-token>
POSTGRES_PASSWORD=<strong-password>
JWT_SECRET=<64-char-random>
```

#### 3. Port Forward on Router
- External 80 → 192.168.1.80:80
- External 443 → 192.168.1.80:443

#### 4. Start Services
```powershell
./start-dev-modes.ps1 -Mode production
```

Or after manual Docker setup:
```bash
docker compose up -d
```

#### 5. Verify DNS
```bash
nslookup pds-resume-suite.mywire.org
# Should resolve to your public IP
```

#### 6. Setup Auto-IP Updates (Optional)
Register the Dynu update task to auto-update IP every 5 minutes:
```powershell
./register-scheduled-task-dynu.ps1  # Run as Administrator
```

Or run manually in the background:
```powershell
./dynu-update.ps1  # Runs in continuous loop
```

### What Runs
- **PostgreSQL**: Docker service (backed by volume)
- **Express Server**: Docker container
- **Vite Client**: Static build mounted into container
- **Caddy**: Reverse proxy with Let's Encrypt HTTPS

### URLs
- **https://pds-resume-suite.mywire.org** (trusted cert, no warning)
- Public IP also works: **https://24.101.223.202** (shows cert warning for IP, but trusted after first visit)

### Environment
- `.env` → `DEPLOY_MODE=production`
- `NODE_ENV=production`
- `DDNS_DOMAIN=pds-resume-suite.mywire.org`
- `DYNU_TOKEN=<token>` (auto-updates IP)

### Certificate Renewal
- Caddy handles all renewal automatically
- Certs stored in Docker volume `caddy-data` (persists across restarts)
- Renewal attempts every 30 days before expiration

### IP Updates
- `dynu-update.ps1` runs every 5 minutes (if scheduled)
- Logs to `.dynu-update.log`
- Updates only if IP has changed

### When to Use
- Production deployment
- Public access required
- Proper HTTPS needed (no browser warnings)
- Stable, trustworthy deployment

### Troubleshooting

**Cert not auto-renewing**
```bash
docker compose logs -f caddy
# Check for Let's Encrypt challenge errors
```

**Domain not resolving**
```bash
nslookup pds-resume-suite.mywire.org
# Wait 5-10 minutes after port forward setup
```

**IP not updating**
```bash
Get-Content ResumeServer\.dynu-update.log
# Check for API errors; verify token is valid
```

---

## Mode 4: Railway (Cloud Deployment)

### Purpose
Fully managed cloud deployment via Railway.app.

### Prerequisites
- Railway account (free tier: 10 GB/month)
- GitHub repository (Railway deploys from Git)
- Railway CLI (`railway` command)

### Setup Steps

#### 1. Create Railway Project
```bash
railway init
# Follow prompts to link to Railway account
```

#### 2. Set Environment Variables
```bash
railway variables set \
  NODE_ENV=production \
  JWT_SECRET=<64-char-random> \
  POSTGRES_PASSWORD=<strong-password> \
  LLM_API_URL=http://your-llm-api \
  DDNS_DOMAIN=pds-resume-suite.mywire.org
```

#### 3. Deploy
```bash
railway up
```

#### 4. View Domain
```bash
railway open
# Railway assigns a URL like: pds-resume-suite.railway.app
```

### When to Use
- Don't want to manage Docker/ports
- Need automatic scaling
- Want zero-maintenance deployments
- Prefer managed database

### Limitations
- Free tier: 10 GB/month (storage + networking)
- Public IPs not available (use Railway-assigned domain)
- Custom domains require upgrade

---

## Switching Modes

### From Local → LAN
```powershell
./start-dev-modes.ps1 -Mode lan
# Automatically:
# 1. Generates self-signed cert (if needed)
# 2. Starts full Docker stack
# 3. Mounts client build
```

### From LAN → Production
```powershell
./start-dev-modes.ps1 -Mode production
# Make sure .env has:
# - DDNS_DOMAIN
# - DYNU_TOKEN
# - POSTGRES_PASSWORD
# - Router ports 80+443 forwarded
```

### Cleanup Between Modes
```bash
docker compose down -v   # Stop and remove volumes
docker compose -f docker-compose.dev.yml down  # Stop dev stack
```

---

## Connection Files

Mode-specific connection info is documented in:
- `CONNECTION.txt` (current mode)
- `.dev-docs/CONNECTION-{mode}.txt` (template for each mode)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│            Resume Suite Deployment Modes                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  LOCAL DEV              LAN/PSEUDO-PROD  PRODUCTION     │
│  ──────────             ──────────────    ────────────  │
│                                                         │
│  Client:                Client (browser)  Client        │
│  localhost:5173  ──→    Caddy :443   ──→ Caddy         │
│                         (self-signed)     (Let's Enc)   │
│       ↓                       ↓                ↓         │
│  Vite dev                                              │
│       ↓                       ↓                ↓         │
│  Express :38291         Express :38291   Express       │
│  (node --watch)         (Docker)          (Docker)      │
│       ↓                       ↓                ↓         │
│  PostgreSQL             PostgreSQL        PostgreSQL    │
│  :5433 (Docker)         :5432 (Docker)    (Docker)      │
│                                                         │
│  Access:                Access:           Access:       │
│  localhost              LAN IP + opt fwd  Public DNS    │
│  (no TLS)               (self-signed TLS) (Let's Enc)   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## See Also
- [.env.example](.env.example) — Environment variables
- [docker-compose.yml](docker-compose.yml) — Production Docker stack
- [docker-compose.dev.yml](docker-compose.dev.yml) — Local dev Docker stack
- [Caddyfile](Caddyfile) — HTTP reverse proxy config
- [.caddyfiles/](.caddyfiles/) — Caddyfile templates per mode
