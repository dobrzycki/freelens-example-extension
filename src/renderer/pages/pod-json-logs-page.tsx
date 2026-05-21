/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Renderer } from "@freelensapp/extensions";
import * as React from "react";
import { withErrorPage } from "../components/error-page";
import { PodJsonLogsViewer } from "../components/pod-json-logs-viewer";
import { type PodSelection, podJsonLogsSelection } from "./pod-json-logs-store";

const { useEffect, useState } = React;

const {
  K8sApi: { podsApi },
} = Renderer;

type Pod = Renderer.K8sApi.Pod;

export interface PodJsonLogsPageProps {
  extension: Renderer.LensExtension;
}

function useSelection(): PodSelection | null {
  const [sel, setSel] = useState<PodSelection | null>(podJsonLogsSelection.get());
  useEffect(() => podJsonLogsSelection.subscribe(() => setSel(podJsonLogsSelection.get())), []);
  return sel;
}

export const PodJsonLogsPage = (props: PodJsonLogsPageProps) =>
  withErrorPage(props, () => {
    const sel = useSelection();
    const [pod, setPod] = useState<Pod | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      let cancelled = false;
      if (!sel) {
        setPod(null);
        return;
      }
      (async () => {
        try {
          const fetched = await podsApi.get({ namespace: sel.namespace, name: sel.name });
          if (!cancelled) setPod(fetched as Pod);
        } catch (e) {
          if (!cancelled) setError(String(e));
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [sel?.namespace, sel?.name]);

    if (!sel) {
      return (
        <div style={{ padding: 16 }}>
          <h2>JSON Logs</h2>
          <p style={{ opacity: 0.7 }}>
            No pod selected. Open a pod's row menu (the ⋮ icon on the Pods list) and choose "JSON Logs".
          </p>
        </div>
      );
    }

    if (error) {
      return (
        <div style={{ padding: 16, color: "#ef4444" }}>
          Failed to load pod {sel.namespace}/{sel.name}: {error}
        </div>
      );
    }

    if (!pod) {
      return (
        <div style={{ padding: 16, opacity: 0.7 }}>
          Loading pod {sel.namespace}/{sel.name}…
        </div>
      );
    }

    const close = () => {
      podJsonLogsSelection.set(null);
      if (window.history.length > 1) window.history.back();
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div
          style={{
            padding: "6px 10px 2px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <strong style={{ fontSize: 13 }}>JSON Logs</strong>
          <span style={{ opacity: 0.7, fontFamily: "monospace", fontSize: 12 }}>
            {sel.namespace}/{sel.name}
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={close}
            title="Close"
            aria-label="Close JSON Logs"
            style={{
              background: "transparent",
              border: "1px solid rgba(127,127,127,0.3)",
              borderRadius: 3,
              cursor: "pointer",
              color: "inherit",
              fontSize: 14,
              lineHeight: 1,
              padding: "2px 8px",
            }}
          >
            ×
          </button>
        </div>
        <PodJsonLogsViewer pod={pod} variant="page" />
      </div>
    );
  });
