(function initPopup() {
    "use strict";

    let chatMessages = [];
    let recordingParams = null;

    const byId = (id) => document.getElementById(id);

    function setView(id) {
        for (const view of document.querySelectorAll(".view")) {
            view.hidden = view.id !== id;
        }
    }

    function renderFailure() {
        setView("errpage");
    }

    function renderException(error) {
        const message = error instanceof Error ? error.message : String(error?.message || error || "Unknown error");
        byId("error-message").textContent = message;
        setView("fail");
    }

    async function copyLink() {
        const button = byId("copy");
        try {
            await navigator.clipboard.writeText(byId("content").value);
            button.textContent = "Copied";
            setTimeout(() => { button.textContent = "Copy URL"; }, 1000);
        } catch (error) {
            renderException(error);
        }
    }

    function downloadBlob(filename, content, type) {
        const blob = new Blob([content], { type });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }

    function downloadChat() {
        if (!chatMessages.length) return;

        const baseName = WebXUtils.sanitizeFilename(recordingParams?.recordName || "webex-recording");
        if (byId("chat-opt").checked) {
            const content = chatMessages
                .map((message) => `${message.timecode} - ${message.name}\n${message.message}`)
                .join("\n\n") + "\n";
            downloadBlob(`${baseName}_chat.txt`, content, "text/plain;charset=utf-8");
            return;
        }

        downloadBlob(
            `${baseName}_chat.json`,
            JSON.stringify(chatMessages, null, 2),
            "application/json;charset=utf-8"
        );
    }

    function downloadVideo() {
        if (!recordingParams?.fallbackPlaySrc) return;
        chrome.runtime.sendMessage({
            type: "downloadRecording",
            url: String(recordingParams.fallbackPlaySrc),
            filename: `${WebXUtils.sanitizeFilename(recordingParams.recordName)}.mp4`
        });
    }

    function renderSuccess(hlsUrl, messages, chatStatus = "") {
        chatMessages = Array.isArray(messages) ? messages : [];
        byId("content").value = String(hlsUrl || "");

        const videoButton = byId("download-video");
        videoButton.disabled = !recordingParams?.fallbackPlaySrc;
        videoButton.title = videoButton.disabled ? "MP4 download URL was not provided by Webex" : "Download MP4 recording";

        byId("chat").hidden = chatMessages.length === 0;
        const chatStatusElement = byId("chat-status");
        chatStatusElement.hidden = chatMessages.length > 0 || !chatStatus;
        chatStatusElement.textContent = chatStatus;

        setView("success");
        PopupSettings.ready.then(() => {
            byId("protip").hidden = !PopupSettings.shouldShowTip();
        });
    }

    function parseChat(xmlDocument) {
        const parserError = xmlDocument.querySelector("parsererror");
        if (parserError) throw new Error("Webex returned an invalid transcript document");

        return [...xmlDocument.getElementsByTagName("Message")].map((message) => {
            const getText = (tag, fallback) => message.getElementsByTagName(tag)[0]?.textContent || fallback;
            return {
                timecode: WebXUtils.formatTimeCode(getText("DateTimeUTC", "")),
                name: getText("LoginName", "Name unavailable"),
                message: getText("Content", "Message unavailable")
            };
        });
    }

    function buildFallbackHlsUrl(params, xmlDocument) {
        if (params.hlsUrl) return params.hlsUrl;
        if (!params.host || params.recordingDir === undefined || params.timestamp === undefined || !params.token) return null;

        const sequence = xmlDocument.getElementsByTagName("Sequence")[0]?.textContent;
        if (!sequence) return null;

        try {
            const url = new URL(params.host);
            const segments = [
                "hls-vod",
                "recordingDir", params.recordingDir,
                "timestamp", params.timestamp,
                "token", params.token,
                "fileName", `${sequence}.m3u8`
            ].map((segment) => encodeURIComponent(String(segment)));
            url.pathname = `/${segments.join("/")}`;
            url.search = "";
            url.hash = "";
            return url.toString();
        } catch (_error) {
            return null;
        }
    }

    async function processApiResponse(response) {
        recordingParams = WebXUtils.extractResponseParameters(response);
        if (!recordingParams) throw new Error("Webex recording metadata is unavailable");

        const streamUrl = WebXUtils.composeStreamURL(recordingParams);
        if (!streamUrl) {
            if (recordingParams.hlsUrl) {
                renderSuccess(recordingParams.hlsUrl, [], "Chat transcript is unavailable for this recording.");
                return;
            }
            throw new Error("Webex did not provide a usable stream URL");
        }

        try {
            const streamResponse = await fetch(streamUrl.toString(), { credentials: "include" });
            if (!streamResponse.ok) throw new Error(`Transcript request returned HTTP ${streamResponse.status}`);
            const xmlText = await streamResponse.text();
            const xmlDocument = new DOMParser().parseFromString(xmlText, "text/xml");
            const messages = parseChat(xmlDocument);
            const hlsUrl = buildFallbackHlsUrl(recordingParams, xmlDocument);
            if (!hlsUrl) throw new Error("Webex did not provide an HLS stream URL");
            renderSuccess(hlsUrl, messages, messages.length ? "" : "No chat transcript was found.");
        } catch (error) {
            if (recordingParams.hlsUrl) {
                renderSuccess(recordingParams.hlsUrl, [], "The HLS URL is available, but the chat transcript could not be read.");
                return;
            }
            throw error;
        }
    }

    function requestApiResponse(tabId, attemptsRemaining = 5) {
        chrome.tabs.sendMessage(tabId, { type: "getApiResponse" }, (response) => {
            if (chrome.runtime.lastError) {
                renderFailure();
                return;
            }

            if (response === -1 && attemptsRemaining > 1) {
                setTimeout(() => requestApiResponse(tabId, attemptsRemaining - 1), 300);
                return;
            }

            if (response === -1) {
                renderException(new Error("The recording is still loading. Reopen the popup after playback is ready."));
                return;
            }

            if (!response) {
                renderException(new Error("The Webex recording metadata request failed."));
                return;
            }

            processApiResponse(response).catch(renderException);
        });
    }

    function initialize() {
        byId("copy").addEventListener("click", copyLink);
        byId("download-chat").addEventListener("click", downloadChat);
        byId("download-video").addEventListener("click", downloadVideo);

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError || !tabs?.length || !tabs[0].url) {
                renderFailure();
                return;
            }

            if (!WebXUtils.parseRecordingUrl(tabs[0].url)) {
                renderFailure();
                return;
            }

            requestApiResponse(tabs[0].id);
        });
    }

    document.addEventListener("DOMContentLoaded", initialize);
}());
