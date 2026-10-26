"use client";

import React, { useState } from "react";
import { formatCurrency } from "@/lib/money";

function computeRoundTicks(minVal: number, maxVal: number, count = 4): number[] {
  const min = Math.min(0, minVal);
  const max = maxVal <= min ? min + 100 : maxVal;
  const rawStep = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(rawStep || 1));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * mag);
  const step = candidates.find((s) => s >= rawStep) || 10 * mag;
  const lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (hi <= max) hi += step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) {
    out.push(Number(v.toFixed(2)));
  }
  return out;
}

export interface LinePoint {
  label: string;
  value: number;
  annotation?: string;
}

export function TasteLineChart({
  data,
  height = 200,
  referenceValue,
  referenceLabel,
  seriesName = "Spending",
}: {
  data: LinePoint[];
  height?: number;
  referenceValue?: number;
  referenceLabel?: string;
  seriesName?: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-[13px] text-[var(--muted)]">
        No time-series points recorded in this period.
      </div>
    );
  }

  const width = 680;
  const values = data.map((d) => d.value);
  const maxVal = Math.max(...values, referenceValue ?? 0, 100);
  const yTicks = computeRoundTicks(0, maxVal, 4);
  const topTick = yTicks[yTicks.length - 1] || 100;

  const hasAnnotation = data.some((d) => Boolean(d.annotation));
  const padT = hasAnnotation ? 26 : 12;
  const padB = 26;
  const padL = 56;
  const padR = 16;

  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xAt = (i: number) =>
    data.length <= 1
      ? padL + plotW / 2
      : padL + (i * plotW) / (data.length - 1);

  const yAt = (v: number) => padT + plotH * (1 - v / topTick);

  const pathD = data
    .map((pt, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)} ${yAt(pt.value).toFixed(1)}`)
    .join(" ");

  const xStep = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`${seriesName} trend from ${data[0]?.label} to ${data[data.length - 1]?.label}`}
        className="block overflow-visible num"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Horizontal gridlines (3-5 lines, no y-axis line) */}
        {yTicks.map((tick) => {
          const yy = yAt(tick);
          return (
            <g key={tick}>
              <line
                x1={padL}
                x2={width - padR}
                y1={yy}
                y2={yy}
                stroke="var(--grid)"
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={padL - 8}
                y={yy + 4}
                textAnchor="end"
                fontSize={12}
                fill="var(--axis-ink)"
              >
                {tick >= 1000 ? `${(tick / 1000).toFixed(tick % 1000 === 0 ? 0 : 1)}k` : tick}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {data.map((pt, i) => {
          if (i % xStep !== 0 && i !== data.length - 1) return null;
          const xx = xAt(i);
          return (
            <text
              key={`${pt.label}-${i}`}
              x={xx}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
              fontSize={12}
              fill="var(--axis-ink)"
            >
              {pt.label}
            </text>
          );
        })}

        {/* Reference dashed line */}
        {referenceValue !== undefined && referenceValue > 0 && (
          <g>
            <line
              x1={padL}
              x2={width - padR}
              y1={yAt(referenceValue)}
              y2={yAt(referenceValue)}
              stroke="var(--axis-ink)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            {referenceLabel && (
              <text
                x={width - padR}
                y={Math.max(12, yAt(referenceValue) - 5)}
                textAnchor="end"
                fontSize={12}
                fill="var(--axis-ink)"
              >
                {referenceLabel}
              </text>
            )}
          </g>
        )}

        {/* Straight 2px data line in the single chart hue */}
        <path
          d={pathD}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Event annotation marker */}
        {data.map((pt, i) => {
          if (!pt.annotation) return null;
          const xx = xAt(i);
          const yy = yAt(pt.value);
          return (
            <g key={`ann-${i}`}>
              <line
                x1={xx}
                x2={xx}
                y1={14}
                y2={yy - 4}
                stroke="var(--axis-ink)"
                strokeWidth={1}
                opacity={0.5}
              />
              <text
                x={Math.min(width - padR - 4, Math.max(padL + 4, xx + 4))}
                y={12}
                fontSize={12}
                fill="var(--axis-ink)"
              >
                {pt.annotation}
              </text>
            </g>
          );
        })}

        {/* Hover guide and single hover dot */}
        {hoverIdx !== null && data[hoverIdx] && (
          <g>
            <line
              x1={xAt(hoverIdx)}
              x2={xAt(hoverIdx)}
              y1={padT}
              y2={height - padB}
              stroke="var(--axis-ink)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.6}
            />
            <circle
              cx={xAt(hoverIdx)}
              cy={yAt(data[hoverIdx].value)}
              r={4}
              fill="var(--surface)"
              stroke="var(--chart-1)"
              strokeWidth={2}
            />
          </g>
        )}

        {/* Invisible hit columns */}
        {data.map((pt, i) => {
          const colW = plotW / Math.max(1, data.length);
          return (
            <rect
              key={`hit-${i}`}
              x={xAt(i) - colW / 2}
              y={padT}
              width={colW}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
            />
          );
        })}
      </svg>

      {hoverIdx !== null && data[hoverIdx] && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 8,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 12,
          }}
          className="num"
        >
          <span className="text-[var(--muted)] mr-2">{data[hoverIdx].label}</span>
          <strong className="font-semibold">
            {formatCurrency(data[hoverIdx].value)}
          </strong>
        </div>
      )}
    </div>
  );
}

export function TasteBarChart({
  data,
  height = 195,
  highlightIndex,
}: {
  data: Array<{ label: string; value: number; secondaryValue?: number }>;
  height?: number;
  highlightIndex?: number;
}) {
  if (data.length === 0) return null;

  const width = 560;
  const maxVal = Math.max(
    ...data.map((d) => Math.max(d.value, d.secondaryValue ?? 0)),
    100
  );
  const yTicks = computeRoundTicks(0, maxVal, 4);
  const topTick = yTicks[yTicks.length - 1] || 100;

  const padT = 12;
  const padB = 26;
  const padL = 56;
  const padR = 12;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const bandW = plotW / data.length;
  const barW = Math.min(36, Math.max(8, bandW * 0.56));
  const yAt = (v: number) => padT + plotH * (1 - v / topTick);

  const highestIdx =
    highlightIndex ??
    data.reduce(
      (best, cur, idx) => (cur.value > data[best].value ? idx : best),
      0
    );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={`Column comparison from ${data[0]?.label} to ${data[data.length - 1]?.label}`}
      className="block overflow-visible num"
    >
      {yTicks.map((tick) => {
        const yy = yAt(tick);
        return (
          <g key={tick}>
            <line
              x1={padL}
              x2={width - padR}
              y1={yy}
              y2={yy}
              stroke="var(--grid)"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <text
              x={padL - 8}
              y={yy + 4}
              textAnchor="end"
              fontSize={12}
              fill="var(--axis-ink)"
            >
              {tick >= 1000 ? `${(tick / 1000).toFixed(0)}k` : tick}
            </text>
          </g>
        );
      })}

      {data.map((d, i) => {
        const center = padL + bandW * i + bandW / 2;
        const isMain = i === highestIdx;
        const barH = Math.max(0, yAt(0) - yAt(d.value));
        return (
          <g key={d.label}>
            {d.secondaryValue !== undefined && (
              <rect
                x={center - barW / 2 - barW * 0.35}
                y={yAt(d.secondaryValue)}
                width={barW * 0.65}
                height={Math.max(0, yAt(0) - yAt(d.secondaryValue))}
                fill="var(--chart-muted)"
                shapeRendering="crispEdges"
              >
                <title>{`${d.label} Income: ${formatCurrency(d.secondaryValue)}`}</title>
              </rect>
            )}
            <rect
              x={d.secondaryValue !== undefined ? center - 2 : center - barW / 2}
              y={yAt(d.value)}
              width={d.secondaryValue !== undefined ? barW * 0.65 : barW}
              height={barH}
              fill={isMain ? "var(--chart-1)" : "var(--chart-2)"}
              shapeRendering="crispEdges"
            >
              <title>{`${d.label}: ${formatCurrency(d.value)}`}</title>
            </rect>
            <text
              x={center}
              y={height - 6}
              textAnchor="middle"
              fontSize={12}
              fill="var(--axis-ink)"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Planned against spent (Charts.plan from taste-skill):
 * The track is the plan, the filled part is confirmed spend in --chart-1,
 * committed recurring obligations are a lighter segment, and any overrun past
 * the track's end renders in --negative.
 */
export function TastePlanBars({
  rows,
}: {
  rows: Array<{
    label: string;
    planned: number;
    spent: number;
    committed?: number;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-4 text-[13px] text-[var(--muted)]">
        No category budgets configured for this month.
      </div>
    );
  }

  return (
    <ul className="grid gap-3.5 list-none p-0 m-0 num">
      {rows.map((r) => {
        const plan = Math.max(r.planned, 1);
        const over = r.spent > plan;
        const spentPct = Math.min(100, (r.spent / plan) * 100);
        const committedPct = r.committed
          ? Math.min(100 - spentPct, (r.committed / plan) * 100)
          : 0;
        const diff = plan - r.spent - (r.committed || 0);

        return (
          <li key={r.label}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5 text-[13px]">
              <span className="font-medium text-[var(--text)] truncate">
                {r.label}
              </span>
              <span className="text-right shrink-0">
                <strong className="font-semibold text-[var(--text)]">
                  {formatCurrency(r.spent)}
                </strong>{" "}
                <span className="text-[var(--muted)]">
                  of {formatCurrency(r.planned)} ·{" "}
                </span>
                <span
                  style={{
                    color: over
                      ? "var(--negative)"
                      : r.spent / plan >= 0.9
                      ? "var(--warning)"
                      : "var(--muted)",
                  }}
                >
                  {over
                    ? `${formatCurrency(r.spent - plan)} over`
                    : `${formatCurrency(Math.max(0, diff))} left`}
                </span>
              </span>
            </div>
            <div
              role="img"
              aria-label={`${r.label}: ${formatCurrency(r.spent)} of ${formatCurrency(r.planned)}`}
              className="relative h-2 rounded-full bg-[var(--rule)] overflow-visible w-full"
            >
              <span
                style={{
                  position: "absolute",
                  inset: "0 auto 0 0",
                  width: `${spentPct}%`,
                  borderRadius: 999,
                  background: over ? "var(--negative)" : "var(--chart-1)",
                }}
              />
              {committedPct > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${spentPct}%`,
                    width: `${committedPct}%`,
                    background: "var(--chart-1)",
                    opacity: 0.35,
                  }}
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Ranked list with thin 2px proportional bar under each label (Charts.barList { thin: true }).
 * Top item in --chart-1, remaining items in --chart-muted.
 */
export function TasteBarList({
  rows,
}: {
  rows: Array<{ label: string; sub?: string; value: number }>;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-4 text-[13px] text-[var(--muted)]">
        No spending recorded across cards or accounts in this period.
      </div>
    );
  }
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ol className="grid gap-3 list-none p-0 m-0 num">
      {rows.map((r, idx) => {
        const pct = Math.max(2, Math.round((r.value / max) * 100));
        return (
          <li key={r.label} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate text-[var(--text)]">
                {r.label}
                {r.sub ? (
                  <span className="text-[12px] text-[var(--muted)] ml-1.5">
                    {r.sub}
                  </span>
                ) : null}
              </span>
              <span className="font-medium text-right shrink-0">
                {formatCurrency(r.value)}
              </span>
            </div>
            <span
              style={{
                display: "block",
                height: 2,
                width: `${pct}%`,
                background:
                  idx === 0 ? "var(--chart-1)" : "var(--chart-muted)",
              }}
            />
          </li>
        );
      })}
    </ol>
  );
}
