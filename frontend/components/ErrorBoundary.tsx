"use client";
import { Component, ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 text-destructive p-8 max-w-md text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-lg font-semibold mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-destructive/80 mb-6">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={this.handleRetry}
              className="px-5 py-2.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors font-medium inline-flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
