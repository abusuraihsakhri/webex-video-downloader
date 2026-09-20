"use strict";

function isWebexApiUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" &&
            (url.hostname === "webex.com" || url.hostname.endsWith(".webex.com")) &&
            url.pathname.startsWith("/webappng/api/v1/recordings/");
    } catch (_error) {
        return false;
    }
}

function isHttpsUrl(value) {
    try {
        return new URL(value).protocol === "https:";
    } catch (_error) {
        return false;
    }
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type === "fetchRecordingJson") {
        if (!isWebexApiUrl(request.url)) {
            sendResponse(null);
            return false;
        }

        const headers = { Accept: "application/json, text/plain, */*" };
        if (request.password) headers.accessPwd = request.password;
        else headers.appFrom = "pb";

        fetch(request.url, {
            headers,
            credentials: "include"
        })
            .then((response) => {
                if (!response.ok) throw new Error(`Webex API returned HTTP ${response.status}`);
                return response.json();
            })
            .then((response) => sendResponse(response))
            .catch(() => sendResponse(null));
        return true;
    }

    if (request?.type === "downloadRecording") {
        if (!isHttpsUrl(request.url) || !request.filename) {
            sendResponse({ ok: false });
            return false;
        }

        chrome.downloads.download({
            url: request.url,
            filename: request.filename,
            conflictAction: "uniquify",
            saveAs: false
        }, (downloadId) => {
            sendResponse({
                ok: !chrome.runtime.lastError && Number.isInteger(downloadId),
                downloadId: downloadId ?? null
            });
        });
        return true;
    }

    return false;
});

function reqWatcher(details) {
    if (!Number.isInteger(details.tabId) || details.tabId < 0) return;

    const passwordHeader = (details.requestHeaders || []).find(
        (header) => header.name?.toLowerCase() === "accesspwd"
    );
    if (!passwordHeader?.value) return;

    chrome.tabs.sendMessage(details.tabId, { recPassword: passwordHeader.value }, () => {
        void chrome.runtime.lastError;
    });
}

chrome.webRequest.onSendHeaders.addListener(
    reqWatcher,
    { urls: ["https://*.webex.com/webappng/api/v1/recordings/*"] },
    ["requestHeaders"]
);
