#!/bin/sh
# SeaweedFS S3 gateway for the parity stack (story 0.2).
# Writes a one-identity S3 config from the TEST-ONLY keys in docker-compose.test.yml,
# starts `weed mini` with both buckets pre-created, then marks the container ready
# once the S3 endpoint lists both buckets (the compose healthcheck reads the marker).
set -eu

cat > /tmp/s3.json <<EOF
{
  "identities": [
    {
      "name": "parity",
      "credentials": [{ "accessKey": "${PARITY_S3_ACCESS_KEY}", "secretKey": "${PARITY_S3_SECRET_KEY}" }],
      "actions": ["Admin", "Read", "Write", "List", "Tagging"]
    }
  ]
}
EOF

rm -f /tmp/parity-buckets-ready
weed mini -dir=/data -s3.config=/tmp/s3.json \
  -bucket="${PARITY_S3_CONCEPTS_BUCKET},${PARITY_S3_FINALS_BUCKET}" &
pid=$!

(
  i=0
  while [ $i -lt 120 ]; do
    buckets=$(echo "s3.bucket.list" | weed shell 2>/dev/null || true)
    case "$buckets" in
      *"${PARITY_S3_CONCEPTS_BUCKET}"*)
        case "$buckets" in
          *"${PARITY_S3_FINALS_BUCKET}"*) touch /tmp/parity-buckets-ready; echo "[parity] buckets ready"; exit 0 ;;
        esac ;;
    esac
    i=$((i + 1)); sleep 1
  done
  echo "[parity] buckets were not created in time" >&2
) &

wait $pid
