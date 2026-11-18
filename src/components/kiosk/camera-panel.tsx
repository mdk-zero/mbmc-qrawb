"use client";

import dynamic from "next/dynamic";
import { CameraTile } from "./camera-tile";

const CameraPreview = dynamic(() => import("./camera-preview"), {
  ssr: false,
  loading: () => <CameraTile status="loading" />,
});

export function CameraPanel(props: {
  paused: boolean;
  onDetect: (code: string) => void;
  onStatus: (running: boolean) => void;
}) {
  return <CameraPreview {...props} />;
}
