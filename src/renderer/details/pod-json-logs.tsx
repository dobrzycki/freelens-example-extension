/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Renderer } from "@freelensapp/extensions";
import { withErrorPage } from "../components/error-page";
import { PodJsonLogsViewer } from "../components/pod-json-logs-viewer";

const {
  Component: { DrawerTitle },
} = Renderer;

type Pod = Renderer.K8sApi.Pod;

export interface PodJsonLogsProps extends Renderer.Component.KubeObjectDetailsProps<Pod> {
  extension: Renderer.LensExtension;
}

export const PodJsonLogs = (props: PodJsonLogsProps) =>
  withErrorPage(props, () => {
    const { object: pod } = props;
    if (!pod || pod.kind !== "Pod") return <></>;
    return (
      <div>
        <DrawerTitle>JSON Logs</DrawerTitle>
        <PodJsonLogsViewer pod={pod} variant="drawer" />
      </div>
    );
  });
