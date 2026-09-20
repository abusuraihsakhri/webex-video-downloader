import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const utils = require(path.join(root, "src", "utils.js"));

const recordingId = "0123456789abcdef0123456789abcdef";
const recordingUrl = `https://acme.webex.com/recordingservice/sites/team/recording/${recordingId}?foo=bar`;
const parsed = utils.parseRecordingUrl(recordingUrl);
assert.equal(parsed?.subdomain, "acme");
assert.equal(parsed?.siteName, "team");
assert.equal(parsed?.recordingId, recordingId);
assert.equal(parsed?.authParams, "?foo=bar");
assert.equal(utils.parseRecordingUrl("https://acme.webex.com/meet/example"), null);
assert.equal(utils.parseRecordingUrl("https://example.com/recordingservice/sites/team/x"), null);

assert.equal(utils.sanitizeFilename('Quarterly: Review / Q1?'), "Quarterly_ Review _ Q1_");
assert.equal(utils.sanitizeFilename("   "), "webex-recording");

assert.equal(utils.formatTimeCode(0), "00:00:00");
assert.equal(utils.formatTimeCode(3661), "01:01:01");
assert.equal(utils.formatTimeCode("1970-01-01T01:01:01Z"), "01:01:01");
assert.equal(utils.formatTimeCode("invalid"), "00:00:00");

const legacyParams = utils.extractResponseParameters({
    recordName: "Meeting",
    fallbackPlaySrc: "https://acme.webex.com/video.mp4",
    mp4StreamOption: {
        host: "https://acme.webex.com/",
        recordingDir: "dir",
        timestamp: "123",
        token: "abc",
        xmlName: "recording.xml",
        playbackOption: "mp4"
    }
});
assert.equal(legacyParams.recordName, "Meeting");
assert.equal(legacyParams.hlsUrl, undefined);
const legacyUrl = utils.composeStreamURL(legacyParams);
assert.equal(legacyUrl?.pathname, "/apis/html5-pipeline.do");
assert.equal(legacyUrl?.searchParams.get("recordingDir"), "dir");

const modernParams = utils.extractResponseParameters({
    mp4StreamOption: {
        host: "https://acme.webex.com/",
        siteid: "site",
        recordid: "record",
        timestamp: "456",
        token: "ticket",
        islogin: "0",
        isprevent: "0",
        ispwd: "0"
    },
    downloadRecordingInfo: {
        downloadInfo: {
            hlsURL: "https://acme.webex.com/example.m3u8"
        }
    }
});
assert.equal(modernParams.hlsUrl, "https://acme.webex.com/example.m3u8");
const modernUrl = utils.composeStreamURL(modernParams);
assert.equal(modernUrl?.pathname, "/nbr/MultiThreadDownloadServlet/recording.xml");
assert.equal(modernUrl?.searchParams.get("siteid"), "site");

const manifestPath = path.join(root, "src", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, "1.4.0");
assert.ok(manifest.permissions.includes("activeTab"));
assert.ok(!manifest.permissions.includes("tabs"));
assert.deepEqual(manifest.content_scripts[0].js, ["utils.js", "content.js"]);

const popup = fs.readFileSync(path.join(root, "src", "popup.html"), "utf8");
for (const asset of ["popup.css", "utils.js", "options.js", "popup.js"]) {
    assert.ok(popup.includes(asset), `popup.html should reference ${asset}`);
    assert.ok(fs.existsSync(path.join(root, "src", asset)), `${asset} should exist`);
}

{
    const contentSource = fs.readFileSync(path.join(root, "src", "content.js"), "utf8");
    let messageListenerRegistered = false;
    const context = {
        WebXUtils: utils,
        location: { href: "https://acme.webex.com/meet/example" },
        chrome: {
            runtime: {
                onMessage: { addListener: () => { messageListenerRegistered = true; } }
            }
        },
        document: {}
    };
    vm.runInNewContext(contentSource, context, { filename: "content.js" });
    assert.equal(messageListenerRegistered, true);
}

{
    const backgroundSource = fs.readFileSync(path.join(root, "src", "background.js"), "utf8");
    let requestHeaderListener;
    let messageListener;
    const sentMessages = [];
    const context = {
        URL,
        Number,
        console,
        fetch: async () => ({ ok: true, json: async () => ({}) }),
        chrome: {
            runtime: {
                lastError: null,
                onMessage: { addListener: (listener) => { messageListener = listener; } }
            },
            downloads: { download: (_options, cb) => cb(1) },
            tabs: {
                sendMessage: (tabId, payload, cb) => {
                    sentMessages.push({ tabId, payload });
                    cb?.();
                }
            },
            webRequest: {
                onSendHeaders: {
                    addListener: (listener) => { requestHeaderListener = listener; }
                }
            }
        }
    };
    vm.runInNewContext(backgroundSource, context, { filename: "background.js" });
    assert.equal(typeof requestHeaderListener, "function");
    assert.equal(typeof messageListener, "function");

    requestHeaderListener({
        tabId: 42,
        requestHeaders: [{ name: "AccessPwd", value: "secret" }]
    });
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].tabId, 42);
    assert.equal(sentMessages[0].payload.recPassword, "secret");

    let blockedResponse;
    const keepAlive = messageListener(
        { type: "fetchRecordingJson", url: "https://example.com/private" },
        {},
        (value) => { blockedResponse = value; }
    );
    assert.equal(keepAlive, false);
    assert.equal(blockedResponse, null);
}

console.log("Validation passed");
