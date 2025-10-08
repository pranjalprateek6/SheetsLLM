import React from "react";
import { Alert } from "./ui/Alert";

export default function ErrorAlert({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <div className="mb-3">
      <Alert variant="destructive" title="Error">
        <code className="text-xs break-words whitespace-pre-wrap">{error}</code>
      </Alert>
    </div>
  );
}
