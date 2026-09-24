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

## Privacy

Vidigest has no server and collects nothing.

- The transcript is sent only to the AI provider you selected, and only when you click **Summarize**.
- Your API key, settings and history are stored in Firefox's local extension storage. They are not synced.
- With Ollama, nothing leaves your computer.

Full details in the [privacy policy](privacy.html).

## How it works

1. `content.js` opens YouTube's own **Show transcript** panel on the current video and reads its text. It waits until the text stops growing, so long transcripts load completely.
2. `popup.js` either saves the text as a `.txt` file, or sends it to the configured provider through `providers.js`.
3. The provider returns Markdown, which the popup renders after escaping all text.

YouTube changes its page structure from time to time. If transcripts stop loading, please [open an issue](https://github.com/spamoi33/vidigest/issues).

## Project structure

```
manifest.json        Extension manifest (Manifest V3)
content.js           Reads the transcript panel on YouTube pages
popup.html / .js     Toolbar popup: download, summarize, history
options.html / .js   AI provider settings and summary language
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
- **Confidentialité** : aucun serveur, aucune collecte. Le transcript n'est envoyé qu'au fournisseur choisi, et seulement quand tu cliques sur « Résumer ». Voir la [politique de confidentialité](privacy.fr.html).
- **Contribuer** : les signalements de bugs, les traductions et les pull requests sont les bienvenus.

Licence : [MPL-2.0](LICENSE).
