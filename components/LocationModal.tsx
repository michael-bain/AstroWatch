import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';

const WIN = Dimensions.get('window');
import Constants from 'expo-constants';
import { MapPin, Search, X } from 'lucide-react-native';
import { useLocation } from '@/contexts/LocationContext';
import {
  searchPlaces,
  fetchTimezone,
  GeocodedPlace,
} from '@/utils/location';
import { formatDate, formatCoords } from '@/utils/astronomy';

function resolveTimezoneLabel(timezone: string | undefined): { abbr: string; isFallback: boolean } {
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, timeZoneName: 'short' }).formatToParts(new Date());
      const abbr = parts.find((p) => p.type === 'timeZoneName')?.value ?? timezone;
      return { abbr, isFallback: false };
    } catch {
      return { abbr: timezone, isFallback: false };
    }
  }
  const abbr = new Intl.DateTimeFormat('en', { timeZoneName: 'short' })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName')?.value ?? 'Local';
  return { abbr: `${abbr} (device)`, isFallback: true };
}

type LocView = 'main' | 'search';

export default function LocationModal({
  visible,
  onClose,
  firstRun = false,
}: {
  visible: boolean;
  onClose: () => void;
  firstRun?: boolean;
}) {
  const { place, recents, setPlace } = useLocation();
  const [view, setView] = useState<LocView>('main');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodedPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSearchAt = useRef<number>(0);

  const resetSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setSearchError(null);
    setSearching(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleClose = useCallback(() => {
    if (firstRun && !place) return;
    resetSearch();
    setView('main');
    Keyboard.dismiss();
    onClose();
  }, [firstRun, place, onClose, resetSearch]);

  const goSearch = useCallback(() => {
    resetSearch();
    setView('search');
  }, [resetSearch]);

  const goMain = useCallback(() => {
    resetSearch();
    Keyboard.dismiss();
    setView('main');
  }, [resetSearch]);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    setSearchError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      // Throttle: ensure at least 1000ms between Nominatim requests
      const now = Date.now();
      const elapsed = now - lastSearchAt.current;
      if (elapsed < 1000) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000 - elapsed));
      }
      lastSearchAt.current = Date.now();

      setSearching(true);
      try {
        const found = await searchPlaces(text.trim());
        setResults(found);
        if (found.length === 0) setSearchError('No places found. Try a different search.');
      } catch {
        setSearchError('Search failed. Check your connection and try again.');
      } finally {
        setSearching(false);
      }
    }, 500);
  }, []);

  const selectPlace = useCallback(async (p: GeocodedPlace) => {
    if (p.timezone) {
      setPlace(p);
      handleClose();
      return;
    }
    const timezone = await fetchTimezone(p.coords.latitude, p.coords.longitude);
    setPlace({ ...p, timezone });
    handleClose();
  }, [setPlace, handleClose]);

  const tzInfo = place ? resolveTimezoneLabel(place.timezone) : null;
  const visibleRecents = recents.slice(0, 3);

  return (
    <Modal visible={visible} transparent={false} animationType="none" onRequestClose={handleClose}>
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />

        {/* ── SEARCH VIEW ── */}
        {view === 'search' && (
          <>
            <View style={s.header}>
              <Text style={s.headerTitle}>SEARCH LOCATION</Text>
              <TouchableOpacity onPress={goMain} style={s.closeBtn} activeOpacity={1}>
                <X size={20} color="#000" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
            <View style={s.dividerHeavy} />

            <View style={s.searchInputRow}>
              <Search size={18} color="#555" strokeWidth={2} />
              <TextInput
                style={s.searchInput}
                placeholder="City, region, or country..."
                placeholderTextColor="#999"
                value={query}
                onChangeText={handleQueryChange}
                autoFocus
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => handleQueryChange('')} activeOpacity={1}>
                  <X size={16} color="#999" strokeWidth={2} />
                </TouchableOpacity>
              )}
            </View>

            {searching && (
              <View style={s.feedback}>
                <ActivityIndicator size="small" color="#000" />
                <Text style={s.feedbackText}>SEARCHING...</Text>
              </View>
            )}
            {searchError && !searching && (
              <View style={s.feedback}>
                <Text style={s.feedbackError}>{searchError}</Text>
              </View>
            )}

            <FlatList
              data={results}
              keyExtractor={(_, i) => String(i)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={s.resultRow} onPress={() => selectPlace(item)} activeOpacity={1}>
                  <MapPin size={16} color="#555" strokeWidth={2} />
                  <View style={s.resultTextWrap}>
                    <Text style={s.resultName}>{item.name}</Text>
                    <Text style={s.resultCoords}>{formatCoords(item.coords.latitude, item.coords.longitude)}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={s.resultSep} />}
            />
          </>
        )}

        {/* ── MAIN VIEW ── */}
        {view === 'main' && (
          <View style={s.mainContent}>
            <View>
              <View style={s.header}>
                <Text style={s.headerTitle}>LOCATION</Text>
                {!firstRun && (
                  <TouchableOpacity onPress={handleClose} style={s.closeBtn} activeOpacity={1}>
                    <X size={20} color="#000" strokeWidth={2.5} />
                  </TouchableOpacity>
                )}
              </View>
              <View style={s.dividerHeavy} />
            </View>

            {/* First-run welcome message */}
            {firstRun && !place && (
              <View style={s.welcomeSection}>
                <Text style={s.welcomeText}>Welcome to AstroWatch.</Text>
                <Text style={s.welcomeText}>Choose a location to begin.</Text>
              </View>
            )}

            {/* Current location */}
            {place && (
              <View style={s.currentSection}>
                <View style={s.currentRow}>
                  <View style={s.currentText}>
                    <Text style={s.currentName}>{place.name}</Text>
                    {tzInfo ? (
                      <Text style={[s.currentTz, tzInfo.isFallback && s.fallbackText]}>
                        {`Timezone: ${tzInfo.abbr}`}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            )}

            {/* Search button */}
            <View style={[s.actionsSection, firstRun && !place && s.actionsSectionFirstRun]}>
              <TouchableOpacity style={s.actionBtn} onPress={goSearch} activeOpacity={1}>
                <Search size={17} color="#000" strokeWidth={2.5} />
                <Text style={s.actionBtnLabel}>SEARCH NEW LOCATION</Text>
              </TouchableOpacity>
            </View>

            {/* Recent locations — hidden on first run with no place */}
            {visibleRecents.length > 0 && !(firstRun && !place) && (
              <View style={s.recentsSection}>
                <Text style={s.sectionLabel}>RECENT LOCATIONS</Text>
                {visibleRecents.map((r, i) => {
                  const rTzInfo = r.timezone ? resolveTimezoneLabel(r.timezone) : null;
                  const isActive = place?.name === r.name &&
                    place?.coords.latitude === r.coords.latitude &&
                    place?.coords.longitude === r.coords.longitude;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={s.recentRow}
                      onPress={() => selectPlace(r)}
                      activeOpacity={1}
                    >
                      <View style={s.recentLeft}>
                        <View style={[s.recentDot, isActive && s.recentDotActive]} />
                        <Text style={[s.recentName, isActive && s.recentNameActive]}>
                          {r.name}
                        </Text>
                      </View>
                      {rTzInfo ? (
                        <Text style={[s.recentTz, rTzInfo.isFallback && s.fallbackText]}>
                          {rTzInfo.abbr}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={s.bottomSpacer} />
            <View style={s.quoteSection}>
              <Text style={s.quoteText}>"Remember to look up at the stars and not down at your feet"</Text>
              <Text style={s.quoteAttrib}>— Stephen Hawking</Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: {
    width: WIN.width,
    height: WIN.height,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? Constants.statusBarHeight : 0,
  },

  // Header — matches TabHeader exactly: height 52, px 20, divider 3px
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.3,
  },
  closeBtn: { padding: 4 },
  dividerHeavy: { height: 3, backgroundColor: '#000' },

  // Main view wrapper — bottom padding reserves space for the absolutely-positioned quote
  mainContent: {
    flex: 1,
    flexDirection: 'column',
    paddingBottom: 110,
  },

  // Welcome message (first run only)
  welcomeSection: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 4,
    alignItems: 'center',
  },
  welcomeText: {
    fontSize: 17,
    fontWeight: '400',
    color: '#000',
    letterSpacing: 0.2,
    lineHeight: 26,
    textAlign: 'center',
  },

  // Sections
  sectionLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 3,
    marginBottom: 14,
  },
  currentSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 0,
  },
  actionsSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  actionsSectionFirstRun: {
    paddingTop: 20,
  },
  recentsSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  bottomSpacer: {},

  // Current location
  currentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  currentText: {
    flex: 1,
    gap: 4,
  },
  currentName: {
    fontSize: 21,
    fontWeight: '700',
    color: '#000',
    lineHeight: 26,
  },
  currentTz: {
    fontSize: 17,
    fontWeight: '400',
    color: '#000',
  },
  fallbackText: { color: '#b36800' },
  savedAt: {
    fontSize: 11,
    fontWeight: '400',
    color: '#bbb',
  },

  // Search button
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: '#000',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  actionBtnLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 1.5,
  },

  // Recents
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  recentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  recentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ccc',
  },
  recentDotActive: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  recentName: {
    fontSize: 18,
    fontWeight: '400',
    color: '#000',
  },
  recentNameActive: {
    fontWeight: '700',
    color: '#000',
  },
  recentTz: {
    fontSize: 15,
    fontWeight: '400',
    color: '#000',
  },

  // Search view
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000',
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    padding: 0,
  },
  feedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  feedbackText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 1,
  },
  feedbackError: {
    fontSize: 15,
    color: '#555',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
  },
  resultTextWrap: {
    flex: 1,
    gap: 2,
  },
  resultName: {
    fontSize: 19,
    fontWeight: '600',
    color: '#000',
  },
  resultCoords: {
    fontSize: 13,
    color: '#888',
  },
  resultSep: {
    height: 1,
    backgroundColor: '#ccc',
    marginLeft: 46,
  },

  // Bottom quote — absolutely pinned so it never shifts when available height changes
  quoteSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 6,
    backgroundColor: '#fff',
  },
  quoteText: {
    fontSize: 17,
    fontWeight: '400',
    color: '#000',
    fontStyle: 'italic',
    lineHeight: 24,
  },
  quoteAttrib: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
    letterSpacing: 0.3,
  },
});
