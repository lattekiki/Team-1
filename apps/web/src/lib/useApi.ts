import { useCallback, useEffect, useState } from "react";
import { api, ApiRequestError, localizeError } from "./api.ts";

type State<T> = { data: T | undefined; error: ApiRequestError | undefined; loading: boolean };

// Fetches `path` whenever it changes; pass null to skip.
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<State<T>>({ data: undefined, error: undefined, loading: path !== null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) {
      setState({ data: undefined, error: undefined, loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    api<T>(path).then(
      (data) => !cancelled && setState({ data, error: undefined, loading: false }),
      (error: unknown) =>
        !cancelled &&
        setState({
          data: undefined,
          error:
            error instanceof ApiRequestError
              ? error
              : new ApiRequestError(0, "network", localizeError("network", undefined, undefined)),
          loading: false,
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

// Runs a mutation, reporting errors through the provided callback.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, onError?: (message: string) => void) => {
    setBusy(true);
    try {
      return await fn();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : localizeError("internal", undefined, undefined));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, run };
}
