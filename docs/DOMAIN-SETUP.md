# Domain + nginx + TLS setup

A runbook for putting the Interview Assistant (or a copy of it) behind a public
subdomain with HTTPS, mirroring the `talent.candidatesbridge.com` setup.

Working example used throughout: **`interview-assistant.candidatesbridge.com`**, which
301-redirects to **`www.interview-assistant.candidatesbridge.com`** (the host that serves
the app). Substitute your own names where needed.

Architecture behind the `www` host:

```
                      ┌─────────── nginx (:443) ───────────┐
browser  ──TLS──▶     │  /api/  → 127.0.0.1:9011 (backend)  │
                      │  /      → 127.0.0.1:9012 (frontend) │
                      └─────────────────────────────────────┘
```

The committed nginx config lives at
[`docs/nginx/interview-assistant.candidatesbridge.com.conf`](nginx/interview-assistant.candidatesbridge.com.conf)
— it is the source of truth; `/etc/nginx/...` is a copy.

---

## 0. Prerequisites

- **DNS:** `A`/`AAAA` records for **both** names (`interview-assistant...` and
  `www.interview-assistant...`) pointing at this server. Verify before starting:
  ```bash
  dig +short interview-assistant.candidatesbridge.com
  dig +short www.interview-assistant.candidatesbridge.com
  ```
- **App running** on its ports (so nginx has something to proxy to):
  ```bash
  cd ~/interview-assistant
  npm run pm2:start        # builds + starts interview-api (9011) + interview-web (9012)
  pm2 save
  # sanity:
  curl -s localhost:9011/api/health      # {"ok":true}
  curl -s localhost:9012/ | grep title   # <title>Interview Assistant</title>
  ```
- `nginx` and `certbot` installed; the ACME webroot `/var/www/certbot` exists
  (`sudo mkdir -p /var/www/certbot`).

---

## 1. The chicken-and-egg problem (read this first)

The full config contains `listen 443 ssl` blocks that reference a certificate that does
**not exist yet**. If you install the full config before the cert exists, `nginx -t`
fails, nginx never reloads, the `:80` ACME-challenge block never goes live, and
`certbot --webroot` gets a **404**. (That is the exact failure we hit.)

So the order is: **HTTP-only block → get cert → full TLS config.**

---

## 2. Bootstrap: HTTP-only block so certbot can validate

Create a temporary HTTP-only config:

```bash
sudo tee /etc/nginx/sites-available/interview-assistant.candidatesbridge.com >/dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name interview-assistant.candidatesbridge.com www.interview-assistant.candidatesbridge.com;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type "text/plain";
    }
    location / { return 404; }
}
EOF

sudo ln -sfn /etc/nginx/sites-available/interview-assistant.candidatesbridge.com \
             /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Verify the challenge path is reachable **from the public URL** (this is what the CA does —
testing `127.0.0.1` can hit a different default server and mislead you):

```bash
echo "ok-$(date +%s)" | sudo tee /var/www/certbot/.well-known/acme-challenge/selftest >/dev/null
curl -s http://interview-assistant.candidatesbridge.com/.well-known/acme-challenge/selftest
sudo rm -f /var/www/certbot/.well-known/acme-challenge/selftest
```

You should see the `ok-...` string. If not, fix DNS / the `:80` block before continuing.

---

## 3. Get the certificate

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d interview-assistant.candidatesbridge.com \
  -d www.interview-assistant.candidatesbridge.com
```

Success writes `/etc/letsencrypt/live/interview-assistant.candidatesbridge.com/`
(`fullchain.pem`, `privkey.pem`). Certbot installs a renewal timer automatically.

---

## 4. Install the full TLS config

```bash
cd ~/interview-assistant
sudo cp docs/nginx/interview-assistant.candidatesbridge.com.conf \
        /etc/nginx/sites-available/interview-assistant.candidatesbridge.com
sudo nginx -t && sudo systemctl reload nginx
```

What the full config does:
- `:80` → serves ACME challenge, else 301 to `https://www....`
- `:443` apex → 301 to `https://www....`  ← **the redirect you asked for**
- `:443` www → proxies `/api/` to the backend and `/` to the frontend

---

## 5. Verify

```bash
curl -sI  http://interview-assistant.candidatesbridge.com/        | grep -iE '^HTTP|^location'  # 301 → www
curl -sI  https://interview-assistant.candidatesbridge.com/       | grep -iE '^HTTP|^location'  # 301 → www
curl -s   https://www.interview-assistant.candidatesbridge.com/   | grep -o '<title>[^<]*</title>'
curl -s   https://www.interview-assistant.candidatesbridge.com/api/models | head -c 80
```

---

## Gotchas we hit (so you don't again)

- **`vite preview` blocks unknown Host headers** → `403 Blocked request. This host ... is
  not allowed.` Two defenses, both already in place: the domain is listed in
  `web/vite.config.ts` → `preview.allowedHosts`, **and** the nginx frontend `location /`
  sends `proxy_set_header Host localhost;` (vite always allows `localhost`; a static SPA
  doesn't care about the upstream Host). If you add another host, do one of the two.
- **SSE streaming** must not be buffered. The `/api/` block sets `proxy_buffering off;`
  and 300s read/send timeouts; the backend also sends `X-Accel-Buffering: no`. Don't remove
  these or token streaming will arrive all-at-once or time out.
- **Test reachability via the public hostname, not `127.0.0.1`** — loopback can match a
  different `default_server` block and give misleading results.
- **Always `nginx -t` before `systemctl reload`.** A bad config won't reload, but a reload
  of a passing config is atomic and won't drop the other sites (talent, candidatesbridge).

---

## Renewal

Certbot's systemd timer renews automatically. The renewal uses the same webroot, which
keeps working as long as the `:80` ACME-challenge `location` stays in the config (it does).
Dry-run check:

```bash
sudo certbot renew --dry-run
```

After a real renewal nginx is reloaded by certbot's deploy hook; no manual step needed.
