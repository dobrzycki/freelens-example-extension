/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Renderer } from "@freelensapp/extensions";
import * as MobxReact from "mobx-react";
import { useEffect, useState } from "react";
import { withErrorPage } from "../components/error-page";
import { PodJsonLogsViewer } from "../components/pod-json-logs-viewer";
import { podJsonLogsSelection } from "./pod-json-logs-store";

const { observer } = MobxReact;

const {
  K8sApi: { podsApi },
} = Renderer;

type Pod = Renderer.K8sApi.Pod;

export interface PodJsonLogsPageProps {
  extension: Renderer.LensExtension;
}

export const PodJsonLogsPage = observer((props: PodJsonLogsPageProps) =>
  withErrorPage(props, () => {
    const sel = podJsonLogsSelection.get();
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

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ padding: "12px 16px 0", display: "flex", alignItems: "baseline", gap: 8 }}>
          <h2 style={{ margin: 0 }}>JSON Logs</h2>
          <span style={{ opacity: 0.7, fontFamily: "monospace" }}>
            {sel.namespace}/{sel.name}
          </span>
        </div>
        <PodJsonLogsViewer pod={pod} variant="page" />
      </div>
    );
  }),
);
