import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Platform,
  Modal,
  Dimensions,
  AppState,
} from 'react-native';

const WIN = Dimensions.get('window');
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useLocation } from '@/contexts/LocationContext';
import { MapPin, ChevronLeft, ChevronRight } from 'lucide-react-native';
import {
  calculateAstroData,
  formatTime,
  formatDate,
  azimuthToCardinal,
  AstroData,
  getLocationMidnightUTC,
  locationNoonUTC,
} from '@/utils/astronomy';
import LocationModal from '@/components/LocationModal';
import TabHeader from '@/components/TabHeader';
import MoonIcon from '@/components/MoonIcon';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function resolveTimezoneLabel(timezone: string | undefined): { label: string; isFallback: boolean } {
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat('en', {
        timeZone: timezone,
        timeZoneName: 'short',
      }).formatToParts(new Date());
      const abbr = parts.find((p) => p.type === 'timeZoneName')?.value ?? timezone;
      return { label: abbr, isFallback: false };
    } catch {
      return { label: timezone, isFallback: false };
    }
  }
  const deviceAbbr = new Intl.DateTimeFormat('en', { timeZoneName: 'short' })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName')?.value ?? 'Local';
  return { label: `${deviceAbbr} (device)`, isFallback: true };
}

function isSameDay(a: Date, b: Date, timezone?: string): boolean {
  if (timezone) {
    const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d);
    return fmt(a) === fmt(b);
  }
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Extracts { year, month (0-indexed), day } from a Date in the given timezone,
// falling back to device-local when no timezone is provided.
function getLocalDateParts(date: Date, timezone?: string): { year: number; month: number; day: number } {
  if (timezone) {
    try {
      const str = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
      const [Y, M, D] = str.split('-').map(Number);
      return { year: Y, month: M - 1, day: D };
    } catch {
      // Invalid timezone — fall through to device-local
    }
  }
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

// Creates a Date whose UTC value equals noon in `timezone` for the location calendar
// date specified by (year, month0, day). Handles UTC+12/13/14 where noon UTC of the
// target date maps to the following local day.
function locationNoonForComponents(year: number, month0: number, day: number, timezone?: string): Date {
  if (!timezone) {
    return new Date(year, month0, day, 12, 0, 0, 0);
  }
  try {
    const probe = new Date(Date.UTC(year, month0, day, 12));
    const str = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(probe);
    const [pY, pM, pD] = str.split('-').map(Number);
    const finalProbe =
      pY === year && pM - 1 === month0 && pD === day
        ? probe
        : new Date(Date.UTC(year, month0, day - 1, 12));
    return new Date(getLocationMidnightUTC(finalProbe, timezone).getTime() + 12 * 3600 * 1000);
  } catch {
    // Invalid timezone — fall back to device-local noon
    return new Date(year, month0, day, 12, 0, 0, 0);
  }
}

function CalendarModal({
  visible,
  selected,
  onSelect,
  onClose,
  timezone,
}: {
  visible: boolean;
  selected: Date;
  onSelect: (d: Date) => void;
  onClose: () => void;
  timezone?: string;
}) {
  const selParts = getLocalDateParts(selected, timezone);
  const [viewYear, setViewYear] = useState(selParts.year);
  const [viewMonth, setViewMonth] = useState(selParts.month);

  useEffect(() => {
    if (visible) {
      const p = getLocalDateParts(selected, timezone);
      setViewYear(p.year);
      setViewMonth(p.month);
    }
  }, [visible]);

  const prevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) { setViewYear((y) => y - 1); return 11; }
      return m - 1;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) { setViewYear((y) => y + 1); return 0; }
      return m + 1;
    });
  }, []);

  const goToday = useCallback(() => {
    const tp = getLocalDateParts(new Date(), timezone);
    setViewYear(tp.year);
    setViewMonth(tp.month);
    onSelect(locationNoonForComponents(tp.year, tp.month, tp.day, timezone));
  }, [onSelect, timezone]);

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  // Always pad to exactly 42 cells (6 rows) so modal height never changes
  while (cells.length < 42) cells.push(null);

  const todayParts = getLocalDateParts(new Date(), timezone);

  const isSelectedDay = (day: number) =>
    selParts.year === viewYear &&
    selParts.month === viewMonth &&
    selParts.day === day;

  const isTodayDay = (day: number) =>
    todayParts.year === viewYear &&
    todayParts.month === viewMonth &&
    todayParts.day === day;

  const isNotToday = !isSameDay(selected, new Date(), timezone);

  return (
    <Modal visible={visible} transparent={false} animationType="none" onRequestClose={onClose}>
      <View style={cal.screen}>
        <View style={cal.sheet}>
          <View style={cal.monthRow}>
            <TouchableOpacity style={cal.navBtn} onPress={prevMonth} activeOpacity={1}>
              <ChevronLeft size={28} color="#000" strokeWidth={2.5} />
            </TouchableOpacity>
            <Text style={cal.monthLabel}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
            <TouchableOpacity style={cal.navBtn} onPress={nextMonth} activeOpacity={1}>
              <ChevronRight size={28} color="#000" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <View style={cal.dowRow}>
            {DAY_LABELS.map((d) => (
              <Text key={d} style={cal.dowLabel}>{d}</Text>
            ))}
          </View>

          {Array.from({ length: cells.length / 7 }, (_, row) => (
            <View key={row} style={cal.gridRow}>
              {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                if (day === null) return <View key={col} style={cal.cell} />;
                const sel = isSelectedDay(day);
                const tod = isTodayDay(day);
                return (
                  <TouchableOpacity
                    key={col}
                    style={[cal.cell, sel && cal.cellSelected, !sel && tod && cal.cellToday]}
                    activeOpacity={1}
                    onPress={() => {
                      onSelect(locationNoonForComponents(viewYear, viewMonth, day, timezone));
                      onClose();
                    }}
                  >
                    <Text style={[cal.cellText, sel && cal.cellTextSelected, !sel && tod && cal.cellTextToday]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          <View style={cal.footer}>
            <TouchableOpacity
              style={isNotToday ? cal.todayBtn : cal.todayBtnActive}
              onPress={goToday}
              activeOpacity={1}
            >
              <Text style={isNotToday ? cal.todayBtnLabel : cal.todayBtnLabelActive}>TODAY</Text>
            </TouchableOpacity>
            <TouchableOpacity style={cal.doneBtn} onPress={onClose} activeOpacity={1}>
              <Text style={cal.doneBtnLabel}>DONE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}


function Row({
  label,
  value,
  badge,
  sub,
  divider = true,
}: {
  label: string;
  value: string;
  badge?: string;
  sub?: string;
  divider?: boolean;
}) {
  return (
    <View style={[styles.row, !divider && styles.rowNoDivider]}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      <View style={styles.rowRight}>
        {badge ? <Text style={styles.rowBadge}>{badge}</Text> : null}
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

// Cache key uses location-tz date string to avoid stale entries across timezone changes
function makeCacheKey(date: Date, lat: number, lon: number, timezone?: string): string {
  let dateStr = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  if (timezone) {
    try {
      dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
    } catch {
      // Invalid timezone — use device-local date string
    }
  }
  return `${dateStr}|${lat}|${lon}`;
}

export default function AstroWatchScreen() {
  const { place, isLoading } = useLocation();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    // Start with device-local noon; re-normalized to location noon by the effect below
    // once the location (and its timezone) is loaded from storage.
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  });
  const [calVisible, setCalVisible] = useState(false);
  const [locModalVisible, setLocModalVisible] = useState(false);

  const astroCache = useRef<Map<string, AstroData>>(new Map());

  // When the location timezone changes (initial load or location switch), re-normalize
  // selectedDate to noon in the new location timezone for the same location calendar day.
  useEffect(() => {
    if (!place?.timezone) return;
    setSelectedDate((prev) => locationNoonUTC(prev, place.timezone!));
  }, [place?.timezone]);

  // When the app returns to foreground, reset to today in the location timezone.
  // Re-registers whenever the timezone changes so the handler always uses the current value.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        const tp = getLocalDateParts(new Date(), place?.timezone);
        setSelectedDate(locationNoonForComponents(tp.year, tp.month, tp.day, place?.timezone));
      }
    });
    return () => sub.remove();
  }, [place?.timezone]);

  // Synchronous — same render cycle as selectedDate change, no extra render pass
  const data = useMemo<AstroData | null>(() => {
    if (!place) return null;
    const { latitude, longitude } = place.coords;
    const key = makeCacheKey(selectedDate, latitude, longitude, place.timezone);
    const cache = astroCache.current;
    if (!cache.has(key)) {
      cache.set(key, calculateAstroData(latitude, longitude, selectedDate, place.timezone));
    }
    return cache.get(key)!;
  }, [place, selectedDate]);

  // Prime prev/next entries after render so arrow taps always hit cache
  useEffect(() => {
    if (!place) return;
    const { latitude, longitude } = place.coords;
    const cache = astroCache.current;
    [-1, 1].forEach((delta) => {
      const d = addDays(selectedDate, delta);
      const key = makeCacheKey(d, latitude, longitude, place.timezone);
      if (!cache.has(key)) {
        cache.set(key, calculateAstroData(latitude, longitude, d, place.timezone));
      }
    });
  }, [place, selectedDate]);

  const changeDate = useCallback((delta: number) => {
    setSelectedDate((prev) => addDays(prev, delta));
  }, []);

  const isToday = isSameDay(selectedDate, new Date(), place?.timezone);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <LocationModal visible={locModalVisible} onClose={() => setLocModalVisible(false)} />

      <CalendarModal
        visible={calVisible}
        selected={selectedDate}
        onSelect={setSelectedDate}
        onClose={() => setCalVisible(false)}
        timezone={place?.timezone}
      />

      <TabHeader
        label={formatDate(selectedDate, place?.timezone)}
        isToday={isToday}
        onPrev={() => changeDate(-1)}
        onNext={() => changeDate(1)}
        onLabelPress={() => setCalVisible(true)}
        onBackToToday={() => {
          const tp = getLocalDateParts(new Date(), place?.timezone);
          setSelectedDate(locationNoonForComponents(tp.year, tp.month, tp.day, place?.timezone));
        }}
      />

      <View style={styles.metaBlock}>
        <TouchableOpacity style={styles.metaLeft} onPress={() => setLocModalVisible(true)} activeOpacity={1}>
          <View style={styles.metaLeftText}>
            <Text style={styles.metaCoords} numberOfLines={1}>
              {place ? place.name : 'TAP TO SET LOCATION'}
            </Text>
            {place && (() => {
              const { label, isFallback } = resolveTimezoneLabel(place.timezone);
              return (
                <Text style={[styles.tzLabel, isFallback && styles.tzLabelFallback]}>
                  {label}
                </Text>
              );
            })()}
          </View>
        </TouchableOpacity>
        {data && (
          <TouchableOpacity style={styles.metaRight} onPress={() => router.navigate('/night')} activeOpacity={1}>
            <MoonIcon phase={data.moonPhase} size={36} />
            <Text style={styles.moonIllumLabel}>{Math.round(data.moonIllumination * 100)}%</Text>
          </TouchableOpacity>
        )}
      </View>

      {!place && !isLoading && (
        <View style={styles.emptyBlock}>
          <MapPin size={40} color="#ccc" strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>No Location Set</Text>
          <Text style={styles.emptyBody}>Tap the location bar above to set your city.</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => setLocModalVisible(true)} activeOpacity={1}>
            <Text style={styles.emptyBtnLabel}>SET LOCATION</Text>
          </TouchableOpacity>
        </View>
      )}

      {data && place && (
        <View style={styles.content}>
          <SectionHeader title="SUN" />
          <Row label="Astro Dawn" value={formatTime(data.astroDawn, place.timezone, 'No Astro Night')} />
          <Row label="Sunrise" value={formatTime(data.sunrise, place.timezone)} />
          <Row label="Sunset" value={formatTime(data.sunset, place.timezone)} />
          <Row label="Astro Dusk" value={formatTime(data.astroDusk, place.timezone, 'No Astro Night')} divider={false} />

          <SectionHeader title="MOON" />
          <Row
            label="Phase"
            value={data.moonPhaseDesc}
            sub={`${Math.round(data.moonIllumination * 100)}% lit`}
          />
          {data.moonAlwaysUp ? (
            <Row label="Moonrise" value="Above horizon all day" divider={false} />
          ) : data.moonAlwaysDown ? (
            <Row label="Moonrise" value="Below horizon all day" divider={false} />
          ) : (() => {
            const riseRow = (
              <Row
                label="Moonrise"
                value={formatTime(data.moonrise, place.timezone, 'No Rise')}
                badge={data.moonriseAzimuth != null ? azimuthToCardinal(data.moonriseAzimuth) : undefined}
              />
            );
            const setRow = (
              <Row
                label="Moonset"
                value={formatTime(data.moonset, place.timezone, 'No Set')}
                badge={data.moonsetAzimuth != null ? azimuthToCardinal(data.moonsetAzimuth) : undefined}
                divider={false}
              />
            );
            // Show events in the chronological order they occur during the location day.
            // When only one event exists, the other shows N/A via formatTime; keep set below rise.
            const setFirst =
              data.moonset != null &&
              data.moonrise != null &&
              data.moonset.getTime() < data.moonrise.getTime();
            return setFirst ? <>{setRow}{riseRow}</> : <>{riseRow}{setRow}</>;
          })()}
        </View>
      )}
    </SafeAreaView>
  );
}

const cal = StyleSheet.create({
  screen: {
    width: WIN.width,
    height: WIN.height,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: '#fff',
    width: '92%',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    borderWidth: 3,
    borderColor: '#000',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navBtn: { padding: 10 },
  monthLabel: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 0.5,
  },
  dowRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  dowLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.5,
  },
  gridRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  cell: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cellSelected: { backgroundColor: '#000', borderColor: 'transparent' },
  cellToday: { borderColor: '#000' },
  cellText: { fontSize: 19, fontWeight: '500', color: '#000' },
  cellTextSelected: { color: '#fff', fontWeight: '800' },
  cellTextToday: { fontWeight: '800' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
  },
  todayBtn: {
    borderWidth: 2,
    borderColor: '#000',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  todayBtnActive: {
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: '#000',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  todayBtnLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 1.5,
  },
  todayBtnLabelActive: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1.5,
  },
  doneBtn: {
    backgroundColor: '#000',
    paddingHorizontal: 28,
    paddingVertical: 10,
  },
  doneBtnLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1.5,
  },
});

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? Constants.statusBarHeight : 0,
  },
  metaBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    flex: 1,
  },
  metaLeftText: {
    flex: 1,
    gap: 1,
  },
  metaCoords: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  tzLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    letterSpacing: 0.3,
  },
  tzLabelFallback: {
    color: '#b36800',
  },
  metaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moonIllumLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  emptyBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 1,
  },
  emptyBody: {
    fontSize: 15,
    color: '#777',
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyBtn: {
    marginTop: 8,
    borderWidth: 2,
    borderColor: '#000',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyBtnLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 1.5,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 4,
    justifyContent: 'space-evenly',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 3,
    marginTop: 8,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  rowNoDivider: {},
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    flex: 1,
  },
  rowLabel: {
    fontSize: 19,
    color: '#333',
    fontWeight: '500',
  },
  rowSub: {
    fontSize: 16,
    color: '#000',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowBadge: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  rowValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    fontVariant: ['tabular-nums'],
  },
});
