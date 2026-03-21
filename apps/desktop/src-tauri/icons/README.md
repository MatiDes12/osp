# Icons

Tauri requires icon files in this directory before you can build or run the app.

## Generate icons from a source image

Place a 1024×1024 PNG called `app-icon.png` in this directory, then run:

```bash
pnpm tauri icon app-icon.png
```

This generates all required sizes:

- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns` (macOS)
- `icon.ico` (Windows)
- `icon.png` (Linux / tray)

## Quick placeholder (dev only)

If you just want to run `pnpm dev` without custom icons, the Tauri CLI will
use its built-in default icons automatically. The entries in `tauri.conf.json`
reference these paths and will work once the real icons are generated.
