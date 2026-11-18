import { expect, test } from "../fixtures";

// Used only by scripts/selftest.mjs to prove the expected-failure mechanism (story 0.1, AC4).
test("O-01 selftest failing test", async () => {
  expect(1).toBe(2);
});

test("O-01 selftest passing test", async () => {
  expect(1).toBe(1);
});
