import { useCallback, useEffect, useRef, useState } from "react";

// Loads data from an API function and tracks loading/error state.
//   const { data, loading, error, reload, setData } = useApi(() => api.get(id), [id]);
export function useApi(request, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(request, deps);

  const reload = useCallback(
    async ({ silent = false } = {}) => {
      const id = ++requestId.current;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const result = await load();
        if (id === requestId.current) setData(result);
      } catch (err) {
        if (id === requestId.current) setError(err);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [load]
  );

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}
