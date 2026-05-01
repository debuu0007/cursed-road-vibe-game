## Performance audit (manual)

_Last run: production `npm run build`_

### Bundle (`dist/assets/*.js`)

- **Gzip**: ~174 KB main chunk + ~16 KB lazy `loader-*.js` (GLTF/Draco) ≈ **190 KB** total JS gzip for typical play (loader loads on first model attempt).
- **Raw**: ~662 KB main + ~53 KB loader — optional `manualChunks` for `three`/`cannon-es` if you need smaller main.

### Runtime checks

- **Pixel ratio**: `Math.min(devicePixelRatio, 1.5)` in renderer bootstrap.
- **Shadows**: disabled (`renderer.shadowMap.enabled = false`).
- **4G simulation**: Chrome DevTools → Network → Slow 4G → hard reload → target first interactive under ~3 s on mid device (depends on Draco WASM CDN latency for compressed GLBs).

### Assets

- **Audio**: stubs in `public/assets/audio/*.ogg`; replace with authored OGGs; keep combined total under README ~500 KB first-load budget.
- **GLB**: paths under `public/assets/models/` (see `README` in that folder). Game degrades to procedural mesh if HTTP 404.

### Draco decoder

`src/utils/loader.js` pulls decoders from `https://www.gstatic.com/draco/versioned/decoders/1.5.6/`. Offline / strict CSP may require self-hosting the decoder WASM.
