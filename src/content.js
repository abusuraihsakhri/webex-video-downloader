"use strict";

const recordingPage = WebXUtils.parseRecordingUrl(location.href);
let apiUrl = null;
let password;
let apiResponse = -1;
let requestInFlight = false;
let observer = null;

if (recordingPage) {
    apiUrl = `https://${recordingPage.subdomain}.webex.com/webappng/api/v1/recordings/${recordingPage.recordingId}/stream${recordingPage.authParams}`;
}

function createDownloadButton(downloadUrl, filename) {
    const button = document.createElement("i");
    button.id = "playerDownload";
    button.classList.add("icon-download", "recordingDownload");
    button.setAttribute("title", "Download recording");
    button.setAttribute("tabindex", "0");
    button.setAttribute("role", "button");
    button.setAttribute("aria-label", `Download recording: ${filename}`);

    const startDownload = () => {
        chrome.runtime.sendMessage({
            type: "downloadRecording",
            url: downloadUrl,
            filename
        });
    };

    button.addEventListener("click", startDownload);
    button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            startDownload();
        }
    });

    return button;
}

function addDownloadButtonToPage(params) {
    if (document.getElementById("playerDownload")) return true;
    if (!params?.fallbackPlaySrc) return false;

    const header = document.querySelector(".recordingHeader");
    if (!header) return false;

    const filename = `${WebXUtils.sanitizeFilename(params.recordName)}.mp4`;
    header.appendChild(createDownloadButton(String(params.fallbackPlaySrc), filename));
    return true;
}

function requestRecordingData() {
    if (!apiUrl || requestInFlight || document.getElementById("playerDownload")) return;
    if (!document.querySelector(".recordingTitle") || !document.querySelector(".recordingHeader")) return;

    requestInFlight = true;
    chrome.runtime.sendMessage({
        type: "fetchRecordingJson",
        url: apiUrl,
        password
    }, (response) => {
        requestInFlight = false;

        if (chrome.runtime.lastError) {
            apiResponse = null;
            return;
        }

        apiResponse = response || null;
        const params = WebXUtils.extractResponseParameters(apiResponse);
        if (addDownloadButtonToPage(params) && observer) observer.disconnect();
    });
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.recPassword) {
        password = request.recPassword;
        if (!apiResponse || apiResponse === -1) requestRecordingData();
    }

    if (request?.type === "getApiResponse") {
        sendResponse(apiResponse);
    }
});

if (recordingPage) {
    observer = new MutationObserver(requestRecordingData);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    requestRecordingData();
}
