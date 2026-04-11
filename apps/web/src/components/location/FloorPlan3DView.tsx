"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useCameraSnapshot } from "@/hooks/use-camera-capture";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  PerspectiveCamera,
  Text,
  Html,
  Environment,
} from "@react-three/drei";
import * as THREE from "three";
import type { FloorObject } from "./FloorPlanEditor";
import { Eye, X } from "lucide-react";

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const SCALE = 0.02; // floor plan units -> 3D world units
const WALL_HEIGHT = 2.5;
const DOOR_HEIGHT = 2.0;
const WINDOW_HEIGHT = 1.2;
const WINDOW_BOTTOM = 0.9;
const FURNITURE_HEIGHT = 0.8;
const FLOOR_Y = 0;

function hexToColor(hex: string): string {
  return hex;
}

// ---------------------------------------------------------------------------
//  Room (extruded box with transparent walls)
// ---------------------------------------------------------------------------

function Room3D({ obj }: { obj: FloorObject }) {
  const color = obj.color ?? "#3B82F6";
  const x = obj.x * SCALE;
  const z = obj.y * SCALE;
  const w = obj.w * SCALE;
  const d = obj.h * SCALE;
  const h = WALL_HEIGHT;

  return (
    <group
      position={[x + w / 2, 0, z + d / 2]}
      rotation={[0, -(obj.rotation * Math.PI) / 180, 0]}
    >
      {/* Floor */}
      <mesh position={[0, FLOOR_Y + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial
          color={color}
          opacity={0.15}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Walls — 4 sides as thin boxes */}
      {/* Front wall (negative Z) */}
      <mesh position={[0, h / 2, -d / 2]}>
        <boxGeometry args={[w, h, 0.05]} />
        <meshStandardMaterial color={color} opacity={0.25} transparent />
      </mesh>
      {/* Back wall (positive Z) */}
      <mesh position={[0, h / 2, d / 2]}>
        <boxGeometry args={[w, h, 0.05]} />
        <meshStandardMaterial color={color} opacity={0.25} transparent />
      </mesh>
      {/* Left wall (negative X) */}
      <mesh position={[-w / 2, h / 2, 0]}>
        <boxGeometry args={[0.05, h, d]} />
        <meshStandardMaterial color={color} opacity={0.25} transparent />
      </mesh>
      {/* Right wall (positive X) */}
      <mesh position={[w / 2, h / 2, 0]}>
        <boxGeometry args={[0.05, h, d]} />
        <meshStandardMaterial color={color} opacity={0.25} transparent />
      </mesh>

      {/* Room label */}
      {obj.label && (
        <Text
          position={[0, 0.1, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={Math.min(w, d) * 0.15}
          color="#A1A1AA"
          anchorX="center"
          anchorY="middle"
        >
          {obj.label}
        </Text>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
//  Wall segment
// ---------------------------------------------------------------------------

function Wall3D({ obj }: { obj: FloorObject }) {
  const x1 = obj.x * SCALE;
  const z1 = obj.y * SCALE;
  const x2 = (obj.x + obj.w) * SCALE;
  const z2 = (obj.y + obj.h) * SCALE;

  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);

  return (
    <mesh
      position={[(x1 + x2) / 2, WALL_HEIGHT / 2, (z1 + z2) / 2]}
      rotation={[0, -angle, 0]}
    >
      <boxGeometry args={[length, WALL_HEIGHT, 0.1]} />
      <meshStandardMaterial color="#71717A" />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
//  Door
// ---------------------------------------------------------------------------

function Door3D({ obj }: { obj: FloorObject }) {
  const x = obj.x * SCALE;
  const z = obj.y * SCALE;
  const w = Math.max(obj.w * SCALE, 0.8);

  return (
    <group
      position={[x + w / 2, 0, z]}
      rotation={[0, -(obj.rotation * Math.PI) / 180, 0]}
    >
      {/* Door frame */}
      <mesh position={[0, DOOR_HEIGHT / 2, 0]}>
        <boxGeometry args={[w, DOOR_HEIGHT, 0.06]} />
        <meshStandardMaterial color="#F59E0B" opacity={0.4} transparent />
      </mesh>
      {/* Door handle */}
      <mesh position={[w * 0.35, DOOR_HEIGHT * 0.45, 0.04]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color="#F59E0B" />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
//  Window
// ---------------------------------------------------------------------------

function Window3D({ obj }: { obj: FloorObject }) {
  const x = obj.x * SCALE;
  const z = obj.y * SCALE;
  const w = Math.max(obj.w * SCALE, 0.6);

  return (
    <group
      position={[x + w / 2, WINDOW_BOTTOM + WINDOW_HEIGHT / 2, z]}
      rotation={[0, -(obj.rotation * Math.PI) / 180, 0]}
    >
      <mesh>
        <boxGeometry args={[w, WINDOW_HEIGHT, 0.04]} />
        <meshStandardMaterial color="#06B6D4" opacity={0.3} transparent />
      </mesh>
      {/* Window frame */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(w, WINDOW_HEIGHT, 0.04)]} />
        <lineBasicMaterial color="#06B6D4" />
      </lineSegments>
    </group>
  );
}

// ---------------------------------------------------------------------------
//  Camera (sphere + FOV cone)
// ---------------------------------------------------------------------------

function Camera3D({
  obj,
  isOnline,
  cameraName,
  onDoubleClick,
}: {
  obj: FloorObject;
  isOnline: boolean;
  cameraName?: string;
  onDoubleClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const x = obj.x * SCALE;
  const z = obj.y * SCALE;
  const color = isOnline ? "#22C55E" : obj.cameraId ? "#EF4444" : "#3B82F6";
  const rot = ((obj.rotation ?? 0) * Math.PI) / 180;

  // Gentle floating animation for online cameras
  useFrame(({ clock }) => {
    if (meshRef.current && isOnline) {
      meshRef.current.position.y = 2.2 + Math.sin(clock.elapsedTime * 2) * 0.03;
    }
  });

  return (
    <group position={[x, 0, z]} onDoubleClick={onDoubleClick}>
      {/* Camera body */}
      <mesh ref={meshRef} position={[0, 2.2, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Camera mount pole */}
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 2.2, 8]} />
        <meshStandardMaterial color="#3F3F46" />
      </mesh>

      {/* FOV cone */}
      <mesh
        position={[0, 2.2, 0]}
        rotation={[0, -rot + Math.PI / 2, -Math.PI / 6]}
      >
        <coneGeometry args={[0.8, 2, 16, 1, true]} />
        <meshStandardMaterial
          color={color}
          opacity={0.1}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Status ring on ground */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.2, 32]} />
        <meshStandardMaterial
          color={color}
          opacity={0.5}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Label */}
      {(cameraName ?? obj.label) && (
        <Text
          position={[0, 2.6, 0]}
          fontSize={0.12}
          color="#E4E4E7"
          anchorX="center"
          anchorY="bottom"
        >
          {cameraName ?? obj.label}
        </Text>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
//  Furniture
// ---------------------------------------------------------------------------

function Furniture3D({ obj }: { obj: FloorObject }) {
  const x = obj.x * SCALE;
  const z = obj.y * SCALE;
  const w = obj.w * SCALE;
  const d = obj.h * SCALE;

  return (
    <group
      position={[x + w / 2, FURNITURE_HEIGHT / 2, z + d / 2]}
      rotation={[0, -(obj.rotation * Math.PI) / 180, 0]}
    >
      <mesh>
        <boxGeometry args={[w, FURNITURE_HEIGHT, d]} />
        <meshStandardMaterial color="#3F3F46" />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(w, FURNITURE_HEIGHT, d)]} />
        <lineBasicMaterial color="#52525B" />
      </lineSegments>
      {obj.label && (
        <Text
          position={[0, FURNITURE_HEIGHT / 2 + 0.08, 0]}
          fontSize={0.08}
          color="#71717A"
          anchorX="center"
        >
          {obj.label}
        </Text>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
//  Label (floating text)
// ---------------------------------------------------------------------------

function Label3D({ obj }: { obj: FloorObject }) {
  return (
    <Text
      position={[obj.x * SCALE, 0.15, obj.y * SCALE]}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={0.15}
      color="#A1A1AA"
      anchorX="left"
      anchorY="top"
      fontWeight="bold"
    >
      {obj.label ?? ""}
    </Text>
  );
}

// ---------------------------------------------------------------------------
//  Ground plane + grid
// ---------------------------------------------------------------------------

function Ground({ size }: { size: number }) {
  return (
    <group>
      {/* Ground plane */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[size / 2, -0.01, size / 2]}
      >
        <planeGeometry args={[size * 2, size * 2]} />
        <meshStandardMaterial color="#0A0A0B" side={THREE.DoubleSide} />
      </mesh>
      {/* Grid */}
      <gridHelper
        args={[size * 2, size * 2 * 2.5, "#1C1C1E", "#141416"]}
        position={[size / 2, 0, size / 2]}
      />
    </group>
  );
}

// ---------------------------------------------------------------------------
//  Camera live popup overlay (HTML in 3D)
// ---------------------------------------------------------------------------

// Snapshot fetching lives in hooks/use-camera-capture.ts — do NOT re-implement.

function CameraPopup3D({
  camera,
  onClose,
  onNavigate,
}: {
  camera: { id: string; name: string; status: string };
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  // Always attempt the snapshot for any linked camera. Gating on `status`
  // causes the popup to show "Offline" when the cached status is stale but
  // the camera is actually reachable.
  const snapshotUrl = useCameraSnapshot(camera.id, true);
  const isLive = !!snapshotUrl;

  return (
    <div className="w-64 rounded-lg border border-zinc-700 bg-zinc-900/95 shadow-xl overflow-hidden backdrop-blur-sm">
      <div className="relative aspect-video bg-black">
        {snapshotUrl ? (
          <img
            src={snapshotUrl}
            alt={camera.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-600 text-xs">
            Connecting...
          </div>
        )}
        <button
          onClick={onClose}
          className="absolute top-1 right-1 p-1 rounded bg-black/60 text-zinc-300 hover:text-white cursor-pointer"
        >
          <X className="h-3 w-3" />
        </button>
        {isLive && (
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[8px] font-bold text-green-400 uppercase">
              Live
            </span>
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="text-[11px] font-medium text-zinc-200 truncate">
          {camera.name}
        </p>
        <button
          onClick={() => onNavigate(camera.id)}
          className="mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors cursor-pointer"
        >
          <Eye className="h-3 w-3" />
          Full Live View
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Inline always-visible live preview billboard above a linked camera
// ---------------------------------------------------------------------------

function CameraLiveBillboard({
  obj,
  camera,
  onNavigate,
}: {
  obj: FloorObject;
  camera: { id: string; name: string; status: string };
  onNavigate: (id: string) => void;
}) {
  // Always try to grab a frame — don't gate on stale `status`.
  const snapshotUrl = useCameraSnapshot(camera.id, true);
  const isLive = !!snapshotUrl;
  const x = obj.x * SCALE;
  const z = obj.y * SCALE;

  return (
    <Html
      position={[x, 3.1, z]}
      center
      distanceFactor={6}
      occlude={false}
      style={{ pointerEvents: "auto" }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onNavigate(camera.id);
        }}
        className="w-32 rounded-md border border-zinc-700 bg-zinc-900/95 shadow-xl overflow-hidden backdrop-blur-sm cursor-pointer hover:border-blue-500 transition-colors"
      >
        <div className="relative aspect-video bg-black">
          {snapshotUrl ? (
            <img
              src={snapshotUrl}
              alt={camera.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-600 text-[8px]">
              Connecting…
            </div>
          )}
          <div className="absolute top-0.5 left-0.5 flex items-center gap-0.5">
            <span
              className={`h-1 w-1 rounded-full ${isLive ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
            />
            <span
              className={`text-[6px] font-bold uppercase ${isLive ? "text-green-400" : "text-red-400"}`}
            >
              {isLive ? "Live" : "Off"}
            </span>
          </div>
        </div>
        <div className="px-1 py-0.5">
          <p className="text-[7px] font-medium text-zinc-200 truncate text-left">
            {camera.name}
          </p>
        </div>
      </button>
    </Html>
  );
}

// ---------------------------------------------------------------------------
//  Scene content
// ---------------------------------------------------------------------------

function SceneContent({
  objects,
  cameras,
  onCameraClick,
  popupCameraObj,
  popupCamera,
  onClosePopup,
  onNavigateCamera,
  showLiveBillboards,
}: {
  objects: readonly FloorObject[];
  cameras?: readonly { id: string; name: string; status: string }[];
  onCameraClick: (id: string) => void;
  popupCameraObj: FloorObject | null;
  popupCamera: { id: string; name: string; status: string } | undefined;
  onClosePopup: () => void;
  onNavigateCamera: (id: string) => void;
  showLiveBillboards: boolean;
}) {
  // Calculate scene bbox / centroid from objects so the camera and orbit
  // target match what the 2D view shows instead of drifting off-center when
  // the floor plan grows or shrinks.
  const { sceneSize, centerX, centerZ } = useMemo(() => {
    if (objects.length === 0)
      return { sceneSize: 10, centerX: 0, centerZ: 0 };
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const obj of objects) {
      const x1 = obj.x * SCALE;
      const y1 = obj.y * SCALE;
      const x2 = (obj.x + obj.w) * SCALE;
      const y2 = (obj.y + obj.h) * SCALE;
      minX = Math.min(minX, x1, x2);
      minY = Math.min(minY, y1, y2);
      maxX = Math.max(maxX, x1, x2);
      maxY = Math.max(maxY, y1, y2);
    }
    const w = maxX - minX;
    const d = maxY - minY;
    return {
      sceneSize: Math.max(w, d, 5) * 1.5,
      centerX: (minX + maxX) / 2,
      centerZ: (minY + maxY) / 2,
    };
  }, [objects]);

  const cameraMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; status: string }>();
    if (cameras) {
      for (const c of cameras) map.set(c.id, c);
    }
    return map;
  }, [cameras]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 15, 10]} intensity={0.8} castShadow />
      <directionalLight position={[-5, 10, -5]} intensity={0.3} />

      <PerspectiveCamera
        makeDefault
        position={[centerX + sceneSize, sceneSize * 0.8, centerZ + sceneSize]}
        fov={50}
      />
      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={1}
        maxDistance={sceneSize * 4}
        target={[centerX, 0, centerZ]}
      />

      <Ground size={sceneSize} />

      {objects.map((obj) => {
        switch (obj.type) {
          case "room":
            return <Room3D key={obj.id} obj={obj} />;
          case "wall":
            return <Wall3D key={obj.id} obj={obj} />;
          case "door":
            return <Door3D key={obj.id} obj={obj} />;
          case "window":
            return <Window3D key={obj.id} obj={obj} />;
          case "camera": {
            const linked = obj.cameraId
              ? cameraMap.get(obj.cameraId)
              : undefined;
            return (
              <Camera3D
                key={obj.id}
                obj={obj}
                isOnline={linked?.status === "online"}
                cameraName={linked?.name}
                onDoubleClick={() => onCameraClick(obj.id)}
              />
            );
          }
          case "furniture":
            return <Furniture3D key={obj.id} obj={obj} />;
          case "label":
            return <Label3D key={obj.id} obj={obj} />;
          default:
            return null;
        }
      })}

      {/* Always-visible live billboards for linked cameras */}
      {showLiveBillboards &&
        objects.map((obj) => {
          if (obj.type !== "camera" || !obj.cameraId) return null;
          const linked = cameraMap.get(obj.cameraId);
          if (!linked) return null;
          // Hide the floating billboard for the camera currently showing the
          // big popup (avoids stacking two previews in the same spot).
          if (popupCameraObj?.id === obj.id) return null;
          return (
            <CameraLiveBillboard
              key={`live-${obj.id}`}
              obj={obj}
              camera={linked}
              onNavigate={onNavigateCamera}
            />
          );
        })}

      {/* Camera popup as HTML overlay in 3D space */}
      {popupCameraObj && popupCamera && (
        <Html
          position={[popupCameraObj.x * SCALE, 3, popupCameraObj.y * SCALE]}
          center
          distanceFactor={8}
        >
          <CameraPopup3D
            camera={popupCamera}
            onClose={onClosePopup}
            onNavigate={onNavigateCamera}
          />
        </Html>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
//  Exported component
// ---------------------------------------------------------------------------

interface FloorPlan3DViewProps {
  readonly objects: readonly FloorObject[];
  readonly cameras?: readonly { id: string; name: string; status: string }[];
}

export function FloorPlan3DView({ objects, cameras }: FloorPlan3DViewProps) {
  const [popupObjId, setPopupObjId] = useState<string | null>(null);
  const [showLiveBillboards, setShowLiveBillboards] = useState(true);

  const popupObj = useMemo(
    () =>
      popupObjId ? (objects.find((o) => o.id === popupObjId) ?? null) : null,
    [objects, popupObjId],
  );

  const linkedCamera = useMemo(
    () =>
      popupObj?.cameraId
        ? cameras?.find((c) => c.id === popupObj.cameraId)
        : undefined,
    [popupObj, cameras],
  );

  return (
    <div className="w-full h-full bg-[#09090B]">
      <Canvas
        shadows
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <SceneContent
          objects={objects}
          cameras={cameras}
          onCameraClick={(id) => setPopupObjId(id)}
          popupCameraObj={popupObj}
          popupCamera={linkedCamera}
          onClosePopup={() => setPopupObjId(null)}
          onNavigateCamera={(id) => {
            window.location.href = `/cameras/${id}`;
          }}
          showLiveBillboards={showLiveBillboards}
        />
      </Canvas>

      {/* Toggle live billboards */}
      <button
        onClick={() => setShowLiveBillboards((v) => !v)}
        className={`absolute top-3 right-3 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer border ${
          showLiveBillboards
            ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
            : "bg-zinc-900/80 text-zinc-500 border-zinc-700"
        }`}
        title="Toggle inline live previews"
      >
        {showLiveBillboards ? "Live On" : "Live Off"}
      </button>

      {/* Controls hint */}
      <div className="absolute bottom-3 left-3 text-[10px] text-zinc-600 space-y-0.5">
        <p>Left drag: Rotate</p>
        <p>Right drag: Pan</p>
        <p>Scroll: Zoom</p>
        <p>Double-click camera: Focus preview</p>
      </div>
    </div>
  );
}
