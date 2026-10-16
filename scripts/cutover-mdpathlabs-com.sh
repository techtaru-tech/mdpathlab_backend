#!/usr/bin/env bash
# Move the new platform onto mdpathlabs.com — run as root on the app server (66.116.254.20, cPanel).
# The old Laravel site and the mailboxes stay on the Plesk server (103.127.29.33); only the website records move.
#
#   bash cutover-mdpathlabs-com.sh prepare   # before the DNS change: serve mdpathlabs.com here, keep its mail remote
#   bash cutover-mdpathlabs-com.sh verify    # check this server answers for mdpathlabs.com (works before DNS too)
#   bash cutover-mdpathlabs-com.sh golive    # after the DNS change has propagated: SSL + switch the app's URLs
#   bash cutover-mdpathlabs-com.sh rollback  # put the app's URLs back to mdpathlab.techtaru.in
#
# Each phase can be re-run safely. Nothing here touches the Plesk server.
set -euo pipefail

DOMAIN=mdpathlabs.com
OLD_HOST=mdpathlab.techtaru.in
CPUSER=techtaru
APP_DIR=/home/techtaru/mdpathlab.techtaru.in
SERVER_IP=66.116.254.20

say() { printf '\n== %s\n' "$*"; }

set_env() { # set_env FILE KEY VALUE — replace or append, keep a .bak once per run
  local file=$1 key=$2 value=$3
  [ -f "$file.cutover.bak" ] || cp "$file" "$file.cutover.bak"
  if grep -q "^$key=" "$file"; then sed -i "s#^$key=.*#$key=$value#" "$file"; else echo "$key=$value" >>"$file"; fi
}

rebuild_restart() {
  su - "$CPUSER" -c "cd $APP_DIR && npm run build 2>&1 | tail -2 && cd web && npm run build 2>&1 | tail -1 && cd .. && pm2 restart mdpathlab-api mdpathlab-web --update-env >/dev/null && pm2 save >/dev/null"
}

case "${1:-}" in
  prepare)
    say "Serve $DOMAIN (+ www) from the same site as $OLD_HOST"
    if grep -q "$DOMAIN" "/var/cpanel/userdata/$CPUSER/$OLD_HOST" 2>/dev/null; then
      echo "already attached"
    else
      prev=$(whmapi1 get_tweaksetting key=allowremotedomains --output=json | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["tweaksetting"]["value"])')
      whmapi1 set_tweaksetting key=allowremotedomains value=1 >/dev/null     # the domain still points to Plesk
      whmapi1 create_parked_domain_for_user domain=$DOMAIN username=$CPUSER web_vhost_domain=$OLD_HOST --output=json \
        | python3 -c 'import sys,json;m=json.load(sys.stdin)["metadata"];print(m["result"],m["reason"])'
      whmapi1 set_tweaksetting key=allowremotedomains value="$prev" >/dev/null
    fi
    say "Mail for $DOMAIN stays on the Plesk server (remote) — never delivered into this server"
    uapi --user=$CPUSER Email setmxcheck domain=$DOMAIN mxcheck=remote >/dev/null
    echo "remotedomains: $(grep -cx $DOMAIN /etc/remotedomains)  localdomains: $(grep -cx $DOMAIN /etc/localdomains || true)"
    say "Apache config"
    apachectl -t 2>&1 | tail -1
    ;;

  verify)
    say "This server answering for $DOMAIN (bypassing public DNS)"
    for path in / /api/support/pages /api/catalogue/packages; do
      printf '%-28s ' "$path"
      curl -sk -o /dev/null -w '%{http_code} %{size_download}b\n' --resolve "$DOMAIN:443:$SERVER_IP" "https://$DOMAIN$path"
    done
    say "Public DNS today"
    dig +short A $DOMAIN; dig +short A www.$DOMAIN; dig +short MX $DOMAIN
    ;;

  golive)
    say "DNS must already point here"
    [ "$(dig +short A $DOMAIN @8.8.8.8 | tail -1)" = "$SERVER_IP" ] || { echo "A record for $DOMAIN is not $SERVER_IP yet — change it in Plesk first"; exit 1; }
    say "SSL certificate (AutoSSL / Let's Encrypt)"
    /usr/local/cpanel/bin/autossl_check --user=$CPUSER || true
    say "App URLs -> https://$DOMAIN"
    set_env "$APP_DIR/.env" PUBLIC_API_URL "https://$DOMAIN/api"
    set_env "$APP_DIR/.env" APP_PUBLIC_URL "https://$DOMAIN"
    set_env "$APP_DIR/web/.env" VITE_API_URL "https://$DOMAIN/api"
    chown $CPUSER:$CPUSER "$APP_DIR/.env" "$APP_DIR/web/.env"; chmod 600 "$APP_DIR/.env"
    rebuild_restart
    "$0" verify
    echo
    echo "Kept working on purpose: https://$OLD_HOST/api (the apps call it) and https://$OLD_HOST (website)."
    ;;

  rollback)
    say "App URLs back to https://$OLD_HOST"
    for f in "$APP_DIR/.env" "$APP_DIR/web/.env"; do [ -f "$f.cutover.bak" ] && cp "$f.cutover.bak" "$f"; done
    rebuild_restart
    echo "Now set the A records for $DOMAIN and www back to 103.127.29.33 in Plesk."
    ;;

  *)
    sed -n '2,12p' "$0"; exit 1 ;;
esac
