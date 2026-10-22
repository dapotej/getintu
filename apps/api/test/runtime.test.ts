import { describe, expect, it } from "vitest";
import { freshAfterQuiet } from "../src/runtime.ts";

function harness() {
  let clock = 0;
  const made: { closed: boolean }[] = [];
  let hold: Promise<void> | null = null;
  const serve = freshAfterQuiet(
    () => {
      const api = { closed: false };
      made.push(api);
      const n = made.length;
      return {
        app: {
          fetch: async () => {
            if (hold) await hold;
            return new Response(String(n));
          },
        },
        close: async () => void (api.closed = true),
      };
    },
    { quietMs: 20_000, now: () => clock },
  );
  return {
    serve,
    made,
    tick: (ms: number) => void (clock += ms),
    holdNext: () => {
      let release = () => {};
      hold = new Promise((r) => (release = r));
      return () => {
        hold = null;
        release();
      };
    },
  };
}
const req = () => new Request("http://api.test/health");

describe("freshAfterQuiet", () => {
  it("reuses the connection while requests keep coming", async () => {
    const h = harness();
    expect(await (await h.serve(req())).text()).toBe("1");
    h.tick(19_000);
    expect(await (await h.serve(req())).text()).toBe("1");
    expect(h.made).toHaveLength(1);
  });

  it("starts on a fresh connection after a quiet spell and closes the old one", async () => {
    const h = harness();
    await h.serve(req());
    h.tick(21_000);
    expect(await (await h.serve(req())).text()).toBe("2");
    expect(h.made.map((a) => a.closed)).toEqual([true, false]);
  });

  it("never swaps the connection under a request that is still running", async () => {
    const h = harness();
    await h.serve(req());
    const release = h.holdNext();
    const slow = h.serve(req());
    h.tick(25_000);
    const next = h.serve(req());
    release();
    expect(await (await next).text()).toBe("1");
    expect(await (await slow).text()).toBe("1");
    expect(h.made).toHaveLength(1);
  });
});
