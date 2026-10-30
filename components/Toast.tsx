"use client";
import { useApp } from "./AppProvider";

export function Toast() {
  const { toastMsg } = useApp();
  return <div id="toast" role="status" hidden={!toastMsg}>{toastMsg}</div>;
}
