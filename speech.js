// speech.js — partagé entre content.js, popup.html et options.html
// Lecture à voix haute avec les voix du système (API Web Speech) : le texte
// ne quitte pas l'ordinateur. Côté content script, la lecture continue même
// quand la popup se ferme ; la popup ne l'utilise qu'en repli, quand aucun
// onglet YouTube n'est ouvert. La page d'options s'en sert pour le bouton Tester.

// Réglages choisis dans les options ; voiceURI vide = choix automatique,
// autoPlay = lecture lancée dès que le résumé est prêt, du TL;DR seul
// (autoPlayScope "tldr") ou de tout le résumé ("full").
const SPEECH_SETTINGS_KEY = "speechSettings";
const DEFAULT_SPEECH_SETTINGS = { autoPlay: false, autoPlayScope: "full", voiceURI: "", rate: 1, pitch: 1, volume: 1 };

async function loadSpeechSettings() {
  const { [SPEECH_SETTINGS_KEY]: saved } = await browser.storage.local.get(SPEECH_SETTINGS_KEY);
  return { ...DEFAULT_SPEECH_SETTINGS, ...saved };
}

const Speech = (() => {
  let token = 0; // change à chaque arrêt : les événements d'une lecture interrompue sont ignorés
  let currentId = null;

  function supported() {
    return typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";
  }

  function baseLang(lang) {
    return (lang || "").toLowerCase().split(/[-_]/)[0];
  }

  // Voix du système pour cette langue ("fr" correspond à "fr-FR", "fr-CA"…).
  function pickVoice(voices, lang) {
    const matching = voices.filter((v) => baseLang(v.lang) === baseLang(lang));
    return matching.find((v) => v.default) || matching.find((v) => v.localService) || matching[0] || null;
  }

  function stop() {
    token++;
    currentId = null;
    if (supported()) speechSynthesis.cancel();
  }

  // Lit les morceaux à la suite (un par ligne du résumé, ce qui marque une pause
  // entre les points). onEnd n'est appelé qu'en fin de lecture, pas sur stop().
  function speak({ chunks, lang, id, voiceURI = "", rate = 1, pitch = 1, volume = 1 }, onEnd) {
    if (!supported()) return { ok: false, reason: "unsupported" };
    if (!chunks || chunks.length === 0) return { ok: false, reason: "empty" };

    // La voix choisie dans les options ne sert que si elle parle la langue du
    // texte. Liste vide = voix pas encore chargées : Firefox choisit d'après la langue.
    const voices = speechSynthesis.getVoices();
    const chosen = voices.find((v) => v.voiceURI === voiceURI);
    const voice = chosen && baseLang(chosen.lang) === baseLang(lang) ? chosen : pickVoice(voices, lang);
    if (voices.length > 0 && !voice) return { ok: false, reason: "noVoice" };

    stop();
    const myToken = token;
    currentId = id;

    chunks.forEach((chunk, i) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = voice ? voice.lang : lang;
      if (voice) utterance.voice = voice;
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;
      if (i === chunks.length - 1) {
        const done = () => {
          if (myToken !== token) return;
          currentId = null;
          if (onEnd) onEnd();
        };
        utterance.addEventListener("end", done);
        utterance.addEventListener("error", done);
      }
      speechSynthesis.speak(utterance);
    });
    return { ok: true };
  }

  function status() {
    return { speaking: currentId !== null, id: currentId };
  }

  return { supported, baseLang, speak, stop, status };
})();
