/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Renderer } from "@freelensapp/extensions";
import * as React from "react";

const { useEffect, useMemo, useRef, useState } = React;

const {
  Component: { Select, Button, Input, Icon, Checkbox, SearchInput },
  K8sApi: { podsApi },
} = Renderer;

type Pod = Renderer.K8sApi.Pod;

const LEVEL_COLORS: Record<string, string> = {
  TRACE: "#7a7a7a",
  DEBUG: "#7a7a7a",
  INFO: "#3b82f6",
  WARN: "#eab308",
  WARNING: "#eab308",
  ERROR: "#ef4444",
  FATAL: "#ef4444",
  SEVERE: "#ef4444",
};

interface ParsedLine {
  raw: string;
  json?: Record<string, unknown>;
}

function parseLine(raw: string): ParsedLine {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return { raw };
  try {
    const json = JSON.parse(trimmed);
    if (json && typeof json === "object") return { raw, json };
  } catch {
    /* not json */
  }
  return { raw };
}

function pickFirst(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function formatTs(ts?: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toISOString().replace("T", " ").replace("Z", "Z");
}

const KNOWN_KEYS = new Set([
  "timestamp",
  "time",
  "@timestamp",
  "ts",
  "level",
  "severity",
  "lvl",
  "logger_name",
  "logger",
  "loggerName",
  "thread_name",
  "thread",
  "message",
  "msg",
  "log",
]);

function lineSearchHaystack(line: ParsedLine): string {
  if (line.json) {
    // Search the raw JSON text — covers all keys/values.
    return line.raw.toLowerCase();
  }
  return line.raw.toLowerCase();
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = lower.indexOf(ql, i);
    if (idx === -1) {
      out.push(text.slice(i));
      break;
    }
    if (idx > i) out.push(text.slice(i, idx));
    out.push(
      <mark key={`hl-${key++}`} style={{ background: "#facc15", color: "#000", padding: 0, borderRadius: 2 }}>
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    i = idx + q.length;
  }
  return out;
}

function renderJsonLine(json: Record<string, unknown>, idx: number, search: string) {
  const ts = formatTs(pickFirst(json, ["timestamp", "time", "@timestamp", "ts"]));
  const level = (pickFirst(json, ["level", "severity", "lvl"]) ?? "").toUpperCase();
  const logger = pickFirst(json, ["logger_name", "logger", "loggerName"]);
  const thread = pickFirst(json, ["thread_name", "thread"]);
  const message = pickFirst(json, ["message", "msg", "log"]) ?? "";
  const extras = Object.entries(json).filter(([k]) => !KNOWN_KEYS.has(k));
  const color = LEVEL_COLORS[level] ?? "inherit";

  return (
    <div key={idx} style={{ padding: "4px 0", borderBottom: "1px solid rgba(127,127,127,0.15)" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, opacity: 0.85 }}>
        {ts && <span style={{ fontFamily: "monospace" }}>{ts}</span>}
        {level && <span style={{ color, fontWeight: 600, fontFamily: "monospace", minWidth: 50 }}>{level}</span>}
        {thread && <span style={{ fontFamily: "monospace" }}>[{thread}]</span>}
        {logger && <span style={{ fontFamily: "monospace", opacity: 0.7 }}>{logger}</span>}
      </div>
      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 2 }}>{highlight(message, search)}</div>
      {extras.length > 0 && (
        <details style={{ marginTop: 2 }}>
          <summary style={{ cursor: "pointer", fontSize: 11, opacity: 0.6 }}>+{extras.length} field(s)</summary>
          <pre style={{ fontSize: 11, margin: "4px 0 0", whiteSpace: "pre-wrap" }}>
            {extras.map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n")}
          </pre>
        </details>
      )}
    </div>
  );
}

function renderRawLine(raw: string, idx: number, search: string) {
  return (
    <div
      key={idx}
      style={{
        padding: "2px 0",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: "monospace",
        fontSize: 12,
        opacity: 0.85,
        borderBottom: "1px solid rgba(127,127,127,0.1)",
      }}
    >
      {highlight(raw, search)}
    </div>
  );
}

export interface PodJsonLogsViewerProps {
  pod: Pod;
  /** "drawer" caps height; "page" fills available space */
  variant?: "drawer" | "page";
}

const POLL_MS = 3000;

export const PodJsonLogsViewer = ({ pod, variant = "drawer" }: PodJsonLogsViewerProps) => {
  const containers = useMemo(() => {
    const spec: any = pod.spec ?? {};
    const init = (spec.initContainers ?? []).map((c: any) => ({ name: c.name, init: true }));
    const main = (spec.containers ?? []).map((c: any) => ({ name: c.name, init: false }));
    return [...init, ...main];
  }, [pod]);

  const [container, setContainer] = useState<string>(containers[0]?.name ?? "");
  const [tailLines, setTailLines] = useState<string>("200");
  const [previous, setPrevious] = useState<boolean>(false);
  const [follow, setFollow] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<ParsedLine[]>([]);

  // Refs to avoid stale closures in the polling interval.
  const linesRef = useRef<ParsedLine[]>([]);
  const containerRef = useRef<string>(container);
  const previousRef = useRef<boolean>(previous);
  const tailRef = useRef<string>(tailLines);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  useEffect(() => {
    containerRef.current = container;
  }, [container]);
  useEffect(() => {
    previousRef.current = previous;
  }, [previous]);
  useEffect(() => {
    tailRef.current = tailLines;
  }, [tailLines]);

  const fetchLogs = async (mode: "replace" | "append"): Promise<void> => {
    const c = containerRef.current;
    if (!c) return;
    const tail = Number.parseInt(tailRef.current, 10);
    const opts: any = {
      container: c,
      tailLines: Number.isFinite(tail) && tail > 0 ? tail : 200,
      previous: previousRef.current,
      timestamps: false,
    };
    const raw = await podsApi.getLogs({ namespace: pod.getNs(), name: pod.getName() }, opts);
    const text = typeof raw === "string" ? raw : "";
    const incoming = text.split("\n").filter((l) => l.length > 0);

    if (mode === "replace") {
      setLines(incoming.map(parseLine));
      return;
    }
    // Append: dedupe against existing tail by finding overlap of last seen line.
    const prev = linesRef.current;
    if (prev.length === 0) {
      setLines(incoming.map(parseLine));
      return;
    }
    const lastSeen = prev[prev.length - 1].raw;
    const overlapIdx = incoming.lastIndexOf(lastSeen);
    const fresh = overlapIdx >= 0 ? incoming.slice(overlapIdx + 1) : incoming;
    if (fresh.length > 0) {
      setLines((cur) => [...cur, ...fresh.map(parseLine)]);
    }
  };

  const load = async () => {
    if (!container) return;
    setLoading(true);
    setError(null);
    try {
      await fetchLogs("replace");
    } catch (e) {
      setError(String(e));
      setLines([]);
    } finally {
      setLoading(false);
    }
  };

  // Polling while follow is on. Reset on container/previous/tail change.
  useEffect(() => {
    if (!follow || !container) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        await fetchLogs(linesRef.current.length === 0 ? "replace" : "append");
        setError(null);
      } catch (e) {
        setError(String(e));
      }
    };
    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [follow, container, previous]);

  // Auto-scroll to bottom while following, but only if user is already near it.
  useEffect(() => {
    if (!follow) return;
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [lines, follow]);

  const filtered = useMemo(() => {
    if (!search) return lines;
    const q = search.toLowerCase();
    return lines.filter((l) => lineSearchHaystack(l).includes(q));
  }, [lines, search]);

  const logBoxStyle: React.CSSProperties =
    variant === "page"
      ? {
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          border: "1px solid rgba(127,127,127,0.2)",
          borderRadius: 4,
          padding: 8,
          background: "rgba(0,0,0,0.15)",
        }
      : {
          maxHeight: 480,
          overflow: "auto",
          border: "1px solid rgba(127,127,127,0.2)",
          borderRadius: 4,
          padding: 8,
          background: "rgba(0,0,0,0.15)",
        };

  return (
    <div
      style={
        variant === "page"
          ? { display: "flex", flexDirection: "column", height: "100%", padding: 16, gap: 8 }
          : undefined
      }
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "0 0 8px" }}>
        <div style={{ minWidth: 200 }}>
          <Select
            value={container}
            options={containers.map((c) => ({ value: c.name, label: c.init ? `${c.name} (init)` : c.name }))}
            onChange={(opt: any) => setContainer(opt?.value ?? "")}
            themeName="lens"
          />
        </div>
        <div style={{ width: 110 }}>
          <Input type="number" value={tailLines} onChange={(v: string) => setTailLines(v)} placeholder="tail lines" />
        </div>
        <Checkbox label="Previous" value={previous} onChange={(v: boolean) => setPrevious(v)} />
        <Checkbox label="Follow" value={follow} onChange={(v: boolean) => setFollow(v)} />
        <Button
          primary
          label={loading ? "Loading..." : follow ? "Reload" : "Load logs"}
          onClick={load}
          disabled={loading || !container}
        />
        {lines.length > 0 && (
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            {filtered.length}/{lines.length} lines
            {search ? ` (matches "${search}")` : ""}
          </span>
        )}
      </div>
      <div style={{ padding: "0 0 8px", maxWidth: 480 }}>
        <SearchInput value={search} onChange={(v: string) => setSearch(v)} placeholder="Filter / search…" />
      </div>
      {error && (
        <div style={{ color: "#ef4444", padding: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon material="error" small /> {error}
        </div>
      )}
      <div ref={scrollRef} style={logBoxStyle}>
        {filtered.length === 0 && !loading && (
          <div style={{ opacity: 0.6, fontSize: 12 }}>
            {lines.length === 0
              ? 'No logs loaded. Pick a container and click "Load logs" (or toggle Follow).'
              : "No lines match the current filter."}
          </div>
        )}
        {filtered.map((l, i) => (l.json ? renderJsonLine(l.json, i, search) : renderRawLine(l.raw, i, search)))}
      </div>
    </div>
  );
};
