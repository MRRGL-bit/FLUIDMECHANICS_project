/** Bounded Y-axis domains for Fab-range thickness charts */

export function coreThicknessYDomain(
  thicknessNm: number[],
  h0Nm: number,
): [number, number] {
  const h0 = Math.max(h0Nm, 1);
  if (thicknessNm.length === 0) {
    return [h0 * 0.4, h0 * 1.05];
  }

  const finite = thicknessNm.filter((v) => Number.isFinite(v) && v >= 0);
  if (finite.length === 0) {
    return [h0 * 0.4, h0 * 1.05];
  }

  const dataMin = Math.min(...finite);
  const dataMax = Math.max(...finite);
  const minH = Math.min(dataMin, h0);
  const maxH = Math.max(dataMax, h0);
  const span = Math.max(maxH - minH, h0 * 0.02);
  const pad = Math.max(span * 0.1, h0 * 0.025);

  const yMin = Math.max(0, minH - pad);
  const yMax = Math.min(h0 * 1.06, maxH + pad);

  if (yMax - yMin < h0 * 0.05) {
    return [Math.max(0, minH - h0 * 0.03), Math.min(h0 * 1.06, maxH + h0 * 0.03)];
  }
  return [yMin, yMax];
}

export function waferProfileYDomain(
  targetNm: number,
  lowerBoundNm: number,
  upperBoundNm: number,
  profileThicknessNm: number[],
): [number, number] {
  const t = Math.max(targetNm, 1);
  const finite = profileThicknessNm.filter((v) => Number.isFinite(v) && v >= 0);
  const peak = finite.length > 0 ? Math.max(...finite) : t * 1.04;

  const yMin = Math.min(lowerBoundNm, t) * 0.992;
  const yMax = Math.max(upperBoundNm, peak) * 1.008;
  const maxSpan = t * 0.12;
  const clampedMax = Math.min(yMax, t + maxSpan);

  if (clampedMax <= yMin) {
    return [t * 0.96, t * 1.06];
  }
  return [yMin, clampedMax];
}

export function validationThicknessYDomain(
  series: { hNumerical: number; hAnalytical: number }[],
  h0Nm: number,
): [number, number] {
  const all = series.flatMap((r) => [r.hNumerical, r.hAnalytical]);
  return coreThicknessYDomain(all, h0Nm);
}
