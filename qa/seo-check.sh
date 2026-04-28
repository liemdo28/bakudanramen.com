#!/bin/bash
# SEO + Lighthouse check for BakudanRamen.com
# Requires: npm install -g lighthouse

URLS=(
  "https://www.bakudanramen.com/"
  "https://www.bakudanramen.com/links/"
  "https://www.bakudanramen.com/stories/"
  "https://www.bakudanramen.com/links-admin/"
)

mkdir -p qa/reports/lighthouse

echo "=== Bakudan Ramen — Lighthouse SEO/Perf Audit ==="
echo "Date: $(date)"
echo ""

for url in "${URLS[@]}"; do
  safe=$(echo "$url" | sed 's/[^a-zA-Z0-9]/_/g')
  echo "Testing: $url"
  npx lighthouse "$url" \
    --output=json \
    --output-path="qa/reports/lighthouse/lighthouse-${safe}.json" \
    --chrome-flags="--headless --no-sandbox" \
    --quiet 2>&1 || echo "Lighthouse failed for $url"
  echo ""
done

echo "Reports written to qa/reports/lighthouse/"
