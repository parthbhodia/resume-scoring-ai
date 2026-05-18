#!/usr/bin/env bash
# Smoke-test Analyze-related API routes (run server first on BASE_URL).
set -euo pipefail
BASE_URL="${BASE_URL:-http://127.0.0.1:8767}"
DOCX="${DOCX:-/tmp/api-test-resume.docx}"
OUT="/tmp/api-test-results"
mkdir -p "$OUT"

echo "=== API smoke tests @ $BASE_URL ==="

echo -n "health: "
curl -sf "$BASE_URL/api/health" | tee "$OUT/health.json"
echo ""

echo ""
echo "=== POST /api/analyze-upload (DOCX) ==="
HTTP=$(curl -s -o "$OUT/analyze-upload.json" -w "%{http_code}" \
  -F "file=@${DOCX};filename=resume.docx;type=application/vnd.openxmlformats-officedocument.wordprocessingml.document" \
  "$BASE_URL/api/analyze-upload")
echo "HTTP $HTTP"
python3 - <<'PY' "$OUT/analyze-upload.json" "$HTTP"
import json, sys
path, http = sys.argv[1], int(sys.argv[2])
data = json.load(open(path))
print("  overallScore:", data.get("overallScore"))
print("  extractedText len:", len(data.get("extractedText") or ""))
print("  structuredResume:", "yes" if data.get("structuredResume") else "NO")
print("  bulletMap len:", len(data.get("bulletMap") or []))
print("  error:", data.get("error"))
if http >= 400 or not data.get("extractedText"):
    sys.exit(1)
PY

echo ""
echo "=== POST /api/analyze-export-pdf (Harshibar) ==="
python3 - <<'PY' "$OUT/analyze-upload.json" "$OUT/export-pdf.pdf"
import json, sys, urllib.request
upload = json.load(open(sys.argv[1]))
sr = upload.get("structuredResume")
if not sr:
    print("SKIP export-pdf: no structuredResume"); sys.exit(1)
body = json.dumps({
    "structuredResume": sr,
    "acceptedEdits": {},
    "referenceFolder": "Harshibar_Template1",
}).encode()
req = urllib.request.Request(
    sys.argv[2].replace("export-pdf.pdf", "").join(["http://127.0.0.1:8767/api/analyze-export-pdf"]),
    data=body,
    headers={"Content-Type": "application/json"},
    method="POST",
)
PY
