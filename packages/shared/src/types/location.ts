export interface FloorPlanObject {
  id: string;
  type: "room" | "wall" | "door" | "window" | "camera" | "label" | "furniture";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label?: string;
  color?: string;
  cameraId?: string;
  cameraStatus?: string;
  furnitureType?: string;
  wallHeight?: number;
  locked?: boolean;
}

export interface Location {
  id: string;
  tenantId: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string;
  floorPlan: FloorPlanObject[];
  cameraCount?: number;
  createdAt: string;
  updatedAt: string;
}
