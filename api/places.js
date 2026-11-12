// Vercel Serverless Function for /api/places/*
// Supports Google Places API (New) (`places.googleapis.com/v1/places:searchNearby`)
// with automatic live fallback to OpenStreetMap Overpass & Nominatim geocoding.

async function discoverCinemasViaGooglePlacesNew(opts, googlePlacesKey) {
  const fieldMask =
    'places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri,places.rating,places.userRatingCount';
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googlePlacesKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify({
      includedTypes: ['movie_theater'],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: {
            latitude: opts.lat,
            longitude: opts.lng,
          },
          radius: Math.min(50000, Math.max(2000, opts.radiusMeters)),
        },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Google Places API (New) returned HTTP ${res.status}`);
  }
  const data = await res.json();
  const places = data.places || [];
  const bmsSlug = opts.city.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return places
    .filter((p) => p.id && p.displayName?.text && p.location?.latitude && p.location?.longitude)
    .map((p) => {
      const name = p.displayName.text;
      const lower = name.toLowerCase();
      const brand =
        lower.includes('pvr') || lower.includes('inox')
          ? 'PVR INOX'
          : lower.includes('cinepolis') || lower.includes('cinépolis')
            ? 'Cinépolis'
            : lower.includes('miraj')
              ? 'Miraj Cinemas'
              : 'Cinema Venue';
      return {
        id: `gplace-${p.id}`,
        externalIds: { googlePlaceId: p.id },
        name,
        brand,
        cityId: opts.cityId,
        city: opts.city,
        state: opts.state,
        country: opts.country,
        area: opts.city,
        address: p.formattedAddress || `${name}, ${opts.city}`,
        coordinates: {
          lat: Number(p.location.latitude),
          lng: Number(p.location.longitude),
        },
        websiteUrl: p.websiteUri || null,
        rating: p.rating ?? null,
        userRatingCount: p.userRatingCount ?? null,
        auditoriumCount: null,
        supportedFormats: ['2D', '3D'],
        format: 'Discovered via Google Places API (New)',
        auditorium: null,
        auditoriums: [],
        hasSeatMapSupport: false,
        seatMapProvider: 'NONE',
        dataSource: 'GOOGLE_PLACES_NEW',
        bookingProvider: 'bookmyshow',
        secondaryProviders: ['district'],
        externalBookingUrl: `https://in.bookmyshow.com/explore/cinemas-${bmsSlug}`,
        verificationTier: 'LIVE_VERIFIED',
        verificationNotes:
          'Discovered automatically via Google Places API (New). No external auditorium seat-map API is linked to this venue yet.',
        lastVerifiedAt: new Date().toISOString().slice(0, 10),
      };
    });
}

async function discoverCinemasViaOverpass(opts) {
  const query = `[out:json][timeout:12];(nwr["amenity"="cinema"](around:${opts.radiusMeters},${opts.lat},${opts.lng}););out center tags 35;`;
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
  ];
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'FOVO-Cinema-Platform/1.0',
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) continue;
      const data = await res.json();
      const elements = data.elements || [];
      const bmsSlug = opts.city.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const list = [];
      for (const el of elements) {
        const tags = el.tags || {};
        const name = tags.name || tags['name:en'];
        if (!name) continue;
        const lat = typeof el.lat === 'number' ? el.lat : el.center?.lat;
        const lng = typeof el.lon === 'number' ? el.lon : el.center?.lon;
        if (typeof lat !== 'number' || typeof lng !== 'number') continue;
        const osmId = `osm-${el.type || 'node'}-${el.id}`;
        const combined = `${name} ${tags.brand || ''} ${tags.operator || ''}`.toLowerCase();
        const brand =
          combined.includes('pvr') || combined.includes('inox')
            ? 'PVR INOX'
            : combined.includes('cinepolis') || combined.includes('cinépolis')
              ? 'Cinépolis'
              : combined.includes('miraj')
                ? 'Miraj Cinemas'
                : tags.brand || tags.operator || 'Cinema Venue';
        const addrParts = [
          tags['addr:housename'],
          tags['addr:street'],
          tags['addr:suburb'] || tags['addr:neighbourhood'] || tags['addr:district'],
          tags['addr:city'] || opts.city,
          tags['addr:state'] || opts.state,
          tags['addr:postcode'],
        ].filter(Boolean);
        const area =
          tags['addr:suburb'] ||
          tags['addr:neighbourhood'] ||
          tags['addr:street'] ||
          opts.city;
        const address =
          tags['addr:full'] ||
          (addrParts.length >= 2
            ? addrParts.join(', ')
            : `${name}, ${area}, ${opts.city}${opts.state ? `, ${opts.state}` : ''}`);
        const screensNum = Number(tags.screens);
        const auditoriumCount =
          Number.isFinite(screensNum) && screensNum > 0 ? screensNum : null;
        list.push({
          id: `cinema-${osmId}`,
          externalIds: { osmId },
          name,
          brand,
          cityId: opts.cityId,
          city: opts.city,
          state: opts.state,
          country: opts.country,
          area,
          address,
          coordinates: { lat, lng },
          websiteUrl: tags.website || tags['contact:website'] || null,
          auditoriumCount,
          supportedFormats: ['2D', '3D'],
          format: auditoriumCount
            ? `${auditoriumCount} Screens · Discovered via OpenStreetMap`
            : 'Discovered Cinema Venue',
          auditorium: null,
          auditoriums: [],
          hasSeatMapSupport: false,
          seatMapProvider: 'NONE',
          dataSource: 'OSM_OVERPASS_LIVE',
          bookingProvider: 'bookmyshow',
          secondaryProviders: ['district'],
          externalBookingUrl: `https://in.bookmyshow.com/explore/cinemas-${bmsSlug}`,
          verificationTier: 'LIVE_VERIFIED',
          verificationNotes:
            'Automatically discovered via OpenStreetMap Overpass geolocation API. No external seat-map API or physical auditorium floorplan is attached yet.',
          lastVerifiedAt: new Date().toISOString().slice(0, 10),
        });
      }
      if (list.length > 0) return list;
    } catch {
      // try next mirror
    }
  }
  return [];
}

export default async function handler(req, res) {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const googlePlacesKey = (process.env.GOOGLE_PLACES_API_KEY || '').trim();
  const vistaConnectUrl = (process.env.VISTA_CONNECT_URL || '').trim();
  const vistaApiToken = (process.env.VISTA_API_TOKEN || '').trim();

  if (parsed.pathname === '/api/places/reverse') {
    const lat = Number(parsed.searchParams.get('lat'));
    const lng = Number(parsed.searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'Valid lat and lng query parameters are required' });
    }
    try {
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=10&accept-language=en`,
        { headers: { 'User-Agent': 'FOVO-Cinema-Platform/1.0' } },
      );
      if (nomRes.ok) {
        const nom = await nomRes.json();
        const addr = nom.address || {};
        const city =
          addr.city ||
          addr.town ||
          addr.municipality ||
          addr.county ||
          addr.state_district ||
          'Detected City';
        return res.status(200).json({
          city,
          state: addr.state || '',
          country: addr.country || 'India',
          countryCode: (addr.country_code || 'IN').toUpperCase(),
          formattedAddress: nom.display_name || `${city}, ${addr.state || 'India'}`,
        });
      }
    } catch {
      // ignore
    }
    return res.status(200).json({
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      countryCode: 'IN',
    });
  }

  if (parsed.pathname === '/api/places/cinemas') {
    const lat = Number(parsed.searchParams.get('lat') || '12.9716');
    const lng = Number(parsed.searchParams.get('lng') || '77.5946');
    const radiusKm = Number(parsed.searchParams.get('radiusKm') || '25');
    const city = (parsed.searchParams.get('city') || 'Bengaluru').trim();
    const cityId = (parsed.searchParams.get('cityId') || city.toLowerCase()).trim();
    const state = (parsed.searchParams.get('state') || 'Karnataka').trim();
    const country = (parsed.searchParams.get('country') || 'India').trim();

    let cinemasList = [];
    let providerUsed = 'OSM_OVERPASS_LIVE';

    if (googlePlacesKey) {
      try {
        cinemasList = await discoverCinemasViaGooglePlacesNew(
          { lat, lng, radiusMeters: radiusKm * 1000, city, cityId, state, country },
          googlePlacesKey,
        );
        providerUsed = 'GOOGLE_PLACES_NEW';
      } catch {
        cinemasList = [];
      }
    }

    if (cinemasList.length === 0) {
      cinemasList = await discoverCinemasViaOverpass({
        lat,
        lng,
        radiusMeters: radiusKm * 1000,
        city,
        cityId,
        state,
        country,
      });
      providerUsed = 'OSM_OVERPASS_LIVE';
    }

    return res.status(200).json({
      cinemas: cinemasList,
      providerUsed,
      googlePlacesConfigured: Boolean(googlePlacesKey),
      vistaConfigured: Boolean(vistaConnectUrl && vistaApiToken),
      lastUpdatedAt: new Date().toISOString(),
    });
  }

  return res.status(404).json({ error: 'Unknown places endpoint' });
}
