#!/usr/bin/env bash
# Loads sample activity (charges, receipts, a vendor bill, an expense, an agreement, a notice) into a RUNNING local API.
# Usage: SEED_PASSWORD=your-seed-password bash scripts/demo-data.sh
# Local development only: the in-memory database is reset every time the API restarts.
set -euo pipefail
API=${API:-http://localhost:8080/api/v1}
PW=${SEED_PASSWORD:?set SEED_PASSWORD to the password the API was started with}
J='Content-Type: application/json'
M=$(curl -s -X POST "$API/auth/login" -H "$J" -d "{\"email\":\"manager@shivranjan.local\",\"password\":\"$PW\"}" | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
H="Authorization: Bearer $M"
P=$(date +%Y-%m); TODAY=$(date +%Y-%m-%d)

curl -s -o /dev/null -X POST "$API/charges/generate" -H "$H" -H "$J" -d "{\"period\":\"$P\",\"maintenance\":3000,\"sinking\":500,\"repair\":250}"
FL=$(curl -s "$API/maintenance?period=$P" -H "$H" | python -c "import sys,json;d=json.load(sys.stdin);print(' '.join(x['flatId'] for x in d[:14]))")
n=0
for f in $FL; do
  n=$((n+1)); amt=3000; [ $((n % 4)) -eq 0 ] && amt=1500
  curl -s -o /dev/null -X POST "$API/receipts" -H "$H" -H "$J" -d "{\"flatId\":\"$f\",\"fund\":\"MAINTENANCE\",\"period\":\"$P\",\"amount\":$amt,\"paidOn\":\"$TODAY\",\"mode\":\"UPI\"}"
done
V=$(curl -s "$API/vendors" -H "$H" | python -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
curl -s -o /dev/null -X POST "$API/vendors/$V/invoices" -H "$H" -H "$J" -d "{\"invoiceDate\":\"$TODAY\",\"amount\":18500,\"description\":\"Quarterly lift service\"}"
curl -s -o /dev/null -X POST "$API/ledger" -H "$H" -H "$J" -d "{\"entryDate\":\"$TODAY\",\"type\":\"DEBIT\",\"category\":\"Stationery & office\",\"amount\":2400,\"mode\":\"CASH\",\"description\":\"Registers and printer paper\"}"
F=$(echo "$FL" | cut -d' ' -f1)
END=$(python -c "import datetime;print(datetime.date.today()+datetime.timedelta(days=18))")
curl -s -o /dev/null -X POST "$API/agreements" -H "$H" -H "$J" -d "{\"flatId\":\"$F\",\"tenantName\":\"Neha Kapoor\",\"tenantPhone\":\"9876500001\",\"startDate\":\"2025-11-20\",\"endDate\":\"$END\",\"rent\":22000}"
curl -s -o /dev/null -X POST "$API/notices" -H "$H" -H "$J" -d '{"title":"Water tank cleaning on Saturday","body":"Water supply will pause between 10 AM and 1 PM during the scheduled tank cleaning.","priority":"NORMAL"}'
echo "Demo data loaded for $P."
