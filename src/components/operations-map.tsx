"use client";

import {
  CustomOverlayMap,
  Map,
  MapMarker,
  useKakaoLoader,
} from "react-kakao-maps-sdk";
import type {
  IncidentInput,
  RankedCandidate,
} from "@/lib/domain/schemas";

interface OperationsMapProps {
  location: IncidentInput["location"];
  recommendations: RankedCandidate[];
  onPick: (location: { lat: number; lng: number }) => void;
}

function SchematicMap({
  location,
  recommendations,
}: Omit<OperationsMapProps, "onPick">) {
  const points = [
    { id: "origin", lat: location.lat, lng: location.lng, label: "사고" },
    ...recommendations.map((candidate) => ({
      id: candidate.hospital.hpid,
      lat: candidate.hospital.lat,
      lng: candidate.hospital.lng,
      label: String(candidate.rank),
    })),
  ];
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const minLat = Math.min(...lats) - 0.15;
  const maxLat = Math.max(...lats) + 0.15;
  const minLng = Math.min(...lngs) - 0.15;
  const maxLng = Math.max(...lngs) + 0.15;

  return (
    <div className="schematic-map" aria-label="경북 병원 위치 개략도">
      <div className="map-grid" />
      <span className="map-region-label">GYEONGBUK</span>
      {points.map((point) => {
        const left = ((point.lng - minLng) / (maxLng - minLng)) * 76 + 12;
        const top = (1 - (point.lat - minLat) / (maxLat - minLat)) * 70 + 15;
        return (
          <span
            className={`schematic-marker ${
              point.id === "origin" ? "origin" : "hospital"
            }`}
            key={point.id}
            style={{ left: `${left}%`, top: `${top}%` }}
          >
            {point.label}
          </span>
        );
      })}
      <div className="map-fallback-note">
        지도 키 미설정 · 좌표 기반 개략 표시
      </div>
    </div>
  );
}

function KakaoOperationsMap({
  appKey,
  location,
  recommendations,
  onPick,
}: OperationsMapProps & { appKey: string }) {
  const [loading, error] = useKakaoLoader({
    appkey: appKey,
    libraries: ["services"],
  });

  if (loading || error) {
    return (
      <SchematicMap
        location={location}
        recommendations={recommendations}
      />
    );
  }

  return (
    <Map
      center={{ lat: location.lat, lng: location.lng }}
      className="kakao-map"
      level={10}
      onClick={(_map, event) =>
        onPick({
          lat: event.latLng.getLat(),
          lng: event.latLng.getLng(),
        })
      }
    >
      <MapMarker position={{ lat: location.lat, lng: location.lng }} />
      <CustomOverlayMap position={{ lat: location.lat, lng: location.lng }}>
        <span className="map-label origin-label">사고지점</span>
      </CustomOverlayMap>
      {recommendations.map((candidate) => (
        <div key={candidate.hospital.hpid}>
          <MapMarker
            position={{
              lat: candidate.hospital.lat,
              lng: candidate.hospital.lng,
            }}
          />
          <CustomOverlayMap
            position={{
              lat: candidate.hospital.lat,
              lng: candidate.hospital.lng,
            }}
          >
            <span className="map-label hospital-label">
              {candidate.rank}. {candidate.hospital.name}
            </span>
          </CustomOverlayMap>
        </div>
      ))}
    </Map>
  );
}

export function OperationsMap(props: OperationsMapProps) {
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
  return appKey ? (
    <KakaoOperationsMap {...props} appKey={appKey} />
  ) : (
    <SchematicMap
      location={props.location}
      recommendations={props.recommendations}
    />
  );
}
