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

// Réglages de lecture à voix haute, enregistrés à chaque changement ; la popup
// les relit à chaque lecture.
async function setupSpeech() {
  if (!Speech.supported()) {
    $("speech-section").hidden = true;
    return;
  }
  const voiceSelect = $("voice");
  const testBtn = $("speech-test");
  // Firefox ne voit pas les voix naturelles de Windows 11 : lien vers l'explication du README.
  browser.runtime.getPlatformInfo().then(({ os }) => ($("voice-windows-hint").hidden = os !== "win"));
  const scopeInputs = [...document.querySelectorAll('input[name="autoPlayScope"]')];
  let prefs = await loadSpeechSettings();

  const decimal = new Intl.NumberFormat(uiLanguage(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(uiLanguage(), { style: "percent" });
  const sliders = {
    rate: (v) => `${decimal.format(v)}×`,
    pitch: (v) => decimal.format(v),
    volume: (v) => percent.format(v),
  };

  // Voix installées, groupées par langue (celle de l'interface en premier).
  // Firefox peut les charger après l'ouverture de la page : voir voiceschanged.
  function renderVoices() {
    const groups = new Map();
    for (const voice of speechSynthesis.getVoices()) {
      const lang = Speech.baseLang(voice.lang);
      if (!groups.has(lang)) groups.set(lang, []);
      groups.get(lang).push(voice);
    }
    const ui = Speech.baseLang(uiLanguage());
    const langs = [...groups.keys()].sort((a, b) =>
      a === ui ? -1 : b === ui ? 1 : languageName(a).localeCompare(languageName(b))
    );
    const children = [new Option(t("optVoiceAuto"), "")];
    for (const lang of langs) {
      const group = document.createElement("optgroup");
      group.label = languageName(lang);
      groups
        .get(lang)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((voice) => group.appendChild(new Option(voice.name, voice.voiceURI)));
      children.push(group);
    }
    voiceSelect.replaceChildren(...children);
    // Voix désinstallée depuis : on affiche "Automatique", comme à la lecture.
    const installed = [...voiceSelect.options].some((o) => o.value === prefs.voiceURI);
    voiceSelect.value = installed ? prefs.voiceURI : "";
  }

  // Le choix TL;DR / tout le résumé ne sert qu'avec la lecture automatique.
  function renderScopeState() {
    const on = $("autoPlay").checked;
    scopeInputs.forEach((input) => (input.disabled = !on));
    $("autoPlayScope").classList.toggle("disabled", !on);
  }

  function renderForm() {
    $("autoPlay").checked = prefs.autoPlay;
    scopeInputs.forEach((input) => (input.checked = input.value === prefs.autoPlayScope));
    renderScopeState();
    for (const [key, format] of Object.entries(sliders)) {
      $(key).value = prefs[key];
      $(`${key}-value`).textContent = format(prefs[key]);
    }
  }

  function readSpeechForm() {
    return {
      autoPlay: $("autoPlay").checked,
      autoPlayScope: (scopeInputs.find((input) => input.checked) || {}).value || DEFAULT_SPEECH_SETTINGS.autoPlayScope,
      voiceURI: voiceSelect.value,
      rate: Number($("rate").value),
      pitch: Number($("pitch").value),
      volume: Number($("volume").value),
    };
  }

  async function save() {
    prefs = readSpeechForm();
    await browser.storage.local.set({ [SPEECH_SETTINGS_KEY]: prefs });
    showToast(t("toastSpeechSaved"), "ok", 2000);
  }

  renderVoices();
  renderForm();
  speechSynthesis.addEventListener("voiceschanged", renderVoices);

  $("autoPlay").addEventListener("change", () => {
    renderScopeState();
    save();
  });
  scopeInputs.forEach((input) => input.addEventListener("change", save));
  voiceSelect.addEventListener("change", save);
  for (const [key, format] of Object.entries(sliders)) {
    const input = $(key);
    input.addEventListener("input", () => ($(`${key}-value`).textContent = format(Number(input.value))));
    input.addEventListener("change", save);
  }

  $("speech-reset").addEventListener("click", async () => {
    prefs = { ...DEFAULT_SPEECH_SETTINGS };
    voiceSelect.value = "";
    renderForm();
    await save();
  });

  // Lit une phrase d'exemple avec les réglages affichés, même non enregistrés.
  const resetTestBtn = () => (testBtn.textContent = t("optSpeechTest"));
  testBtn.addEventListener("click", () => {
    if (Speech.status().speaking) {
      Speech.stop();
      resetTestBtn();
      return;
    }
    const form = readSpeechForm();
    const chosen = speechSynthesis.getVoices().find((v) => v.voiceURI === form.voiceURI);
    const lang = chosen ? chosen.lang : uiLanguage();
    const res = Speech.speak({ chunks: [t("speechSample")], lang, id: "test", ...form }, resetTestBtn);
    if (res.ok) {
      testBtn.textContent = t("linkStopSpeech");
    } else {
      const detail = res.reason === "noVoice" ? t("errNoVoice", [languageName(lang)]) : t("errSpeechUnsupported");
      showToast(t("toastError", [detail]), "ko", 6000);
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  localizeDocument();
  document.title = t("optPageTitle");
  $("privacy-link").href = t("privacyFile");
  setupSummaryLanguage();
  setupSpeech();
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
