# 🌿 CrowdMonitor — User & Operator Guide
*Smart Occupancy Intelligence & Crowd Flow Analytics*

Welcome to **CrowdMonitor**! This guide is written to be clean, calm, and easy to read (low cognitive load, low cortisol). Whether you are an operator watching the entrance, an event coordinator, or a facility manager, this document explains exactly how everything works with clear visual examples and zero guesswork.

---

## 📑 Table of Contents
1. [What is CrowdMonitor?](#-1-what-is-crowdmonitor)
2. [System Architecture & Visual Flow](#-2-system-architecture--visual-flow)
3. [Quick Setup (3 Simple Steps)](#-3-quick-setup-3-simple-steps)
4. [Portal Access & Architecture](#-4-portal-access--architecture)
   - [Public Visitor Portal (`/`)](#1-public-visitor-portal-)
   - [Live Sensor View (`/view/:code`)](#2-live-sensor-view-viewcode)
   - [Admin Console Authentication](#3-admin-console-authentication)
5. [Tour of the Admin Console (`/admin/*`)](#-5-tour-of-the-admin-console-admin)
   - [Overview Dashboard (`/admin`)](#1-overview-dashboard-admin)
   - [Live Monitor Cockpit (`/admin/live`)](#2-live-monitor-cockpit-adminlive)
   - [Historical Analytics (`/admin/analytics`)](#3-historical-analytics-adminanalytics)
   - [Sessions Management (`/admin/sessions`)](#4-sessions-management-adminsessions)
   - [Alerts & Incidents (`/admin/alerts`)](#5-alerts--incidents-adminalerts)
   - [Reports & CSV Exports (`/admin/reports`)](#6-reports--csv-exports-adminreports)
   - [Settings & Diagnostics (`/admin/settings`)](#7-settings--diagnostics-adminsettings)
6. [Real-World Everyday Walkthroughs](#-6-real-world-everyday-walkthroughs)
7. [Troubleshooting & Calming Fixes](#-7-troubleshooting--calming-fixes)

---

## 🍃 1. What is CrowdMonitor?

CrowdMonitor takes your physical ESP8266 crowd counting hardware (IR sensors, LCD screen, buzzer, and servo door) and connects it securely to a modern web application.

### Why you will love using it:
- **No direct cloud credentials in your browser**: The backend handles all secure MQTT connections to HiveMQ Cloud.
- **Instant updates**: Real-time Socket.IO synchronization reflects room entries and exits in milliseconds.
- **Safe capacity changes**: Adjust the room's maximum limit directly from your browser—the ESP8266 hardware updates its door logic and LCD automatically.
- **Permanent memory**: Even if your laptop sleeps or your browser tab closes, the backend records all occupancy events in a local SQLite database.

---

## 🔄 2. System Architecture & Visual Flow

```text
 🚶 Person Enters / Exits
         │
         ▼
 ┌───────────────────────────────────────────────┐
 │            ESP8266 Hardware Unit              │
 │  • Entry IR Beam (GPIO 14 / D5)               │
 │  • Exit IR Beam  (GPIO 12 / D6)               │
 │  • Door Servo    (GPIO 2  / D4)               │
 │  • Alert Buzzer  (GPIO 13 / D7)               │
 │  • LCD Display   (I2C D1/D2)                  │
 └───────────────────────┬───────────────────────┘
                         │ 
                         │ Encrypted TLS MQTT (Port 8883)
                         ▼
 ┌───────────────────────────────────────────────┐
 │          HiveMQ Cloud Broker (Serverless)     │
 │  Topics: "crowd/occupancy" & "crowd/capacity" │
 └───────────────────────┬───────────────────────┘
                         │
                         │ Secure Backend Bridge
                         ▼
 ┌───────────────────────────────────────────────┐
 │             Node.js / Express Backend         │
 │  • Validates telemetry schemas with Zod       │
 │  • Local SQLite database (occupancy.db)       │
 │  • REST API & Socket.IO WebSockets            │
 └───────────────────────┬───────────────────────┘
                         │
                         │ Fast Local WebSocket / HTTP
                         ▼
 ┌───────────────────────────────────────────────┐
 │        React + TypeScript + Vite Dashboard    │
 │  (Runs smoothly in Chrome, Edge, Safari, etc) │
 └───────────────────────────────────────────────┘
```

---

## 🚀 3. Quick Setup (3 Simple Steps)

### Step 1: Set up your configuration file
In your main project folder, copy `.env.example` to create `.env`:
```bash
copy .env.example .env
```
Open `.env` and fill in your actual HiveMQ Cloud details:
```env
MQTT_BROKER_URL=mqtts://c4102da92fbe4c4e867a3cd351dbf2aa.s1.eu.hivemq.cloud:8883
MQTT_USERNAME=crowd_esp
MQTT_PASSWORD=YourSecretPasswordHere

PORT=3001
FACILITY_TIMEZONE=Asia/Kolkata
STALE_THRESHOLD_SECONDS=60
ALERT_WARNING_PCT=80
ALERT_CRITICAL_PCT=100
DEFAULT_CAPACITY=10
```

### Step 2: Start the Backend Server (Terminal 1)
```bash
cd server
npm run dev
```
*Expected log output:*
```text
[Database] SQLite connected at .../server/data/occupancy.db
[Broadcaster] Socket.IO instance registered
[MQTT] Connected successfully to MQTT broker
[Server] CrowdMonitor backend listening on port 3001
```

### Step 3: Start the Frontend App (Terminal 2)
```bash
cd client
npm run dev
```
Open your browser and navigate to: **`http://localhost:5173`**

---

## 🚪 4. Portal Access & Architecture

CrowdMonitor features a unified dual-portal architecture designed for both everyday visitors and facility operators:

### 1. Public Visitor Portal (`/`)
*Clean, calm, and instant. No login or password required.*

- **Direct Sensor Lookups**: Visitors enter an assigned sensor or room code (default: `ROOM-101`) to immediately check live availability.
- **One-Click Quick Select**: Quick-access chip for testing and review (`ROOM-101 (Main Conference Hall)`).
- **Fast Status Awareness**: Shows room headcount and door status instantly without exposing administrative controls or private history.

### 2. Live Sensor View (`/view/:code`)
*A full-width, distraction-free view designed for attendees, hallway displays, or reception desks.*

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Back to Portal    ROOM-101 • Main Conference Hall            🟢 Live Stream│
├─────────────────────────────────────────────────────────────────────────────┤
│ 🟢 SPACE AVAILABLE — Safe Capacity (Entry Permitted)                        │
│ Plenty of space remains. You may enter the facility immediately.            │
├───────────────────────────────────┬──────────────┬──────────────┬───────────┤
│         HEADCOUNT INSIDE          │ SPACES FREE  │ UTILIZATION  │ DOOR STATE│
│            👥 4 / 10              │    🟢 6      │     40%      │   🔓 Open │
├───────────────────────────────────┴──────────────┴──────────────┴───────────┤
│ Capacity Progress: [████████░░░░░░░░░░░░] 40% Filled                        │
│ Last Sensor Transmission: 3s ago (Real-time WebSocket active)               │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Zero Scrolling Required**: All vital indicators (headcount, spaces left, percentage bar, door status, and freshness timer) fit cleanly on screen.
- **Color-Coded State System**:
  - 🟢 **SPACE AVAILABLE**: Plenty of capacity remains; entry is safe and welcome.
  - 🟡 **MAX CAPACITY**: 100% full; visitors are advised to queue.
  - 🔴 **OVER CAPACITY**: Limit exceeded; servo gate closes and entry pauses.

### 3. Admin Console Authentication
- Facility managers access full controls via the secure login card on the landing page or directly at `/admin`.
- **Default Credentials for Review/Demo**:
  - **Username**: `admin`
  - **Password**: `admin123`
  - *Includes a 1-click "Auto-Fill" button for easy evaluator testing.*

---

## 🖥 5. Tour of the Admin Console (`/admin/*`)

### 1. Overview Dashboard (`/admin`)
*The calm high-level view. Perfect for an overhead control monitor.*

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 📊 Overview                                                    🟢 Connected │
├──────────────┬──────────────┬──────────────┬──────────────┬─────────────────┤
│  Occupancy   │ Utilization  │  Available   │ Entries Today│   Status        │
│    7 / 10    │     70%      │   3 spaces   │   42 (est)   │   NORMAL 🟢     │
├──────────────┴──────────────┴──────────────┴──────────────┴─────────────────┤
│ 📈 Live 60-Minute Trend                                                     │
│ 10 ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── (Capacity Ceiling)       │
│  8         ╭──╮                                                             │
│  6   ╭─────╯  ╰─────╮                                                       │
│  4 ──╯              ╰─────────                                              │
│    10:00        10:15        10:30        10:45        11:00                │
├──────────────────────────────────────────────┬──────────────────────────────┤
│ 📊 Hourly In / Out Traffic                   │ 🔔 Recent Activity Feed      │
│   [■ In  ■ Out]                              │ • 10:48 AM: Normal telemetry │
│ 12 █ █                                       │ • 10:32 AM: Warning alert    │
│  8 █ █ █                                     │ • 10:14 AM: Capacity set 10  │
└──────────────────────────────────────────────┴──────────────────────────────┘
```

#### What you can see here:
- **Top Metrics**:
  - **Occupancy**: Current headcount vs. maximum allowed.
  - **Utilization**: Visual percentage bar.
  - **Available Spaces**: Remaining spots before room is full.
  - **Entries & Exits Today**: Cumulative foot traffic.
  - **Peak Today**: Highest count reached today.
- **Real-Time Sparkline**: Automatically rolls forward every time someone passes the IR sensors.
- **Hourly In/Out Comparison**: Bar chart comparing arrivals vs. departures.

---

### 2. Live Monitor Cockpit (`/admin/live`)
*The operator control panel for managing real-time flow.*

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 📡 Live Monitor                                                🟢 Connected │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                         ┌───────────────────────┐                           │
│                         │        NORMAL         │                           │
│                         │     🟢 Safe Level     │                           │
│                         └───────────────────────┘                           │
│                                                                             │
│            OCCUPANCY           CAPACITY            AVAILABLE                │
│             👥  7               🎯 10               🟢  3                   │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🛠 Change Permitted Capacity                                                │
│ Set the maximum occupancy permitted. Synchronizes with ESP8266 and door servo.│
│                                                                             │
│ [ 15             ]  [ Update Capacity ]   ✅ Capacity confirmed by ESP8266   │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Status Indicators Explained:
- 🟢 **NORMAL**: Occupancy is below capacity. Servo door is OPEN (`90°`), buzzer is OFF.
- 🟡 **FULL**: Exactly at capacity (`occupancy == capacity`). Servo door remains OPEN, warning logged.
- 🔴 **OVERLIMIT**: Occupancy exceeds capacity (`occupancy > capacity`). ESP8266 buzzer turns ON (`HIGH`), servo door closes (`0°`), and an Incident is logged.

#### How to Change Room Capacity:
1. Type a new number into the box (e.g., `15`).
2. Click **Update Capacity**.
3. The button displays a pending state while sending the command to `crowd/capacity`.
4. As soon as the ESP8266 applies the setting and confirms back, you will see a green checkmark confirmation.

---

### 3. Historical Analytics (`/admin/analytics`)
*Discover patterns, busy hours, and average dwell metrics.*

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 📈 Analytics Studio                                                         │
│ Filter: [ Last 7 Days ▼ ]   Granularity: (●) Hourly  ( ) Daily  ( ) Weekly  │
├─────────────────────────────────────────────────────────────────────────────┤
│ ⚠️ Note: Entry & exit counts are estimated from occupancy delta samples.   │
├──────────────┬──────────────┬──────────────┬──────────────┬─────────────────┤
│ Peak Persons │ Avg Persons  │ Total In     │ Total Out    │ Over-Limit Time │
│      14      │     6.2      │     312      │     298      │     12 mins     │
├──────────────┴──────────────┴──────────────┴──────────────┴─────────────────┤
│ 🗓 Day-of-Week × 24-Hour Traffic Heatmap                                   │
│        00 02 04 06 08 10 12 14 16 18 20 22                                  │
│   Mon  ░░ ░░ ░░ ░░ ▒▒ ▓▓ ▓▓ ▒▒ ░░ ░░ ░░ ░░   (Darker = Busiest)             │
│   Tue  ░░ ░░ ░░ ░░ ▒▒ ▓▓ ██ ▓▓ ▒▒ ░░ ░░ ░░                                  │
│   Wed  ░░ ░░ ░░ ░░ ▒▒ ▓▓ ██ ██ ▓▓ ▒▒ ░░ ░░                                  │
│   Thu  ░░ ░░ ░░ ░░ ▒▒ ▓▓ ▓▓ ▓▓ ▒▒ ░░ ░░ ░░                                  │
│   Fri  ░░ ░░ ░░ ░░ ▒▒ ▓▓ ██ ██ ██ ▓▓ ▒▒ ░░                                  │
│   Sat  ░░ ░░ ░░ ░░ ░░ ▒▒ ▓▓ ▓▓ ▒▒ ░░ ░░ ░░                                  │
│   Sun  ░░ ░░ ░░ ░░ ░░ ░░ ▒▒ ▒▒ ░░ ░░ ░░ ░░                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🏆 Traffic Highlights                                                       │
│ • Busiest Hour: 2:00 PM - 3:00 PM (Average 9.4 people)                      │
│ • Busiest Day:  Friday (Average 8.1 people)                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 4. Sessions Management (`/admin/sessions`)
*Track isolated shifts, classroom exams, conferences, or private events.*

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ ⏱ Session Management                                                       │
│ [ Enter Session Name...             ]  [ + Create Session ]                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🟢 CURRENT ACTIVE SESSION: "Afternoon Keynote Speech"                       │
│ • Started: 2:00 PM (42 mins elapsed)                                        │
│ • Initial Capacity: 25                                                      │
│ • Current Occupancy: 18 (Peak: 22)                                          │
│                                           [ End Session & Save Stats ]      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 📚 Past Session History                                                     │
│ Name                   Started    Ended      Peak   Avg   Overlimit  Action │
│ ─────────────────────────────────────────────────────────────────────────── │
│ Morning Workshop       09:00 AM   12:30 PM   12     7.4   0m         [CSV]  │
│ Evening Meetup         06:00 PM   09:00 PM   28     19.2  4m         [CSV]  │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Why use Sessions?
- When a session starts, it creates a clean mathematical snapshot.
- When you end a session, you get an isolated summary (Peak, Average, Duration, Over-limit time) without mixing in earlier morning data.
- Download a targeted CSV export for any individual session with one click.

---

### 5. Alerts & Incidents (`/admin/alerts`)
*Peace of mind and safety compliance.*

- **Open Alerts**: Shows active threshold violations. If occupancy passes 80% or 100%, an alert card appears here.
- **Acknowledge Button**: Clicking **"Acknowledge"** attaches your timestamp to show that someone is handling the situation.
- **Device Health Diagnostic**:
  - Broker URL status (safely redacted).
  - Time elapsed since the last message.
  - Reconnect attempt counters.
  - **Stale Data Warning**: If the ESP8266 stops transmitting for more than 60 seconds, a notification informs you that readings may be paused.

---

### 6. Reports & CSV Exports (`/admin/reports`)
*Extract clean data for spreadsheets, management decks, and compliance records.*

1. Select your **Start Date** and **End Date**.
2. Click one of the download buttons:
   - **Download Events CSV**: Line-by-line record of every single person entering or leaving.
   - **Download Occupancy CSV**: Timestamped records of room counts, percentages, and statuses.
3. Preview the first 50 rows in the browser before exporting.

---

### 7. Settings & Diagnostics (`/admin/settings`)
*Adjust rules without writing any code.*

- **Warning Threshold**: Set the early caution percentage (Default: `80%`).
- **Critical Threshold**: Set the over-capacity trigger (Default: `100%`).
- **Stale Telemetry Seconds**: How long to wait before flagging a sensor as paused or disconnected (Default: `60 seconds`).
- **Default Capacity**: Baseline capacity used if the hardware starts fresh.

---

## 🏃 6. Real-World Everyday Walkthroughs

### Scenario A: Running a Lecture or Event
1. Go to **Sessions** (`/admin/sessions`).
2. Type `"Physics 101 Lecture"` and click **Create Session**.
3. When students begin walking in, click **Start**.
4. During the lecture, leave **Live Monitor** (`/admin/live`) open on your phone or tablet.
5. If the room gets crowded, you will see yellow or red warnings immediately.
6. When the lecture concludes, click **End Session**.
7. Click **Export CSV** to download attendance and peak data for your records.

### Scenario B: Temporarily Raising Capacity
1. Suppose you have added 5 extra folding chairs to a room with capacity `10`.
2. Go to **Live Monitor** (`/admin/live`).
3. In the capacity box, change `10` to `15` and click **Update Capacity**.
4. The ESP8266 LCD changes from `People: X/10` to `People: X/15` and the servo door stays open.

---

## 🧘 7. Troubleshooting & Calming Fixes

| What you see | What it means | How to fix it |
|---|---|---|
| `getaddrinfo ENOTFOUND your_hivemq_host...` | The `.env` file still has the placeholder text. | Open `.env` and paste your actual HiveMQ host URL: `c4102da92fbe4c4e867a3cd351dbf2aa.s1.eu.hivemq.cloud`. |
| 🟡 **Stale Telemetry** badge appears | The backend hasn't heard from the ESP8266 in >60 seconds. | Check if the ESP8266 has power. Note: The firmware only publishes when people enter/exit or capacity changes. |
| Port 3001 already in use | Another backend process is already running. | Close any extra terminal windows running `node`, or change `PORT=3002` in `.env`. |
| Browser shows "Disconnected" dot | The frontend cannot reach the backend server. | Make sure Terminal 1 (`npm run dev` in `server/`) is running without errors. |

---

### ✨ Summary Checklist
- [x] Node.js 18 or 22 installed
- [x] `.env` filled with real HiveMQ credentials
- [x] Backend running in Terminal 1 (`cd server && npm run dev`)
- [x] Frontend running in Terminal 2 (`cd client && npm run dev`)
- [x] Browser open to `http://localhost:5173`

*Enjoy your clear, calm, and reliable crowd intelligence system!*
