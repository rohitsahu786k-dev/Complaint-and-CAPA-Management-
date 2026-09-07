import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Last line of defence so a render failure never leaves a blank screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaced in the browser console only; no user data is transmitted anywhere.
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-soft">
          <ShieldAlert className="mx-auto h-8 w-8 text-brand-red" />
          <h1 className="mt-4 text-lg font-bold text-brand-charcoal">Something stopped responding</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The page could not be displayed. Reload to continue; your saved work is unaffected.
          </p>
          <Button className="mt-5 w-full" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" />
            Reload
          </Button>
        </div>
      </div>
    );
  }
}
