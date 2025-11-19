/**
 * Test script to simulate full streaming workflow
 * Tests: get_ordered_list → create_link → fetch m3u8 → fetch first video chunk
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
        "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3",
        "X-User-Agent": "Model: MAG270; Link: WiFi",
        "Referer": CONFIG.url + "c/",
        "Authorization": `Bearer ${CONFIG.bearer}`,
        "Cookie": `mac=${CONFIG.mac.toLowerCase()}; timezone=America/Toronto; adid=06c140f97c839eaaa4faef4cc08a5722;`
    };

    console.log(`\n[${action.toUpperCase()}]`);
    console.log(`URL: ${finalUrl}`);

    try {
        const res = await fetch(finalUrl, { headers });
        if (!res.ok) {
            console.log(`❌ Error: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.log(`Response: ${text.substring(0, 200)}`);
            return null;
        }
        const text = await res.text();
        return JSON.parse(text);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`❌ Error: ${msg}`);
        return null;
    }
}

async function fetchUrl(url: string, name: string) {
    console.log(`\n[FETCH: ${name}]`);
    console.log(`URL: ${url}`);
    
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.log(`❌ Error: ${res.status} ${res.statusText}`);
            return null;
        }
        const text = await res.text();
        console.log(`✅ Got ${text.length} bytes`);
        console.log(`Content preview:\n${text.substring(0, 300)}`);
        return text;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`❌ Error: ${msg}`);
        return null;
    }
}

async function run() {
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║   STALKER PORTAL - FULL STREAMING TEST                     ║");
    console.log("╚════════════════════════════════════════════════════════════╝");

    // Step 1: Get account info
    const mainInfo = await callStalker("get_main_info", { type: "account_info" });
    if (!mainInfo) return;
    console.log(`✅ Account: ${mainInfo.js.fname}, Expires: ${mainInfo.js.end_date}`);

    // Step 2: Get channels from ENGLISH | USA category
    console.log("\n─────────────────────────────────────────────────────────────");
    const channelList = await callStalker("get_ordered_list", {
        type: "itv",
        genre: "1"  // ENGLISH | USA
    });
    
    if (!channelList?.js?.data?.length) {
        console.log("❌ No channels found");
        return;
    }

    const channel = channelList.js.data[0];
    console.log(`✅ Selected channel: ${channel.name}`);
    console.log(`   Channel ID: ${channel.id}`);
    console.log(`   Channel CMD: ${channel.cmd}`);
    console.log(`   Currently playing: ${channel.cur_playing}`);

    // Step 3: Create stream link (THIS IS THE KEY STEP)
    console.log("\n─────────────────────────────────────────────────────────────");
    const streamResponse = await callStalker("create_link", {
        type: "itv",
        cmd: channel.cmd,
        forced_storage: "0",
        disable_ad: "0",
        js_client: "1"
    });

    if (!streamResponse?.js?.cmd) {
        console.log("❌ Failed to create stream link");
        console.log(`Response: ${JSON.stringify(streamResponse)}`);
        return;
    }

    const streamUrl = streamResponse.js.cmd;
    console.log(`✅ Stream URL generated: ${streamUrl}`);

    // Step 4: Fetch the m3u8 playlist
    console.log("\n─────────────────────────────────────────────────────────────");
    const m3u8Content = await fetchUrl(streamUrl, "m3u8 playlist");
    if (!m3u8Content) {
        console.log("⚠️  Could not fetch m3u8, stream URL may be correct but:");
        console.log("   - May require specific headers");
        console.log("   - May require origin/referer");
        console.log("   - Token may have expired");
        console.log("\n💡 Try this URL in VLC:");
        console.log(`   ${streamUrl}`);
        return;
    }

    // Step 5: Parse m3u8 and get first segment
    console.log("\n─────────────────────────────────────────────────────────────");
    const lines = m3u8Content.split('\n');
    const segmentLine = lines.find((line: string) => !line.startsWith('#') && line.trim());
    
    if (!segmentLine) {
        console.log("❌ No segments found in m3u8");
        return;
    }

    // Resolve relative URLs
    let firstSegmentUrl = segmentLine.trim();
    if (!firstSegmentUrl.startsWith('http')) {
        const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1);
        firstSegmentUrl = baseUrl + firstSegmentUrl;
    }

    console.log(`✅ First segment: ${firstSegmentUrl}`);

    // Step 6: Fetch first video chunk
    console.log("\n─────────────────────────────────────────────────────────────");
    const chunkResponse = await fetch(firstSegmentUrl);
    if (!chunkResponse.ok) {
        console.log(`❌ Error fetching chunk: ${chunkResponse.status} ${chunkResponse.statusText}`);
        return;
    }

    const buffer = await chunkResponse.arrayBuffer();
    console.log(`✅ Got first video chunk: ${buffer.byteLength} bytes`);

    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║   ✅ STREAMING TEST SUCCESSFUL                            ║");
    console.log("║   Stream is playable and delivering video chunks          ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
}

run();
