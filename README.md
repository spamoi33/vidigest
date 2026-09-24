# Vidigest (Firefox extension)

Download a video's transcript and summarize it with the AI of your choice.
Works with YouTube. Vidigest is not affiliated with or endorsed by YouTube or Google.

*Interface available in English and French (follows the browser language).*

## Features

- Download the transcript as `.txt`, no setup required.
- Three summary lengths (short, medium, long), always starting with a TL;DR.
- Summary language: browser language, same as the video, or a fixed language.
- Providers: Google Gemini, Mistral AI, Infomaniak AI Services, local Ollama,
  or any OpenAI-compatible service.
- History of the last 50 summaries, with a link to the video and `.md` export.

## Try it

1. Open `about:debugging` → "This Firefox" → "Load Temporary Add-on".
2. Select `manifest.json`.
3. On the first summary, the settings page opens: pick a provider, enter
   the key, then "Save and test".

Requires Firefox 140 or later.

## Providers

| Provider | Endpoint | Default model |
|---|---|---|
| Gemini | native Google API | `gemini-2.5-flash` |
| Mistral AI | `https://api.mistral.ai/v1/chat/completions` | `mistral-small-latest` |
| Infomaniak | `https://api.infomaniak.com/2/ai/{product_id}/openai/v1/chat/completions` | `qwen3` |
| Ollama | `http://localhost:11434/v1/chat/completions` | `llama3.2` |
| Custom | any `/chat/completions` URL | to be set |

For Ollama, start the server with `OLLAMA_ORIGINS="moz-extension://*" ollama serve`.

## Translations

UI strings live in `_locales/<lang>/messages.json` (English is the default).
To add a language, copy `_locales/en/messages.json` to a new folder
(e.g. `_locales/de/`) and translate the `message` values.

## Publishing on addons.mozilla.org

- The manifest declares `websiteContent` in `data_collection_permissions`,
  since the transcript is sent to the AI provider when summarizing.
- Paste `privacy.html` (English) into the AMO privacy policy field;
  `privacy.fr.html` is the French version.
- Each user supplies their own key and must comply with their provider's
  terms (notably the Gemini API terms for European users).

## Limitations

- The video must offer a transcript.
- Depends on YouTube's page structure, which changes regularly.
