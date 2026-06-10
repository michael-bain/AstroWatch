import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView,
  StatusBar, Platform, AppState,
} from 'react-native';
import Constants from 'expo-constants';
import Svg, { Circle, Path } from 'react-native-svg';
import SunCalc from 'suncalc';
import TabHeader from '@/components/TabHeader';

// ── constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const KEY_PHASES = [
  { phase: 0,    label: 'New' },
  { phase: 0.25, label: '1st Qtr' },
  { phase: 0.5,  label: 'Full' },
  { phase: 0.75, label: 'Last Qtr' },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function buildCalendar(year: number, month: number): (Date | null)[][] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d, 12, 0, 0));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ── moon icon ─────────────────────────────────────────────────────────────────
// SVG centered at (0,0), radius r.
// Lit area uses two arcs: outer semicircle + terminator ellipse (rx=tx, ry=r).
// SVG y-axis is down, so sweep=1 is clockwise on screen.
// From (0,r) [bottom]: sweep=1 goes LEFT, sweep=0 goes RIGHT.

function MoonIcon({ phase, size }: { phase: number; size: number }) {
  const r = (size - 1) / 2;
  const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const waxing = phase < 0.5;
  const tx = r * Math.abs(Math.cos(Math.PI * 2 * phase));

  let litPath: string | null = null;
  if (illum > 0.02 && illum < 0.98) {
    if (waxing) {
      litPath = illum <= 0.5
        // Crescent: right semicircle CW ↓, terminator stays right CCW ↑
        ? `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${tx} ${r} 0 0 0 0 ${-r} Z`
        // Gibbous: right semicircle CW ↓, terminator crosses left CW ↑
        : `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${tx} ${r} 0 0 1 0 ${-r} Z`;
    } else {
      litPath = illum <= 0.5
        // Crescent: left semicircle CCW ↓, terminator stays left CW ↑
        ? `M 0 ${-r} A ${r} ${r} 0 0 0 0 ${r} A ${tx} ${r} 0 0 1 0 ${-r} Z`
        // Gibbous: left semicircle CCW ↓, terminator crosses right CCW ↑
        : `M 0 ${-r} A ${r} ${r} 0 0 0 0 ${r} A ${tx} ${r} 0 0 0 0 ${-r} Z`;
    }
  }

  const m = 0.75;
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`${-(r + m)} ${-(r + m)} ${(r + m) * 2} ${(r + m) * 2}`}
    >
      <Circle cx={0} cy={0} r={r} fill={illum >= 0.98 ? 'white' : 'black'} />
      {litPath !== null && <Path d={litPath} fill="white" />}
      <Circle cx={0} cy={0} r={r} fill="none" stroke="#000" strokeWidth={0.8} />
    </Svg>
  );
}

// ── screen ────────────────────────────────────────────────────────────────────

function makeToday(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

export default function MoonScreen() {
  const [today, setToday] = useState(makeToday);

  const [viewDate, setViewDate] = useState(() => {
    const d = makeToday();
    d.setDate(1);
    return d;
  });

  // Reset to the current day/month when the app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        const now = makeToday();
        setToday(now);
        setViewDate(new Date(now.getFullYear(), now.getMonth(), 1, 12));
      }
    });
    return () => sub.remove();
  }, []);

  const month = viewDate.getMonth();
  const year = viewDate.getFullYear();

  const weeks = useMemo(() => buildCalendar(year, month), [year, month]);

  const isCurrentMonth =
    today.getMonth() === month && today.getFullYear() === year;

  const prevMonth = () =>
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1, 12));
  const nextMonth = () =>
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1, 12));
  const goToCurrentMonth = () =>
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1, 12));

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <TabHeader
        label={`${MONTHS[month]}  ${year}`}
        isToday={isCurrentMonth}
        onPrev={prevMonth}
        onNext={nextMonth}
        onLabelPress={isCurrentMonth ? undefined : goToCurrentMonth}
        onBackToToday={goToCurrentMonth}
      />

      {/* Calendar grid */}
      <View style={s.calendar}>
        {/* Day-of-week row */}
        <View style={s.dowRow}>
          {DOW.map((d, i) => (
            <Text key={i} style={s.dowText}>{d}</Text>
          ))}
        </View>
        {/* Week rows */}
        {weeks.map((week, wi) => (
          <View key={wi} style={s.weekRow}>
            {week.map((date, di) => {
              const isToday =
                isCurrentMonth && date !== null &&
                date.toDateString() === today.toDateString();
              const phase = date
                ? SunCalc.getMoonIllumination(date).phase
                : 0;
              return (
                <View key={di} style={[s.cell, isToday && s.cellToday]}>
                  {date !== null && (
                    <>
                      <Text style={[s.dayNum, isToday && s.dayNumBold]}>
                        {date.getDate()}
                      </Text>
                      <MoonIcon phase={phase} size={34} />
                    </>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {/* Phase key */}
      <View style={s.keySection}>
          <View style={s.keyRow}>
          {KEY_PHASES.map(({ phase, label }) => (
            <View key={label} style={s.keyItem}>
              <MoonIcon phase={phase} size={18} />
              <Text style={s.keyLabel}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? Constants.statusBarHeight : 0,
  },
  calendar: {
    flex: 1,
    paddingHorizontal: 4,
    paddingTop: 6,
  },
  dowRow: {
    flexDirection: 'row',
    paddingBottom: 5,
    paddingHorizontal: 2,
  },
  dowText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 0.5,
  },
  weekRow: {
    flex: 1,
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    gap: 2,
  },
  cellToday: {
    borderWidth: 1.5,
    borderColor: '#000',
  },
  dayNum: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
    lineHeight: 17,
  },
  dayNumBold: {
    fontWeight: '900',
  },
  keySection: {
    paddingBottom: 8,
  },
  keyRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  keyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  keyLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
});
