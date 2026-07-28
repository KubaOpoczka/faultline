export type FaultKind = "partition" | "latency" | null;

export interface NetworkNode {
  id: string;
  city: string;
  x: number;
  y: number;
  role: "leader" | "replica";
}

export interface NetworkEdge {
  id: string;
  from: string;
  to: string;
  latency: number;
  fault: FaultKind;
  faultUntil: number | null;
}

export interface Packet {
  id: number;
  route: string[];
  hop: number;
  progress: number;
  committed: boolean;
}

export interface NetworkEvent {
  id: number;
  at: number;
  tone: "info" | "warn" | "bad" | "good";
  message: string;
}

export interface Snapshot {
  elapsed: number;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  packets: Packet[];
  events: NetworkEvent[];
  committed: number;
  dropped: number;
  traffic: number;
  quorum: boolean;
  reachable: number;
  p95: number;
  seed: number;
}

const NODES: NetworkNode[] = [
  { id: "dub", city: "DUB", x: 18, y: 49, role: "leader" },
  { id: "lon", city: "LON", x: 39, y: 21, role: "replica" },
  { id: "ams", city: "AMS", x: 63, y: 30, role: "replica" },
  { id: "fra", city: "FRA", x: 72, y: 69, role: "replica" },
  { id: "hel", city: "HEL", x: 91, y: 45, role: "replica" },
];

const EDGE_DATA: Array<[string, string, number]> = [
  ["dub", "lon", 21],
  ["dub", "fra", 34],
  ["lon", "ams", 18],
  ["lon", "fra", 26],
  ["ams", "fra", 16],
  ["ams", "hel", 31],
  ["fra", "hel", 28],
];

const mulberry32 = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
};

export class FaultlineEngine {
  private readonly random: () => number;
  private readonly state: Snapshot;
  private packetSequence = 0;
  private eventSequence = 0;
  private spawnClock = 0;
  private trafficUntil = 0;

  constructor(seed = 2407) {
    this.random = mulberry32(seed);
    this.state = {
      elapsed: 0,
      nodes: NODES.map((node) => ({ ...node })),
      edges: EDGE_DATA.map(([from, to, latency]) => ({
        id: `${from}-${to}`,
        from,
        to,
        latency,
        fault: null,
        faultUntil: null,
      })),
      packets: [],
      events: [],
      committed: 0,
      dropped: 0,
      traffic: 1,
      quorum: true,
      reachable: NODES.length,
      p95: 34,
      seed,
    };
    this.pushEvent("info", `deterministic run armed · seed ${seed}`);
    this.pushEvent("good", "five replicas reporting healthy");
  }

  step(deltaMs: number) {
    const dt = Math.min(deltaMs, 100);
    this.state.elapsed += dt;
    this.expireFaults();
    this.state.traffic = this.state.elapsed < this.trafficUntil ? 3 : 1;
    this.spawnClock += dt;

    const spawnEvery = 430 / this.state.traffic;
    while (this.spawnClock >= spawnEvery) {
      this.spawnClock -= spawnEvery;
      this.spawnPacket();
    }

    for (const packet of this.state.packets) {
      if (packet.committed) continue;
      const edge = this.edgeById(packet.route[packet.hop]);
      if (!edge || edge.fault === "partition") {
        packet.committed = true;
        this.state.dropped += 1;
        continue;
      }

      const effectiveLatency = edge.latency * (edge.fault === "latency" ? 5.5 : 1);
      packet.progress += dt / (effectiveLatency * 16);
      if (packet.progress >= 1) {
        packet.hop += 1;
        packet.progress = 0;
        if (packet.hop >= packet.route.length) {
          packet.committed = true;
          this.state.committed += 1;
        }
      }
    }

    this.state.packets = this.state.packets
      .filter((packet) => !packet.committed || this.random() > 0.22)
      .slice(-48);

    this.updateHealth();
  }

  injectPartition() {
    const edge = this.edgeById("dub-fra");
    if (!edge) return;
    edge.fault = "partition";
    edge.faultUntil = null;
    this.pushEvent("bad", "link DUB→FRA severed by operator");
    this.pushEvent("warn", "routes recalculating around fault boundary");
    this.updateHealth();
  }

  injectLatency() {
    const candidates = this.state.edges.filter((edge) => edge.fault !== "partition");
    const edge = candidates[Math.floor(this.random() * candidates.length)];
    edge.fault = "latency";
    edge.faultUntil = this.state.elapsed + 7000;
    this.pushEvent("warn", `${edge.id.toUpperCase()} latency multiplied ×5.5`);
  }

  injectBurst() {
    this.trafficUntil = this.state.elapsed + 6500;
    this.state.traffic = 3;
    this.pushEvent("warn", "traffic burst injected · 3× normal volume");
  }

  recover() {
    this.state.edges.forEach((edge) => {
      edge.fault = null;
      edge.faultUntil = null;
    });
    this.trafficUntil = 0;
    this.state.traffic = 1;
    this.pushEvent("good", "operator recovery completed");
    this.pushEvent("info", "topology converged on healthy routes");
    this.updateHealth();
  }

  getSnapshot(): Snapshot {
    return {
      ...this.state,
      nodes: this.state.nodes.map((node) => ({ ...node })),
      edges: this.state.edges.map((edge) => ({ ...edge })),
      packets: this.state.packets.map((packet) => ({
        ...packet,
        route: [...packet.route],
      })),
      events: this.state.events.map((event) => ({ ...event })),
    };
  }

  private expireFaults() {
    this.state.edges.forEach((edge) => {
      if (edge.faultUntil !== null && this.state.elapsed >= edge.faultUntil) {
        this.pushEvent("good", `${edge.id.toUpperCase()} latency returned to baseline`);
        edge.fault = null;
        edge.faultUntil = null;
      }
    });
  }

  private spawnPacket() {
    const targets = NODES.filter((node) => node.id !== "dub");
    const target = targets[Math.floor(this.random() * targets.length)];
    const route = this.shortestRoute("dub", target.id);
    if (route.length === 0) {
      this.state.dropped += 1;
      return;
    }
    this.state.packets.push({
      id: this.packetSequence++,
      route,
      hop: 0,
      progress: 0,
      committed: false,
    });
  }

  private shortestRoute(from: string, to: string): string[] {
    const queue: Array<{ node: string; route: string[] }> = [{ node: from, route: [] }];
    const visited = new Set([from]);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      if (current.node === to) return current.route;

      for (const edge of this.state.edges) {
        if (edge.fault === "partition") continue;
        const neighbour =
          edge.from === current.node ? edge.to : edge.to === current.node ? edge.from : null;
        if (neighbour && !visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push({ node: neighbour, route: [...current.route, edge.id] });
        }
      }
    }
    return [];
  }

  private updateHealth() {
    const reachable = new Set(["dub"]);
    let changed = true;
    while (changed) {
      changed = false;
      this.state.edges.forEach((edge) => {
        if (edge.fault === "partition") return;
        if (reachable.has(edge.from) && !reachable.has(edge.to)) {
          reachable.add(edge.to);
          changed = true;
        }
        if (reachable.has(edge.to) && !reachable.has(edge.from)) {
          reachable.add(edge.from);
          changed = true;
        }
      });
    }

    this.state.reachable = reachable.size;
    this.state.quorum = reachable.size >= 3;
    const activeLatencies = this.state.edges
      .filter((edge) => edge.fault !== "partition")
      .map((edge) => edge.latency * (edge.fault === "latency" ? 5.5 : 1));
    this.state.p95 = Math.round(Math.max(...activeLatencies, 0) * this.state.traffic);
  }

  private edgeById(id: string) {
    return this.state.edges.find((edge) => edge.id === id);
  }

  private pushEvent(tone: NetworkEvent["tone"], message: string) {
    this.state.events.unshift({
      id: this.eventSequence++,
      at: this.state.elapsed,
      tone,
      message,
    });
    this.state.events = this.state.events.slice(0, 18);
  }
}

export const getPacketPosition = (
  packet: Packet,
  edges: NetworkEdge[],
  nodes: NetworkNode[],
) => {
  const edge = edges.find((candidate) => candidate.id === packet.route[packet.hop]);
  if (!edge) return null;
  const from = nodes.find((node) => node.id === edge.from);
  const to = nodes.find((node) => node.id === edge.to);
  if (!from || !to) return null;
  return {
    x: from.x + (to.x - from.x) * packet.progress,
    y: from.y + (to.y - from.y) * packet.progress,
  };
};
