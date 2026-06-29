import useAsync from '../hooks/useAsync';
import { api } from '../api/client';

export default function useWorkspace() {
  return useAsync(() => api('/api/user/workspace'), []);
}
