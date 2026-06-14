/* 3BEL — Geo & route logica (postcode-clustering, geen externe API nodig) */
const GEO = (() => {
  // Basis/thuis = De Panne (Adinkerke 8660)
  const BASE = { lat: 51.097, lng: 2.593 };

  // Benaderende coördinaten — kust & Westhoek (West-Vlaanderen).
  // Uitbreidbaar: voeg postcodes toe naar wens.
  const PC = {
    '8660': { lat: 51.097, lng: 2.593, naam: 'De Panne' },        // + Adinkerke
    '8670': { lat: 51.115, lng: 2.645, naam: 'Koksijde' },        // + Oostduinkerke/St-Idesbald
    '8620': { lat: 51.130, lng: 2.751, naam: 'Nieuwpoort' },
    '8630': { lat: 51.072, lng: 2.663, naam: 'Veurne' },
    '8600': { lat: 51.032, lng: 2.862, naam: 'Diksmuide' },
    '8647': { lat: 50.990, lng: 2.756, naam: 'Lo-Reninge' },
    '8650': { lat: 50.984, lng: 2.886, naam: 'Houthulst' },
    '8970': { lat: 50.855, lng: 2.726, naam: 'Poperinge' },
    '8900': { lat: 50.851, lng: 2.885, naam: 'Ieper' },
    '8434': { lat: 51.160, lng: 2.766, naam: 'Westende' },
    '8430': { lat: 51.185, lng: 2.820, naam: 'Middelkerke' },
    '8400': { lat: 51.215, lng: 2.928, naam: 'Oostende' },
    '8420': { lat: 51.262, lng: 3.026, naam: 'De Haan' },
    '8460': { lat: 51.115, lng: 2.960, naam: 'Oudenburg' },
    '8480': { lat: 51.090, lng: 2.998, naam: 'Ichtegem' },
    '8000': { lat: 51.209, lng: 3.224, naam: 'Brugge' },
  };

  function coords(pc) {
    if (!pc) return null;
    const key = String(pc).trim().slice(0, 4);
    if (PC[key]) return PC[key];
    // Fallback: zelfde regio (84xx/86xx/89xx) -> dichtstbijzijnde gekende centroid
    const num = parseInt(key, 10);
    if (!isNaN(num)) {
      let best = null, bestDiff = Infinity;
      for (const k in PC) {
        const diff = Math.abs(parseInt(k, 10) - num);
        if (diff < bestDiff) { bestDiff = diff; best = PC[k]; }
      }
      if (best && bestDiff <= 400) return best;
    }
    return null;
  }

  // Hemelsbrede afstand in km
  function haversine(a, b) {
    if (!a || !b) return 9999;
    const R = 6371, toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
  }

  // Afstand tussen twee klanten (op basis van postcode)
  function distance(custA, custB) {
    return haversine(coords(custA.postcode), coords(custB.postcode));
  }

  // Nearest-neighbour volgorde, startend vanaf BASE.
  // Geeft een nieuwe array klanten in optimale rijvolgorde terug.
  function routeOrder(customers, start = BASE) {
    const list = customers.slice();
    const ordered = [];
    let current = start;
    while (list.length) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < list.length; i++) {
        const d = haversine(current, coords(list[i].postcode) || start);
        if (d < bd) { bd = d; bi = i; }
      }
      const next = list.splice(bi, 1)[0];
      ordered.push(next);
      current = coords(next.postcode) || current;
    }
    return ordered;
  }

  // Groepeer klanten per gemeente; gemeentes geordend op afstand vanaf BASE.
  function clusterByGemeente(customers) {
    const groups = {};
    for (const c of customers) {
      const key = (c.gemeente || coords(c.postcode)?.naam || 'Onbekend').trim();
      (groups[key] = groups[key] || []).push(c);
    }
    const entries = Object.entries(groups).map(([gemeente, list]) => {
      const ref = list.find(x => coords(x.postcode)) || list[0];
      const dist = haversine(BASE, coords(ref.postcode) || BASE);
      return { gemeente, customers: list, dist };
    });
    entries.sort((a, b) => a.dist - b.dist);
    return entries;
  }

  return { BASE, PC, coords, haversine, distance, routeOrder, clusterByGemeente };
})();
