# Moving the new platform to mdpathlabs.com

The new platform (API + website) keeps running on the app server **66.116.254.20** (cPanel), where it already runs as
`mdpathlab.techtaru.in`. Only the **website records** of mdpathlabs.com move there. The old Laravel site and the
**mailboxes stay on the Plesk server 103.127.29.33** — nothing on it is changed except two DNS records at go-live.

Why not run it on the Plesk server: its subscription has only MariaDB (the platform needs PostgreSQL and Redis), and
its SSH is a restricted shell (no node, git, php, mysql).

## Today's DNS (managed in Plesk — ns1/ns2.mdpathlabs.com)

| Record | Value | At go-live |
|---|---|---|
| `mdpathlabs.com` A | 103.127.29.33 | **→ 66.116.254.20** |
| `www.mdpathlabs.com` | 103.127.29.33 | **→ 66.116.254.20** |
| `mail.mdpathlabs.com` A | 103.127.29.33 | keep |
| MX | 10 mail.mdpathlabs.com | keep |
| TXT SPF | `v=spf1 +a +mx include:spf.brevo.com -all` | **change `+a` → `ip4:103.127.29.33`** (so mail sent from Plesk still passes SPF once `@` points elsewhere) |
| TXT brevo-code | … | keep |

Mailboxes in use: info@ (1.7 GB), admin@, noreply@, opmaurya@ — untouched.

## Steps

1. **A day before** — in Plesk → mdpathlabs.com → DNS: lower the TTL of the `@` and `www` records to 300 s (today 3 h),
   so the switch and any rollback take minutes.
2. **App server:** `bash scripts/cutover-mdpathlabs-com.sh prepare` then `… verify` — the site and API answer for
   mdpathlabs.com on this server (tested with `--resolve`, before any DNS change). Mail for the domain stays remote.
3. **Outside services — add mdpathlabs.com** (before go-live):
   - Razorpay dashboard → website/app details (and keep the webhook URL as it is, it works on either host).
   - Google Cloud → the Maps API key's allowed websites: `https://mdpathlabs.com/*`, `https://www.mdpathlabs.com/*`.
   - Firebase → the web API key's allowed websites, if restricted.
4. **Go-live** — in Plesk DNS: `@` and `www` → **66.116.254.20**, update the SPF line as above. Wait until
   `dig +short mdpathlabs.com @8.8.8.8` shows 66.116.254.20, then on the app server:
   `bash scripts/cutover-mdpathlabs-com.sh golive` (SSL certificate, app URLs → mdpathlabs.com, rebuild, checks).
5. **Check:** home, login (OTP), a test booking with pay at collection, report email links, admin and lab login.
6. **Rollback** (if needed): `bash scripts/cutover-mdpathlabs-com.sh rollback` and set the two A records back to
   103.127.29.33.

`mdpathlab.techtaru.in` keeps working throughout — the apps call `https://mdpathlab.techtaru.in/api`; change their base
URL in a later app release, not on the day.

## Old site — separate, do not mix with the move

Its files `.env`, `backup.zip`, `storage/logs/laravel.log` are publicly downloadable today (document root is the
project root, not `public/`). Fix on the Plesk server when approved: document root → `httpdocs/public`, move the zips
out of `httpdocs`, `APP_ENV=production` / `APP_DEBUG=false`, then rotate the DB and panel passwords.
