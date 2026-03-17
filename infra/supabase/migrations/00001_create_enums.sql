-- Enum types for OSP
CREATE TYPE tenant_plan AS ENUM ('free', 'pro', 'business', 'enterprise');
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'operator', 'viewer');
CREATE TYPE camera_protocol AS ENUM ('rtsp', 'onvif', 'webrtc', 'usb', 'ip');
CREATE TYPE camera_status AS ENUM ('online', 'offline', 'connecting', 'error', 'disabled');
CREATE TYPE recording_trigger AS ENUM ('motion', 'continuous', 'manual', 'rule', 'ai_detection');
CREATE TYPE recording_status AS ENUM ('recording', 'complete', 'partial', 'failed', 'deleted');
CREATE TYPE event_type AS ENUM ('motion', 'person', 'vehicle', 'animal', 'camera_offline', 'camera_online', 'tampering', 'audio', 'custom');
CREATE TYPE event_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE notification_channel AS ENUM ('push', 'email', 'webhook', 'sms', 'in_app');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'delivered', 'failed', 'read');
CREATE TYPE extension_status AS ENUM ('draft', 'review', 'published', 'suspended', 'deprecated');
