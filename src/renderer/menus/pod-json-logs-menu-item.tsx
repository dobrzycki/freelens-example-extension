/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Renderer } from "@freelensapp/extensions";
import { withErrorPage } from "../components/error-page";
import { podJsonLogsSelection } from "../pages/pod-json-logs-store";

const {
  Component: { MenuItem, Icon },
} = Renderer;

type Pod = Renderer.K8sApi.Pod;

export interface PodJsonLogsMenuItemProps extends Renderer.Component.KubeObjectMenuProps<Pod> {
  extension: Renderer.LensExtension;
}

export const PodJsonLogsMenuItem = (props: PodJsonLogsMenuItemProps) =>
  withErrorPage(props, () => {
    const { object, toolbar, extension } = props;
    if (!object) return <></>;

    const open = () => {
      podJsonLogsSelection.set({ namespace: object.getNs() ?? "", name: object.getName() });
      void extension.navigate("pod-json-logs");
    };

    return (
      <MenuItem onClick={open}>
        <Icon material="data_object" interactive={toolbar} title="JSON Logs" />
        <span className="title">JSON Logs</span>
      </MenuItem>
    );
  });
