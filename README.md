# S.to-like Framework Generator

This is a generator plugin for the S.to-like framework (German streaming sites like s.to, aniworld.to, etc.).

## What is this?

This plugin allows you to create custom GrayJay plugins for any German streaming site that uses the same framework as S.to and Aniworld.to.

## How to use

1. Visit the generator page: https://grayjay-sources.github.io/grayjay-source-sto-like/
2. Enter your streaming site's base URL (e.g., `https://your-site.to`)
3. Click "Generate" to create your custom plugin
4. Scan the QR code with GrayJay or download the config file

## Supported Sites

Any site using the S.to/Aniworld framework with:

- `/anime/stream/` or `/serie/stream/` URL structure
- Similar HTML structure for episode listings
- German language content

## Generator Features

- Automatic QR code generation
- Downloadable config file
- Direct "Open in Grayjay" link
- Custom plugin name and icon

## Development

To run locally:

```bash
cd docs
python -m http.server 8000
```

Then visit http://localhost:8000

## License

MIT License - See LICENSE file for details
