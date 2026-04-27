import { useCallback, useState } from "react";
import { searchArtisans, searchSirene } from "../lib/api.js";

export function useArtisans() {
  const [state, setState] = useState({
    status: "idle",
    results: [],
    count: 0,
    source: null,
    error: null,
    debugData: null,
  });

  const search = useCallback(
    async ({
      trades,
      departement,
      codePostal,
      region,
      adresse,
      lat,
      lon,
      zonePlu,
      typeZone,
      source = "sirene", // 'pappers' | 'sirene' | 'both'
    debug = false,
    }) => {
      if (!trades?.length) return;
      setState({
        status: "loading",
        results: [],
        count: 0,
        source: null,
        error: null,
      });
      try {
        let results = [];

        if (source === "both") {
          // Run both in parallel, merge by SIREN, deduplicate
          const [pappersRes, sireneRes] = await Promise.allSettled([
            searchArtisans({
              trades,
              departement,
              codePostal,
              adresse,
              lat,
              lon,
              zonePlu,
              typeZone,
            }),
            searchSirene({
              trades,
              departement,
              region,
              codePostal,
              adresse,
              lat,
              lon,
              zonePlu,
              typeZone,
            }),
          ]);
          const pappers =
            pappersRes.status === "fulfilled"
              ? pappersRes.value.results || []
              : [];
          const sirene =
            sireneRes.status === "fulfilled"
              ? sireneRes.value.results || []
              : [];
          // Pappers enriched data wins on conflict (has CA, bilans)
          const map = new Map();
          sirene.forEach((r) => map.set(r.siren, r));
          pappers.forEach((r) => map.set(r.siren, r)); // overwrite with richer data
          results = [...map.values()].sort(
            (a, b) => (b.score || 0) - (a.score || 0),
          );
        } else if (source === "pappers") {
          const data = await searchArtisans({
            trades,
            departement,
            codePostal,
            adresse,
            lat,
            lon,
            zonePlu,
            typeZone,
          });
          results = data.results || [];
        } else {
          // default: sirene (gratuit)
          const data = await searchSirene({
            trades,
            departement,
            region,
            codePostal,
            adresse,
            lat,
            lon,
            zonePlu,
            typeZone,
          }, debug);
          results = data.results || [];
          setState({
            status: "done",
            results,
            count: results.length,
            source,
            error: null,
            debugData: debug ? data : null,
          });
          return;
        }

        setState({
          status: "done",
          results,
          count: results.length,
          source,
          error: null,
          debugData: null,
        });
      } catch (e) {
        setState({
          status: "error",
          results: [],
          count: 0,
          source,
          error: e.message,
        });
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setState({
      status: "idle",
      results: [],
      count: 0,
      source: null,
      error: null,
    });
  }, []);

  return { ...state, search, reset };
}
