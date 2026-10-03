import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, "dist");
const siteFiles = [
  "About.html",
  "CHAT-SETUP.md",
  "Games.html",
  "Links.html",
  "Media.html",
  "Music.html",
  "browser.html",
  "browser.js",
  "chat.html",
  "chat-config.js",
  "chat.js",
  "context-menu.js",
  "index.html",
  "navigation.js",
  "proxy-config.js",
  "script.js",
  "settings.html",
  "site-settings.js",
  "styles.css",
  "supabase-chat.sql",
  "sw.js"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of siteFiles) {
  await cp(path.join(root, file), path.join(output, file));
}

for (const directory of ["scramjet", "controller", "epoxy", "baremux", "uv"]) {
  await mkdir(path.join(output, directory), { recursive: true });
}

const configuredWispHost = process.env.KILLBYTE_UV_WISP_HOST || "killbyte-uv-wisp.onrender.com";
const normalizedWispHost = configuredWispHost
  .replace(/^wss?:\/\//i, "")
  .replace(/^https?:\/\//i, "")
  .replace(/\/+$/, "");
const wispProtocol = /^http:\/\//i.test(configuredWispHost) || /^ws:\/\//i.test(configuredWispHost)
  ? "ws"
  : "wss";
const wispUrl = `${wispProtocol}://${normalizedWispHost}/wisp/`;

await Promise.all([
  cp(
    path.join(root, "node_modules/@mercuryworkshop/scramjet/dist/scramjet.js"),
    path.join(output, "scramjet/scramjet.js")
  ),
  cp(
    path.join(root, "node_modules/@mercuryworkshop/scramjet/dist/scramjet.wasm"),
    path.join(output, "scramjet/scramjet.wasm")
  ),
  ...["controller.api.js", "controller.inject.js", "controller.sw.js"].map((file) =>
    cp(
      path.join(root, "node_modules/@mercuryworkshop/scramjet-controller/dist", file),
      path.join(output, "controller", file)
    )
  ),
  cp(
    path.join(root, "node_modules/@mercuryworkshop/epoxy-transport/dist/index.js"),
    path.join(output, "epoxy/index.js")
  ),
  cp(
    path.join(root, "node_modules/@mercuryworkshop/epoxy-transport-uv/dist/index.mjs"),
    path.join(output, "epoxy/index.mjs")
  ),
  cp(
    path.join(root, "node_modules/@mercuryworkshop/bare-mux/dist/index.js"),
    path.join(output, "baremux/index.js")
  ),
  cp(
    path.join(root, "node_modules/@mercuryworkshop/bare-mux/dist/worker.js"),
    path.join(output, "baremux/worker.js")
  ),
  ...["uv.bundle.js", "uv.client.js", "uv.handler.js", "uv.sw.js", "sw.js"].map((file) =>
    cp(
      path.join(root, "node_modules/@titaniumnetwork-dev/ultraviolet/dist", file),
      path.join(output, "uv", file)
    )
  )
]);

await cp(path.join(root, "uv.config.js"), path.join(output, "uv/uv.config.js"));
await writeFile(
  path.join(output, "uv-proxy-config.js"),
  `window.KILLBYTE_UV_WISP_URL = ${JSON.stringify(wispUrl)};\n`
);

console.log(`Built Killbyte into ${output}`);
