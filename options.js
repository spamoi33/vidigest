// options.js

const HELP_KEYS = {
  gemini: "helpGemini",
  mistral: "helpMistral",
  infomaniak: "helpInfomaniak",
  ollama: "helpOllama",
  custom: "helpCustom",
};

let settings = null;

function $(id) {
  return document.getElementById(id);
}

let toastTimer = null;
function showToast(message, type, duration = 3500) {
  const toast = $("toast");
  toast.textContent = message;
  toast.className = `${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
}

async function closeOptionsPage() {
  try {
    const tab = await browser.tabs.getCurrent();
    if (tab) {
      await browser.tabs.remove(tab.id);
      return;
    }
  } catch (e) {}
  window.close();
}

// Affiche les champs adaptés au fournisseur sélectionné, pré-remplis avec sa config.
function renderProvider(providerId) {
  const cfg = getProviderConfig(settings, providerId);
  setHtml($("provider-help"), t(HELP_KEYS[providerId]));
  $("field-endpoint").classList.toggle("hidden", cfg.type === "gemini");
  $("apikey-optional").style.display = cfg.needsKey ? "none" : "inline";
  $("endpoint").value = cfg.endpoint;
  $("apiKey").value = cfg.apiKey;
  $("model").value = cfg.model;
}

// Lecture synchrone du formulaire (nécessaire pour demander la permission
// d'hôte directement dans le gestionnaire de clic).
function readForm() {
  const providerId = $("provider").value;
  const def = PROVIDERS[providerId];
  return {
    id: providerId,
    label: def.label,
    type: def.type,
    needsKey: def.needsKey,
    endpoint: def.type === "gemini" ? "" : $("endpoint").value.trim(),
    apiKey: $("apiKey").value.trim(),
    model: $("model").value.trim(),
  };
}

// Remplit le menu "Langue du résumé" et enregistre le choix dès qu'il change.
async function setupSummaryLanguage() {
  const select = $("summaryLanguage");
  const options = [
    ["browser", `${t("langBrowser")} (${languageName(uiLanguage())})`],
    ["video", t("langVideo")],
    ...SUMMARY_LANGUAGES.map((code) => [code, languageName(code)]),
  ];
  for (const [value, label] of options) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  }
  const { [SUMMARY_LANG_KEY]: current = "browser" } = await browser.storage.local.get(SUMMARY_LANG_KEY);
  select.value = current;
  select.addEventListener("change", async () => {
    await browser.storage.local.set({ [SUMMARY_LANG_KEY]: select.value });
    showToast(t("toastLangSaved"), "ok", 2000);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  localizeDocument();
  document.title = t("optPageTitle");
  $("privacy-link").href = t("privacyFile");
  setupSummaryLanguage();
  settings = await loadSettings();
  $("provider").value = settings.provider;
  renderProvider(settings.provider);

  $("provider").addEventListener("change", () => renderProvider($("provider").value));

  const saveBtn = $("save");
  saveBtn.addEventListener("click", async () => {
    const cfg = readForm();

    const error = validateConfig(cfg);
    if (error) {
      showToast(t("toastError", [error]), "ko", 5000);
      return;
    }

    // La demande de permission doit être le premier appel asynchrone du clic.
    let granted = true;
    if (cfg.type === "openai") {
      try {
        granted = await browser.permissions.request({ origins: [originPatternFor(cfg.endpoint)] });
      } catch (e) {
        granted = false;
      }
    }
    if (!granted) {
      showToast(t("toastPermissionDenied"), "ko", 6000);
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = t("optTesting");

    const result = await testConfig(cfg);

    if (result.ok) {
      settings.provider = cfg.id;
      settings.configs[cfg.id] = { endpoint: cfg.endpoint, apiKey: cfg.apiKey, model: cfg.model };
      await saveSettings(settings);
      showToast(t("toastSuccess", [cfg.label]), "ok");
      setTimeout(closeOptionsPage, 1500);
    } else {
      // Rien n'est enregistré : la configuration précédente est conservée.
      showToast(t("toastTestFailed", [result.detail]), "ko", 7000);
      saveBtn.disabled = false;
      saveBtn.textContent = t("optSave");
    }
  });
});
