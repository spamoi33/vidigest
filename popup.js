// popup.js

const MAX_TRANSCRIPT_CHARS = 400000; // limite haute ; les modèles à petit contexte tronqueront côté serveur
const HISTORY_KEY = "summaryHistory";
const MAX_HISTORY_ITEMS = 50;

// --- Niveaux de résumé ---
const SUMMARY_LEVELS = {
  court: {
    labelKey: "levelShort",
    bullets: "exactly 4 to 5 bullet points",
    detail: "Each point is a single short sentence.",
  },
  moyen: {
    labelKey: "levelMedium",
    bullets: "exactly 8 to 10 bullet points (no fewer than 8 unless the video is very short)",
    detail: "Each point is one or two sentences.",
  },
  long: {
    labelKey: "levelLong",
    bullets:
      "15 to 20 bullet points, grouped under 3 to 5 thematic Markdown subheadings (### Heading) following the order of the video",
    detail:
      "Each point is two or three sentences and includes useful details (examples, figures, names, dates, arguments).",
  },
};
const DEFAULT_LEVEL = "moyen";

// Langue de sortie selon le réglage "Langue du résumé" (null = langue de la vidéo).
function targetLanguageName(langPref) {
  if (langPref === "video") return null;
  const code = langPref && langPref !== "browser" ? langPref : uiLanguage();
  return languageName(code, "en");
}

function languageInstruction(langPref) {
  const name = targetLanguageName(langPref);
  return name
    ? `Write your entire answer in ${name}, even if the transcript is in another language: the TL;DR and every bullet point must be in ${name}.`
    : "Write your entire answer in the same language as the transcript.";
}

// Instructions système : format et langue. Les modèles les respectent mieux
// que des consignes noyées avant un très long transcript.
function buildSystemPrompt(level, langPref) {
  const cfg = SUMMARY_LEVELS[level] || SUMMARY_LEVELS[DEFAULT_LEVEL];
  return (
    "You summarize YouTube video transcripts. " +
    languageInstruction(langPref) + " " +
    'Start your answer with a line beginning with the exact prefix "TL;DR:" (this short prefix is ' +
    "the only thing not to translate), followed by an ultra-condensed summary of the essentials in " +
    "at most 2 sentences. Then, after a blank line, give a detailed summary as " + cfg.bullets + ". " +
    "Each point starts with a key word or short phrase in bold followed by a colon, then the " +
    "explanation (e.g. **Topic:** concise explanation). " + cfg.detail + " " +
    "Cover the entire video from start to finish, prioritizing concrete facts (decisions, dates, " +
    "figures, names) over minor anecdotes. No other introduction or conclusion; get straight to the point."
  );
}


// --- Petit convertisseur Markdown -> HTML (titres, gras/italique, listes) ---
// Les IA renvoient du Markdown ; sans ça, ###, ** et * s'affichaient tels quels.
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineMarkdown(text) {
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  return out;
}

function markdownToHtml(md) {
  const lines = md.split(/\r?\n/);
  let html = "";
  let inList = false;

  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeList();
      continue;
    }

    const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headerMatch) {
      closeList();
      const level = Math.min(headerMatch[1].length + 2, 6);
      html += `<h${level}>${inlineMarkdown(headerMatch[2])}</h${level}>`;
      continue;
    }

    const listMatch = line.match(/^[*-]\s+(.*)/);
    if (listMatch) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inlineMarkdown(listMatch[1])}</li>`;
      continue;
    }

    closeList();

    const tldrMatch = line.match(/^(?:\*\*)?TL;DR\s*:?\s*(?:\*\*)?\s*:?\s*(.*)/i);
    if (tldrMatch) {
      html += `<p class="tldr"><strong>TL;DR:</strong> ${inlineMarkdown(tldrMatch[1])}</p>`;
      continue;
    }

    html += `<p>${inlineMarkdown(line)}</p>`;
  }
  closeList();
  return html;
}

const TLDR_PREFIX = /^(?:\*\*)?TL;DR\s*:?\s*(?:\*\*)?\s*:?\s*/i;

// Le paragraphe "TL;DR" seul, jusqu'à la ligne vide, la liste ou le titre
// suivants ; null si l'IA n'en a pas mis.
function tldrMarkdown(md) {
  const lines = md.split(/\r?\n/).map((l) => l.trim());
  const start = lines.findIndex((l) => TLDR_PREFIX.test(l));
  if (start === -1) return null;
  const end = lines.findIndex((l, i) => i > start && (!l || /^([*-]|#{1,6})\s/.test(l)));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

// Même découpage par ligne, mais en texte à lire : sans symboles Markdown ni
// préfixe "TL;DR" (que les voix épellent). Une ligne = une pause.
function markdownToSpeech(md) {
  return md
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[*-]\s+/, "")
        .replace(TLDR_PREFIX, "")
        .replace(/[*`]/g, "")
        .trim()
    )
    .filter(Boolean);
}

// Langue réelle du résumé, pour choisir la voix : le réglage "même langue
// que la vidéo" ne la donne pas, et l'historique ne la garde pas.
async function detectTextLanguage(text) {
  try {
    const { languages } = await browser.i18n.detectLanguage(text);
    if (languages && languages.length && languages[0].language !== "und") return languages[0].language;
  } catch (e) {}
  return uiLanguage();
}

function buildSafeFilename(title, videoId, suffix) {
  const safeTitle = (title || "")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()
    .slice(0, 80);
  return `${safeTitle || videoId} - ${suffix}`;
}

function downloadTextFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

document.addEventListener("DOMContentLoaded", () => {
  localizeDocument();
  const downloadBtn = document.getElementById("download");
  const summarizeBtn = document.getElementById("summarize");
  const status = document.getElementById("status");
  const result = document.getElementById("result");
  const optionsLink = document.getElementById("options-link");

  const tabMain = document.getElementById("tab-main");
  const tabHistory = document.getElementById("tab-history");
  const viewMain = document.getElementById("view-main");
  const viewHistory = document.getElementById("view-history");
  const historyList = document.getElementById("history-list");
  const emptyHistory = document.getElementById("empty-history");
  const clearHistoryBtn = document.getElementById("clear-history");

  optionsLink.addEventListener("click", (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });


  // --- Sélecteur de niveau de résumé (mémorisé) ---
  const levelInputs = Array.from(document.querySelectorAll('input[name="level"]'));
  function getSelectedLevel() {
    const checked = levelInputs.find((i) => i.checked);
    return checked ? checked.value : DEFAULT_LEVEL;
  }
  browser.storage.local.get("summaryLevel").then(({ summaryLevel }) => {
    const lvl = SUMMARY_LEVELS[summaryLevel] ? summaryLevel : DEFAULT_LEVEL;
    levelInputs.forEach((i) => (i.checked = i.value === lvl));
  });
  levelInputs.forEach((i) =>
    i.addEventListener("change", () => browser.storage.local.set({ summaryLevel: i.value }))
  );

  loadSettings().then((st) => {
    const cfg = getActiveConfig(st);
    summarizeBtn.textContent = validateConfig(cfg) ? t("btnSummarizeGeneric") : t("btnSummarizeWith", [cfg.label]);
  });

  // --- Navigation entre onglets ---
  function showTab(tab) {
    const isMain = tab === "main";
    tabMain.classList.toggle("active", isMain);
    tabHistory.classList.toggle("active", !isMain);
    viewMain.classList.toggle("active", isMain);
    viewHistory.classList.toggle("active", !isMain);
    if (!isMain) renderHistory();
  }
  tabMain.addEventListener("click", () => showTab("main"));
  tabHistory.addEventListener("click", () => showTab("history"));

  // --- Lecture à voix haute ---
  // Elle se fait dans l'onglet actif s'il s'agit de YouTube (content script),
  // où elle continue popup fermée ; sinon dans la popup elle-même. Chaque
  // résumé est identifié par son timestamp d'historique.
  const stopSpeechBtn = document.getElementById("stop-speech");
  const speechError = document.getElementById("speech-error"); // visible dans les deux onglets
  let speakingId = null;

  function sendToTab(tabId, message) {
    return browser.tabs.sendMessage(tabId, message).catch(() => null); // pas de content script
  }

  async function sendToYouTubeTabs(message) {
    const tabs = await browser.tabs.query({ url: "https://www.youtube.com/*" });
    return Promise.all(tabs.map((tab) => sendToTab(tab.id, message)));
  }

  function setSpeaking(id) {
    speakingId = id;
    stopSpeechBtn.hidden = id === null;
    document.querySelectorAll(".listen-link").forEach((link) => {
      link.textContent = id !== null && link.dataset.id === String(id) ? t("linkStopSpeech") : t("linkListen");
    });
  }

  async function stopSpeech() {
    Speech.stop();
    await sendToYouTubeTabs({ action: "stopSpeech" });
    setSpeaking(null);
  }

  async function startSpeech(summary, id) {
    speechError.hidden = true;
    await stopSpeech();
    const chunks = markdownToSpeech(summary);
    const lang = await detectTextLanguage(chunks.join(" "));
    const reading = { chunks, lang, id, ...(await loadSpeechSettings()) };

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    let res = tab ? await sendToTab(tab.id, { action: "speak", ...reading }) : null;
    if (!res) res = Speech.speak(reading, () => setSpeaking(null));

    if (res.ok) {
      setSpeaking(id);
    } else {
      const detail = res.reason === "noVoice" ? t("errNoVoice", [languageName(lang)]) : t("errSpeechUnsupported");
      speechError.textContent = t("errorPrefix", [detail]);
      speechError.hidden = false;
    }
  }

  // null si le navigateur ne sait pas lire à voix haute : pas de lien du tout.
  function createListenLink(summary, id) {
    if (!Speech.supported()) return null;
    const link = document.createElement("a");
    link.href = "#";
    link.className = "listen-link";
    link.dataset.id = id;
    link.textContent = id === speakingId ? t("linkStopSpeech") : t("linkListen");
    link.addEventListener("click", (e) => {
      e.preventDefault();
      if (id === speakingId) stopSpeech();
      else startSpeech(summary, id);
    });
    return link;
  }

  stopSpeechBtn.addEventListener("click", stopSpeech);

  browser.runtime.onMessage.addListener((message) => {
    if (message && message.action === "speechEnded" && message.id === speakingId) setSpeaking(null);
  });

  // Une lecture lancée avant l'ouverture de la popup continue peut-être dans un onglet YouTube.
  sendToYouTubeTabs({ action: "speechStatus" }).then((statuses) => {
    const playing = statuses.find((s) => s && s.speaking);
    if (playing) setSpeaking(playing.id);
  });

  // --- Transcript ---
  async function getTranscriptFromActiveTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes("youtube.com/watch")) {
      throw new Error(t("errNotVideoPage"));
    }
    return browser.tabs.sendMessage(tab.id, { action: "getTranscript" });
  }

  downloadBtn.addEventListener("click", async () => {
    result.textContent = "";
    status.textContent = t("statusFetching");
    downloadBtn.disabled = true;

    try {
      const { text, title, videoId, languageCode } = await getTranscriptFromActiveTab();
      const filename = buildSafeFilename(title, videoId, `transcript (${languageCode}).txt`);
      downloadTextFile(text, filename, "text/plain;charset=utf-8");

      status.textContent = t("statusDownloadStarted");
    } catch (err) {
      status.textContent = t("errorPrefix", [err && err.message ? err.message : String(err)]);
    } finally {
      downloadBtn.disabled = false;
    }
  });

  summarizeBtn.addEventListener("click", async () => {
    result.textContent = "";
    status.textContent = t("statusFetching");
    summarizeBtn.disabled = true;

    try {
      const cfg = getActiveConfig(await loadSettings());
      if (validateConfig(cfg)) {
        status.textContent = t("statusNotConfigured");
        browser.runtime.openOptionsPage();
        return;
      }

      const { text, title, videoId } = await getTranscriptFromActiveTab();

      status.textContent = t("statusSummarizing", [cfg.label]);
      const level = getSelectedLevel();
      const { [SUMMARY_LANG_KEY]: langPref = "browser" } = await browser.storage.local.get(SUMMARY_LANG_KEY);
      const summary = await summarizeTranscript(cfg, text, level, langPref);

      status.textContent = "";
      setHtml(result, markdownToHtml(summary));

      const mdLink = document.createElement("a");
      mdLink.href = "#";
      mdLink.className = "md-download-link";
      mdLink.textContent = t("linkDownloadMd");
      mdLink.addEventListener("click", (e) => {
        e.preventDefault();
        const filename = buildSafeFilename(title, videoId, t("fileSuffixSummary"));
        downloadTextFile(summary, filename, "text/markdown;charset=utf-8");
      });
      result.appendChild(mdLink);

      const timestamp = Date.now();
      const listenLink = createListenLink(summary, timestamp);
      if (listenLink) result.appendChild(listenLink);

      await saveToHistory({ title, videoId, summary, level, provider: cfg.label, timestamp });

      const speech = await loadSpeechSettings();
      if (listenLink && speech.autoPlay) {
        const toRead = speech.autoPlayScope === "tldr" ? tldrMarkdown(summary) || summary : summary;
        await startSpeech(toRead, timestamp);
      }
    } catch (err) {
      status.textContent = t("errorPrefix", [err && err.message ? err.message : String(err)]);
    } finally {
      summarizeBtn.disabled = false;
    }
  });

  // --- Historique ---
  async function saveToHistory(entry) {
    const { [HISTORY_KEY]: existing = [] } = await browser.storage.local.get(HISTORY_KEY);
    const updated = [entry, ...existing].slice(0, MAX_HISTORY_ITEMS);
    await browser.storage.local.set({ [HISTORY_KEY]: updated });
  }

  function formatDate(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleString(uiLanguage(), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function renderHistory() {
    const { [HISTORY_KEY]: items = [] } = await browser.storage.local.get(HISTORY_KEY);
    setHtml(historyList, "");

    if (items.length === 0) {
      emptyHistory.style.display = "block";
      return;
    }
    emptyHistory.style.display = "none";

    for (const item of items) {
      const div = document.createElement("div");
      div.className = "history-item";

      const meta = document.createElement("div");
      meta.className = "meta";
      const levelLabel = item.level && SUMMARY_LEVELS[item.level] ? ` · ${t(SUMMARY_LEVELS[item.level].labelKey)}` : "";
      const providerLabel = item.provider ? ` · ${item.provider}` : "";
      meta.textContent = formatDate(item.timestamp) + levelLabel + providerLabel;
      div.appendChild(meta);

      const link = document.createElement("a");
      link.className = "title";
      link.href = `https://www.youtube.com/watch?v=${item.videoId}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.title || item.videoId;
      div.appendChild(link);

      const toggle = document.createElement("button");
      toggle.className = "toggle";
      toggle.textContent = t("toggleShow");
      div.appendChild(toggle);

      const summaryEl = document.createElement("div");
      summaryEl.className = "summary";
      setHtml(summaryEl, markdownToHtml(item.summary));
      div.appendChild(summaryEl);

      const mdLink = document.createElement("a");
      mdLink.href = "#";
      mdLink.className = "md-download-link summary";
      mdLink.style.display = "none";
      mdLink.textContent = t("linkDownloadMd");
      mdLink.addEventListener("click", (e) => {
        e.preventDefault();
        const filename = buildSafeFilename(item.title, item.videoId, t("fileSuffixSummary"));
        downloadTextFile(item.summary, filename, "text/markdown;charset=utf-8");
      });
      div.appendChild(mdLink);

      const listenLink = createListenLink(item.summary, item.timestamp);
      if (listenLink) {
        listenLink.classList.add("summary");
        listenLink.style.display = "none";
        div.appendChild(listenLink);
      }

      toggle.addEventListener("click", () => {
        const isExpanded = summaryEl.classList.toggle("expanded");
        toggle.textContent = isExpanded ? t("toggleHide") : t("toggleShow");
        mdLink.style.display = isExpanded ? "inline-block" : "none";
        if (listenLink) listenLink.style.display = mdLink.style.display;
      });

      historyList.appendChild(div);
    }
  }

  clearHistoryBtn.addEventListener("click", async () => {
    await browser.storage.local.set({ [HISTORY_KEY]: [] });
    renderHistory();
  });
});

async function summarizeTranscript(cfg, transcript, level, langPref) {
  const truncated =
    transcript.length > MAX_TRANSCRIPT_CHARS
      ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) + " [...]"
      : transcript;
  // Rappel de la langue APRÈS le transcript : sur un texte long, c'est la
  // dernière consigne lue qui pèse le plus.
  const prompt =
    "Transcript:\n\n" + truncated + "\n\n---\n" +
    "Now write the summary. " + languageInstruction(langPref);
  return callAI(cfg, prompt, { maxTokens: 4096, system: buildSystemPrompt(level, langPref) });
}
