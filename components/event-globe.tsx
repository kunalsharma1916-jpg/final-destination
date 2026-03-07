"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { parseKmlToRenderData } from "@/lib/kml";

type StagePoint = {
  stage_no: number;
  lat: number;
  lng: number;
  location_name?: string | null;
};

type Props = {
  stages: StagePoint[];
  focus?: { lat: number; lng: number; location_name?: string | null; country?: string | null } | null;
  featuredStageNo?: number;
  autoRotateDefault?: boolean;
  showControls?: boolean;
  kmlUrl?: string;
  showLabels?: boolean;
  minHeightPx?: number;
  onWarning?: (message: string | null) => void;
};

type RouteLine = { coords: Array<{ lat: number; lng: number }> };
type Marker = { lat: number; lng: number; stage_no: number; label: string; isFeatured?: boolean };
type GlobeApi = {
  pointsData: (data: unknown[]) => GlobeApi;
  pointColor: (fn: (p: unknown) => string) => GlobeApi;
  pointAltitude: (fn: (p: unknown) => number) => GlobeApi;
  pointRadius: (fn: (p: unknown) => number) => GlobeApi;
  labelsData: (data: unknown[]) => GlobeApi;
  labelText: (fn: (p: unknown) => string) => GlobeApi;
  labelColor: (fn: (p: unknown) => string) => GlobeApi;
  labelSize?: (fn: (p: unknown) => number) => GlobeApi;
  labelDotRadius?: (fn: (p: unknown) => number) => GlobeApi;
  labelAltitude?: (fn: (p: unknown) => number) => GlobeApi;
  labelResolution?: (value: number) => GlobeApi;
  pathsData: (data: unknown[]) => GlobeApi;
  pathPoints?: (value: string | ((p: unknown) => unknown[])) => GlobeApi;
  pathColor: (fn: (p: unknown) => string) => GlobeApi;
  pathPointLat: (key: string | ((p: unknown) => number)) => GlobeApi;
  pathPointLng: (key: string | ((p: unknown) => number)) => GlobeApi;
  pathPointAlt?: (key: string | ((p: unknown) => number)) => GlobeApi;
  pathStroke: (v: number) => GlobeApi;
  pathAltitude?: (v: number) => GlobeApi;
  pathResolution: (v: number) => GlobeApi;
  htmlElementsData?: (data: unknown[]) => GlobeApi;
  htmlLat?: (key: string | ((p: unknown) => number)) => GlobeApi;
  htmlLng?: (key: string | ((p: unknown) => number)) => GlobeApi;
  htmlAltitude?: (key: string | ((p: unknown) => number)) => GlobeApi;
  htmlElement?: (fn: (p: unknown) => HTMLElement) => GlobeApi;
  htmlTransitionDuration?: (ms: number) => GlobeApi;
  globeMaterial: () => THREE.MeshPhongMaterial;
  globeImageUrl: (url: string) => GlobeApi;
  bumpImageUrl: (url: string) => GlobeApi;
  getCoords?: (lat: number, lng: number, altitude?: number) => { x: number; y: number; z: number };
  showAtmosphere: (value: boolean) => GlobeApi;
  atmosphereColor: (value: string) => GlobeApi;
  atmosphereAltitude: (value: number) => GlobeApi;
};
type OrbitControlsLike = {
  autoRotate: boolean;
  autoRotateSpeed: number;
  enablePan: boolean;
  minDistance: number;
  maxDistance: number;
  target: THREE.Vector3;
  update: () => void;
  dispose: () => void;
};

function webglSupported() {
  if (typeof window === "undefined") return false;
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
}

function toSafeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeLines(value: unknown): RouteLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((line) => {
      const coordsRaw = typeof line === "object" && line && "coords" in line ? (line as { coords?: unknown }).coords : null;
      if (!Array.isArray(coordsRaw)) return null;
      const coords = coordsRaw
        .map((coord) => {
          const lat = typeof coord === "object" && coord && "lat" in coord ? toSafeNumber((coord as { lat?: unknown }).lat) : null;
          const lng = typeof coord === "object" && coord && "lng" in coord ? toSafeNumber((coord as { lng?: unknown }).lng) : null;
          if (lat === null || lng === null) return null;
          return { lat, lng };
        })
        .filter((coord): coord is { lat: number; lng: number } => coord !== null);
      if (coords.length === 0) return null;
      return { coords };
    })
    .filter((line): line is RouteLine => line !== null);
}

function normalizePoints(value: unknown): Array<{ lat: number; lng: number; stage_no: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((point) => {
      const lat = typeof point === "object" && point && "lat" in point ? toSafeNumber((point as { lat?: unknown }).lat) : null;
      const lng = typeof point === "object" && point && "lng" in point ? toSafeNumber((point as { lng?: unknown }).lng) : null;
      const stageNo =
        typeof point === "object" && point && "stage_no" in point ? toSafeNumber((point as { stage_no?: unknown }).stage_no) : null;
      if (lat === null || lng === null || stageNo === null) return null;
      return { lat, lng, stage_no: Math.max(1, Math.trunc(stageNo)) };
    })
    .filter((point): point is { lat: number; lng: number; stage_no: number } => point !== null);
}

function latLngToVec3(lat: number, lng: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

function buildPinElement(marker: Marker, showLabel: boolean) {
  const isFeatured = Boolean(marker.isFeatured);
  const pinColor = isFeatured ? "#f59e0b" : "#38bdf8";
  const pinBorder = isFeatured ? "#fef08a" : "#7dd3fc";
  const textColor = isFeatured ? "#fef08a" : "#e2e8f0";

  const root = document.createElement("div");
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.alignItems = "center";
  root.style.transform = "translate(-50%, -100%)";
  root.style.pointerEvents = "none";
  root.style.userSelect = "none";
  root.style.whiteSpace = "nowrap";
  root.style.textShadow = "0 0 8px rgba(2, 6, 23, 0.95)";

  if (showLabel) {
    const label = document.createElement("span");
    label.textContent = marker.label;
    label.style.color = textColor;
    label.style.fontSize = isFeatured ? "12px" : "11px";
    label.style.fontWeight = isFeatured ? "700" : "600";
    label.style.marginBottom = "4px";
    root.appendChild(label);
  }

  const head = document.createElement("span");
  head.style.width = isFeatured ? "14px" : "12px";
  head.style.height = isFeatured ? "14px" : "12px";
  head.style.borderRadius = "9999px";
  head.style.background = pinColor;
  head.style.border = `2px solid ${pinBorder}`;
  head.style.boxShadow = isFeatured ? "0 0 10px rgba(245, 158, 11, 0.7)" : "0 0 8px rgba(56, 189, 248, 0.6)";
  root.appendChild(head);

  const tail = document.createElement("span");
  tail.style.width = "0";
  tail.style.height = "0";
  tail.style.borderLeft = isFeatured ? "5px solid transparent" : "4px solid transparent";
  tail.style.borderRight = isFeatured ? "5px solid transparent" : "4px solid transparent";
  tail.style.borderTop = isFeatured ? "8px solid #f59e0b" : "7px solid #38bdf8";
  tail.style.marginTop = "-1px";
  root.appendChild(tail);

  return root;
}

export function EventGlobe({
  stages,
  focus,
  featuredStageNo,
  autoRotateDefault = false,
  showControls = true,
  kmlUrl = "/route.kml",
  showLabels = false,
  minHeightPx = 300,
  onWarning,
}: Props) {
  const CLOUD_ROTATION_SPEED = 0.00005;
  const FLY_DURATION_MS = 2800;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControlsLike | null>(null);
  const globeRef = useRef<GlobeApi | null>(null);
  const cloudsRef = useRef<THREE.Mesh | null>(null);
  const rafRef = useRef<number | null>(null);
  const flyRafRef = useRef<number | null>(null);
  const flyTokenRef = useRef(0);

  const [unsupported, setUnsupported] = useState(false);
  const [autoRotate, setAutoRotate] = useState(autoRotateDefault);
  const [kmlLines, setKmlLines] = useState<RouteLine[]>([]);
  const [kmlMarkers, setKmlMarkers] = useState<Marker[] | null>(null);

  useEffect(() => {
    if (!containerRef.current || !webglSupported()) {
      setUnsupported(true);
      return;
    }

    let mounted = true;

    const init = async () => {
      const container = containerRef.current;
      if (!container) return;

      const ThreeGlobeModule = await import("three-globe");
      const OrbitControlsModule = await import("three/examples/jsm/controls/OrbitControls.js");
      const ThreeGlobe = (ThreeGlobeModule.default ?? ThreeGlobeModule) as unknown as new () => GlobeApi;
      const OrbitControlsCtor = OrbitControlsModule.OrbitControls;

      if (!mounted) return;

      const width = container.clientWidth;
      const height = Math.max(minHeightPx, Math.floor(width * 0.55));

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 2500);
      camera.position.copy(latLngToVec3(22, 82, 250));
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      rendererRef.current = renderer;
      container.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffffff, 1.05));
      const fillA = new THREE.DirectionalLight(0xffffff, 0.35);
      fillA.position.set(220, 120, 180);
      scene.add(fillA);
      const fillB = new THREE.DirectionalLight(0xffffff, 0.28);
      fillB.position.set(-220, -120, -180);
      scene.add(fillB);

      const textureExists = async (url: string) => {
        try {
          const res = await fetch(url, { method: "HEAD", cache: "force-cache" });
          return res.ok;
        } catch {
          return false;
        }
      };

      const [hasDay, hasBump, hasSpec, hasClouds] = await Promise.all([
        textureExists("/textures/earth_day.jpg"),
        textureExists("/textures/earth_bump.jpg"),
        textureExists("/textures/earth_spec.jpg"),
        textureExists("/textures/clouds.png"),
      ]);

      const globeObj: GlobeApi = new ThreeGlobe()
        .globeImageUrl(hasDay ? "/textures/earth_day.jpg" : "")
        .bumpImageUrl(hasBump ? "/textures/earth_bump.jpg" : "")
        .showAtmosphere(true)
        .atmosphereColor("#7fb8ff")
        .atmosphereAltitude(0.25);

      scene.add(globeObj as unknown as THREE.Object3D);
      globeRef.current = globeObj;

      const globeMat = globeObj.globeMaterial();
      const texLoader = new THREE.TextureLoader();

      globeMat.color = new THREE.Color(0xffffff);
      globeMat.emissive = new THREE.Color(0x355f95);
      globeMat.emissiveIntensity = 0.5;

      if (hasSpec) {
        globeMat.specularMap = texLoader.load("/textures/earth_spec.jpg");
        globeMat.specular = new THREE.Color(0x8db8df);
        globeMat.shininess = 7;
      } else {
        globeMat.specular = new THREE.Color(0x7ba7d0);
        globeMat.shininess = 5;
      }

      if (!hasDay) {
        globeMat.color = new THREE.Color(0x2466b5);
      }

      if (hasClouds) {
        const cloudTexture = texLoader.load("/textures/clouds.png");
        const cloudMesh = new THREE.Mesh(
          new THREE.SphereGeometry(101.3, 64, 64),
          new THREE.MeshPhongMaterial({
            map: cloudTexture,
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        cloudsRef.current = cloudMesh;
        scene.add(cloudMesh);
      }

      const controls = new OrbitControlsCtor(camera, renderer.domElement);
      controls.enablePan = false;
      controls.minDistance = 145;
      controls.maxDistance = 500;
      controls.autoRotate = autoRotateDefault;
      controls.autoRotateSpeed = 0.35;
      controlsRef.current = controls;

      const animate = () => {
        if (!mounted || !rendererRef.current || !sceneRef.current || !cameraRef.current) return;
        controls.update();
        if (cloudsRef.current) cloudsRef.current.rotation.y += CLOUD_ROTATION_SPEED;
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        rafRef.current = requestAnimationFrame(animate);
      };
      animate();

      const onResize = () => {
        if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = Math.max(minHeightPx, Math.floor(w * 0.55));
        rendererRef.current.setSize(w, h);
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
      };

      window.addEventListener("resize", onResize);

      return () => {
        window.removeEventListener("resize", onResize);
      };
    };

    let localCleanup: (() => void) | undefined;
    void init().then((fn) => {
      localCleanup = fn;
    });

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (flyRafRef.current) cancelAnimationFrame(flyRafRef.current);
      localCleanup?.();
      controlsRef.current?.dispose();
      rendererRef.current?.dispose();
      if (containerRef.current && rendererRef.current?.domElement && containerRef.current.contains(rendererRef.current.domElement)) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      sceneRef.current?.clear();
      globeRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      cloudsRef.current = null;
      flyRafRef.current = null;
    };
  }, [autoRotateDefault, minHeightPx]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.35;
  }, [autoRotate]);

  useEffect(() => {
    let cancelled = false;

    const loadKml = async () => {
      try {
        const res = await fetch(kmlUrl, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) {
            setKmlLines([]);
            setKmlMarkers(null);
            onWarning?.("KML missing/unloadable. Using stage markers only.");
          }
          return;
        }

        const text = await res.text();
        if (cancelled) return;

        const parsed = parseKmlToRenderData(text, Math.max(stages.length, 10));
        const safeLines = normalizeLines((parsed as { lines?: unknown })?.lines);
        const safePoints = normalizePoints((parsed as { points?: unknown })?.points);

        setKmlLines(safeLines);
        setKmlMarkers(
          safePoints.map((p) => ({
            lat: p.lat,
            lng: p.lng,
            stage_no: p.stage_no,
            label: `Location ${p.stage_no}`,
          })),
        );

        if (safePoints.length === 0 && safeLines.length === 0) {
          onWarning?.("KML route data is invalid. Using stage markers only.");
        } else if (parsed.warning) onWarning?.(parsed.warning);
        else onWarning?.(null);
      } catch {
        if (!cancelled) {
          setKmlLines([]);
          setKmlMarkers(null);
          onWarning?.("KML missing/unloadable. Using stage markers only.");
        }
      }
    };

    void loadKml();

    return () => {
      cancelled = true;
    };
  }, [kmlUrl, stages.length, onWarning]);

  const effectiveMarkers = useMemo<Marker[]>(() => {
    const safeStages = Array.isArray(stages) ? stages : [];
    const base = kmlMarkers && kmlMarkers.length
      ? kmlMarkers
      : safeStages.map((s) => ({
          lat: s.lat,
          lng: s.lng,
          stage_no: s.stage_no,
          label: `Location ${s.stage_no}`,
        }));

    return [...base].sort((a, b) => a.stage_no - b.stage_no).map((m) => ({
      ...m,
      label: `Location ${m.stage_no}`,
      isFeatured: featuredStageNo === m.stage_no,
    }));
  }, [kmlMarkers, stages, featuredStageNo]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    if (globe.htmlElementsData && globe.htmlLat && globe.htmlLng && globe.htmlAltitude && globe.htmlElement) {
      globe.pointsData([]);
      globe.labelsData([]);
      globe.htmlElementsData(effectiveMarkers);
      globe.htmlLat("lat");
      globe.htmlLng("lng");
      globe.htmlAltitude(() => 0.01);
      globe.htmlElement((d: unknown) => buildPinElement(d as Marker, showLabels));
      globe.htmlTransitionDuration?.(0);
      return;
    }

    globe
      .pointsData(effectiveMarkers)
      .pointColor((d: unknown) => ((d as Marker).isFeatured ? "#f59e0b" : "#38bdf8"))
      .pointRadius((d: unknown) => ((d as Marker).isFeatured ? 0.72 : 0.34))
      .pointAltitude((d: unknown) => ((d as Marker).isFeatured ? 0.1 : 0.035))
      .labelsData(showLabels ? effectiveMarkers : [])
      .labelText((d: unknown) => (d as Marker).label)
      .labelColor((d: unknown) => ((d as Marker).isFeatured ? "#fef08a" : "#e2e8f0"));

    globe.labelSize?.((d: unknown) => ((d as Marker).isFeatured ? 1.32 : 1.08));
    globe.labelDotRadius?.((d: unknown) => ((d as Marker).isFeatured ? 0.34 : 0.25));
    globe.labelAltitude?.(() => 0.01);
    globe.labelResolution?.(5);
  }, [effectiveMarkers, showLabels]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    const safeLines = Array.isArray(kmlLines) ? kmlLines : [];
    const lineData = safeLines
      .map((line) => ({
        points: (Array.isArray(line.coords) ? line.coords : [])
          .filter(
            (point): point is { lat: number; lng: number } =>
              Number.isFinite(point?.lat) && Number.isFinite(point?.lng),
          )
          .map((point) => ({ lat: point.lat, lng: point.lng, alt: 0.07 })),
      }))
      .filter((line) => line.points.length >= 2);

    const withPaths = globe.pathsData(lineData as unknown[]);
    if (withPaths.pathPoints) {
      withPaths.pathPoints((path: unknown) => {
        const pointsRaw = typeof path === "object" && path && "points" in path ? (path as { points?: unknown }).points : [];
        return Array.isArray(pointsRaw) ? pointsRaw : [];
      });
    }
    withPaths
      .pathPointLat((p: unknown) =>
        typeof p === "object" && p && "lat" in p && Number.isFinite(Number((p as { lat?: unknown }).lat))
          ? Number((p as { lat?: unknown }).lat)
          : 0,
      )
      .pathPointLng((p: unknown) =>
        typeof p === "object" && p && "lng" in p && Number.isFinite(Number((p as { lng?: unknown }).lng))
          ? Number((p as { lng?: unknown }).lng)
          : 0,
      );
    if (withPaths.pathPointAlt) {
      withPaths.pathPointAlt((p: unknown) =>
        typeof p === "object" && p && "alt" in p && Number.isFinite(Number((p as { alt?: unknown }).alt))
          ? Number((p as { alt?: unknown }).alt)
          : 0.07,
      );
    }
    withPaths
      .pathColor(() => "rgba(34, 211, 238, 0.95)")
      .pathStroke(2.8)
      .pathResolution(2);
  }, [kmlLines]);

  const flyTo = (lat: number, lng: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const globe = globeRef.current;
    if (!camera || !controls) return;

    const shouldResume = controls.autoRotate;
    controls.autoRotate = false;
    flyTokenRef.current += 1;
    const token = flyTokenRef.current;
    if (flyRafRef.current) {
      cancelAnimationFrame(flyRafRef.current);
      flyRafRef.current = null;
    }

    const globeCoords = globe?.getCoords?.(lat, lng, 1.45) ?? latLngToVec3(lat, lng, 245);
    const targetPos = new THREE.Vector3(globeCoords.x, globeCoords.y, globeCoords.z);
    const from = camera.position.clone();
    const to = targetPos.clone();
    const start = performance.now();

    const step = (t: number) => {
      if (token !== flyTokenRef.current) return;
      const p = Math.min(1, (t - start) / FLY_DURATION_MS);
      const eased = 1 - Math.pow(1 - p, 3);
      camera.position.lerpVectors(from, to, eased);
      controls.target.set(0, 0, 0);
      controls.update();
      if (p < 1) {
        flyRafRef.current = requestAnimationFrame(step);
      } else {
        flyRafRef.current = null;
        if (shouldResume) controls.autoRotate = true;
      }
    };

    flyRafRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    if (!focus) return;
    flyTo(focus.lat, focus.lng);
  }, [focus?.lat, focus?.lng]);

  const fallbackLabel = useMemo(() => {
    if (featuredStageNo) return `Location ${featuredStageNo}`;
    return "Earth Globe (Live)";
  }, [featuredStageNo]);

  if (unsupported) {
    return (
      <div className="rounded-lg border border-amber-500/50 bg-slate-900/70 p-4">
        <p className="font-semibold text-amber-300">WebGL unavailable - fallback mode</p>
        <p className="mt-2 text-slate-200">{fallbackLabel}</p>
        {focus && <p className="text-slate-300">{focus.lat.toFixed(4)}, {focus.lng.toFixed(4)}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
      {showControls && (
        <div className="mb-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => focus && flyTo(focus.lat, focus.lng)}>Recenter</button>
          <button type="button" onClick={() => setAutoRotate((v) => !v)}>{autoRotate ? "Stop Rotate" : "Auto-Rotate"}</button>
        </div>
      )}
      <div ref={containerRef} className="w-full overflow-hidden rounded-md" style={{ minHeight: `${minHeightPx}px` }} />
    </div>
  );
}
