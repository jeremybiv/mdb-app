import { useCallback, useState } from "react";
import { searchArtisans } from "../lib/api.js";
import { searchAndScore } from "../lib/sirene.js";

export function useArtisans() {
  const [state, setState] = useState({
    status: "idle",
    results: [],
    count: 0,
    source: null,
    error: null,
    debugData: null,
  });

  const search = useCallback(async ({
    trades, departement, citycode, codePostal, region,
    adresse, lat, lon, zonePlu, typeZone,
    source = "sirene", debug = false,
  }) => {
    if (!trades?.length) return;
    setState({ status: "loading", results: [], count: 0, source: null, error: null });
    try {
      let results = [];

      if (source === "both") {
        const [pappersRes, sireneRes] = await Promise.allSettled([
          searchArtisans({ trades, departement, codePostal, adresse, lat, lon, zonePlu, typeZone }),
          searchAndScore({ trades, departement, region, codePostal }),
        ]);
        const pappers = pappersRes.status === "fulfilled" ? pappersRes.value.results || [] : [];
        const sirene  = sireneRes.status  === "fulfilled" ? sireneRes.value  || [] : [];
        const map = new Map();
        sirene.forEach(r  => map.set(r.siren, r));
        pappers.forEach(r => map.set(r.siren, r));
        results = [...map.values()].sort((a, b) => (b.score || 0) - (a.score || 0));
      } else if (source === "pappers") {
        const data = await searchArtisans({ trades, departement, codePostal, adresse, lat, lon, zonePlu, typeZone });
        results = data.results || [];
      } else {
        results = await searchAndScore({ trades, departement, region, codePostal, debug });
      }

      setState({ status: "done", results, count: results.length, source, error: null, debugData: null });
    } catch (e) {
      setState({ status: "error", results: [], count: 0, source, error: e.message });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ status: "idle", results: [], count: 0, source: null, error: null });
  }, []);

  return { ...state, search, reset };
}
