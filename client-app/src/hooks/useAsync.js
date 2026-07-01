import { useCallback, useEffect, useState } from 'react';

export default function useAsync(load, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  const refresh = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    return load()
      .then((data) => setState({ loading: false, data, error: '' }))
      .catch((error) => setState({ loading: false, data: null, error: error.message }));
  }, deps);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...state, refresh };
}
