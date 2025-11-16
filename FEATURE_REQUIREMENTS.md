# Feature Requirements

## Audio Fingerprinting (Real, Not Mock)

### Goal

Identify currently playing tracks in near real time and correlate to the session timeline.

### Functional Requirements

- Detect track title, primary artists, confidence score, and detection timestamp.
- Support selectable audio input device; persist selection per device/profile.
- Provide status: inactive/initializing/active/error; show current RMS level.
- Expose callbacks/events to timeline correlation and analytics (e.g., track change markers).
- Debounce spurious detections; configurable minimum track duration before confirmation.
- Persist detections to local DB and show in session analytics timeline.

### Non-Functional Requirements

- **Latency**: ≤ 5 s from stable audio to first detection at ≥ configured confidence.
- **Stability**: 60 minutes continuous detection with no memory leaks.
- **CPU headroom**: ≤ 20% on mid-range laptop while pose detection runs at target FPS.

### Acceptance Criteria

- When audio input is enabled and a clear steady input is present, the system emits a track detection with title/artist/confidence and timestamps it to the current session.
- When input device changes mid-session, detection resumes automatically without app restart.
- When confidence is below threshold, no track is confirmed and no timeline marker is created.
- When a new track is detected, a distinct marker is visible in analytics within 2 seconds.

---

## Director Preview Per-Camera Recording (Wire to Storage)

### Goal

Record multiple cameras independently, show status, and save segments.

### Functional Requirements

- Add camera: enumerate devices, select, preview; save friendly label.
- Per-camera REC/STOP: start/stop writing video segments to disk with unique IDs linked to session.
- Show per-camera state (READY/RECORDING/ERROR), elapsed time, estimated size.
- Persist segments with metadata: format, resolution, fps, bitrate, start/end time (ns), file size, checksum.
- Stop all cameras on session end; handle failures per camera without aborting session.

### Non-Functional Requirements

- Disk write continuity under short CPU spikes; recoverable on transient camera errors.
- File rotation support for segments ≥ N minutes to cap file size.

### Acceptance Criteria

- Starting REC on any camera creates a VideoSegment record with non-empty file path and real bytes on disk.
- Stopping REC updates segment end time and file size; status transitions to active.
- If a camera disconnects, its segment is finalized with status=error and other cameras continue.

---

## Multi-Camera Synchronization & Ingest

### Goal

Align video segments from different cameras to the same timeline.

### Functional Requirements

- Capture per-segment start_time_ns referenced to session start (or absolute time).
- Maintain sync metadata (first/last frame timestamps, frame count, optional frame sync points).
- API: query segment covering any given session timestamp; compute relative ms inside file.

### Acceptance Criteria

- For two cameras started within the same session, querying a timestamp in the overlapping range returns both segments with consistent relative times (±1 frame at 30fps).
- For gaps between segments, API returns "no coverage" clearly.

---

## Web Persistence Fallback (No Electron)

### Goal

Allow core session analytics without Electron preload.

### Functional Requirements

- When window.bangerVisionAPI is absent, persist analytics/pose data to IndexedDB/WASM SQLite.
- Single abstraction to read/write, selecting Electron DB or web DB at runtime.

### Acceptance Criteria

- In browser mode, starting/stopping recording produces analytics entries retrievable after reload.
- Switching to Electron uses the same DAO shape; no code changes in calling sites.

---

## Session Start/Stop and Navigation Policy (Popup vs In-App)

### Goal

Standardize the recording UX.

### Functional Requirements

- Default in-app route for recording; optionally allow "Open in new window" toggle.
- If popup is used, message channel must deliver session metadata and any uploaded file paths back to the main window; handle window close gracefully.

### Acceptance Criteria

- Default "Start New Session" routes in-app and succeeds without postMessage.
- If "Open in new window" is enabled, stopping a recording posts back and session list shows it within 2 seconds.

---

## Analytics Enhancements (Spatial and Event Features)

### Goal

Improve signal quality and insights.

### Functional Requirements

- Jump detection: detect spikes in vertical motion; expose count and peak periods.
- Hotspots: grid-based intensity map (x,y,intensity) updated per interval.
- Crowd flow: vector field of movement between grid cells per interval.
- Smoothing and calibration: configurable smoothing windows; per-venue sensitivity presets.
- Peak detection: flag peak moments with type and duration; surface in legacy analytics UI.

### Acceptance Criteria

- Enabling hotspots produces a heat map dataset per time bucket; disabled removes it from storage and UI.
- Peak moments appear in analytics with start/end timestamps and remain consistent across reloads.
- Adjusting sensitivity impacts resulting energy levels within defined bounds (documented).

---

## Serato Track Correlation

### Goal

Align detected/ingested track events with analytics.

### Functional Requirements

- Ingest current track, BPM, key, cue points, start/end timestamps.
- Render track lanes and markers in analytics; compute per-track engagement summary.
- Resolve conflicts: when audio fingerprinting and Serato disagree, prefer Serato with a flag.

### Acceptance Criteria

- Track start updates analytics view with a marker and displays track metadata.
- Per-track summary shows avg energy, peak energy, and audience count deltas during the track.

---

## Export and Sharing

### Goal

Share insights and raw data externally.

### Functional Requirements

- Export session report (PDF): summary stats, top peaks, per-track metrics, key charts.
- Export raw analytics (CSV/JSON): timeline (timestamp, people, energy, sentiment, movement).
- Export video clips: select time range; export merged video (main camera) with optional overlay.

### Acceptance Criteria

- Exported report includes session name, venue, duration, counts, and at least one engagement chart.
- CSV contains a header row and at least timestamp + 4 metrics; values match UI within rounding tolerance.
- Video export succeeds for a 60-second range and produces a playable file.

---

## Storage Management and Media Lifecycle

### Goal

Keep disk usage in control and assets manageable.

### Functional Requirements

- Thumbnails and preview generation on segment finalize.
- Archiving policy: mark segments archived and exclude from default queries.
- Cleanup tools: remove segments by age/size; validate missing files and mark status=deleted.

### Acceptance Criteria

- After recording, a thumbnail file exists and is referenced in DB metadata.
- Running cleanup with a threshold removes files over limit and updates DB status accordingly.

---

## Settings and Configuration

### Goal

Centralize operational controls.

### Functional Requirements

- Camera & audio device defaults per profile.
- Detection settings: model/sensitivity, smoothing windows, max tracked people.
- Storage paths (Electron only), export formats, privacy settings (data retention).

### Acceptance Criteria

- Changing sensitivity from Balanced to Conservative updates values used by pose detector immediately.
- Updating storage path migrates newly created segments; old segments remain referenced.

---

## Permissions, Onboarding, and Error Handling

### Goal

Robust startup and guidance.

### Functional Requirements

- Clear permission prompts with retry guidance for camera/mic.
- Error states for device unavailable, model load failure, disk full; visible and logged.

### Acceptance Criteria

- If camera permission is denied, an actionable error with retry appears and no recording controls are active.
- If disk is full mid-recording, UI stops gracefully and finalizes segments with error status.

---

## Performance and Resilience

### Goal

Meet UX and stability targets.

### Requirements

- Target FPS for pose detection: 15+ fps on mid-range hardware; degrade gracefully with frame skipping.
- Memory ceiling: sustained recording ≤ 1.5 GB RSS increase over idle for 60 minutes with two cameras.

### Acceptance Criteria

- Under normal conditions, FPS metric shown stays ≥ target; if under, frame-skip increases automatically.
- Long-run soak test completes without crash; segments finalize correctly.

---

## Accessibility and UX Standards

### Goal

Inclusive and predictable UI.

### Requirements

- Keyboard operation for core controls (Record/Stop, device dropdowns, tabs).
- High-contrast option for overlays; tooltips for status icons.

### Acceptance Criteria

- Tabbing reaches Record/Stop and toggles via Enter/Space.
- Enabling high contrast changes overlay color palette accordingly.

---

## QA, Diagnostics, and Telemetry (Local)

### Goal

Assist support and debugging without external services.

### Requirements

- Local diagnostic log viewer; log rotation.
- Optional anonymous local metrics (no network) for performance counters.

### Acceptance Criteria

- Log viewer filters by level/component and shows last N MB.
- Enabling metrics displays graphs locally; disabling halts collection.

---

## Security and Privacy

### Goal

Respect user data control.

### Requirements

- Data retention policy with configurable duration; "Delete all session data" per session and globally.
- No exports without explicit user action; no background uploads.

### Acceptance Criteria

- Deleting a session removes analytics and marks/optionally deletes associated segments; UI confirms.











