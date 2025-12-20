#!/usr/bin/env bash
# Small integration test for the job-service KYC flow.
# Requires: curl, jq
# Environment variables used (set in shell or .env):
# JOB_SERVICE_BASE (default: http://localhost:4002)
# JOB_SERVICE_ADMIN_KEY (required for admin steps)
# KYC_TEST_FILE (path to a small test file to upload)

set -euo pipefail

BASE=${JOB_SERVICE_BASE:-http://localhost:4002}
ADMIN_KEY=${JOB_SERVICE_ADMIN_KEY:-}
TEST_FILE=${KYC_TEST_FILE:-./test-data/sample.pdf}

if [ -z "$ADMIN_KEY" ]; then
  echo "ERROR: JOB_SERVICE_ADMIN_KEY must be set to run this test" >&2
  exit 2
fi

echo "1) Registering employer..."
REG_RESP=$(curl -s -X POST "$BASE/api/v1/employer/register" -H "Content-Type: application/json" -d '{"name":"Test Employer","email":"test+employer@example.com","password":"TestPass123","company":"TestCo"}')
echo "$REG_RESP" | jq .
EMPLOYER_ID=$(echo "$REG_RESP" | jq -r .employerId)
echo "Employer ID: $EMPLOYER_ID"

echo "2) Submitting KYC document..."
if [ ! -f "$TEST_FILE" ]; then
  echo "Creating test file $TEST_FILE"
  mkdir -p "$(dirname "$TEST_FILE")"
  echo "Sample KYC file" > "$TEST_FILE"
fi

KYC_RESP=$(curl -s -X POST "$BASE/api/v1/kyc/submit" -F "employerId=$EMPLOYER_ID" -F "documentType=BUSINESS_REG" -F "document=@$TEST_FILE")
echo "$KYC_RESP" | jq .
KYC_ID=$(echo "$KYC_RESP" | jq -r '.kycRecord.id')
echo "KYC ID: $KYC_ID"

echo "3) Admin approves KYC..."
APPROVE_RESP=$(curl -s -X POST "$BASE/api/v1/kyc/process/$KYC_ID" -H "x-admin-key: $ADMIN_KEY" -H "Content-Type: application/json" -d '{"action":"APPROVE","adminId":null,"reason":"Automated test approval"}')
echo "$APPROVE_RESP" | jq .

echo "4) Get KYC status for employer..."
curl -s "$BASE/api/v1/kyc/status/$EMPLOYER_ID" | jq .

echo "5) Download KYC document (if supported)..."
curl -s -H "x-admin-key: $ADMIN_KEY" "$BASE/api/v1/kyc/document/$KYC_ID" -o /tmp/kyc_download || true
if [ -f /tmp/kyc_download ]; then
  echo "Downloaded to /tmp/kyc_download (size: $(wc -c < /tmp/kyc_download) bytes)"
else
  echo "Download not available or failed (may be encrypted or not implemented)"
fi

echo "Test complete"
