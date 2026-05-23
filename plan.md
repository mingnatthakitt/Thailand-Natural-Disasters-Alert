Here is the complete, production-ready architectural plan for **Siam & Greater Indochina Disaster Watch**.

By shifting the trigger clock from GitHub Actions to **Cron-Job.org** and integrating **Upstash Redis**, we completely eliminate processing delays. This ensures you get near-real-time Discord push notifications on your phone the moment an anomaly is detected.

---

## 1. What You Need to Sign Up For (The Free Stack)

Before building, make sure you have free accounts on these platforms. You will not need to enter a credit card for any of them.

* **GitHub:** To host your private code repository.
* **Vercel:** To host both your frontend interactive map and your serverless backend endpoints.
* **Upstash:** To get a free Serverless Redis database (gives you 10,000 free requests per day, we will only use about 200 per day).
* **Cron-Job.org:** A dedicated, hyper-punctual cron service that will ping your Vercel app exactly on time without delays.
* **Discord:** Create your own private server and a channel named `#disaster-alerts`.

---

## 2. Expanded Regional Spatial Boundary Matrix

To capture cross-border events that directly impact Thailand—such as agricultural slash-and-burn smoke hazards from Laos and Myanmar, or seismic activity originating near northern Malaysia—the bounding box has been expanded:

| Boundary Extreme | Location Context Covered | Expanded Coordinate |
| --- | --- | --- |
| **West Longitude (Min)** | Deep into Myanmar (Andaman Sea/Yangon) | `95.0° E` |
| **North Latitude (Max)** | High Laos / Northern Myanmar borders | `22.5° N` |
| **East Longitude (Max)** | Edge of Laos / Vietnam border zone | `107.5° E` |
| **South Latitude (Min)** | Northern Malaysia / Straits of Malacca | `4.0° N` |

> **Your Universal Bounding Box String:** `95.0,22.5,107.5,4.0`

---

## 3. Near-Real-Time Dual-API Specification

To ensure events are captured immediately without missing flash occurrences like earthquakes, the backend logic shifts from tracking "open status" to analyzing **sliding historical time windows**.

### Data Feed A: NASA EONET API v3 (Thermal/Climate Hazards)

* **Endpoint:** `[https://eonet.gsfc.nasa.gov/api/v3/events](https://eonet.gsfc.nasa.gov/api/v3/events)`
* **Query Parameters:** `bbox=95.0,22.5,107.5,4.0&status=open&limit=50`
* **Live Parsing Strategy:** Read the latest element in the `geometry` array. Even if a wildfire burns for a week, NASA updates the timestamp on this array when new thermal anomalies are detected by MODIS/VIIRS satellites.

### Data Feed B: USGS Earthquake API (Seismic Hazards)

* **Endpoint:** `[https://earthquake.usgs.gov/fdsnws/event/1/query](https://earthquake.usgs.gov/fdsnws/event/1/query)`
* **Query Parameters:** `format=geojson&minmagnitude=2.0&minlongitude=95.0&maxlongitude=107.5&minlatitude=4.0&maxlatitude=22.5`
* **Near-Real-Time Sliding Window:** The engine must dynamically append a `starttime` parameter to this URL on every execution, calculated exactly as **45 minutes prior to execution time**. This guarantees that a sudden 2.0+ Richter shake in Laos or the Gulf is caught on the very next cron cycle.

---

## 4. System Architecture Flow

```
+---------------------------------------------------------------------------------+
|                         HIGH-SPEED MONITORING ENGINE                            |
+---------------------------------------------------------------------------------+
|                                                                                 |
|  [ CRON-JOB.ORG ] ---> (Every 15 mins + Secret Key) ---> [ VERCEL SERVERLESS ] |
|                                                                  |              |
|       +----------------------------------------------------------+              |
|       |                                                                         |
|       v                                                                         |
|  1. Queries NASA & USGS (95.0, 4.0 to 107.5, 22.5)                              |
|  2. Checks Upstash Redis Cache (Has Event ID been notified?)                    |
|  3. If NEW -> Saves ID to Redis (24-hour expiry)                                |
|  4. Formats Discord Rich Embed Payload                                          |
|       |                                                                         |
|       v                                                                         |
|  [ DISCORD WEBHOOK ] ---> (Instant Processing) ---> [ YOUR SMARTPHONE ALERT ]   |
|                                                                                 |
+---------------------------------------------------------------------------------+

```

---

## 5. Blueprint Implementation Protocol (For Google Antigravity)

Provide this exact sequence to your building tool to write and wire up the codebase:

### Phase I: Environment & Security Architecture

* Configure the Vercel project to expect three hidden environment variables:
1. `DISCORD_WEBHOOK_URL`: The destination URL generated by your Discord channel integration.
2. `CRON_SECRET_KEY`: A complex random string generated by you to protect your serverless endpoint.
3. `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`: Credentials provided by your Upstash console.


* The backend script must sit at `/api/check-disasters.js` (or `.ts`). The very first line of code must validate that the incoming request header `Authorization: Bearer [CRON_SECRET_KEY]` matches your secret variable. If it does not, abort immediately with an HTTP 401 error.

### Phase II: Deduplication Engine (Upstash Integration)

* Establish an asynchronous connection loop to the Upstash Redis instance.
* When parsing the combined payloads of NASA and USGS events, the script must look up the unique event string (e.g., `EONET_E-1234` or `USGS_us6000abc`) using a Redis `GET` command.
* If the key returns data, the event is skipped.
* If the key returns null, the script issues a Redis `SET` command with an `EX` (expiration) flag set to `86400` seconds (24 hours). This prevents database bloating while ensuring you never get duplicate text pings for the same event.

### Phase III: Discord Presentation Layer

The payload sent to Discord must utilize Rich Embed structures for quick scannability on a phone screen:

* **Color Logic:** Map `0xE67E22` (Orange) for NASA wildfire/smoke detections, and `0xFF0000` (Red) for USGS tectonic alerts.
* **Time Normalization:** Convert all ISO timestamps returned by the APIs into Indochina Time (`ICT`, UTC+7) before injecting them into the message text.
* **Formatting Fields:**
* *Title:* e.g., `"⚠️ New Seismic Activity Detected"`
* *Description:* e.g., `"M 2.4 Earthquake - 12km X of Luang Prabang, Laos"`
* *Fields:* Add clear inline rows for `Coordinates`, `Local Time`, and `Source Data Link`.



### Phase IV: Frontend Mapping Dashboard

* Inside the static web layout hosted on Vercel, integrate a **Leaflet.js** map container.
* Set the default viewport zoom to focus squarely on Thailand, but pull the entire expanded bounding box dataset (`95.0, 4.0, 107.5, 22.5`) directly on the client side.
* Instruct the map engine to differentiate pins visually: use orange radial rings or flame indicators for fires crossing over from Myanmar/Laos, and distinct seismic shock rings for earthquakes.