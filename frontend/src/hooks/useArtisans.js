import { useState, useCallback } from 'react';
import { searchArtisans } from '../lib/api.js';

export function useArtisans() {
  const [state, setState] = useState({
    status: 'idle',  // idle | loading | done | error
    results: [],
    count: 0,
    error: null,
  });

  const search = useCallback(async ({ trades, departement, codePostal, adresse, lat, lon, zonePlu, typeZone }) => {
    if (!trades?.length) return;
    setState({ status: 'loading', results: [], count: 0, error: null });
    try {
      const data = await searchArtisans({ trades, departement, codePostal, adresse, lat, lon, zonePlu, typeZone });
      setState({ status: 'done', results: data.results || [], count: data.count || 0, error: null });
    } catch (e) {
      setState({ status: 'error', results: [], count: 0, error: e.message });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ status: 'idle', results: [], count: 0, error: null });
  }, []);

  return { ...state, search, reset };
}
