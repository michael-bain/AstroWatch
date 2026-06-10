import Svg, { Circle, Path } from 'react-native-svg';

// Exact same rendering logic as the Moon tab calendar icons.
// SVG centered at (0,0), radius r.
// Lit area uses two arcs: outer semicircle + terminator ellipse (rx=tx, ry=r).
// SVG y-axis is down, so sweep=1 is clockwise on screen.
// From (0,r) [bottom]: sweep=1 goes LEFT, sweep=0 goes RIGHT.

export default function MoonIcon({ phase, size }: { phase: number; size: number }) {
  const r = (size - 1) / 2;
  const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const waxing = phase < 0.5;
  const tx = r * Math.abs(Math.cos(Math.PI * 2 * phase));

  let litPath: string | null = null;
  if (illum > 0.02 && illum < 0.98) {
    if (waxing) {
      litPath = illum <= 0.5
        ? `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${tx} ${r} 0 0 0 0 ${-r} Z`
        : `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${tx} ${r} 0 0 1 0 ${-r} Z`;
    } else {
      litPath = illum <= 0.5
        ? `M 0 ${-r} A ${r} ${r} 0 0 0 0 ${r} A ${tx} ${r} 0 0 1 0 ${-r} Z`
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
