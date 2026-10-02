import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, "dist");
const siteFiles = [
  "About.html",
  "Games.html",
  "Links.html",
  "browser.html",
  "browser.js",
  "context-menu.js",
  "index.html",
  "navigation.js",
  "proxy-config.js",
  "script.js",
  "settings.html",
  "site-settings.js",
  "styles.css",
  "sw.js"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of siteFiles) {
  await cp(path.join(root, file), path.join(output, file));
}

for (const directory of ["scramjet", "controller", "epoxy"]) {
  await mkdir(path.join(output, directory), { recursive: true });
}

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
  )
]);

console.log(`Built Killbyte into ${output}`);
