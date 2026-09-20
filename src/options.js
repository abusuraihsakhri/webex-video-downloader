(function initPopupSettings() {
    "use strict";

    const state = {
        hideProtip: false,
        theme: "light"
    };

    function applyTheme(theme) {
        state.theme = theme === "dark" ? "dark" : "light";
        document.documentElement.dataset.theme = state.theme;

        const toggle = document.getElementById("theme-toggle");
        if (toggle) {
            const nextTheme = state.theme === "dark" ? "light" : "dark";
            toggle.textContent = state.theme === "dark" ? "☀" : "◐";
            toggle.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
            toggle.setAttribute("title", `Switch to ${nextTheme} theme`);
        }
    }

    function syncTip() {
        const checkbox = document.getElementById("hide-protip");
        if (checkbox) checkbox.checked = state.hideProtip;
    }

    const ready = new Promise((resolve) => {
        chrome.storage.local.get(["hideprotip", "theme"], (result) => {
            state.hideProtip = Boolean(result.hideprotip);
            applyTheme(result.theme || "light");
            syncTip();
            resolve();
        });
    });

    document.addEventListener("DOMContentLoaded", () => {
        const themeToggle = document.getElementById("theme-toggle");
        const hideTip = document.getElementById("hide-protip");

        themeToggle?.addEventListener("click", () => {
            const nextTheme = state.theme === "dark" ? "light" : "dark";
            applyTheme(nextTheme);
            chrome.storage.local.set({ theme: nextTheme });
        });

        hideTip?.addEventListener("change", () => {
            state.hideProtip = hideTip.checked;
            chrome.storage.local.set({ hideprotip: state.hideProtip });
            if (state.hideProtip) document.getElementById("protip")?.setAttribute("hidden", "");
        });

        applyTheme(state.theme);
        syncTip();
    });

    globalThis.PopupSettings = {
        ready,
        shouldShowTip: () => !state.hideProtip
    };
}());
