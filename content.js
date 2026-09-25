// content.js
// Récupère le transcript en ouvrant le panneau "Transcription" natif de
// YouTube (celui accessible manuellement via "..." > "Afficher la
// transcription"), puis en lisant son contenu dans le DOM.
//
// Note : YouTube renomme régulièrement les noms de composants internes de
// ce panneau (ça a changé au moins deux fois en 2026). Pour rester robuste,
// on évite de dépendre d'un nom de balise précis pour les segments et on
// lit plutôt le texte brut du conteneur du panneau, en filtrant les lignes
// qui ne sont que des timestamps.

// Le libellé "Transcription" selon la langue de YouTube (en, fr, es, pt, it, de, nl, pl…).
const TRANSCRIPT_WORD = /transcri|trascri|transkri|transkry/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(checkFn, { timeout = 6000, interval = 200 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = checkFn();
    if (result) return result;
    await sleep(interval);
  }
  return null;
}

function findTranscriptOpenButton() {
  const dedicated = document.querySelector(
    "ytd-video-description-transcript-section-renderer button"
  );
  if (dedicated) return dedicated;

  const candidates = Array.from(document.querySelectorAll("button, ytd-button-renderer"));
  return (
    candidates.find((el) => {
      const label = (el.getAttribute("aria-label") || el.textContent || "").toLowerCase();
      return TRANSCRIPT_WORD.test(label);
    }) || null
  );
}

function findExpandDescriptionButton() {
  return document.querySelector("tp-yt-paper-button#expand, #expand");
}

function findMoreActionsButton() {
  const candidates = Array.from(document.querySelectorAll("button"));
  return (
    candidates.find((el) => {
      const label = (el.getAttribute("aria-label") || "").toLowerCase();
      return (
        label.includes("more actions") ||
        label.includes("plus d'actions") ||
        label.includes("autres options") ||
        label.includes("more options")
      );
    }) || null
  );
}

function findTranscriptMenuItem() {
  const candidates = Array.from(
    document.querySelectorAll("ytd-menu-service-item-renderer, tp-yt-paper-item, tp-yt-paper-listbox *")
  );
  return (
    candidates.find((el) => TRANSCRIPT_WORD.test(el.textContent || "")) || null
  );
}

// Le nom exact des composants internes change souvent ; on essaie plusieurs
// sélecteurs, du plus spécifique au plus générique.
function findTranscriptContainer() {
  const selectors = [
    "#segments-container",
    "ytd-transcript-segment-list-renderer",
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
    'ytd-engagement-panel-section-list-renderer[visibility$="EXPANDED"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText && el.innerText.trim().length > 20) {
      return el;
    }
  }
  return null;
}

function isPureTimestampLine(line) {
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(line);
}

function isPanelControlLine(line) {
  const normalized = line.trim().toLowerCase();
  // Titre du panneau dans une autre langue ("Transkript", "Transcripción"…) : un seul mot.
  if (!/\s/.test(normalized) && TRANSCRIPT_WORD.test(normalized)) return true;
  const knownControls = [
    "transcription",
    "transcript",
    "tout",
    "all",
    "rechercher dans la vidéo",
    "search in video",
    "afficher les codes temporels",
    "show timestamps",
    "masquer les codes temporels",
    "hide timestamps",
  ];
  return knownControls.includes(normalized);
}

function extractTranscriptFromPanel() {
  const container = findTranscriptContainer();
  if (!container) return "";

  const lines = (container.innerText || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !isPureTimestampLine(l))
    .filter((l) => !isPanelControlLine(l));

  return lines.join(" ").replace(/\s+/g, " ").trim();
}

async function openTranscriptPanel() {
  if (findTranscriptContainer()) return true;

  let btn = findTranscriptOpenButton();

  if (!btn) {
    const expandBtn = findExpandDescriptionButton();
    if (expandBtn) {
      expandBtn.click();
      await sleep(400);
      btn = findTranscriptOpenButton();
    }
  }

  if (btn) {
    btn.click();
  } else {
    const moreBtn = findMoreActionsButton();
    if (moreBtn) {
      moreBtn.click();
      await sleep(300);
      const menuItem = await waitFor(findTranscriptMenuItem, { timeout: 2000 });
      if (menuItem) {
        menuItem.click();
      }
    }
  }

  const found = await waitFor(findTranscriptContainer, { timeout: 6000 });
  return !!found;
}

// Au lieu d'un délai fixe (trop court pour les vidéos longues dont tous les
// segments n'ont pas fini de se charger), on attend que le texte du panneau
// se stabilise (n'augmente plus sur plusieurs vérifications consécutives).
async function waitForStableTranscript({ maxWait = 10000, interval = 400, stableRounds = 3 } = {}) {
  let lastLength = -1;
  let stableCount = 0;
  let lastText = "";
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const text = extractTranscriptFromPanel();
    if (text.length > 0 && text.length === lastLength) {
      stableCount++;
      if (stableCount >= stableRounds) {
        return text;
      }
    } else {
      stableCount = 0;
    }
    lastLength = text.length;
    lastText = text;
    await sleep(interval);
  }
  return lastText;
}

async function getTranscriptText() {
  const url = new URL(window.location.href);
  const videoId = url.searchParams.get("v");
  if (!videoId) {
    throw new Error(browser.i18n.getMessage("errNoVideo"));
  }

  const opened = await openTranscriptPanel();
  if (!opened) {
    throw new Error(browser.i18n.getMessage("errPanelOpen"));
  }

  await sleep(200); // laisse le panneau s'initialiser avant de commencer à surveiller

  const text = await waitForStableTranscript();
  if (!text) {
    throw new Error(browser.i18n.getMessage("errPanelEmpty"));
  }

  const title = document.title.replace(/ - YouTube$/, "") || videoId;
  return { text, title, videoId, languageCode: "auto" };
}

// Lecture à voix haute (voir speech.js). Elle se fait ici plutôt que dans la
// popup pour continuer quand celle-ci se ferme ; on met la vidéo en pause
// pour ne pas mélanger les deux voix.
function speakSummary(message) {
  const { id } = message;
  const res = Speech.speak(message, () => {
    browser.runtime.sendMessage({ action: "speechEnded", id }).catch(() => {}); // popup fermée
  });
  if (res.ok) {
    const video = document.querySelector("#movie_player video");
    if (video) video.pause();
  }
  return res;
}

browser.runtime.onMessage.addListener((message) => {
  if (!message) return;
  switch (message.action) {
    case "getTranscript":
      return getTranscriptText();
    case "speak":
      return Promise.resolve(speakSummary(message));
    case "stopSpeech":
      Speech.stop();
      return Promise.resolve(true);
    case "speechStatus":
      return Promise.resolve(Speech.status());
  }
});
