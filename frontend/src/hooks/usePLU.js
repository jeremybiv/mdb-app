import { useState, useCallback } from 'react';
import { geocodeAddress, getZonePLU, getDocumentUrbanisme } from '../lib/ign.js';

export function usePLU() {
  const [state, setState] = useState({
    status: 'idle',  // idle | loading | done | error
    steps: { geocode: 'idle', zone: 'idle', doc: 'idle' },
    geo:  null,
    zone: null,
    doc:  null,
    error: null,
  });

  const lookup = useCallback(async (address, citycode) => {
    setState({ status: 'loading', steps: { geocode: 'loading', zone: 'idle', doc: 'idle' }, geo: null, zone: null, doc: null, error: null });

    // Step 1 — geocode
    let geo;
    try {
      geo = await geocodeAddress(address, citycode);
      setState((s) => ({ ...s, geo, steps: { ...s.steps, geocode: 'done', zone: 'loading' } }));
    } catch (e) {
      setState((s) => ({ ...s, status: 'error', steps: { ...s.steps, geocode: 'error' }, error: e.message }));
      return;
    }

    // Step 2 — zone PLU
    let zone;
    try {
      zone = await getZonePLU(geo.lon, geo.lat);
      setState((s) => ({ ...s, zone, steps: { ...s.steps, zone: 'done', doc: 'loading' } }));
    } catch (e) {
      setState((s) => ({ ...s, status: 'error', steps: { ...s.steps, zone: 'error' }, error: e.message }));
      return;
    }

    // Step 3 — document (non-blocking)
    let doc = null;
    try {
      doc = await getDocumentUrbanisme(geo.lon, geo.lat);
    } catch { /* silent */ }

    setState((s) => ({ ...s, status: 'done', doc, steps: { ...s.steps, doc: doc ? 'done' : 'error' } }));
  }, []);

  const reset = useCallback(() => {
    setState({ status: 'idle', steps: { geocode: 'idle', zone: 'idle', doc: 'idle' }, geo: null, zone: null, doc: null, error: null });
  }, []);

  return { ...state, lookup, reset };
}
