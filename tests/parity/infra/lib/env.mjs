// Host-side endpoints and TEST-ONLY credentials of the parity stack.
// Defaults mirror docker-compose.test.yml; override with the same env variables.
const port = (name, fallback) => process.env[name] || fallback;

export const infra = {
  s3: {
    endpoint: process.env.PARITY_S3_ENDPOINT || `http://127.0.0.1:${port("PARITY_S3_PORT", "58333")}`,
    accessKey: "parity-test-only-access-key",
    secretKey: "parity-test-only-secret-key",
    buckets: {
      concepts: process.env.PARITY_S3_CONCEPTS_BUCKET || "lf-parity-concepts",
      finals: process.env.PARITY_S3_FINALS_BUCKET || "lf-parity-final-deliverables",
    },
  },
  mailpit: `http://127.0.0.1:${port("PARITY_MAILPIT_PORT", "58025")}`,
  postmarkShim: `http://127.0.0.1:${port("PARITY_POSTMARK_PORT", "58090")}`,
  stripe: {
    host: "127.0.0.1",
    port: Number(port("PARITY_STRIPE_PORT", "58091")),
    url: `http://127.0.0.1:${port("PARITY_STRIPE_PORT", "58091")}`,
    secretKey: "sk_test_parity_test_only",
    webhookSecret: "whsec_parity_test_only_0000000000000000",
  },
};
