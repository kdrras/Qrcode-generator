# QR Lab — Professional QR Code Generator

A clean, client-side QR code generator built with vanilla HTML, CSS and JavaScript. No backend, no build step, no tracking — everything runs in the browser and works out of the box on GitHub Pages.

**Live demo:** _add your GitHub Pages link here after deploying_

## Features

- **Four content types** — URL, plain text, Wi-Fi network, phone number
- **Live preview** — the QR code updates as you type or change settings
- **Custom styling** — QR color, background color, size (160–512px), error correction level (L/M/Q/H), and dot style (square / rounded / dots)
- **Export** — download as PNG or scalable SVG
- **History** — recently generated codes are saved locally (`localStorage`), with delete and clear-all
- **Light / dark mode** — theme preference is remembered between visits
- **Polished UX** — toast notifications, loading state, inline validation, disabled states, keyboard-friendly controls

## Tech stack

- HTML5, CSS3, vanilla JavaScript (no frameworks)
- [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) loaded via CDN for QR rendering and PNG/SVG export
- Google Fonts: Space Grotesk (display) + Inter (body)

## Project structure

```
├── index.html   # markup
├── style.css    # design system, layout, light/dark themes
├── script.js    # QR generation, downloads, history, theme, toasts
└── README.md
```

## Run locally

Just open `index.html` in a browser. For local development without file:// restrictions, serve the folder instead:

```bash
python3 -m http.server
# then open http://localhost:8000
```

## Deploy to GitHub Pages

1. Push `index.html`, `style.css` and `script.js` to a GitHub repository.
2. Go to **Settings → Pages**.
3. Under **Source**, select the branch (e.g. `main`) and folder (`/root` or `/docs`).
4. Your site will be live at `https://<username>.github.io/<repo>/`.

## License

MIT — feel free to use and adapt.
