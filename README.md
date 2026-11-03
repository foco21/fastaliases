# Fastmail Alias

Chrome extension (Manifest V3, plain JS, no build step) that creates Fastmail Masked Email aliases with a custom prefix (`netflix.k3j9x@fastmail.com`) and fills them into signup forms.

Bitwarden is not integrated. The extension fills the email field, and when you submit the form Bitwarden's own "Save login?" prompt picks the alias up.

## Install

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and select this folder.
3. The settings page opens. In Fastmail go to **Settings → Privacy & Security → Integrations → API tokens**, create a token with **Masked Email** as its only scope, paste it, click **Save**, then **Test connection**.
4. Reload any tabs that were already open. The content script only loads into pages opened or reloaded after install.

## Use

- **Inline:** focus an email field and click the **@** badge near its right edge. Edit the prefix and press Enter (or Create). Esc closes the panel. The alias is filled in (plus any empty "confirm email" field) and copied to the clipboard. Aliases you already made for this site are listed so you can reuse one.
- **Right-click** any editable field and choose **Create Fastmail alias here**.
- **Toolbar popup:** create an alias for the current site. It fills the last email field you focused on the page, or else only copies it. It also lists this site's aliases and recent ones, with copy and disable/enable buttons.

## Notes

- Aliases are created as `enabled`, not `pending`, because Fastmail deletes pending aliases after 24h if no mail arrives.
- The token lives in the extension's own IndexedDB, not `chrome.storage.local` (which content scripts inside web pages can read). It is never synced, never shown again after saving, and sent only to `api.fastmail.com`. All API calls happen in the service worker. Content scripts only get the current site's aliases.
- The site's base domain comes from a short built-in list of second-level suffixes (`co.uk`, `com.au`, …), plus common shared hosts (`github.io`, `vercel.app`, `netlify.app`, …) where each subdomain is its own site. It is not the full Public Suffix List, so a shared host missing from the list would group unrelated sites together.
- Run `node test.js` to check the domain/prefix helpers.
- Manual test page: run `python3 -m http.server 8000 -d test-site` and open http://localhost:8000. It has every kind of email field the extension handles.
- The popup uses IBM Plex Sans and Mono, bundled in `fonts/` (SIL Open Font License, see `fonts/OFL.txt`) so it never loads fonts from the web.

## License

Apache License 2.0, see [LICENSE](LICENSE). The bundled IBM Plex fonts in `fonts/` are under the SIL Open Font License 1.1 (`fonts/OFL.txt`).
