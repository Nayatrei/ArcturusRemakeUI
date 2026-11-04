# Arcturus Remake UI

Static presentation for a private reference library. GitHub Pages serves only the interface and pinned JavaScript dependencies. Images, models, catalogs, research documents, credentials and filesystem configuration remain on the owner's computer.

The published UI connects to the local companion at `http://127.0.0.1:8899`. It only displays files registered by that companion. If the companion or source is unavailable, the interface remains available and its media areas stay empty. A browser may request local-network permission on first use. No automatic folder scanning or remote fallback is performed.

Build: `npm ci --ignore-scripts` followed by `node build-pages.mjs`. Deploy `pages-dist` with the included GitHub Pages workflow. The normal local UI uses the same source without the published-shell marker. Local server code, access configuration and operational records are maintained outside this public repository.
