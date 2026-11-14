export interface RouteWaypoint {
  id: string;
  _id?: string;
  orderNumber?: string;
  name: string;
  address: string;
  type: 'warehouse' | 'stop';
  orderType?: string;
  status?: string;
  dueDate?: string;
  installerName?: string;
  installerEmail?: string;
  lat: number;
  lng: number;
  legDistanceKm: number;
  details: string;
}

const CITY_ANCHORS: { match: RegExp; lat: number; lng: number }[] = [
  { match: /industrial|riverfront|dallas.*wh|warehouse-1/i, lat: 32.7845, lng: -96.824 },
  { match: /mckinney/i, lat: 32.7966, lng: -96.8012 },
  { match: /oak lawn/i, lat: 32.8045, lng: -96.8141 },
  { match: /commerce st/i, lat: 32.7803, lng: -96.7832 },
  { match: /hillcrest|university park/i, lat: 32.8501, lng: -96.7897 },
  { match: /preston|plano/i, lat: 33.0198, lng: -96.6989 },
  { match: /springfield|evergreen/i, lat: 32.742, lng: -96.835 },
  { match: /austin|tech ridge|warehouse-2/i, lat: 30.4021, lng: -97.6745 },
  { match: /houston|commerce park|warehouse-3/i, lat: 29.7604, lng: -95.3698 },
  { match: /dallas/i, lat: 32.7767, lng: -96.797 },
];

function hashOffset(seed: string): [number, number] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const latOff = ((h % 100) / 100) * 0.012 - 0.006;
  const lngOff = ((((h >> 8) % 100)) / 100) * 0.012 - 0.006;
  return [latOff, lngOff];
}

export function resolveCoordinates(address: string, seed: string, specs?: any): { lat: number; lng: number } {
  if (typeof specs?.lat === 'number' && typeof specs?.lng === 'number') {
    return { lat: specs.lat, lng: specs.lng };
  }
  const clean = `${address || ''} ${seed || ''}`;
  const anchor = CITY_ANCHORS.find((a) => a.match.test(clean)) || { lat: 32.7767, lng: -96.797 };
  const [dLat, dLng] = hashOffset(seed || clean || 'default');
  return {
    lat: Number((anchor.lat + dLat).toFixed(5)),
    lng: Number((anchor.lng + dLng).toFixed(5)),
  };
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const c =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinDLng * sinDLng;
  return Number((2 * R * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c))).toFixed(1));
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function optimizeRouteWaypoints(params: {
  warehouses: any[];
  orders: any[];
  mode: string;
}) {
  const { warehouses, orders, mode } = params;
  const primaryWh = warehouses[0] || {
    _id: 'default-wh',
    name: 'Primary Warehouse',
    location: '1200 Industrial Blvd, Dallas, TX',
  };
  const endWh = warehouses.length > 1 ? warehouses[0] : primaryWh;

  const startCoord = resolveCoordinates(primaryWh.location || primaryWh.name, `wh-${primaryWh._id}`);
  const endCoord = startCoord;

  const stopCandidates = orders.map((o: any) => {
    const addr = o.address || 'Dallas Dispatch Zone, TX';
    const coord = resolveCoordinates(addr, o.orderNumber || o._id?.toString() || addr, o.specifications);
    return {
      id: o.orderNumber || o._id?.toString(),
      _id: o._id?.toString(),
      orderNumber: o.orderNumber || '',
      name: addr,
      address: addr,
      type: 'stop' as const,
      orderType: o.type || 'Installation',
      status: o.status || 'Pending',
      dueDate: o.dueDate || 'Standard',
      installerName: o.installerName || 'Unassigned',
      installerEmail: o.installerEmail || '',
      lat: coord.lat,
      lng: coord.lng,
      isRush: String(o.dueDate || '').toLowerCase() === 'rush',
    };
  });

  const orderedStops: typeof stopCandidates = [];
  if (mode === 'manual') {
    orderedStops.push(...stopCandidates);
  } else {
    const remaining = [...stopCandidates];
    let current = startCoord;
    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestScore = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const dist = haversineKm(current, remaining[i]);
        const priorityPenalty = mode === 'fastest' && !remaining[i].isRush ? 1000 : 0;
        const score = dist + priorityPenalty;
        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      orderedStops.push(next);
      current = next;
    }
  }

  const waypoints: RouteWaypoint[] = [
    {
      id: `wh-start-${primaryWh._id}`,
      name: primaryWh.name,
      address: primaryWh.location || primaryWh.name,
      type: 'warehouse',
      lat: startCoord.lat,
      lng: startCoord.lng,
      legDistanceKm: 0,
      details: 'Departure Point',
    },
  ];

  let prevCoord = startCoord;
  let totalDistanceKm = 0;

  orderedStops.forEach((stop, idx) => {
    const leg = haversineKm(prevCoord, stop);
    totalDistanceKm += leg;
    waypoints.push({
      id: stop.id,
      _id: stop._id,
      orderNumber: stop.orderNumber,
      name: stop.name,
      address: stop.address,
      type: 'stop',
      orderType: stop.orderType,
      status: stop.status,
      dueDate: stop.dueDate,
      installerName: stop.installerName,
      installerEmail: stop.installerEmail,
      lat: stop.lat,
      lng: stop.lng,
      legDistanceKm: leg,
      details: `Stop ${idx + 1} (${stop.orderNumber}) • ${leg} km`,
    });
    prevCoord = stop;
  });

  if (orderedStops.length > 0) {
    const returnLeg = haversineKm(prevCoord, endCoord);
    totalDistanceKm += returnLeg;
    waypoints.push({
      id: `wh-end-${endWh._id}`,
      name: endWh.name,
      address: endWh.location || endWh.name,
      type: 'warehouse',
      lat: endCoord.lat,
      lng: endCoord.lng,
      legDistanceKm: returnLeg,
      details: `Return Point • ${returnLeg} km`,
    });
  }

  const roundedDist = Number(totalDistanceKm.toFixed(1));
  const estMinutes = Math.round((roundedDist / 45) * 60 + orderedStops.length * 12);

  return {
    waypoints,
    routePath: waypoints.map((w) => [w.lat, w.lng] as [number, number]),
    summary: {
      stopCount: orderedStops.length,
      totalDistanceKm: roundedDist,
      estimatedMinutes: estMinutes,
      estimatedTimeLabel: formatDuration(estMinutes),
      isRoadRoute: false,
    },
  };
}

interface CachedRoadResult {
  expires: number;
  routePath: [number, number][];
  legsKm: number[];
  totalDistanceKm: number;
  driveMinutes: number;
}

const roadCache = new Map<string, CachedRoadResult>();

export async function attachRoadGeometry(plan: ReturnType<typeof optimizeRouteWaypoints>) {
  const { waypoints } = plan;
  if (waypoints.length < 2) return plan;

  const coordKey = waypoints.map((w) => `${w.lng},${w.lat}`).join(';');
  const now = Date.now();
  let road = roadCache.get(coordKey);
  if (!road || road.expires < now) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${coordKey}?overview=full&geometries=geojson&steps=false`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data: any = await res.json();
        const best = data?.routes?.[0];
        if (data?.code === 'Ok' && best?.geometry?.coordinates?.length) {
          road = {
            expires: now + 5 * 60 * 1000,
            routePath: best.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
            legsKm: (best.legs || []).map((l: any) => Number(((l.distance || 0) / 1000).toFixed(1))),
            totalDistanceKm: Number(((best.distance || 0) / 1000).toFixed(1)),
            driveMinutes: Math.round((best.duration || 0) / 60),
          };
          roadCache.set(coordKey, road);
        }
      }
    } catch {
      // Fall back to direct coordinates cleanly if OSRM is unavailable
    }
  }

  if (!road) return plan;

  let stopNum = 0;
  const updatedWaypoints = waypoints.map((w, idx) => {
    const legKm = idx === 0 ? 0 : road!.legsKm[idx - 1] ?? w.legDistanceKm;
    if (w.type === 'stop') {
      stopNum += 1;
      return {
        ...w,
        legDistanceKm: legKm,
        details: `Stop ${stopNum} (${w.orderNumber}) • ${legKm} km`,
      };
    }
    return {
      ...w,
      legDistanceKm: legKm,
      details: idx === 0 ? 'Departure Point' : `Return Point • ${legKm} km`,
    };
  });

  const estMinutes = road.driveMinutes + plan.summary.stopCount * 12;
  return {
    waypoints: updatedWaypoints,
    routePath: road.routePath,
    summary: {
      stopCount: plan.summary.stopCount,
      totalDistanceKm: road.totalDistanceKm,
      estimatedMinutes: estMinutes,
      estimatedTimeLabel: formatDuration(estMinutes),
      isRoadRoute: true,
    },
  };
}
