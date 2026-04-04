use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewWindow,
};
use tauri_plugin_shell::ShellExt;

// ── Sidecar process state ────────────────────────────────────────────────────

struct Go2rtcProcess(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);
struct CameraIngestProcess(Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

// ── Tauri commands ─────────────────────────────────────────────────────────────

/// Called by the frontend to update the tray tooltip with live camera status.
#[tauri::command]
fn update_tray_status(
    app: tauri::AppHandle,
    cameras_online: u32,
    cameras_total: u32,
    alerts_unread: u32,
) {
    let tooltip = if alerts_unread > 0 {
        format!(
            "OSP  •  {}/{} cameras online  •  {} alert{}",
            cameras_online,
            cameras_total,
            alerts_unread,
            if alerts_unread == 1 { "" } else { "s" }
        )
    } else {
        format!(
            "OSP  •  {}/{} cameras online",
            cameras_online, cameras_total
        )
    };

    if let Some(tray) = app.tray_by_id("osp-tray") {
        let _ = tray.set_tooltip(Some(tooltip.as_str()));
    }
}

/// Shows a native OS notification. Called from the web frontend via invoke.
#[tauri::command]
async fn show_os_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

/// Toggles auto-start on login. Returns the new enabled state.
#[tauri::command]
async fn toggle_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    let enabled = manager.is_enabled().map_err(|e| e.to_string())?;
    if enabled {
        manager.disable().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        manager.enable().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

/// Returns whether auto-start is currently enabled.
#[tauri::command]
async fn get_autostart_enabled(app: tauri::AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

/// Shows and focuses the main window.
#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

// ── go2rtc sidecar management ──────────────────────────────────────────────────

/// Starts go2rtc sidecar, or skips if go2rtc is already running on localhost:1984.
fn start_go2rtc(app: &tauri::App) {
    // Check if go2rtc is already running (e.g. via Docker)
    let already_running = std::net::TcpStream::connect("127.0.0.1:1984").is_ok();
    if already_running {
        eprintln!("[OSP] go2rtc already running on :1984, skipping sidecar");
        app.manage(Go2rtcProcess(Mutex::new(None)));
        return;
    }

    let data_dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir");
    std::fs::create_dir_all(&data_dir).ok();

    let config_path = data_dir.join("go2rtc.yaml");
    let config = r#"api:
  listen: ":1984"
  origin: "*"
rtsp:
  listen: ":8554"
webrtc:
  listen: ":8555"
  candidates:
    - stun:stun.l.google.com:19302
log:
  level: warn
"#;
    std::fs::write(&config_path, config).ok();

    let config_str = config_path.to_string_lossy().to_string();

    match app
        .shell()
        .sidecar("go2rtc")
        .and_then(|s| s.args(["-config", &config_str]).spawn())
    {
        Ok((_rx, child)) => {
            app.manage(Go2rtcProcess(Mutex::new(Some(child))));
            eprintln!("[OSP] go2rtc started");
        }
        Err(e) => {
            eprintln!("[OSP] go2rtc sidecar not available: {e}");
            app.manage(Go2rtcProcess(Mutex::new(None)));
        }
    }
}

/// Kills go2rtc when the app quits.
fn stop_go2rtc(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<Go2rtcProcess>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
                eprintln!("[OSP] go2rtc stopped");
            }
        }
    }
}

// ── Tauri commands: go2rtc status ──────────────────────────────────────────

/// Returns whether the local go2rtc instance is reachable.
#[tauri::command]
async fn get_go2rtc_status() -> bool {
    reqwest::get("http://localhost:1984/api/streams")
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

// ── camera-ingest sidecar ──────────────────────────────────────────────────────

/// Called by the frontend after login to start the local camera-ingest agent.
/// Idempotent — if already running, does nothing.
#[tauri::command]
fn start_camera_ingest(
    app: tauri::AppHandle,
    gateway_url: String,
    api_token: String,
    tenant_id: String,
) {
    if let Some(state) = app.try_state::<CameraIngestProcess>() {
        if let Ok(guard) = state.0.lock() {
            if guard.is_some() {
                // Already running
                return;
            }
        }
    }

    match app
        .shell()
        .sidecar("camera-ingest")
        .map(|s| {
            s.env("GATEWAY_URL", &gateway_url)
             .env("API_URL", &gateway_url)
             .env("API_TOKEN", &api_token)
             .env("TENANT_ID", &tenant_id)
             .env("GO2RTC_API_URL", "http://localhost:1984")
             .env("GO2RTC_URL", "http://localhost:1984")
             .env("SNAPSHOT_DIR", app.path().app_data_dir().unwrap_or_default().join("snapshots").to_string_lossy().to_string())
        })
        .and_then(|s| s.spawn())
    {
        Ok((_rx, child)) => {
            if let Some(state) = app.try_state::<CameraIngestProcess>() {
                if let Ok(mut guard) = state.0.lock() {
                    *guard = Some(child);
                    eprintln!("[OSP] camera-ingest started");
                }
            }
        }
        Err(e) => {
            eprintln!("[OSP] camera-ingest sidecar not available: {e}");
        }
    }
}

fn stop_camera_ingest(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<CameraIngestProcess>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
                eprintln!("[OSP] camera-ingest stopped");
            }
        }
    }
}

// ── Tray setup ─────────────────────────────────────────────────────────────────

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Open Dashboard", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let autostart = MenuItem::with_id(app, "autostart", "Start at Login", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit OSP", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &sep1, &autostart, &sep2, &quit])?;

    TrayIconBuilder::with_id("osp-tray")
        .tooltip("OSP — Open Surveillance Platform")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "autostart" => {
                use tauri_plugin_autostart::ManagerExt;
                let mgr = app.autolaunch();
                let currently = mgr.is_enabled().unwrap_or(false);
                if currently {
                    let _ = mgr.disable();
                } else {
                    let _ = mgr.enable();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Left-click: toggle window visibility
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    toggle_window_visibility(&window);
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn toggle_window_visibility(window: &WebviewWindow) {
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

// ── App entry point ────────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            build_tray(app)?;

            // Start go2rtc sidecar for local camera streaming
            start_go2rtc(app);

            // Register camera-ingest state (started later by JS after login)
            app.manage(CameraIngestProcess(Mutex::new(None)));

            // Minimize to tray on window close instead of quitting
            let window = app.get_webview_window("main").unwrap();
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window_clone.hide();
                }
            });

            Ok(())
        })
        .on_window_event(|_window, _event| {})
        .invoke_handler(tauri::generate_handler![
            update_tray_status,
            show_os_notification,
            toggle_autostart,
            get_autostart_enabled,
            show_main_window,
            get_go2rtc_status,
            start_camera_ingest,
        ])
        .build(tauri::generate_context!())
        .expect("error while running OSP desktop application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                stop_go2rtc(app);
                stop_camera_ingest(app);
            }
        });
}
