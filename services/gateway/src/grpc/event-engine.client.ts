// ---------------------------------------------------------------------------
//  Event-Engine gRPC Client
//  Wraps the raw gRPC stub with typed methods and a fallback-to-direct pattern.
// ---------------------------------------------------------------------------

import { createLogger } from "../lib/logger.js";
import {
  getRawEventEngineStub,
  unaryCall,
  isServiceUnavailable,
} from "./client.js";
import { GrpcFallbackError } from "./camera-ingest.client.js";

const logger = createLogger("grpc-event-engine");

// ---------------------------------------------------------------------------
//  Types (mirror proto messages)
// ---------------------------------------------------------------------------

export interface ProcessEventRequest {
  tenantId: string;
  cameraId: string;
  zoneId: string;
  type: string;
  severity: string;
  detectedAt: string;
  metadata: Record<string, string>;
  snapshotId: string;
  clipPath: string;
  intensity: number;
}

export interface ProcessEventResult {
  success: boolean;
  eventId: string;
  rulesMatched: number;
  actionsDispatched: string[];
}

export interface EvaluateRulesRequest {
  tenantId: string;
  eventId: string;
}

export interface MatchedRule {
  ruleId: string;
  ruleName: string;
  actions: string[];
}

export interface EvaluateRulesResult {
  matchedRules: MatchedRule[];
}

export interface RuleStatus {
  ruleId: string;
  ruleName: string;
  enabled: boolean;
  lastTriggeredAt: string;
  cooldownSec: number;
  inCooldown: boolean;
}

// ---------------------------------------------------------------------------
//  Client interface
// ---------------------------------------------------------------------------

export interface EventEngineClient {
  processEvent(event: ProcessEventRequest): Promise<ProcessEventResult>;
  evaluateRules(tenantId: string, eventId: string): Promise<MatchedRule[]>;
  getRuleStatus(tenantId: string, ruleId: string): Promise<RuleStatus>;
}

// ---------------------------------------------------------------------------
//  Implementation
// ---------------------------------------------------------------------------

function createGrpcEventEngineClient(): EventEngineClient {
  function getStub() {
    return getRawEventEngineStub();
  }

  return {
    async processEvent(event) {
      try {
        return await unaryCall<ProcessEventRequest, ProcessEventResult>(
          getStub(),
          "processEvent",
          event,
        );
      } catch (err) {
        if (isServiceUnavailable(err)) {
          logger.warn("Event-engine service not available, using direct mode");
          throw new GrpcFallbackError("event-engine", "processEvent");
        }
        throw err;
      }
    },

    async evaluateRules(tenantId, eventId) {
      const request: EvaluateRulesRequest = { tenantId, eventId };

      try {
        const response = await unaryCall<EvaluateRulesRequest, EvaluateRulesResult>(
          getStub(),
          "evaluateRules",
          request,
        );
        return response.matchedRules;
      } catch (err) {
        if (isServiceUnavailable(err)) {
          logger.warn("Event-engine service not available, using direct mode");
          throw new GrpcFallbackError("event-engine", "evaluateRules");
        }
        throw err;
      }
    },

    async getRuleStatus(tenantId, ruleId) {
      try {
        return await unaryCall<{ tenantId: string; ruleId: string }, RuleStatus>(
          getStub(),
          "getRuleStatus",
          { tenantId, ruleId },
        );
      } catch (err) {
        if (isServiceUnavailable(err)) {
          logger.warn("Event-engine service not available, using direct mode");
          throw new GrpcFallbackError("event-engine", "getRuleStatus");
        }
        throw err;
      }
    },
  };
}

// ---------------------------------------------------------------------------
//  Singleton
// ---------------------------------------------------------------------------

let instance: EventEngineClient | null = null;

export function getEventEngineClient(): EventEngineClient {
  if (!instance) {
    instance = createGrpcEventEngineClient();
  }
  return instance;
}
