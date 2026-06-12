import SunCalc from 'suncalc';

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Galactic Centre coordinates (J2000): RA 17h 45m 40s, Dec -29° 0' 28"
const GC_RA = (17 + 45 / 60 + 40 / 3600) * 15; // degrees
const GC_DEC = -(29 + 0 / 60 + 28 / 3600); // degrees

function galacticCentreAltAz(date: Date, lat: number, lon: number): { alt: number; az: number } {
  // Julian date
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;

  // Greenwich Mean Sidereal Time (degrees)
  const GMST = (280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T) % 360;
  const LST = ((GMST + lon) % 360 + 360) % 360;

  const HA = ((LST - GC_RA) % 360 + 360) % 360;

  const decRad = toRad(GC_DEC);
  const latRad = toRad(lat);
  const haRad = toRad(HA);

  const sinAlt = Math.sin(decRad) * Math.sin(latRad) + Math.cos(decRad) * Math.cos(latRad) * Math.cos(haRad);
  const alt = toDeg(Math.asin(sinAlt));

  const cosAz = (Math.sin(decRad) - Math.sin(latRad) * sinAlt) / (Math.cos(latRad) * Math.cos(toRad(alt)));
  let az = toDeg(Math.acos(Math.max(-1, Math.min(1, cosAz))));
  if (Math.sin(haRad) > 0) az = 360 - az;

  return { alt, az };
}

function scanGalacticWindow(
  date: Date,
  lat: number,
  lon: number,
  astroDusk: Date | undefined,
  astroDawn: Date | undefined,
): MilkyWayWindow[] {
  const windows: MilkyWayWindow[] = [];
  // Fall back to nautical/civil times or fixed hours when astro darkness is unavailable
  const start = astroDusk ?? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 21, 0, 0);
  const end = astroDawn ?? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 4, 0, 0);

  const stepMs = 5 * 60 * 1000;
  let inWindow = false;
  let windowStart: Date | null = null;
  let peakAlt = -90;
  let peakTime: Date | null = null;

  for (let t = start.getTime(); t <= end.getTime(); t += stepMs) {
    const d = new Date(t);
    const { alt } = galacticCentreAltAz(d, lat, lon);
    if (alt > 10) {
      if (!inWindow) {
        inWindow = true;
        windowStart = d;
        peakAlt = alt;
        peakTime = d;
      } else if (alt > peakAlt) {
        peakAlt = alt;
        peakTime = d;
      }
    } else if (inWindow) {
      inWindow = false;
      windows.push({ start: windowStart!, end: d, peakAlt, peakTime: peakTime! });
      windowStart = null;
      peakAlt = -90;
      peakTime = null;
    }
  }
  if (inWindow && windowStart) {
    windows.push({ start: windowStart, end: new Date(end.getTime()), peakAlt, peakTime: peakTime! });
  }
  return windows;
}

export interface MilkyWayWindow {
  start: Date;
  end: Date;
  peakAlt: number;
  peakTime: Date;
}

export interface MilkyWayData {
  gcAltNow: number;
  gcAzNow: number;
  gcVisibleNow: boolean;
  windows: MilkyWayWindow[];
  moonIllumination: number;
  darkEnough: boolean; // astro darkness available tonight
  bestWindow: MilkyWayWindow | null;
  viewingQuality: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Not Visible';
}

// Galactic plane points: sample galactic longitudes 0..360 and convert to equatorial RA/Dec
// Galactic north pole: RA 192.859°, Dec 27.128°; Galactic centre: l=0 => RA 266.405°, Dec -28.936°
const GP_NORTH_RA = 192.859; // deg
const GP_NORTH_DEC = 27.128; // deg
const GP_ASCENDING_RA = 282.860; // RA of ascending node of galactic plane on equator

function galLonToEquatorial(l: number): { ra: number; dec: number } {
  const lRad = toRad(l);
  const gnpDecRad = toRad(GP_NORTH_DEC);
  const gnpRaRad = toRad(GP_NORTH_RA);
  const theta = toRad(GP_ASCENDING_RA); // RA of ascending node

  // Galactic coords b=0, l=l -> equatorial
  const sinDec = Math.sin(gnpDecRad) * Math.sin(lRad - toRad(33)) +
    Math.cos(gnpDecRad) * Math.cos(lRad - toRad(33)) * 0; // b=0
  // Proper formula for b=0 galactic plane to equatorial:
  const b = 0;
  const bRad = toRad(b);
  const sinDecEq =
    Math.cos(bRad) * Math.cos(gnpDecRad) * Math.sin(lRad - toRad(123)) +
    Math.sin(bRad) * Math.sin(gnpDecRad);
  const decEq = toDeg(Math.asin(Math.max(-1, Math.min(1, sinDecEq))));

  const y = Math.cos(bRad) * Math.cos(lRad - toRad(123));
  const x =
    Math.sin(bRad) * Math.cos(gnpDecRad) -
    Math.cos(bRad) * Math.sin(gnpDecRad) * Math.sin(lRad - toRad(123));
  const raEq = ((toDeg(Math.atan2(y, x)) + toRad(GP_NORTH_RA) * (180 / Math.PI)) % 360 + 360) % 360;

  // Simpler: use the standard galactic->equatorial rotation directly
  // NGP: RA=192.859, Dec=27.128; ascending node RA=282.86
  // For b=0: ra = 282.86 - atan2( cos(l-33)*sin(gnpDec), sin(l-33) ) ...
  // Using direct rotation matrix approach:
  const cosB = Math.cos(bRad);
  const sinB = Math.sin(bRad);
  const cosDngp = Math.cos(gnpDecRad);
  const sinDngp = Math.sin(gnpDecRad);
  const lShift = lRad - toRad(123.932); // l - 33 + 90 = l - 123.932 ... standard offset
  const sinDecFinal = cosB * cosDngp * Math.sin(lShift) + sinB * sinDngp;
  const decFinal = toDeg(Math.asin(Math.max(-1, Math.min(1, sinDecFinal))));
  const cosDecFinal = Math.cos(toRad(decFinal));
  const yFinal = cosB * Math.cos(lShift);
  const xFinal = sinB * cosDngp - cosB * sinDngp * Math.sin(lShift);
  const raOffset = toDeg(Math.atan2(yFinal, xFinal));
  const raFinal = ((GP_NORTH_RA - 90 + raOffset) % 360 + 360) % 360;

  return { ra: raFinal, dec: decFinal };
}

function equatorialToAltAz(
  ra: number, dec: number, date: Date, lat: number, lon: number
): { alt: number; az: number } {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  const GMST = (280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T) % 360;
  const LST = ((GMST + lon) % 360 + 360) % 360;
  const HA = ((LST - ra) % 360 + 360) % 360;

  const decRad = toRad(dec);
  const latRad = toRad(lat);
  const haRad = toRad(HA);

  const sinAlt = Math.sin(decRad) * Math.sin(latRad) + Math.cos(decRad) * Math.cos(latRad) * Math.cos(haRad);
  const alt = toDeg(Math.asin(Math.max(-1, Math.min(1, sinAlt))));

  const cosAz = (Math.sin(decRad) - Math.sin(latRad) * sinAlt) / (Math.cos(latRad) * Math.cos(toRad(alt)));
  let az = toDeg(Math.acos(Math.max(-1, Math.min(1, cosAz))));
  if (Math.sin(haRad) > 0) az = 360 - az;

  return { alt, az };
}

export interface GalacticPlanePoint {
  alt: number;
  az: number;
  l: number; // galactic longitude 0-360
}

// Returns 72 points along the galactic plane (every 5°)
export function getGalacticPlanePoints(date: Date, lat: number, lon: number): GalacticPlanePoint[] {
  const points: GalacticPlanePoint[] = [];
  for (let l = 0; l < 360; l += 5) {
    const { ra, dec } = galLonToEquatorial(l);
    const { alt, az } = equatorialToAltAz(ra, dec, date, lat, lon);
    points.push({ alt, az, l });
  }
  return points;
}

export function calculateMilkyWayData(lat: number, lon: number, date: Date): MilkyWayData {
  const now = date;
  const { alt: gcAltNow, az: gcAzNow } = galacticCentreAltAz(now, lat, lon);
  const sunTimes = SunCalc.getTimes(now, lat, lon);
  const moonIllum = SunCalc.getMoonIllumination(now);

  // Use astronomical dusk/dawn when available; fall back to nautical, then sunset/sunrise
  const dusk = sunTimes.night ?? sunTimes.nauticalDusk ?? sunTimes.sunset;
  const dawn = sunTimes.nightEnd ?? sunTimes.nauticalDawn ?? sunTimes.sunrise;

  const windows = scanGalacticWindow(now, lat, lon, dusk, dawn);
  const bestWindow = windows.reduce<MilkyWayWindow | null>((best, w) => {
    if (!best || w.peakAlt > best.peakAlt) return w;
    return best;
  }, null);

  const moonFrac = moonIllum.fraction;
  // darkEnough: at least some night darkness (nautical counts)
  const darkEnough = !!(dusk && dawn);

  let viewingQuality: MilkyWayData['viewingQuality'];
  if (!bestWindow) {
    viewingQuality = 'Not Visible';
  } else if (moonFrac > 0.7) {
    viewingQuality = 'Poor';
  } else if (moonFrac > 0.4) {
    viewingQuality = 'Fair';
  } else if (bestWindow.peakAlt > 30) {
    viewingQuality = 'Excellent';
  } else {
    viewingQuality = 'Good';
  }

  return {
    gcAltNow,
    gcAzNow,
    gcVisibleNow: gcAltNow > 10,
    windows,
    moonIllumination: moonFrac,
    darkEnough,
    bestWindow,
    viewingQuality,
  };
}

export function azimuthToCardinal(az: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(((az % 360) + 360) % 360 / 22.5) % 16;
  return dirs[idx];
}


export function getMoonPhaseDescription(phase: number): string {
  if (phase < 0.0625) return 'New Moon';
  if (phase < 0.1875) return 'Waxing Crescent';
  if (phase < 0.3125) return 'First Quarter';
  if (phase < 0.4375) return 'Waxing Gibbous';
  if (phase < 0.5625) return 'Full Moon';
  if (phase < 0.6875) return 'Waning Gibbous';
  if (phase < 0.8125) return 'Last Quarter';
  if (phase < 0.9375) return 'Waning Crescent';
  return 'New Moon';
}

export function formatTime(date: Date | undefined | null, timezone?: string, fallback = 'N/A'): string {
  if (!date || isNaN(date.getTime())) return fallback;
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timezone ? { timeZone: timezone } : {}),
  });
}

export function formatCoords(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(3)}° ${latDir}   ${Math.abs(lon).toFixed(3)}° ${lonDir}`;
}

export function formatDate(date: Date, timezone?: string): string {
  if (timezone) {
    try {
      return date.toLocaleDateString('en-GB', {
        timeZone: timezone,
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      // Invalid timezone — fall through to device-local format
    }
  }
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = date.getDate();
  const m = months[date.getMonth()];
  const y = date.getFullYear();
  return `${d} ${m} ${y}`;
}

export interface AstroData {
  sunrise: Date | undefined;
  sunset: Date | undefined;
  astroDawn: Date | undefined;
  astroDusk: Date | undefined;
  moonrise: Date | undefined;
  moonset: Date | undefined;
  moonriseAzimuth: number | null;
  moonsetAzimuth: number | null;
  moonAlwaysUp: boolean;
  moonAlwaysDown: boolean;
  moonPhase: number;
  moonPhaseDesc: string;
  moonIllumination: number;
  nauticalDawn: Date | undefined;
  nauticalDusk: Date | undefined;
}

// Returns the UTC timestamp corresponding to midnight at the start of `date`
// as seen in the given IANA timezone. Probes at noon UTC to get a DST-stable
// offset (DST transitions almost never occur at midnight).
export function getLocationMidnightUTC(date: Date, timezone: string): Date {
  try {
    // en-CA reliably formats as "YYYY-MM-DD"
    const localDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
    const [Y, M, D] = localDateStr.split('-').map(Number);

    const probeUTC = new Date(Date.UTC(Y, M - 1, D, 12));
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(probeUTC);
    const get = (type: string) => {
      const v = parts.find((p) => p.type === type)?.value ?? '0';
      return Number(v === '24' ? '0' : v);
    };
    // offset = local(probe) − UTC(probe) in seconds; probe was 12:00 UTC
    const offsetSec = (get('hour') - 12) * 3600 + get('minute') * 60 + get('second');

    // midnight_local = midnight_UTC + offset  →  midnight_UTC = Date.UTC(Y,M-1,D) − offset
    return new Date(Date.UTC(Y, M - 1, D) - offsetSec * 1000);
  } catch {
    // Invalid or unrecognized IANA timezone — fall back to device-local midnight
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}

// Returns noon in the location timezone for the calendar day that `date` falls on
// in that timezone. This is the canonical anchor for all SunCalc and date-display calls.
export function locationNoonUTC(date: Date, timezone: string): Date {
  return new Date(getLocationMidnightUTC(date, timezone).getTime() + 12 * 3600 * 1000);
}

// Queries SunCalc for the previous, current, and next device-timezone days and
// returns only the rise/set events that fall within the selected location's
// calendar day. This is required because SunCalc.getMoonTimes anchors its scan
// window to device-local midnight, which may not align with the location's day
// when the device timezone differs from the location timezone.
function getMoonTimesForLocationDay(
  date: Date,
  lat: number,
  lon: number,
  timezone: string,
): { rise: Date | undefined; set: Date | undefined; alwaysUp: boolean; alwaysDown: boolean } {
  const dayStart = getLocationMidnightUTC(date, timezone).getTime();
  // 24 h window; ±1 h DST error is acceptable for astronomical display
  const dayEnd = dayStart + 24 * 3600 * 1000;

  let rise: Date | undefined;
  let set: Date | undefined;
  let alwaysUp = false;
  let alwaysDown = false;

  for (let delta = -1; delta <= 1; delta++) {
    const probe = new Date(date.getTime() + delta * 24 * 3600 * 1000);
    const mt = SunCalc.getMoonTimes(probe, lat, lon) as {
      rise?: Date;
      set?: Date;
      alwaysUp?: boolean;
      alwaysDown?: boolean;
    };

    // Use the current day's call as the source of truth for always-up/down
    if (delta === 0) {
      alwaysUp = !!mt.alwaysUp;
      alwaysDown = !!mt.alwaysDown;
    }

    if (!rise && mt.rise) {
      const t = mt.rise.getTime();
      if (t >= dayStart && t < dayEnd) rise = mt.rise;
    }
    if (!set && mt.set) {
      const t = mt.set.getTime();
      if (t >= dayStart && t < dayEnd) set = mt.set;
    }
  }

  return {
    rise,
    set,
    // Only flag always-up/down when no events were found in the window
    alwaysUp: alwaysUp && !rise && !set,
    alwaysDown: alwaysDown && !rise && !set,
  };
}

function getMoonAzimuthAt(date: Date | undefined, lat: number, lon: number): number | null {
  if (!date) return null;
  const pos = SunCalc.getMoonPosition(date, lat, lon);
  // SunCalc azimuth is south-based, convert to N=0 clockwise
  const az = (toDeg(pos.azimuth) + 180 + 360) % 360;
  return az;
}

export function calculateAstroData(lat: number, lon: number, date?: Date, timezone?: string): AstroData {
  const now = date ?? new Date();
  // Anchor sun calculations to noon in the location timezone so that SunCalc's
  // Julian-day arithmetic always falls on the correct location calendar day,
  // regardless of the device timezone.
  const sunAnchor = timezone ? locationNoonUTC(now, timezone) : now;

  const sunTimes = SunCalc.getTimes(sunAnchor, lat, lon);
  const moonTimes = timezone
    ? getMoonTimesForLocationDay(now, lat, lon, timezone)
    : (SunCalc.getMoonTimes(now, lat, lon) as {
        rise?: Date;
        set?: Date;
        alwaysUp?: boolean;
        alwaysDown?: boolean;
      });
  const moonIllum = SunCalc.getMoonIllumination(sunAnchor);

  return {
    sunrise: sunTimes.sunrise,
    sunset: sunTimes.sunset,
    astroDawn: sunTimes.nightEnd,
    astroDusk: sunTimes.night,
    moonrise: moonTimes.rise,
    moonset: moonTimes.set,
    moonriseAzimuth: getMoonAzimuthAt(moonTimes.rise, lat, lon),
    moonsetAzimuth: getMoonAzimuthAt(moonTimes.set, lat, lon),
    moonAlwaysUp: !!moonTimes.alwaysUp,
    moonAlwaysDown: !!moonTimes.alwaysDown,
    moonPhase: moonIllum.phase,
    moonPhaseDesc: getMoonPhaseDescription(moonIllum.phase),
    moonIllumination: moonIllum.fraction,
    nauticalDawn: sunTimes.nauticalDawn,
    nauticalDusk: sunTimes.nauticalDusk,
  };
}

