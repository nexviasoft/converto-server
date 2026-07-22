# Converto backend deployment

1. Replace the backend repository contents with the files in this package.
2. Commit and push `index.js`, `package.json`, `package-lock.json`, and `verify-sharp.js`.
3. In Render, use Node 20 or Node 22.
4. Build command: `npm ci --include=optional`
5. Start command: `npm start`
6. Run **Manual Deploy → Clear build cache & deploy**.
7. After deployment, open `/health` and confirm that `avifEngine` is `sharp` and that Sharp/libvips versions are present.

Do not upload the local `node_modules` folder. Render must install the Linux build of Sharp itself.
