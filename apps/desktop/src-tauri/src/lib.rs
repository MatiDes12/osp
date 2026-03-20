use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewWindow,
};

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
        .menu_on_left_click(false)
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
        .invoke_handler(tauri::generate_handler![
            update_tray_status,
            show_os_notification,
            toggle_autostart,
            get_autostart_enabled,
            show_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OSP desktop application");
}
