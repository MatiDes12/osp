# Open Surveillance Platform (OSP) — Product Requirements Document

**Version**: 1.0
**Date**: 2026-03-16
**Status**: Draft — Pending Review

---

## Table of Contents

1. [Personas](#1-personas)
2. [Feature Matrix](#2-feature-matrix)
3. [MVP Scope (Phase 1)](#3-mvp-scope-phase-1)
4. [Product Roadmap](#4-product-roadmap)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Competitive Analysis](#6-competitive-analysis)

---

## 1. Personas

### 1.1 Homeowner — "Sarah"

**Profile**: Homeowner with a family, lives in a suburban neighborhood. Has 2–10 cameras covering front door, backyard, garage, and driveway. Wants peace of mind without complexity.

**Goals**:
- See who's at the door from anywhere on her phone
- Get notified immediately when something unusual happens at night
- Review what happened while she was away
- Share camera access with spouse and babysitter without giving full control
- Set it up herself in under 15 minutes per camera

**Pain Points**:
- Current apps (Ring, Wyze) lock features behind subscriptions that add up across cameras
- Too many false alerts from wind, shadows, animals — alert fatigue
- Can't mix camera brands — stuck in one vendor's ecosystem
- Recorded clips expire too fast on free plans
- No way to set "only alert me between 10pm and 6am"

**Must-Have Features**:
- Mobile-first live view with <2s load time
- Push notifications for motion with snapshot preview
- Easy camera setup (RTSP URL or ONVIF auto-discovery on LAN)
- Clip recording on motion events with 7-day minimum retention
- Share access with family members (Viewer role)
- Configurable motion zones (ignore the street, focus on porch)

**Nice-to-Have Features**:
- Person vs animal vs vehicle detection (reduce false alerts)
- Two-way audio through the app
- Time-based alert schedules (night mode)
- Integration with smart home (HomeKit, Google Home)
- Local recording fallback (NAS/USB drive)

---

### 1.2 Small Business Owner — "Marcus"

**Profile**: Owns a coffee shop with a small warehouse. Has 5–30 cameras across the shop floor, register area, storage room, back entrance, and parking lot. Manages 8 employees across two shifts.

**Goals**:
- Monitor the shop remotely when not on-site
- Know immediately if someone enters the storage room after hours
- Give shift managers camera access to the floor, but not the register feed
- Review incidents (customer complaints, theft) by scrubbing the timeline
- Keep costs predictable — one platform for all cameras, no per-camera licensing

**Pain Points**:
- Current NVR box has a terrible mobile app, can only view from the local network
- Can't grant different access levels — employees either see everything or nothing
- No alerting — has to manually check footage
- Existing cameras are mixed brands (Hikvision, Dahua, cheap IP cams) — no unified view
- Pays for cloud storage on each camera brand separately

**Must-Have Features**:
- Unified dashboard for all cameras regardless of brand/protocol
- Role-based access: Owner sees everything, Shift Manager sees floor only, Staff sees nothing
- Zone-based motion alerts with schedule (storage room, back door — after 9pm only)
- 30-day recording retention with search by date/time/camera
- Clip export for incident documentation
- Works with existing RTSP/ONVIF cameras (no hardware replacement)

**Nice-to-Have Features**:
- Person detection at entrances (people counting)
- Custom alert rules ("register drawer open + no employee nearby")
- Basic analytics (busiest hours, foot traffic patterns)
- Integration with POS system for transaction-linked video
- Multi-location support (if they open a second shop)

---

### 1.3 Retail Chain Manager — "Diana"

**Profile**: Regional manager overseeing 12 retail stores, each with 15–50 cameras. Responsible for loss prevention, operational compliance, and store performance. Reports to VP of Operations.

**Goals**:
- Centralized view of all 12 stores from one dashboard
- Identify shrinkage patterns — which stores, which departments, what times
- Verify operational compliance (displays set up, checkout lanes staffed)
- Generate weekly incident reports for leadership
- Roll out camera policies consistently across all locations

**Pain Points**:
- Each store has its own NVR system — no centralized management
- Loss prevention team wastes hours reviewing footage manually
- No way to search across stores ("show me all back-door events last Tuesday")
- Adding a new store means weeks of setup with the current integrator
- Current enterprise systems (Milestone, Genetec) are expensive and require dedicated IT

**Must-Have Features**:
- Multi-location management with store grouping
- Centralized user management (regional admins, store managers, LP analysts)
- Cross-store event search and filtering
- Scheduled recording policies applied per store or per camera group
- Heat map analytics (foot traffic, dwell time per zone)
- Incident workflow: flag event → assign to LP analyst → resolve → report
- Exportable reports (PDF/CSV) for leadership

**Nice-to-Have Features**:
- AI-powered person detection with demographic analytics (no PII)
- License plate recognition in parking lots
- POS integration: link transaction data to register camera
- Custom branded dashboard per store (white-label)
- Automated shrinkage alerts based on AI + rules
- Integration with existing access control systems

---

### 1.4 Mall / Enterprise Security Director — "James"

**Profile**: Director of Security for a regional shopping mall with 200+ retail tenants, parking structures, common areas, and loading docks. Manages a 24/7 command center with 8 operators. Must comply with local surveillance regulations and insurance requirements.

**Goals**:
- Real-time situational awareness across 500–1,000+ cameras in a unified command center
- Coordinate security response with timestamped evidence
- Meet compliance requirements: footage retention, access audit trails, privacy zones
- Enable each tenant to manage their own cameras while mall security has override access
- Reduce the $300K/year they spend on the current enterprise VMS

**Pain Points**:
- Current Milestone/Genetec setup requires a dedicated IT team and $50K+ annual licensing
- Adding cameras requires vendor involvement and license purchases
- System is slow — searching footage across 500 cameras takes minutes
- No modern mobile access — operators are desk-bound
- Integrations with access control, fire alarm, PA system are brittle and expensive
- Tenant camera systems are siloed — mall security can't see into tenant spaces during incidents

**Must-Have Features**:
- Command center view: multi-monitor layout with camera wall, event feed, map overlay
- Sub-tenant architecture: mall-level security with per-tenant camera isolation
- Compliance features: audit log of all access (who viewed what, when), privacy zone masking
- 90-day retention with archival to cold storage
- Automatic camera health monitoring with offline alerts
- Federated search across all cameras and tenants (with permission)
- SLA-backed uptime (99.9%) with failover
- RBAC: Security Director → Command Center Operator → Tenant Admin → Tenant Viewer

**Nice-to-Have Features**:
- AI analytics: crowd density, abandoned object detection, perimeter breach
- License plate recognition at parking entries
- Integration SDK for access control, fire panel, PA system
- Custom AI model hosting (bring your own model for specific use cases)
- Map-based camera navigation (click on map location → jump to camera)
- Automated compliance reporting for insurance audits
- SSO / SAML integration with corporate identity provider

---

## 2. Feature Matrix

| Feature | Home | Business | Retail | Enterprise |
|---------|------|----------|--------|------------|
| **Live View** | Core | Core | Core | Core |
| **Playback / Timeline** | Core | Core | Core | Core |
| **Motion-Triggered Recording** | Core | Core | Core | Core |
| **Continuous Recording** | Extension | Core | Core | Core |
| **Motion Detection** | Core | Core | Core | Core |
| **Person Detection** | Extension | Extension | Core | Core |
| **Vehicle Detection** | Extension | Extension | Extension | Core |
| **Custom Alert Rules** | Core (basic) | Core | Core | Core (advanced) |
| **Alert Schedules** | Core | Core | Core | Core |
| **Multi-Location Management** | N/A | Extension | Core | Core |
| **User Roles & Permissions** | Core (2 roles) | Core (3 roles) | Core (full RBAC) | Core (full RBAC + sub-tenant) |
| **Two-Way Audio** | Core | Core | Extension | Extension |
| **PTZ Control** | Core | Core | Core | Core |
| **Analytics Dashboard** | N/A | Extension | Core | Core |
| **Heat Maps** | N/A | N/A | Extension | Core |
| **License Plate Recognition** | N/A | Extension | Extension | Extension |
| **White-Label / Custom Branding** | N/A | N/A | Extension | Core |
| **API Access** | N/A | Extension | Core | Core |
| **Custom AI Model Support** | N/A | N/A | Extension | Extension |
| **Compliance / Audit Logs** | N/A | Extension | Core | Core |
| **Privacy Zone Masking** | Extension | Extension | Core | Core |
| **Camera Health Monitoring** | Core (basic) | Core | Core | Core (SLA-backed) |
| **Clip Export** | Core | Core | Core | Core |
| **Mobile App** | Core | Core | Core | Core |
| **Desktop App** | Extension | Extension | Core | Core |
| **Extension Marketplace** | Extension | Extension | Core | Core |
| **Webhook / Integration** | N/A | Extension | Core | Core |
| **SSO / SAML** | N/A | N/A | Extension | Core |
| **Command Center (Multi-Monitor)** | N/A | N/A | Extension | Core |
| **Map-Based Camera Navigation** | N/A | N/A | Extension | Core |
| **Sub-Tenant Architecture** | N/A | N/A | N/A | Core |

**Legend**:
- **Core**: Built into the plan tier, available out of the box
- **Extension**: Available via plugin/add-on (free or paid)
- **N/A**: Not applicable or not available for this tier

---

## 3. MVP Scope (Phase 1)

### 3.1 Target Personas

Phase 1 ships for **Homeowner** and **Small Business Owner**. Retail and Enterprise personas are Phase 2–3.

### 3.2 Supported Camera Protocols

| Protocol | Phase 1 | Notes |
|----------|---------|-------|
| **RTSP** | Yes | Primary protocol — covers 90%+ of IP cameras |
| **ONVIF** | Yes | Auto-discovery, PTZ control, camera configuration |
| **WebRTC** | Yes (output only) | Live view delivery to browser/mobile — not camera input |
| USB/IP | No | Phase 2 (desktop app) |
| Proprietary (Ring, Arlo, Wyze) | No | Phase 3 (reverse-engineered or partnership APIs) |

### 3.3 Supported Platforms

| Platform | Phase 1 | Notes |
|----------|---------|-------|
| **Web (Next.js)** | Yes | Primary dashboard |
| **iOS (React Native)** | Yes | Live view, alerts, basic management |
| **Android (React Native)** | Yes | Live view, alerts, basic management |
| Desktop (Tauri) | No | Phase 2 |

### 3.4 Features In vs Out

#### IN (ships in v1.0)

| Feature | Acceptance Criteria |
|---------|-------------------|
| Camera add/remove | Manual RTSP URL input + ONVIF auto-discovery on LAN |
| Live view | WebRTC stream loads in <2s, supports 1/4/9/16 grid layouts |
| Motion detection | Server-side frame diff, configurable sensitivity (1–10), zone drawing |
| Motion-triggered recording | Starts recording 5s pre-motion, continues 10s post-motion, saves to S3/R2 |
| Playback | HLS player with timeline scrubber, date picker, camera selector |
| Clip export | Download motion-event clips as MP4 |
| Push notifications | Mobile push within 3s of event, includes snapshot thumbnail |
| Email notifications | Configurable per-user, per-camera, per-event-type |
| Alert schedules | Enable/disable alerts by time window (e.g., 10pm–6am) |
| Motion zones | Draw rectangles/polygons on camera view to define detection areas |
| PTZ control | Pan/tilt/zoom for ONVIF-capable cameras |
| User roles | Owner, Admin, Operator, Viewer with permission matrix |
| Multi-tenant | Tenant isolation via Supabase RLS, tenant-scoped everything |
| Camera status | Online/offline indicator, auto-reconnect, offline alert |
| Settings | Camera config, notification preferences, user management, storage retention |
| Auth | Email/password signup, Google OAuth, JWT-based sessions |

#### OUT (deferred to Phase 2+)

| Feature | Phase | Reason for Deferral |
|---------|-------|-------------------|
| Person/vehicle/animal detection | 2 | Requires AI pipeline, increases infra cost |
| Visual rule builder | 2 | Complex UI, depends on extension SDK |
| Extension SDK & marketplace | 2 | Core platform must stabilize first |
| Multi-location management | 2 | Not needed for Home/SMB personas |
| Two-way audio | 2 | Requires additional WebRTC channel |
| Heat maps & analytics | 3 | Requires ClickHouse + AI |
| White-label / custom branding | 3 | Enterprise feature |
| License plate recognition | 3 | Specialized AI model |
| Desktop app | 2 | Tauri build pipeline setup |
| SSO / SAML | 3 | Enterprise feature |
| Continuous recording | 2 | Storage cost optimization needed first |
| Webhook notifications | 2 | Part of extension/integration layer |
| Compliance / audit logs | 3 | Enterprise feature |

### 3.5 Definition of Done (MVP)

MVP is **done** when all of the following are true:

- [ ] A user can sign up, create a tenant, and add an RTSP or ONVIF camera in under 5 minutes
- [ ] Live view loads in <2s and streams with <500ms latency on LAN, <2s remote
- [ ] Motion detection triggers recording and push notification within 3s
- [ ] User can draw motion zones and set alert schedules per camera
- [ ] Playback timeline shows all motion events for the selected date, clips load in <1s
- [ ] Owner can invite users with Admin, Operator, or Viewer roles
- [ ] Viewer role can only see cameras they are assigned to
- [ ] Web dashboard works on Chrome, Firefox, Safari (latest 2 versions)
- [ ] Mobile app works on iOS 16+ and Android 12+
- [ ] All data is tenant-isolated (verified with cross-tenant access tests)
- [ ] 7-day recording retention with configurable option for 30/90 days
- [ ] System handles 50 concurrent cameras per tenant without degradation
- [ ] 80%+ test coverage (unit + integration)
- [ ] API response times <200ms p95
- [ ] Zero critical security vulnerabilities (OWASP top 10 audit passed)
- [ ] Deployment is automated: one-command Docker Compose for self-host, CI/CD for cloud

---

## 4. Product Roadmap

### Phase 1: Core Platform (Months 1–4)

**Theme**: "See your cameras anywhere"

| Milestone | Target | Deliverables |
|-----------|--------|-------------|
| **M1: Foundation** | Month 1 | Project scaffolding, Supabase setup, auth flow, camera CRUD API, basic web layout |
| **M2: Live View** | Month 2 | go2rtc integration, WebRTC live view, camera grid, ONVIF discovery, PTZ controls |
| **M3: Recording & Alerts** | Month 3 | Motion detection, recording pipeline, HLS playback, push notifications, motion zones |
| **M4: Polish & Launch** | Month 4 | Mobile app, alert schedules, user roles, clip export, performance tuning, beta launch |

**Exit Criteria**: 100 beta users, <5 critical bugs, all MVP "done" criteria met.

---

### Phase 2: Intelligence & Extensibility (Months 5–8)

**Theme**: "Make cameras smart"

| Milestone | Target | Deliverables |
|-----------|--------|-------------|
| **M5: AI Detection** | Month 5–6 | Person/vehicle/animal detection (ONNX Runtime), detection-based alerts, AI event tagging |
| **M6: Extension SDK** | Month 6–7 | Extension SDK v1 (TypeScript), hook points, sandboxed runtime, example extensions |
| **M7: Rule Engine** | Month 7 | Visual rule builder UI, trigger → condition → action, schedule support |
| **M8: Marketplace & Desktop** | Month 8 | Extension marketplace (browse, install, rate), Tauri desktop app, two-way audio, continuous recording |

**Key Decisions**:
- AI runs cloud-side initially (GPU instances), edge support in Phase 4
- Extension sandbox: Wasm (Extism) for isolation, V8 isolates as fallback
- Marketplace: free extensions only in Phase 2, paid extensions in Phase 3

---

### Phase 3: Enterprise & Analytics (Months 9–12)

**Theme**: "Scale to the enterprise"

| Milestone | Target | Deliverables |
|-----------|--------|-------------|
| **M9: Multi-Location** | Month 9 | Location grouping, cross-location search, centralized policies |
| **M10: Analytics** | Month 10 | ClickHouse integration, heat maps, people counting, dwell time, traffic patterns |
| **M11: Compliance** | Month 11 | Audit logs, privacy zone masking, configurable retention policies, SSO/SAML |
| **M12: Enterprise Launch** | Month 12 | White-label theming, sub-tenant architecture, command center view, SLA monitoring, paid extensions in marketplace |

**Key Decisions**:
- ClickHouse deployed as managed service (ClickHouse Cloud) to avoid ops burden
- SSO via Supabase Auth enterprise features or Auth0 integration
- White-label: tenant-level theme config (logo, colors, fonts, custom domain via CNAME)

---

### Phase 4: Edge & Advanced AI (Months 13–18)

**Theme**: "Intelligence at the edge"

| Milestone | Target | Deliverables |
|-----------|--------|-------------|
| **M13: Edge Agent** | Month 13–14 | Lightweight Go agent for on-premise deployment, local processing, cloud sync |
| **M14: Custom AI** | Month 15–16 | Bring-your-own-model support (ONNX), model marketplace, license plate recognition |
| **M15: Advanced Integrations** | Month 17–18 | Access control integration, fire/alarm panel, PA system, POS system, map-based navigation |

**Key Decisions**:
- Edge agent: single Go binary (~50MB), runs on any Linux box (Raspberry Pi 4+, NUC, server)
- Custom AI: tenant uploads ONNX model → platform validates → deploys to edge or cloud
- LPR: built as first-party extension to prove the model marketplace

---

### Roadmap Visual

```
Month:  1    2    3    4    5    6    7    8    9   10   11   12   13-18
        ├────┼────┼────┼────┼────┼────┼────┼────┼────┼────┼────┼────┼────┤
Phase 1 │████████████████████│                                            │
        │ Foundation  Live   │                                            │
        │ + Auth     View    │                                            │
        │        Recording   │                                            │
        │          + Alerts  │                                            │
        │            Polish  │                                            │
        │             Launch │                                            │
        │                    │                                            │
Phase 2 │                    │████████████████████│                       │
        │                    │ AI Detection       │                       │
        │                    │   Extension SDK    │                       │
        │                    │     Rule Engine    │                       │
        │                    │       Marketplace  │                       │
        │                    │         Desktop    │                       │
        │                    │                    │                       │
Phase 3 │                    │                    │████████████████████│  │
        │                    │                    │ Multi-Location     │  │
        │                    │                    │   Analytics        │  │
        │                    │                    │     Compliance     │  │
        │                    │                    │       Enterprise   │  │
        │                    │                    │         Launch     │  │
        │                    │                    │                    │  │
Phase 4 │                    │                    │                    │██│
        │                    │                    │                    │Edge
        │                    │                    │                    │AI
        ├────┼────┼────┼────┼────┼────┼────┼────┼────┼────┼────┼────┼──┤
```

---

## 5. Non-Functional Requirements

### 5.1 Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Live view latency (LAN)** | <500ms from camera to screen | WebRTC roundtrip measured at client |
| **Live view latency (remote)** | <2s from camera to screen | Includes cloud relay hop |
| **Video playback start (clip)** | <1s | Time from tap to first frame of a motion clip |
| **Video playback start (timeline)** | <3s | Time from timeline scrub to playback at new position |
| **Push notification delivery** | <3s from event detection | Measured from motion detection to device notification |
| **API response time** | <200ms p95 | All REST endpoints under normal load |
| **API response time (cached)** | <50ms p95 | Cached queries (camera list, settings) |
| **Camera grid render** | <2s for 16-camera grid | All 16 WebRTC streams connected and rendering |
| **ONVIF discovery** | <10s for full LAN scan | Discovery of all ONVIF cameras on local subnet |
| **Motion detection latency** | <500ms from frame to event | Time from video frame to event created in system |

### 5.2 Reliability

| Metric | Target | Notes |
|--------|--------|-------|
| **Cloud service uptime** | 99.9% (8.7h downtime/year) | API gateway, web app, storage |
| **Video pipeline uptime** | 99.5% (43.8h downtime/year) | Transcoding, recording — graceful degradation allowed |
| **Camera reconnection** | Auto-reconnect within 30s | Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s cap |
| **Data durability** | 99.999999999% (11 nines) | S3/R2 storage durability for recordings |
| **Zero data loss on failure** | Pre-motion buffer survives crash | 30s circular buffer in RAM, flushed to disk on event |

### 5.3 Scalability

| Metric | MVP (Phase 1) | Scale (Phase 3+) |
|--------|---------------|-------------------|
| **Cameras per tenant** | 50 | 10,000+ |
| **Concurrent streams per user** | 4 | 16 |
| **Concurrent streams per tenant** | 50 | 1,000 |
| **Total platform cameras** | 5,000 | 100,000+ |
| **Total concurrent viewers** | 500 | 50,000 |
| **Events per second** | 100 | 10,000 |
| **Storage per camera per day** | ~5GB (motion-triggered) | ~20GB (continuous, 1080p) |

### 5.4 Storage & Retention

| Plan | Retention | Estimated Storage per Camera |
|------|-----------|------------------------------|
| **Free** | 7 days | ~35 GB (motion-triggered, 1080p) |
| **Pro** | 30 days | ~150 GB (motion-triggered, 1080p) |
| **Business** | 90 days | ~450 GB (motion + continuous) |
| **Enterprise** | Custom (up to 365 days) | Tiered: hot (30d) → warm (90d) → cold (365d) |

Storage optimization:
- Motion-triggered: only store when motion detected (5–10x reduction)
- Adaptive bitrate: reduce quality for storage, full quality for live view
- Thumbnail-only mode: store snapshots every 5s as cheapest tier
- Cold storage: auto-tier old recordings to cheaper storage class

### 5.5 Security

| Requirement | Implementation |
|-------------|---------------|
| Data in transit | TLS 1.3 for all connections (HTTPS, WSS, gRPC) |
| Data at rest | AES-256 server-side encryption on S3/R2, PostgreSQL encryption |
| Authentication | Supabase Auth (bcrypt passwords, OAuth, JWT with 15min expiry) |
| Authorization | RBAC enforced at API gateway + RLS at database |
| Multi-tenant isolation | RLS on every table, S3 prefix isolation, test suite verifies no cross-tenant leaks |
| Rate limiting | Per-tenant, per-endpoint: 100 req/min default, 1000 req/min enterprise |
| Input validation | Zod schemas on every API endpoint, reject unknown fields |
| Secrets | Environment variables only, rotated quarterly, no secrets in code/config |
| CORS | Strict origin allowlist per tenant |
| OWASP compliance | Top 10 audit before each phase launch |

### 5.6 Compatibility

| Platform | Minimum Version |
|----------|----------------|
| Chrome | Latest 2 versions |
| Firefox | Latest 2 versions |
| Safari | Latest 2 versions |
| Edge | Latest 2 versions |
| iOS | 16.0+ |
| Android | 12+ (API 31+) |
| Node.js (API) | 20 LTS |
| Go (services) | 1.22+ |

---

## 6. Competitive Analysis

### 6.1 Ring (Amazon)

| Aspect | Details |
|--------|---------|
| **What they do** | Consumer doorbell/camera ecosystem, cloud-only recording, Neighbors social network |
| **Strengths** | Massive brand recognition, tight Alexa integration, affordable hardware, easy setup |
| **Weaknesses** | Proprietary ecosystem (Ring cameras only), mandatory cloud subscription for recording ($10–20/mo per camera), privacy controversies (law enforcement sharing), no self-hosting, limited to home use |
| **What OSP does differently** | Works with ANY camera brand, self-host option, no per-camera subscription, open extension system, scales beyond consumer |

### 6.2 Arlo (Verisure)

| Aspect | Details |
|--------|---------|
| **What they do** | Premium consumer cameras with AI detection, battery-powered options, cloud-based |
| **Strengths** | Best-in-class AI detection (person, vehicle, animal, package), wire-free cameras, good mobile app |
| **Weaknesses** | Expensive hardware ($150–400/camera), expensive subscriptions ($13–18/mo), proprietary ecosystem, no RTSP output on newer models, no business/enterprise tier |
| **What OSP does differently** | Bring your own cameras (including Arlo via RTSP if enabled), AI detection as extensible plugin (swap models), unified platform from home to enterprise, no hardware lock-in |

### 6.3 Milestone XProtect (Milestone Systems)

| Aspect | Details |
|--------|---------|
| **What they do** | Enterprise VMS (Video Management System), on-premise, used by large organizations |
| **Strengths** | Extremely mature (20+ years), 10,000+ camera support, 150+ integration partners, proven in enterprise, ONVIF certified |
| **Weaknesses** | Expensive ($30–100+ per camera license perpetual + annual maintenance), Windows Server only, requires dedicated IT team, dated UI, no native mobile (third-party only), complex installation, no cloud-native option |
| **What OSP does differently** | Cloud-native + self-host option, modern UI (web + native mobile), Linux/Docker deployment, no per-camera licensing, extension marketplace instead of expensive integrator partnerships, 10x lower TCO |

### 6.4 Verkada

| Aspect | Details |
|--------|---------|
| **What they do** | Cloud-managed enterprise cameras with built-in AI, command center SaaS |
| **Strengths** | Modern cloud-first architecture, excellent UI, built-in AI (person detection, LPR), zero-touch deployment, camera + software + cloud bundled |
| **Weaknesses** | Requires Verkada hardware (proprietary cameras $300–1,500+), expensive annual licensing ($200+/camera/year), 2021 data breach damaged trust, no BYOC (bring your own camera), vendor lock-in |
| **What OSP does differently** | BYOC — works with any RTSP/ONVIF camera (reuse existing hardware), open source core, self-host option, transparent pricing without per-camera licensing, extension SDK for custom integrations vs waiting for Verkada to build it |

### 6.5 Frigate NVR

| Aspect | Details |
|--------|---------|
| **What they do** | Open source NVR focused on AI object detection, runs locally, Home Assistant integration |
| **Strengths** | Free and open source, excellent AI detection (uses Coral TPU), local-only processing (privacy), Home Assistant native, active community, runs on modest hardware |
| **Weaknesses** | Technical setup (Docker, YAML config), no official mobile app, single-node only (no multi-location), no cloud option, no multi-tenancy, no user management (single user), limited UI (basic web), no extension SDK |
| **What OSP does differently** | Professional-grade UX with native mobile apps, multi-tenant from day one, cloud + self-host hybrid, extension marketplace for customization, scales from home to enterprise, visual configuration (no YAML), built-in user management and RBAC |

### 6.6 Competitive Positioning Summary

```
                    Consumer ◄──────────────────────► Enterprise
                    Simple                              Complex

            Ring ●
            Arlo   ●
                         Frigate ●
                                        ● OSP (spans the full range)
                                              Verkada ●
                                                    Milestone ●

                    Closed ◄──────────────────────► Open
                    Proprietary                     Extensible

            Ring ●
          Verkada  ●
            Arlo     ●
                            Milestone ●
                                          ● OSP
                                            Frigate ●
```

**OSP's unique position**: The only platform that spans from consumer to enterprise with an open, extensible architecture. Competitors are either consumer-only (Ring, Arlo), enterprise-only (Milestone, Verkada), or technical-user-only (Frigate). OSP bridges all segments with a single platform, shared extension ecosystem, and consistent UX across web, mobile, and desktop.

---

## Appendix: Plan Tiers (Preliminary)

| Feature | Free | Pro ($10/mo) | Business ($50/mo) | Enterprise (Custom) |
|---------|------|-------------|-------------------|-------------------|
| Cameras | 4 | 16 | 100 | Unlimited |
| Users | 2 | 5 | 25 | Unlimited |
| Retention | 7 days | 30 days | 90 days | Custom |
| Concurrent streams | 2 | 4 | 8 | 16 |
| Motion detection | Yes | Yes | Yes | Yes |
| AI detection | No | Basic (person) | Full (person, vehicle, animal) | Full + custom models |
| Locations | 1 | 1 | 10 | Unlimited |
| Extensions | 2 | 10 | Unlimited | Unlimited |
| API access | No | Read-only | Full | Full |
| White-label | No | No | No | Yes |
| SSO / SAML | No | No | No | Yes |
| SLA | None | None | 99.5% | 99.9% |
| Support | Community | Email | Priority email | Dedicated + SLA |
