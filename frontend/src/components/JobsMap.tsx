import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router";
import L from "leaflet";
import { AREA_COORDS, MAP_CENTER, type JobSummary } from "@team1/shared";
import { useI18n } from "../lib/i18n.tsx";
import "leaflet/dist/leaflet.css";

const MAP_VIEW: L.LatLngExpression = [MAP_CENTER.lat, MAP_CENTER.lng];
const DEFAULT_ZOOM = 13;

function pinIcon(active: boolean) {
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -24],
    html: `<span style="
      display:block;width:28px;height:28px;border-radius:999px;
      background:${active ? "#18181b" : "#16a34a"};
      border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);
    "></span>`,
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function JobsMap({
  jobs,
  selectedId,
  onSelect,
  className = "",
  height = "h-72 lg:h-80",
}: {
  jobs: JobSummary[];
  selectedId?: string | null;
  onSelect?: (jobId: string) => void;
  className?: string;
  height?: string;
}) {
  const { t, fmt } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const points = useMemo(
    () => jobs.filter((j): j is JobSummary & { lat: number; lng: number } => j.lat != null && j.lng != null),
    [jobs],
  );
  const pointsKey = points.map((p) => `${p.id}:${p.lat}:${p.lng}`).join("|");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      attributionControl: true,
    }).setView(MAP_VIEW, DEFAULT_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || !containerRef.current) return;
    layer.clearLayers();

    const bounds = L.latLngBounds([]);
    for (const job of points) {
      const marker = L.marker([job.lat, job.lng], { icon: pinIcon(job.id === selectedId) });
      marker.bindPopup(
        `<div style="min-width:140px;font:600 12px/1.4 system-ui,sans-serif">
          <a href="/jobs/${job.id}" style="color:#18181b;text-decoration:none">${escapeHtml(job.title)}</a>
          <div style="margin-top:4px;color:#71717a;font-weight:500">${escapeHtml(fmt.area(job.area))} · ${escapeHtml(fmt.pay(job))}</div>
        </div>`,
      );
      marker.on("click", () => onSelectRef.current?.(job.id));
      marker.addTo(layer);
      bounds.extend([job.lat, job.lng]);
    }

    if (points.length === 1) {
      map.setView([points[0]!.lat, points[0]!.lng], 14);
    } else if (points.length > 1 && bounds.isValid()) {
      map.fitBounds(bounds.pad(0.2));
    } else {
      map.setView(MAP_VIEW, DEFAULT_ZOOM);
    }

    requestAnimationFrame(() => map.invalidateSize());
  }, [pointsKey, selectedId, points, fmt]);

  return (
    <div className={`overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-100 ${className}`}>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-zinc-200 bg-white">
        <p className="text-xs font-bold text-zinc-800">{t("mapTitle")}</p>
        <p className="text-[11px] text-zinc-500">{t("mapHint", { n: points.length })}</p>
      </div>
      {points.length === 0 ? (
        <div className={`${height} flex items-center justify-center text-sm text-zinc-500 px-4 text-center`}>
          {t("mapEmpty")}
        </div>
      ) : (
        <div ref={containerRef} className={`${height} w-full z-0`} role="img" aria-label={t("mapTitle")} />
      )}
      {selectedId && (
        <div className="px-4 py-2 border-t border-zinc-200 bg-white text-xs">
          <Link to={`/jobs/${selectedId}`} className="font-semibold text-zinc-900 hover:underline">
            {t("mapOpenJob")}
          </Link>
        </div>
      )}
    </div>
  );
}

/** Single-job map for detail pages. */
export function JobLocationMap({ job }: { job: JobSummary }) {
  const coords =
    job.lat != null && job.lng != null
      ? { lat: job.lat, lng: job.lng }
      : ((AREA_COORDS as Record<string, { lat: number; lng: number }>)[job.area] ?? null);
  if (!coords) return null;
  return <JobsMap jobs={[{ ...job, lat: coords.lat, lng: coords.lng }]} height="h-56" className="shadow-sm" />;
}
