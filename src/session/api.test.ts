import { describe, expect, it } from "vitest";
import type { FetchLike } from "../api/request.js";
import { endSession, type EndSessionOptions } from "./api.js";

const sessionId = "11111111-1111-4111-8111-111111111111";

describe("session end API", () => {
  it.each(["cancel", "abandon"] as const)(
    "%s preserves the supplied key when retrying after a lost response",
    async (action) => {
      const requests: {
        url: string;
        method: string | undefined;
        key: string | null;
      }[] = [];
      const status = action === "cancel" ? "cancelled" : "abandoned";
      const fetch: FetchLike = (url, init) => {
        requests.push({
          url: url.toString(),
          method: init.method,
          key: new Headers(init.headers).get("idempotency-key"),
        });
        if (requests.length === 1) {
          return Promise.reject(new Error("response lost after acceptance"));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ session: { id: sessionId, status } }), {
            headers: { "content-type": "application/json" },
          }),
        );
      };
      const options: EndSessionOptions = {
        action,
        sessionId,
        apiOrigin: "https://api.toughcrowd.dev",
        authorization: "Bearer tc_test",
        idempotencyKey: "logical-operation-key",
        signal: new AbortController().signal,
        version: "0.9.0-test",
        fetch,
      };

      await expect(endSession(options)).rejects.toMatchObject({
        kind: "network",
      });
      // The client does not retry automatically; the caller reuses its request options.
      expect(requests).toHaveLength(1);
      await expect(endSession(options)).resolves.toEqual({
        session: { id: sessionId, status },
      });
      expect(requests).toEqual([
        {
          url: `https://api.toughcrowd.dev/api/sessions/${sessionId}/${action}`,
          method: "POST",
          key: "logical-operation-key",
        },
        {
          url: `https://api.toughcrowd.dev/api/sessions/${sessionId}/${action}`,
          method: "POST",
          key: "logical-operation-key",
        },
      ]);
    },
  );
});
