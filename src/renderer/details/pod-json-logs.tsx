/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Renderer } from "@freelensapp/extensions";
import { useMemo, useState } from "react";
import { withErrorPage } from "../components/error-page";

const {
  Component: { DrawerTitle, Select, Button, Input, Icon },
  K8sApi: { podsApi },
} = Renderer;

type Pod = Renderer.K8sApi.Pod;

export interface PodJsonLogsProps extends Renderer.Component.KubeObjectDetailsProps<Pod> {
  extension: Renderer.LensExtension;
}

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
  // YYYY-MM-DD HH:mm:ss.SSSZ — concise & sortable
  return d.toISOString().replace("T", " ").replace("Z", "Z");
}

function renderJsonLine(json: Record<string, unknown>, idx: number) {
  const ts = formatTs(pickFirst(json, ["timestamp", "time", "@timestamp", "ts"]));
  const level = (pickFirst(json, ["level", "severity", "lvl"]) ?? "").toUpperCase();
  const logger = pickFirst(json, ["logger_name", "logger", "loggerName"]);
  const thread = pickFirst(json, ["thread_name", "thread"]);
  const message = pickFirst(json, ["message", "msg", "log"]) ?? "";

  // Collect extras (anything else worth showing)
  const known = new Set([
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
  const extras = Object.entries(json).filter(([k]) => !known.has(k));

  const color = LEVEL_COLORS[level] ?? "inherit";

  return (
    <div key={idx} style={{ padding: "4px 0", borderBottom: "1px solid rgba(127,127,127,0.15)" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, opacity: 0.85 }}>
        {ts && <span style={{ fontFamily: "monospace" }}>{ts}</span>}
        {level && <span style={{ color, fontWeight: 600, fontFamily: "monospace", minWidth: 50 }}>{level}</span>}
        {thread && <span style={{ fontFamily: "monospace" }}>[{thread}]</span>}
        {logger && <span style={{ fontFamily: "monospace", opacity: 0.7 }}>{logger}</span>}
      </div>
      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 2 }}>{message}</div>
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

function renderRawLine(raw: string, idx: number) {
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
      {raw}
    </div>
  );
}

export const PodJsonLogs = (props: PodJsonLogsProps) =>
  withErrorPage(props, () => {
    const { object: pod } = props;

    const containers = useMemo(() => {
      const spec: any = pod.spec ?? {};
      const init = (spec.initContainers ?? []).map((c: any) => ({ name: c.name, init: true }));
      const main = (spec.containers ?? []).map((c: any) => ({ name: c.name, init: false }));
      return [...init, ...main];
    }, [pod]);

    const [container, setContainer] = useState<string>(containers[0]?.name ?? "");
    const [tailLines, setTailLines] = useState<string>("200");
    const [previous, setPrevious] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [lines, setLines] = useState<ParsedLine[]>([]);

    const load = async () => {
      if (!container) return;
      setLoading(true);
      setError(null);
      try {
        const tail = Number.parseInt(tailLines, 10);
        const raw = await podsApi.getLogs({ namespace: pod.getNs(), name: pod.getName() }, {
          container,
          tailLines: Number.isFinite(tail) && tail > 0 ? tail : 200,
          previous,
          timestamps: false,
        } as any);
        const text = typeof raw === "string" ? raw : "";
        const parsed = text
          .split("\n")
          .filter((l) => l.length > 0)
          .map(parseLine);
        setLines(parsed);
      } catch (e) {
        setError(String(e));
        setLines([]);
      } finally {
        setLoading(false);
      }
    };

    if (!pod || pod.kind !== "Pod") return <></>;

    return (
      <div>
        <DrawerTitle>JSON Logs</DrawerTitle>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "0 0 8px" }}>
          <div style={{ minWidth: 200 }}>
            <Select
              value={container}
              options={containers.map((c) => ({ value: c.name, label: c.init ? `${c.name} (init)` : c.name }))}
              onChange={(opt: any) => setContainer(opt?.value ?? "")}
              themeName="lens"
            />
          </div>
          <div style={{ width: 100 }}>
            <Input type="number" value={tailLines} onChange={(v: string) => setTailLines(v)} placeholder="tail lines" />
          </div>
          <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12 }}>
            <input type="checkbox" checked={previous} onChange={(e) => setPrevious(e.target.checked)} />
            previous
          </label>
          <Button
            primary
            label={loading ? "Loading..." : "Load logs"}
            onClick={load}
            disabled={loading || !container}
          />
          {lines.length > 0 && (
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              {lines.filter((l) => l.json).length}/{lines.length} parsed as JSON
            </span>
          )}
        </div>
        {error && (
          <div style={{ color: "#ef4444", padding: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon material="error" small /> {error}
          </div>
        )}
        <div
          style={{
            maxHeight: 480,
            overflow: "auto",
            border: "1px solid rgba(127,127,127,0.2)",
            borderRadius: 4,
            padding: 8,
            background: "rgba(0,0,0,0.15)",
          }}
        >
          {lines.length === 0 && !loading && (
            <div style={{ opacity: 0.6, fontSize: 12 }}>No logs loaded. Pick a container and click "Load logs".</div>
          )}
          {lines.map((l, i) => (l.json ? renderJsonLine(l.json, i) : renderRawLine(l.raw, i)))}
        </div>
      </div>
    );
  });
