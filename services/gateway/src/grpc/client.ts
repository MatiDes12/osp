// ---------------------------------------------------------------------------
//  gRPC Client Manager
//  Creates and manages gRPC connections to Go micro-services.
//  Each client is a singleton, lazily connected, with automatic reconnection.
// ---------------------------------------------------------------------------

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("grpc-client");

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROTO_DIR = resolve(__dirname, "proto");

// ---------------------------------------------------------------------------
//  Proto loader options (shared across all services)
// ---------------------------------------------------------------------------

const PROTO_LOADER_OPTIONS: protoLoader.Options = {
  keepCase: false, // Convert snake_case to camelCase
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

// ---------------------------------------------------------------------------
//  Service addresses (from env, with sensible defaults)
// ---------------------------------------------------------------------------

function getCameraIngestAddress(): string {
  return process.env["CAMERA_INGEST_GRPC_URL"] ?? "localhost:50051";
}

function getVideoPipelineAddress(): string {
  return process.env["VIDEO_PIPELINE_GRPC_URL"] ?? "localhost:50052";
}

function getEventEngineAddress(): string {
  return process.env["EVENT_ENGINE_GRPC_URL"] ?? "localhost:50053";
}

// ---------------------------------------------------------------------------
//  Generic helper: load a proto and return a typed service client constructor
// ---------------------------------------------------------------------------

export function loadServiceClient<T>(
  protoFile: string,
  packageName: string,
  serviceName: string,
): grpc.ServiceClientConstructor {
  const protoPath = resolve(PROTO_DIR, protoFile);

  const packageDefinition = protoLoader.loadSync(protoPath, PROTO_LOADER_OPTIONS);
  const grpcObject = grpc.loadPackageDefinition(packageDefinition);

  // Navigate nested package path (e.g. "osp.cameraingest.v1")
  const parts = packageName.split(".");
  let current: Record<string, unknown> = grpcObject as unknown as Record<string, unknown>;
  for (const part of parts) {
    current = current[part] as Record<string, unknown>;
    if (!current) {
      throw new Error(`Package path "${packageName}" not found in proto "${protoFile}"`);
    }
  }

  const ServiceConstructor = current[serviceName] as grpc.ServiceClientConstructor | undefined;
  if (!ServiceConstructor) {
    throw new Error(`Service "${serviceName}" not found in package "${packageName}"`);
  }

  return ServiceConstructor;
}

// ---------------------------------------------------------------------------
//  Singleton client instances
// ---------------------------------------------------------------------------

let cameraIngestStub: grpc.Client | null = null;
let videoPipelineStub: grpc.Client | null = null;
let eventEngineStub: grpc.Client | null = null;

export function getRawCameraIngestStub(): grpc.Client {
  if (!cameraIngestStub) {
    const Ctor = loadServiceClient(
      "camera_ingest.proto",
      "osp.cameraingest.v1",
      "CameraIngestService",
    );
    const address = getCameraIngestAddress();
    cameraIngestStub = new Ctor(address, grpc.credentials.createInsecure());
    logger.info("Camera-ingest gRPC stub created", { address });
  }
  return cameraIngestStub;
}

export function getRawVideoPipelineStub(): grpc.Client {
  if (!videoPipelineStub) {
    const Ctor = loadServiceClient(
      "video_pipeline.proto",
      "osp.videopipeline.v1",
      "VideoPipelineService",
    );
    const address = getVideoPipelineAddress();
    videoPipelineStub = new Ctor(address, grpc.credentials.createInsecure());
    logger.info("Video-pipeline gRPC stub created", { address });
  }
  return videoPipelineStub;
}

export function getRawEventEngineStub(): grpc.Client {
  if (!eventEngineStub) {
    const Ctor = loadServiceClient(
      "event_engine.proto",
      "osp.eventengine.v1",
      "EventEngineService",
    );
    const address = getEventEngineAddress();
    eventEngineStub = new Ctor(address, grpc.credentials.createInsecure());
    logger.info("Event-engine gRPC stub created", { address });
  }
  return eventEngineStub;
}

// ---------------------------------------------------------------------------
//  Health check helper
// ---------------------------------------------------------------------------

export type ServiceHealth = "up" | "down" | "not_configured";

export async function checkServiceHealth(
  serviceName: string,
  stub: grpc.Client,
): Promise<ServiceHealth> {
  return new Promise((resolvePromise) => {
    const deadline = new Date(Date.now() + 3_000);
    stub.waitForReady(deadline, (err) => {
      if (err) {
        logger.debug(`${serviceName} health check failed`, { error: String(err) });
        resolvePromise("down");
      } else {
        resolvePromise("up");
      }
    });
  });
}

// ---------------------------------------------------------------------------
//  Graceful shutdown
// ---------------------------------------------------------------------------

export function closeAllClients(): void {
  if (cameraIngestStub) {
    cameraIngestStub.close();
    cameraIngestStub = null;
  }
  if (videoPipelineStub) {
    videoPipelineStub.close();
    videoPipelineStub = null;
  }
  if (eventEngineStub) {
    eventEngineStub.close();
    eventEngineStub = null;
  }
  logger.info("All gRPC client connections closed");
}

// ---------------------------------------------------------------------------
//  Utility: promisify a unary gRPC call
// ---------------------------------------------------------------------------

export function unaryCall<TReq, TRes>(
  stub: grpc.Client,
  method: string,
  request: TReq,
  timeoutMs = 10_000,
): Promise<TRes> {
  return new Promise((resolvePromise, reject) => {
    const fn = (stub as unknown as Record<string, Function>)[method];
    if (typeof fn !== "function") {
      reject(new Error(`Method "${method}" not found on gRPC stub`));
      return;
    }

    const deadline = new Date(Date.now() + timeoutMs);

    fn.call(stub, request, { deadline }, (err: grpc.ServiceError | null, response: TRes) => {
      if (err) {
        reject(err);
      } else {
        resolvePromise(response);
      }
    });
  });
}

// ---------------------------------------------------------------------------
//  Utility: check if a gRPC error is "service unavailable" (connection refused)
// ---------------------------------------------------------------------------

export function isServiceUnavailable(err: unknown): boolean {
  if (err instanceof Error && "code" in err) {
    const code = (err as grpc.ServiceError).code;
    return (
      code === grpc.status.UNAVAILABLE ||
      code === grpc.status.DEADLINE_EXCEEDED
    );
  }
  return false;
}
