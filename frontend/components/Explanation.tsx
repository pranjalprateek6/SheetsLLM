import React from "react";
import { Alert } from "./ui/Alert";

export default function Explanation({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div className="mb-3">
      <Alert variant="info" title="💡 Explanation">
        {text}
      </Alert>
    </div>
  );
}
