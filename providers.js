// providers.js — partagé entre popup.html et options.html
// Gère les fournisseurs d'IA : Gemini (API native) et tous les services
// compatibles avec l'API OpenAI /chat/completions (Mistral, Infomaniak,
// Ollama en local, ou n'importe quel autre endpoint).

const SETTINGS_KEY = "aiSettings";
const SUMMARY_LANG_KEY = "summaryLanguage";
// Langues proposées pour le résumé (en plus de "navigateur" et "même langue que la vidéo")
const SUMMARY_LANGUAGES = ["en", "fr", "es", "de", "it", "pt", "nl", "pl", "ja", "zh"];

// --- Traduction de l'interface -------------------------------------------
function t(key, substitutions) {
  return browser.i18n.getMessage(key, substitutions) || key;
}

function uiLanguage() {
  return browser.i18n.getUILanguage() || "en";
}

// Nom d'une langue, affiché dans la langue demandée (ex. "fr" -> "French" ou "français").
function languageName(code, displayLang = uiLanguage()) {
  try {
    const name = new Intl.DisplayNames([displayLang], { type: "language" }).of(code);
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : code;
  } catch (e) {
    return code;
  }
}

// Traduit les éléments marqués data-i18n (texte), data-i18n-html (HTML maison),
// data-i18n-placeholder et data-i18n-title.
function localizeDocument() {
  document.documentElement.lang = uiLanguage();
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll("[data-i18n-html]").forEach((el) => setHtml(el, t(el.dataset.i18nHtml)));
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
  document.querySelectorAll("[data-i18n-title]").forEach((el) => (el.title = t(el.dataset.i18nTitle)));
}

// Insère du HTML généré par l'extension sans passer par innerHTML :
// le HTML est analysé hors du document, puis ses nœuds sont déplacés.
function setHtml(element, html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  element.replaceChildren(...doc.body.childNodes);
}

const PROVIDERS = {
  gemini: {
    label: "Google Gemini",
    type: "gemini",
    endpoint: "",
    defaultModel: "gemini-2.5-flash",
    needsKey: true,
  },
  mistral: {
    label: "Mistral AI",
    type: "openai",
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    defaultModel: "mistral-small-latest",
    needsKey: true,
  },
  infomaniak: {
    label: "Infomaniak AI",
    type: "openai",
    endpoint: "https://api.infomaniak.com/2/ai/{product_id}/openai/v1/chat/completions",
    defaultModel: "qwen3",
    needsKey: true,
  },
  ollama: {
    label: t("providerOllama"),
    type: "openai",
    endpoint: "http://localhost:11434/v1/chat/completions",
    defaultModel: "llama3.2",
    needsKey: false,
  },
  custom: {
    label: t("providerCustom"),
    type: "openai",
    endpoint: "",
    defaultModel: "",
    needsKey: false,
  },
};
const DEFAULT_PROVIDER = "gemini";

// --- Réglages -------------------------------------------------------------
// Forme stockée : { provider: "mistral", configs: { mistral: {endpoint, apiKey, model}, ... } }
// Chaque fournisseur garde sa propre config : changer de fournisseur ne perd pas les clés.

async function loadSettings() {
  const data = await browser.storage.local.get([SETTINGS_KEY, "geminiApiKey"]);
  let settings = data[SETTINGS_KEY];

  if (!settings) {
    settings = { provider: DEFAULT_PROVIDER, configs: {} };
    // Migration depuis l'ancienne version (clé Gemini seule)
    if (data.geminiApiKey) {
      settings.configs.gemini = { apiKey: data.geminiApiKey };
    }
  }
  if (!PROVIDERS[settings.provider]) settings.provider = DEFAULT_PROVIDER;
  settings.configs = settings.configs || {};
  return settings;
}

async function saveSettings(settings) {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
  await browser.storage.local.remove("geminiApiKey"); // ancien format
}

function getProviderConfig(settings, providerId) {
  const def = PROVIDERS[providerId];
  const saved = settings.configs[providerId] || {};
  return {
    id: providerId,
    label: def.label,
    type: def.type,
    needsKey: def.needsKey,
    endpoint: saved.endpoint ?? def.endpoint,
    apiKey: saved.apiKey ?? "",
    model: saved.model || def.defaultModel,
  };
}

function getActiveConfig(settings) {
  return getProviderConfig(settings, settings.provider);
}

// Renvoie null si la config est utilisable, sinon un message d'erreur lisible.
function validateConfig(cfg) {
  if (!cfg.model) return t("errModel");
  if (cfg.needsKey && !cfg.apiKey) return t("errKey");
  if (cfg.type === "openai") {
    if (!cfg.endpoint) return t("errEndpoint");
    if (cfg.endpoint.includes("{product_id}")) {
      return t("errProductId");
    }
    try {
      const u = new URL(cfg.endpoint);
      if (!/^https?:$/.test(u.protocol)) return t("errUrlProtocol");
    } catch (e) {
      return t("errUrlInvalid");
    }
  }
  return null;
}

// Motif de permission d'hôte pour un endpoint (les ports sont ignorés par Firefox).
function originPatternFor(endpoint) {
  const u = new URL(endpoint);
  return `${u.protocol}//${u.hostname}/*`;
}

// --- Appel à l'IA -----------------------------------------------------------

function stripThinking(text) {
  // Certains modèles (ex. Qwen3) renvoient leur raisonnement entre <think>...</think>
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "").trim();
}

async function readError(response) {
  let detail = `HTTP ${response.status}`;
  try {
    const body = await response.text();
    try {
      const json = JSON.parse(body);
      detail = json?.error?.message || json?.message || json?.detail || body.slice(0, 200) || detail;
      if (typeof detail !== "string") detail = JSON.stringify(detail).slice(0, 200);
    } catch (e) {
      if (body) detail = body.slice(0, 200);
    }
  } catch (e) {}
  return detail;
}

function networkErrorMessage(cfg) {
  if (cfg.id === "ollama" || /localhost|127\.0\.0\.1/.test(cfg.endpoint)) return t("errOllamaNetwork");
  return t("errNetwork");
}

async function callAI(cfg, prompt, { maxTokens = 4096, allowEmpty = false, system = "" } = {}) {
  let response;
  try {
    if (cfg.type === "gemini") {
      const generationConfig = { maxOutputTokens: maxTokens };
      // Les modèles 2.5 comptent leur "réflexion" interne dans maxOutputTokens,
      // ce qui coupait les résumés : on la désactive pour eux.
      if (cfg.model.startsWith("gemini-2.5")) {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
            generationConfig,
          }),
        }
      );
    } else {
      const headers = { "Content-Type": "application/json" };
      if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
      response = await fetch(cfg.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            ...(system ? [{ role: "system", content: system }] : []),
            { role: "user", content: prompt },
          ],
          max_tokens: maxTokens,
          stream: false,
        }),
      });
    }
  } catch (e) {
    throw new Error(networkErrorMessage(cfg));
  }

  if (!response.ok) {
    throw new Error(`${cfg.label} (${response.status}) : ${await readError(response)}`);
  }

  const data = await response.json();
  let text;
  if (cfg.type === "gemini") {
    const parts = data.candidates?.[0]?.content?.parts || [];
    text = parts.map((p) => p.text || "").join("\n");
  } else {
    text = data.choices?.[0]?.message?.content || "";
  }
  text = stripThinking(text);

  if (!text && !allowEmpty) throw new Error(t("errNoText", [cfg.label]));
  return text;
}

// Test de connexion utilisé par la page d'options.
async function testConfig(cfg) {
  try {
    if (cfg.type === "gemini") {
      // Appel léger qui ne consomme pas de quota de génération.
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}`,
        { headers: { "x-goog-api-key": cfg.apiKey } }
      );
      if (!res.ok) return { ok: false, detail: await readError(res) };
      return { ok: true };
    }
    // API compatibles OpenAI : mini requête de quelques tokens. Une réponse HTTP 200
    // suffit à valider (certains modèles "réfléchissent" et ne sortent rien en 10 tokens).
    await callAI(cfg, "Reply only: OK", { maxTokens: 16, allowEmpty: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: e.message || String(e) };
  }
}
