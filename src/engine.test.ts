import { describe, expect, it } from "vitest";
import { FaultlineEngine } from "./engine";

describe("FaultlineEngine", () => {
  it("produces the same run from the same seed", () => {
    const first = new FaultlineEngine(99);
    const second = new FaultlineEngine(99);
    for (let index = 0; index < 120; index += 1) {
      first.step(16);
      second.step(16);
    }
    expect(first.getSnapshot()).toEqual(second.getSnapshot());
  });

  it("routes around the severed DUB-FRA link while retaining quorum", () => {
    const engine = new FaultlineEngine(7);
    engine.injectPartition();
    for (let index = 0; index < 200; index += 1) engine.step(16);
    const snapshot = engine.getSnapshot();
    expect(snapshot.edges.find((edge) => edge.id === "dub-fra")?.fault).toBe("partition");
    expect(snapshot.quorum).toBe(true);
    expect(snapshot.reachable).toBe(5);
  });

  it("recovers every injected fault", () => {
    const engine = new FaultlineEngine(4);
    engine.injectPartition();
    engine.injectLatency();
    engine.recover();
    expect(engine.getSnapshot().edges.every((edge) => edge.fault === null)).toBe(true);
  });
});
