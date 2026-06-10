import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeocodedPlace, fetchTimezone } from '@/utils/location';

const STORAGE_KEY = 'astro_saved_location';
const RECENTS_KEY = 'astro_recent_locations';
const MAX_RECENTS = 3;

interface LocationContextValue {
  place: GeocodedPlace | null;
  isLoading: boolean;
  recents: GeocodedPlace[];
  setPlace: (place: GeocodedPlace | null) => void;
}

const LocationContext = createContext<LocationContextValue>({
  place: null,
  isLoading: true,
  recents: [],
  setPlace: () => {},
});

function mergeIntoRecents(recents: GeocodedPlace[], incoming: GeocodedPlace): GeocodedPlace[] {
  const filtered = recents.filter((r) => r.name !== incoming.name);
  return [incoming, ...filtered].slice(0, MAX_RECENTS);
}

// Fetch and persist timezone for each recent that is missing one.
// Runs fire-and-forget after startup; does not block rendering.
async function backfillRecentsTimezones(
  initial: GeocodedPlace[],
  onUpdate: (updated: GeocodedPlace[]) => void,
): Promise<void> {
  const missing = initial.filter((r) => !r.timezone);
  if (missing.length === 0) return;

  const patched = [...initial];
  for (const r of missing) {
    try {
      const timezone = await fetchTimezone(r.coords.latitude, r.coords.longitude);
      if (timezone) {
        const idx = patched.findIndex(
          (p) => p.name === r.name && p.coords.latitude === r.coords.latitude,
        );
        if (idx !== -1) patched[idx] = { ...patched[idx], timezone };
      }
    } catch {
      // network unavailable — leave this recent without timezone
    }
  }

  const changed = patched.some((p, i) => p.timezone !== initial[i]?.timezone);
  if (changed) {
    onUpdate(patched);
    AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(patched)).catch(() => {});
  }
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [place, setPlaceState] = useState<GeocodedPlace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recents, setRecents] = useState<GeocodedPlace[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [rawPlace, rawRecents] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(RECENTS_KEY),
        ]);

        let loadedRecents: GeocodedPlace[] = [];
        if (rawRecents) {
          try { loadedRecents = JSON.parse(rawRecents); } catch {}
        }
        setRecents(loadedRecents);

        if (!rawPlace) {
          void backfillRecentsTimezones(loadedRecents, setRecents);
          return;
        }
        const parsed: GeocodedPlace = JSON.parse(rawPlace);
        setPlaceState(parsed);

        if (!parsed.timezone) {
          const timezone = await fetchTimezone(parsed.coords.latitude, parsed.coords.longitude);
          if (timezone) {
            const updated = { ...parsed, timezone };
            setPlaceState(updated);
            AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
          }
        }

        void backfillRecentsTimezones(loadedRecents, setRecents);
      } catch {
        // corrupt storage — leave place null, user will re-select
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const setPlace = (p: GeocodedPlace | null) => {
    const stamped = p ? { ...p, savedAt: Date.now() } : null;
    setPlaceState(stamped);

    if (stamped) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stamped)).catch(() => {});
      setRecents((prev) => {
        const next = mergeIntoRecents(prev, stamped);
        AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    } else {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
  };

  return (
    <LocationContext.Provider value={{ place, isLoading, recents, setPlace }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  return useContext(LocationContext);
}
