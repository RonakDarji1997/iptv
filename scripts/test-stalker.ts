/**
 * ================================================================
 *  STALKER PORTAL IPTV API – FULL DOCUMENTATION (REVERSE-ENGINEERED)
 * ================================================================
 *
 *  BASE URL:
 *      http://tv.stream4k.cc/stalker_portal/server/load.php
 *
 *  REQUIRED HEADERS:
 *      User-Agent:     (MAG emulator)
 *      X-User-Agent:   Model info
 *      Referer:        http://tv.stream4k.cc/stalker_portal/c/
 *      Authorization:  Bearer <TOKEN>
 *      Cookie:
 *          mac=<MAC>;
 *          timezone=<TZ>;
 *          adid=<STATIC DEVICE ID>;
 *          st=<TOKEN>;     (Some portals ignore)
 *
 * ================================================================
 *  AUTHENTICATION NOTES
 * ================================================================
 *  - Handshake is NOT required for TiviMate-style access.
 *  - Bearer token stays persistent until portal revokes it.
 *  - `adid` stays same for all further requests per device.
 *  - MAC address uniquely identifies your "virtual device".
 *
 *
 * ================================================================
 *  API ENDPOINTS (A→Z)
 * ================================================================
 *
 *  1) get_main_info
 *  -----------------
 *  PATH:
 *      ?type=account_info&action=get_main_info
 *
 *  PURPOSE:
 *      - Fetch account balance, subscription status,
 *        expiration date, connection limits, etc.
 *
 *  NOTES:
 *      - Works without handshake.
 *
 *
 *  2) get_all_channels
 *  -------------------
 *  PATH:
 *      ?type=itv&action=get_all_channels
 *
 *  PURPOSE:
 *      - Returns ALL channel metadata.
 *      - Includes channel IDs used for streaming.
 *
 *  RESPONSE:
 *      js.data[] → array of channel objects
 *
 *
 *  3) get_genres
 *  -------------
 *  PATH:
 *      ?type=itv&action=get_genres
 *
 *  PURPOSE:
 *      - Category list for channels (Sports, News, Movies, etc.)
 *
 *
 *  4) get_ordered_list
 *  -------------------
 *  PATH:
 *      ?type=itv&action=get_ordered_list&genre=<id>&sortby=number
 *
 *  PURPOSE:
 *      - Category-only channel list
 *      - Usually grouped by genre
 *
 *  NOTES:
 *      - TiviMate uses this when entering category tabs.
 *
 *
 *  5) create_link
 *  --------------
 *  PATH:
 *      ?type=itv&action=create_link&cmd=ffrt <LOCAL PATH>
 *
 *  PURPOSE:
 *      - Converts internal "channel link ID" into playable `.m3u8`
 *
 *  RESPONSE:
 *      js.cmd = "http://<STREAM-IP>/<UUID>/index.m3u8?token=<short-lived>"
 *
 *  IMPORTANT:
 *      - Stream IP changes dynamically (CDN, load balancer)
 *      - Token changes frequently
 *      - **YOU MUST CALL THIS BEFORE PLAYING LIVE CHANNEL**
 *
 *
 * ================================================================
 *  STREAMING WORKFLOW
 * ================================================================
 *
 *  Step 1: get_all_channels
 *          → Gives "cmd" like `ffrt http://localhost/ch/48723`
 *
 *  Step 2: create_link
 *          → Converts channel ID → Real HLS URL
 *
 *  Step 3: Play index.m3u8 in VLC / ffmpeg / player
 *
 *
 * ================================================================
 *  STATIC DEVICE PARAMETERS
 * ================================================================
 *
 *  mac      → Always lowercase in cookies.
 *  adid     → Stays constant after installed on device.
 *  timezone → Used in portal logs, not validation.
 *  bearer   → Authentication token.
 *
 *
 * ================================================================
 *  SECURITY / DETECTION NOTES
 * ================================================================
 *
 *  ❗ DO NOT reuse MAC on multiple devices (portal may ban).
 *  ❗ Stream tokens are short-lived (5–30 min usually).
 *  ❗ Each `create_link` must be done per-playback.
 *
 * ================================================================
 */


import fetch from "node-fetch";

const CONFIG = {
    url: "http://tv.stream4k.cc/stalker_portal/",
    mac: "00:1A:79:17:F4:F5",
    bearer: "1E75E91204660B7A876055CE8830130E"
};

async function callStalker(action: string, params: Record<string, string> = {}) {
    const baseUrl = CONFIG.url.endsWith("/") ? CONFIG.url : CONFIG.url + "/";
    const apiUrl = baseUrl + "server/load.php";

    const query = new URLSearchParams();
    query.append("action", action);

    if (!params.type) query.append("type", "stb");

    Object.entries(params).forEach(([k, v]) => query.append(k, v));

    const finalUrl = `${apiUrl}?${query.toString()}`;

    const headers: Record<string, string> = {
        "User-Agent":
            "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3",
        "X-User-Agent": "Model: MAG270; Link: WiFi",
        "Referer": CONFIG.url + "c/",
        "Authorization": `Bearer ${CONFIG.bearer}`,
        "Cookie":
            `mac=${CONFIG.mac.toLowerCase()}; ` +
            `timezone=America/Toronto; ` +
            `adid=06c140f97c839eaaa4faef4cc08a5722;`
    };

    console.log(`\n[REQUEST] ${action}`);
    console.log(`URL → ${finalUrl}`);
    console.log("HEADERS →", headers);

    const res = await fetch(finalUrl, { headers });
    const text = await res.text();

    try {
        return JSON.parse(text);
    } catch {
        console.log("Non-JSON:", text);
        return null;
    }
}

async function run() {
    console.log("Using STATIC BEARER (no handshake)");
    console.log("Bearer:", CONFIG.bearer);

    // 1. Main Info
    console.log("\n--- get_main_info ---");
    const mainInfo = await callStalker("get_main_info", {
        type: "account_info"
    });
    console.log("Main Info:", mainInfo);

    // 2. Get Channels from a specific genre to test streaming
    console.log("\n--- get_ordered_list for genre 1 (ENGLISH | USA) ---");
    const channelList = await callStalker("get_ordered_list", {
        type: "itv",
        genre: "1"
    });
    
    if (channelList?.js?.data?.length > 0) {
        const firstChannel = channelList.js.data[0];
        console.log(`First channel: ${firstChannel.name} (${firstChannel.cmd})`);
        
        // 3. CREATE STREAM LINK - This is the key step!
        console.log("\n--- create_link ---");
        const streamLink = await callStalker("create_link", {
            type: "itv",
            cmd: firstChannel.cmd,
            forced_storage: "0",
            disable_ad: "0",
            js_client: "1"
        });
        
        if (streamLink?.js?.cmd) {
            console.log("🎥 PLAYABLE STREAM URL:");
            console.log(streamLink.js.cmd);
            console.log("\n💡 HOW TO PLAY:");
            console.log("1. Copy the URL above");
            console.log("2. Open VLC Media Player");
            console.log("3. Go to Media -> Open Network Stream");
            console.log("4. Paste the URL and click Play");
            console.log("\n⚠️  NOTE: Stream token expires in ~5-30 minutes");
        } else {
            console.log("❌ Failed to get stream URL:", streamLink);
        }
    }

    // 4. Genres
    console.log("\n--- get_genres ---");
    const genres = await callStalker("get_genres", {
        type: "itv"
    });
    console.log("Available genres:", genres?.js?.slice(0, 5)); // Show first 5
}

run();
