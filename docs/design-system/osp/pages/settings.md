# Settings -- Page Overrides

> Rules here override `MASTER.md`. Unmentioned rules inherit from Master.

---

## Layout

- Left nav: Settings categories (vertical tabs)
- Right content: Selected category form
- Mobile: Categories as full-width list, tap opens category

## Categories

1. **Cameras** -- Add/edit/remove cameras, connection settings
2. **Users and Roles** -- Invite users, assign roles, manage permissions
3. **Notifications** -- Push, email, webhook preferences per user
4. **Recording** -- Retention policy, storage usage, quality settings
5. **Extensions** -- Installed extensions, marketplace, extension config
6. **Tenant** -- Organization name, branding, custom domain
7. **Billing** -- Plan, usage, invoices
8. **API Keys** -- Developer API keys for extension development

## Camera Settings

- Camera list: Table with columns (Name, Status, Protocol, IP/URL, Last Seen, Actions)
- Add Camera flow:
  1. Auto-discover (ONVIF scan) or Manual entry (RTSP URL)
  2. Test connection (show live preview)
  3. Name the camera, assign to zones
  4. Save
- Edit: Inline or slide-over panel
- Delete: Confirmation dialog with camera name typed to confirm

## Users and Roles

- User table: Name, Email, Role, Last Active, Actions
- Invite: Email input + role selector
- Roles: Admin (full access), Operator (view + manage cameras + acknowledge alerts), Viewer (view only)

## Extension Marketplace

- Grid of extension cards (2 or 3 columns)
- Each card: Icon, name, author, short description, install count
- Installed tab / Browse tab
- Install button: Opens confirmation dialog with permissions list
- Installed extensions: Config button, disable toggle, uninstall

## Form Patterns

- Group related fields in bordered sections with section title
- Save button: Bottom of each section, disabled until changes made
- Unsaved changes: Warning banner at top if navigating away
- Success: Toast notification "Settings saved"
- Validation: Inline errors below fields, red border on invalid
