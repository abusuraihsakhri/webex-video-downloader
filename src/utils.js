(function initWebXUtils(root) {
    "use strict";

    function parseRecordingUrl(value) {
        if (typeof value !== "string") return null;

        try {
            const url = new URL(value);
            if (url.protocol !== "https:" || !url.hostname.endsWith(".webex.com")) return null;

            const subdomain = url.hostname.slice(0, -".webex.com".length);
            if (!subdomain) return null;

            const match = url.pathname.match(/^\/(?:recordingservice|webappng)\/sites\/([^/]+)\/.*?([a-f0-9]{32})/i);
            if (!match) return null;

            return {
                subdomain,
                siteName: match[1],
                recordingId: match[2],
                authParams: url.search
            };
        } catch (_error) {
            return null;
        }
    }

    function sanitizeFilename(value, fallback = "webex-recording") {
        const base = String(value || fallback)
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
            .replace(/\s+/g, " ")
            .trim()
            .replace(/[. ]+$/g, "")
            .slice(0, 180);
        return base || fallback;
    }

    function formatTimeCode(value) {
        if (value === null || value === undefined || value === "") return "00:00:00";

        let date;
        const raw = String(value).trim();
        if (/^\d+(?:\.\d+)?$/.test(raw)) {
            const numeric = Number(raw);
            if (!Number.isFinite(numeric)) return "00:00:00";
            const milliseconds = numeric >= 1e12 ? numeric : numeric * 1000;
            date = new Date(milliseconds);
        } else {
            date = new Date(raw);
        }

        if (Number.isNaN(date.getTime())) return "00:00:00";
        return date.toISOString().slice(11, 19);
    }

    function extractResponseParameters(response) {
        if (!response || typeof response !== "object") return null;
        const streamOption = response.mp4StreamOption || {};

        return {
            host: streamOption.host,
            recordingDir: streamOption.recordingDir,
            timestamp: streamOption.timestamp,
            token: streamOption.token,
            xmlName: streamOption.xmlName,
            playbackOption: streamOption.playbackOption,
            siteid: streamOption.siteid,
            recordid: streamOption.recordid,
            islogin: streamOption.islogin,
            isprevent: streamOption.isprevent,
            ispwd: streamOption.ispwd,
            hlsUrl: response.downloadRecordingInfo?.downloadInfo?.hlsURL,
            recordName: response.recordName || "Webex recording",
            fallbackPlaySrc: response.fallbackPlaySrc
        };
    }

    function composeStreamURL(params) {
        if (!params || !params.host) return null;

        try {
            if (params.recordingDir !== undefined && params.recordingDir !== null) {
                const url = new URL("apis/html5-pipeline.do", params.host);
                url.searchParams.set("recordingDir", params.recordingDir);
                url.searchParams.set("timestamp", params.timestamp ?? "");
                url.searchParams.set("token", params.token ?? "");
                url.searchParams.set("xmlName", params.xmlName ?? "");
                url.searchParams.set("isMobileOrTablet", "false");
                url.searchParams.set("ext", params.playbackOption ?? "");
                return url;
            }

            if (params.siteid !== undefined && params.siteid !== null) {
                const url = new URL("nbr/MultiThreadDownloadServlet/recording.xml", params.host);
                url.searchParams.set("siteid", params.siteid);
                url.searchParams.set("recordid", params.recordid ?? "");
                url.searchParams.set("ticket", params.token ?? "");
                url.searchParams.set("timestamp", params.timestamp ?? "");
                url.searchParams.set("islogin", params.islogin ?? "");
                url.searchParams.set("isprevent", params.isprevent ?? "");
                url.searchParams.set("ispwd", params.ispwd ?? "");
                url.searchParams.set("play", "1");
                return url;
            }
        } catch (_error) {
            return null;
        }

        return null;
    }

    const api = {
        parseRecordingUrl,
        sanitizeFilename,
        formatTimeCode,
        extractResponseParameters,
        composeStreamURL
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    } else {
        root.WebXUtils = api;
    }
}(typeof globalThis !== "undefined" ? globalThis : this));
