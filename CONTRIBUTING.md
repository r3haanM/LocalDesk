# Contributing to Local Desk

Thank you for contributing to **Local Desk**.

## Local Development

```bash
git clone https://github.com/rehanmumtaz/local-desk.git
cd local-desk
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Verification Before Submitting a Pull Request

Run type-checking, the production build, and the 27-case automated QA suite:

```bash
npm run lint
npm run build
npm run test:qa
```

All pull requests must preserve offline execution (zero external runtime network calls) and pass `npm run test:qa` (`27 / 27 PASSED`).
