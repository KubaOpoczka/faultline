import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaultlineEngine,
  getPacketPosition,
  type NetworkEdge,
  type NetworkNode,
  type Snapshot,
} from "./engine";

const timeLabel = (milliseconds: number) => {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

const positionFor = (node: NetworkNode) => ({ left: `${node.x}%`, top: `${node.y}%` });

const edgeGeometry = (edge: NetworkEdge, nodes: NetworkNode[]) => {
  const from = nodes.find((node) => node.id === edge.from)!;
  const to = nodes.find((node) => node.id === edge.to)!;
  return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
};

export function App() {
  const engine = useMemo(() => new FaultlineEngine(2407), []);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => engine.getSnapshot());
  const [paused, setPaused] = useState(false);
  const [announcement, setAnnouncement] = useState("Simulation ready");
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let lastPaint = previous;
    const loop = (now: number) => {
      if (!pausedRef.current) engine.step(now - previous);
      previous = now;
      if (now - lastPaint > 70) {
        setSnapshot(engine.getSnapshot());
        lastPaint = now;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [engine]);

  const runAction = (label: string, action: () => void) => {
    action();
    setSnapshot(engine.getSnapshot());
    setAnnouncement(label);
  };

  return (
    <div className={`app-shell ${snapshot.quorum ? "" : "is-critical"}`}>
      <a className="skip-link" href="#network">
        Skip to network
      </a>

      <header className="masthead">
        <div className="wordmark" aria-label="Faultline">
          FAULT<span>/</span>LINE
        </div>
        <p className="masthead-note">
          Distributed systems failure laboratory <span>· KubaOpoczka</span>
        </p>
        <div className={`system-state ${snapshot.quorum ? "healthy" : "critical"}`}>
          <i aria-hidden="true" />
          {snapshot.quorum ? "Quorum held" : "Quorum lost"}
        </div>
      </header>

      <main>
        <section className="control-rail" aria-labelledby="fault-controls">
          <div>
            <p className="section-key">Live interventions</p>
            <h1 id="fault-controls">Break it on purpose.</h1>
            <p className="rail-intro">
              Inject a real fault into the deterministic model. Routes, packets, and health
              indicators all respond to the same state.
            </p>
          </div>

          <div className="actions">
            <button
              className="fault-action"
              onClick={() =>
                runAction("Dublin to Frankfurt link severed", () => engine.injectPartition())
              }
            >
              <span>Sever DUB—FRA</span>
              <small>Network partition</small>
            </button>
            <button
              onClick={() => runAction("Latency spike injected", () => engine.injectLatency())}
            >
              <span>Spike one link</span>
              <small>7 second latency fault</small>
            </button>
            <button
              onClick={() => runAction("Traffic burst injected", () => engine.injectBurst())}
            >
              <span>Triple traffic</span>
              <small>6.5 second burst</small>
            </button>
            <button
              className="recover-action"
              onClick={() => runAction("Network recovered", () => engine.recover())}
            >
              <span>Recover network</span>
              <small>Clear every fault</small>
            </button>
          </div>

          <button
            className="pause-control"
            aria-pressed={paused}
            onClick={() => {
              setPaused((current) => !current);
              setAnnouncement(paused ? "Simulation resumed" : "Simulation paused");
            }}
          >
            <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>
            {paused ? "Resume clock" : "Pause clock"}
          </button>
        </section>

        <section id="network" className="network-stage" aria-labelledby="topology-title">
          <div className="stage-heading">
            <div>
              <p className="section-key">Topology / Europe edge</p>
              <h2 id="topology-title">One leader. Four replicas. No theatre.</h2>
            </div>
            <div className="clock">
              <span>Run time</span>
              <strong>{timeLabel(snapshot.elapsed)}</strong>
            </div>
          </div>

          <div className="topology" role="img" aria-describedby="topology-summary">
            <svg className="edge-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {snapshot.edges.map((edge) => {
                const geometry = edgeGeometry(edge, snapshot.nodes);
                return (
                  <g key={edge.id} className={`edge ${edge.fault ?? ""}`}>
                    <line {...geometry} />
                    {edge.fault === "partition" ? (
                      <g className="break-mark">
                        <circle cx={(geometry.x1 + geometry.x2) / 2} cy={(geometry.y1 + geometry.y2) / 2} r="3.8" />
                        <path
                          d={`M ${(geometry.x1 + geometry.x2) / 2 - 1.2} ${(geometry.y1 + geometry.y2) / 2 - 2.3} l 2.1 1.6 -2 1.8 2.2 1.7`}
                        />
                      </g>
                    ) : null}
                  </g>
                );
              })}
              {snapshot.packets.map((packet) => {
                const position = getPacketPosition(packet, snapshot.edges, snapshot.nodes);
                return position ? (
                  <circle
                    className="packet"
                    key={packet.id}
                    cx={position.x}
                    cy={position.y}
                    r="0.8"
                  />
                ) : null;
              })}
            </svg>

            {snapshot.nodes.map((node) => (
              <div
                className={`node ${node.role}`}
                key={node.id}
                style={positionFor(node)}
                aria-label={`${node.city}, ${node.role}`}
              >
                <span className="node-core" aria-hidden="true" />
                <strong>{node.city}</strong>
                <small>{node.role}</small>
              </div>
            ))}

            <p className="topology-caption">
              Lines show active replication paths. Yellow pulses are write acknowledgements.
            </p>
          </div>
          <p id="topology-summary" className="visually-hidden">
            {snapshot.reachable} of 5 nodes reachable. Quorum is{" "}
            {snapshot.quorum ? "available" : "unavailable"}. Current p95 latency is{" "}
            {snapshot.p95} milliseconds.
          </p>

          <div className="metrics" aria-label="Live network metrics">
            <div>
              <span>Reachable</span>
              <strong>{snapshot.reachable}/5</strong>
            </div>
            <div>
              <span>p95 latency</span>
              <strong>{snapshot.p95}ms</strong>
            </div>
            <div>
              <span>Committed</span>
              <strong>{snapshot.committed}</strong>
            </div>
            <div>
              <span>Dropped</span>
              <strong>{snapshot.dropped}</strong>
            </div>
          </div>
        </section>

        <aside className="event-tape" aria-labelledby="event-heading">
          <div className="tape-head">
            <div>
              <p className="section-key">Event tape</p>
              <h2 id="event-heading">What the model knows</h2>
            </div>
            <span className="sequence">#{String(snapshot.events[0]?.id ?? 0).padStart(4, "0")}</span>
          </div>
          <ol>
            {snapshot.events.map((event) => (
              <li key={event.id} className={event.tone}>
                <time>{timeLabel(event.at)}</time>
                <p>{event.message}</p>
              </li>
            ))}
          </ol>
          <div className="model-note">
            <span>Model note</span>
            <p>
              Packet routing uses breadth-first search over healthy links. The run is reproducible
              from seed {snapshot.seed}.
            </p>
          </div>
        </aside>
      </main>

      <div className="visually-hidden" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
