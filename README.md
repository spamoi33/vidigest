<p align="center">
  <img src="icons/icon-128.png" alt="" width="96" height="96" />
</p>

<h1 align="center">Vidigest</h1>

<p align="center">
  An hour of video, two lines to read.<br />
  A Firefox extension that downloads a video's transcript and summarizes it with the AI you choose. Works with YouTube.
</p>

<p align="center">
  <a href="https://addons.mozilla.org/firefox/addon/vidigest/"><img alt="Firefox Add-on" src="https://img.shields.io/amo/v/vidigest?label=Firefox%20Add-on" /></a>
  <a href="LICENSE"><img alt="License: MPL-2.0" src="https://img.shields.io/badge/license-MPL--2.0-4f46e5" /></a>
</p>

<p align="center">
  <a href="https://addons.mozilla.org/firefox/addon/vidigest/">Install</a> ·
  <a href="https://spamoi33.github.io/vidigest/">Website</a> ·
  <a href="privacy.html">Privacy policy</a> ·
  <a href="#français">Français</a>
</p>

<!-- Add a screenshot of the popup here once you have one:
<p align="center"><img src="docs/screenshot.png" alt="Vidigest popup showing a summary" width="520" /></p>
-->

## Features

- **Download the transcript** of any video that has captions, as a `.txt` file. No account and no setup.
- **Summarize it** in three lengths (short, medium, long), always starting with a two-line TL;DR followed by the key points.
- **Choose the summary language**: your browser's language, the video's language, or a fixed language.
- **Pick your AI provider**: Google Gemini, Mistral AI, Infomaniak AI Services, a local Ollama server, or any OpenAI-compatible service.
- **Keep a history** of your last 50 summaries, with a link to each video and a Markdown export (handy for Obsidian or Notion).
- **Listen to a summary** with your system's voices, automatically once it's ready if you like (the TL;DR only or the whole summary), and choose the voice, speed, pitch and volume. The video pauses and reading continues after the popup closes. The text is not sent anywhere. On Windows 11, see [Natural voices on Windows 11](#natural-voices-on-windows-11).
- **Interface in English and French**, following the browser language.

## Install

**From Firefox Add-ons** (recommended): [addons.mozilla.org/firefox/addon/vidigest](https://addons.mozilla.org/firefox/addon/vidigest/)

**From source**, for testing:

1. Clone this repository.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on** and select `manifest.json`.

Temporary add-ons are removed when Firefox closes. Requires Firefox 140 or later.

## Configure an AI provider

Downloading transcripts works right away. For summaries, click **Summarize** once: the settings page opens. Choose a provider, fill in the fields, then click **Save and test**.

| Provider | Endpoint | Default model | Key |
|---|---|---|---|
| Google Gemini | native Google API | `gemini-2.5-flash` | [aistudio.google.com](https://aistudio.google.com/apikey) |
| Mistral AI | `https://api.mistral.ai/v1/chat/completions` | `mistral-small-latest` | [console.mistral.ai](https://console.mistral.ai/api-keys) |
| Infomaniak AI Services | `https://api.infomaniak.com/2/ai/{product_id}/openai/v1/chat/completions` | `qwen3` | [Infomaniak Manager](https://manager.infomaniak.com) |
| Ollama (local) | `http://localhost:11434/v1/chat/completions` | `llama3.2` | none |
| Custom | any `/chat/completions` URL | your choice | depends |

**Ollama** only accepts requests from the extension if you start it with:

```bash
OLLAMA_ORIGINS="moz-extension://*" ollama serve
```

**Infomaniak**: replace `{product_id}` in the URL with your AI Services product ID.

You use your own API key and must follow your provider's terms of use. For example, the Gemini API terms require paid services for users in the European Economic Area, Switzerland and the United Kingdom.

## Natural voices on Windows 11

On Windows, Firefox can only use SAPI 5 voices, which sound robotic (Microsoft Hortense, Zira…). The natural voices of Windows 11 (Denise, Henri, Aria…) are reserved for Narrator: they don't appear in Vidigest's voice list, even after you install them.

The free, open-source tool [NaturalVoiceSAPIAdapter](https://github.com/gexgd0419/NaturalVoiceSAPIAdapter) makes them available to Firefox. It is a third-party project, not affiliated with Vidigest or Microsoft, and its author warns that it may stop working after a Windows update.

1. Install a natural voice: **Settings → Accessibility → Narrator → Narrator's voice → Add natural voices**. You can also download it from the [links on the adapter's wiki](https://github.com/gexgd0419/NaturalVoiceSAPIAdapter/wiki/Narrator-natural-voice-download-links).
2. Download the adapter from its [Releases page](https://github.com/gexgd0419/NaturalVoiceSAPIAdapter/releases) and extract the zip to a folder you will keep, for example `C:\Tools\NaturalVoiceSAPIAdapter`. The files must not be moved afterwards.
3. Run `Installer.exe` and install the **64-bit** version, the one Firefox uses (administrator rights required).
4. Keep **Narrator voices** enabled. Disable the **Microsoft Edge online voices** if you want the text to stay on your computer: those voices send it to Microsoft.
5. Close the installer to apply the settings, then quit Firefox completely and restart it.
6. In Vidigest's settings, pick the voice under **Read aloud → Voice**, then click **Test**.

If the voice still doesn't appear, check that Windows exposes it, in PowerShell:

```powershell
$v = New-Object -ComObject SAPI.SpVoice; foreach ($t in $v.GetVoices()) { $t.GetDescription() }
```

If it's in this list but not in Vidigest, restart Firefox. If it isn't, the adapter is not installed in 64-bit.

## Privacy

Vidigest has no server and collects nothing.

- The transcript is sent only to the AI provider you selected, and only when you click **Summarize**.
- Your API key, settings and history are stored in Firefox's local extension storage. They are not synced.
- With Ollama, nothing leaves your computer.
- Read aloud uses the voices installed on your system: the summary is not sent anywhere.

Full details in the [privacy policy](privacy.html).

## How it works

1. `content.js` opens YouTube's own **Show transcript** panel on the current video and reads its text. It waits until the text stops growing, so long transcripts load completely.
2. `popup.js` either saves the text as a `.txt` file, or sends it to the configured provider through `providers.js`.
3. The provider returns Markdown, which the popup renders after escaping all text.
4. **Listen** sends the summary, stripped of Markdown, to `content.js`, which reads it in the YouTube tab with the Web Speech API (`speech.js`). Reading therefore continues after the popup closes. With no YouTube tab active, the popup reads it itself.

YouTube changes its page structure from time to time. If transcripts stop loading, please [open an issue](https://github.com/spamoi33/vidigest/issues).

## Project structure

```
manifest.json        Extension manifest (Manifest V3)
content.js           Reads the transcript panel on YouTube pages
speech.js            Read aloud with system voices (shared by content.js and the popup)
popup.html / .js     Toolbar popup: download, summarize, history
options.html / .js   AI provider, summary language and read-aloud settings
providers.js         AI providers, settings storage, shared helpers
_locales/            Interface translations (en, fr)
icons/               Extension icons (SVG source + PNG sizes)
privacy.html         Privacy policy (English; privacy.fr.html in French)
index.html           Project website (GitHub Pages, not part of the extension)
```

## Development

No build step: the code is plain JavaScript and runs as is.

Check the extension with Mozilla's linter, the same one used by addons.mozilla.org:

```bash
npx web-ext lint --ignore-files "icons/icon.svg" index.html
```

Run it in a fresh Firefox profile that reloads on every change:

```bash
npx web-ext run
```

Build a package for addons.mozilla.org:

```bash
npx web-ext build --ignore-files index.html README.md
```

Remember to increase `version` in `manifest.json` before each new release.

## Translations

Interface strings live in `_locales/<language>/messages.json`, with English as the default.

To add a language:

1. Copy `_locales/en/messages.json` to a new folder, for example `_locales/de/`.
2. Translate every `message` value. Keep placeholders such as `$PROVIDER$` and the HTML tags unchanged.
3. Open a pull request.

## Contributing

Bug reports and pull requests are welcome. Before opening a pull request, run `npx web-ext lint` and check that it reports no errors or warnings.

## License

Vidigest is released under the [Mozilla Public License 2.0](LICENSE). You can use, modify and share it; if you distribute a modified version of its files, you must make those modified files available under the same license.

Vidigest is an independent project. It is not affiliated with or endorsed by YouTube or Google.

---

## Français

Vidigest est une extension Firefox qui télécharge le transcript d'une vidéo et le résume avec l'IA de ton choix. Elle fonctionne avec YouTube, et son interface est disponible en français et en anglais.

- **Installation** : depuis les [modules complémentaires Firefox](https://addons.mozilla.org/firefox/addon/vidigest/), ou en chargeant `manifest.json` dans `about:debugging` pour tester.
- **Configuration** : au premier clic sur « Résumer », la page d'options s'ouvre. Choisis un fournisseur (Gemini, Mistral AI, Infomaniak, Ollama en local ou tout service compatible OpenAI), renseigne ta clé, puis clique sur « Enregistrer et tester ».
- **Écoute** : le bouton « Écouter » lit le résumé avec les voix de ton système. Dans les options, tu peux lancer la lecture automatiquement dès que le résumé est prêt (le TL;DR seul ou tout le résumé), et choisir la voix, la vitesse, la hauteur et le volume. La vidéo se met en pause et la lecture continue même popup fermée. Sous Windows 11, voir [Voix naturelles sous Windows 11](#voix-naturelles-sous-windows-11).
- **Confidentialité** : aucun serveur, aucune collecte. Le transcript n'est envoyé qu'au fournisseur choisi, et seulement quand tu cliques sur « Résumer ». La lecture à voix haute se fait sur ton ordinateur. Voir la [politique de confidentialité](privacy.fr.html).
- **Contribuer** : les signalements de bugs, les traductions et les pull requests sont les bienvenus.

### Voix naturelles sous Windows 11

Sous Windows, Firefox ne peut utiliser que les voix SAPI 5, au son robotique (Microsoft Hortense…). Les voix naturelles de Windows 11 (Denise, Henri…) sont réservées au Narrateur : elles n'apparaissent pas dans la liste des voix de Vidigest, même une fois installées.

L'outil libre et gratuit [NaturalVoiceSAPIAdapter](https://github.com/gexgd0419/NaturalVoiceSAPIAdapter) les rend disponibles pour Firefox. C'est un projet tiers, sans lien avec Vidigest ni Microsoft, et son auteur prévient qu'il peut cesser de fonctionner après une mise à jour de Windows.

1. Installe une voix naturelle : **Paramètres → Accessibilité → Narrateur → Voix du Narrateur → Ajouter des voix naturelles**. Tu peux aussi la télécharger depuis les [liens du wiki de l'adaptateur](https://github.com/gexgd0419/NaturalVoiceSAPIAdapter/wiki/Narrator-natural-voice-download-links).
2. Télécharge l'adaptateur depuis sa [page Releases](https://github.com/gexgd0419/NaturalVoiceSAPIAdapter/releases) et extrais le zip dans un dossier que tu garderas, par exemple `C:\Outils\NaturalVoiceSAPIAdapter`. Les fichiers ne doivent plus être déplacés ensuite.
3. Lance `Installer.exe` et installe la version **64 bits**, celle qu'utilise Firefox (droits administrateur nécessaires).
4. Laisse les **voix du Narrateur** activées. Désactive les **voix en ligne de Microsoft Edge** si tu veux que le texte reste sur ton ordinateur : ces voix l'envoient à Microsoft.
5. Ferme l'installeur pour appliquer les réglages, puis quitte complètement Firefox et relance-le.
6. Dans les options de Vidigest, choisis la voix dans **Lecture à voix haute → Voix**, puis clique sur **Tester**.

Si la voix n'apparaît toujours pas, vérifie que Windows la voit, dans PowerShell :

```powershell
$v = New-Object -ComObject SAPI.SpVoice; foreach ($t in $v.GetVoices()) { $t.GetDescription() }
```

Si elle est dans cette liste mais pas dans Vidigest, redémarre Firefox. Sinon, l'adaptateur n'est pas installé en 64 bits.

Licence : [MPL-2.0](LICENSE).
