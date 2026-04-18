#!/bin/sh
# Railway start script — routes to the correct service based on BLADE_SERVICE env var
case "${BLADE_SERVICE}" in
  telegram)
    exec node apps/telegram/dist/index.js
    ;;
  warroom)
    exec python warroom/server.py
    ;;
  voice-proxy)
    exec python warroom/proxy.py
    ;;
  *)
    cd apps/web && exec npm run start -- -p "${PORT:-3000}"
    ;;
esac
