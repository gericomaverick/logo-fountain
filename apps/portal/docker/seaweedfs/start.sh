#!/bin/sh
# Local S3 stand-in for Cloudflare R2 (dev only; same approach as tests/parity/infra/seaweedfs/start.sh).
set -eu
cat > /tmp/s3.json <<JSON
{ "identities": [ { "name": "dev", "credentials": [{ "accessKey": "${S3_ACCESS_KEY}", "secretKey": "${S3_SECRET_KEY}" }],
  "actions": ["Admin", "Read", "Write", "List", "Tagging"] } ] }
JSON
exec weed mini -dir=/data -s3.config=/tmp/s3.json -bucket="${S3_BUCKETS}"
