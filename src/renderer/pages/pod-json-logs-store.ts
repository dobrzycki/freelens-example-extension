/**
 * Tiny module-level store to hand the selected pod from the menu item
 * to the cluster page on navigation.
 */
import { observable } from "mobx";

export interface PodSelection {
  namespace: string;
  name: string;
}

export const podJsonLogsSelection = observable.box<PodSelection | null>(null);
