# Rules Engine -- Page Overrides

> Rules here override `MASTER.md`. Unmentioned rules inherit from Master.

---

## Layout

- Two panels: Rules list (left, 40%) + Rule editor (right, 60%)
- Mobile: Full-width list, tap opens editor as new screen

## Rules List

- Each rule card:
  - Name (bold), description (muted)
  - Trigger type icon + camera/zone scope
  - Enabled/disabled toggle (right side)
  - Last triggered timestamp (monospace)
  - Active indicator: green dot if enabled
- Sort by: Name, Last Triggered, Created
- "Create Rule" button: Primary, top of list

## Rule Editor (Visual Builder)

Three-stage pipeline connected by arrows:

```
[Trigger] --> [Conditions] --> [Actions]
```

### Trigger Block
- Background: `bg-blue-500/10 border border-blue-500/30 rounded-lg p-4`
- Trigger type dropdown: Motion Detected, Person Detected, Vehicle Detected, Camera Offline, Schedule
- Camera selector: Which cameras this rule applies to
- Zone selector: Which zones within those cameras (optional)

### Condition Block
- Background: `bg-amber-500/10 border border-amber-500/30 rounded-lg p-4`
- Condition rows: AND/OR logic between conditions
- Condition types: Time of Day, Day of Week, Confidence Threshold, Consecutive Count
- "Add Condition" button (ghost)

### Action Block
- Background: `bg-green-500/10 border border-green-500/30 rounded-lg p-4`
- Action types: Send Push Notification, Send Email, Start Recording, Trigger Webhook, Run Extension
- Multiple actions allowed (list)
- "Add Action" button (ghost)
- Each action: Expandable config (recipient, message template, URL)

## Connection Lines

- SVG arrows between blocks, `stroke: zinc-600`, `stroke-width: 2`
- Animated dash pattern when rule is being tested
- Straight horizontal lines with rounded corners, not bezier curves

## Rule Testing

- "Test Rule" button: Simulates the rule with a synthetic event
- Shows step-by-step execution: Trigger matched, Conditions evaluated, Actions fired
- Green checkmarks or red X for each stage
- Does not send actual notifications in test mode (dry run)

## Schedule Overlay

- When trigger is "Schedule": Show weekly grid (7 columns x 24 rows)
- Click and drag to select active hours
- Green cells = rule active, gray = inactive
