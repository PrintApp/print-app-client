#!/usr/bin/env node
/**
 * Deploy the client assets to the CDN. Replaces the gulpfile.
 *
 * Two things the gulp tasks did not do, both of which have cost real time:
 *
 * 1. SET CACHE-CONTROL. These files sit at stable, unhashed URLs and are
 *    loaded by every storefront, so a browser with no cache header applies
 *    HEURISTIC caching — roughly 10% of the file's age — and keeps running an
 *    old client for hours or days after a release. `no-cache` does not mean
 *    "do not cache"; it means "cache, but revalidate every time", which with
 *    an ETag costs a 304 and nothing else. That is exactly what an entry-point
 *    file wants.
 *
 * 2. PROVE THE UPLOAD LANDED. `aws s3 cp` reporting success tells you nothing
 *    about what the CDN is serving: without an invalidation the edge keeps the
 *    previous copy, and the deploy looks fine while the world sees the old
 *    file. Every deploy here invalidates, waits, then re-fetches over HTTPS and
 *    compares byte length against the local file.
 *
 * Usage:
 *   npm run deploy -- client            one target
 *   npm run deploy -- client wp sp      several
 *   npm run deploy -- all               every asset target
 *   npm run deploy -- run-cache         flush the run.print.app API cache
 */

import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PROFILE = process.env.AWS_PROFILE || "printapp";
const BUCKET = "editor-print-app";
const PUBLIC_BASE = "https://editor.print.app";

/** editor.print.app + create.print.app — origin is the bucket below. */
const DISTRIBUTION = "E282D1VGL03CJE";
/** run.print.app — a Lambda origin, no S3 involved. Flushed on its own. */
const RUN_DISTRIBUTION = "E6UKMH1UCIW23";

/**
 * Revalidate on every request. These URLs never change, so the file behind
 * them must never be assumed fresh. (Content-hashed assets are the opposite
 * case and belong on `immutable` — none are deployed from this repo.)
 */
const REVALIDATE = "no-cache";

const TARGETS = {
    client: { file: "src/main.js", key: "js/client.js" },
    wp: { file: "src/frameworks/wordpress.js", key: "js/wp.js" },
    ps: { file: "src/frameworks/prestashop.js", key: "js/ps.js" },
    oc: { file: "src/frameworks/opencart.js", key: "js/oc.js" },
    bc: { file: "src/frameworks/bigcommerce.js", key: "js/bc.js" },
    sp: { file: "src/frameworks/shopify.js", key: "js/sp.js" },
    style: { file: "src/style.css", key: "css/style.css", type: "text/css" },
    sample: { dir: "sample", prefix: "" }
};

const aws = (args) =>
    execFileSync("aws", [...args, "--profile", PROFILE], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"]
    });

const contentType = (key) =>
    key.endsWith(".css") ? "text/css"
        : key.endsWith(".js") ? "application/javascript"
            : key.endsWith(".html") ? "text/html"
                : null;

/** Byte length of what the CDN actually serves, decoded (it negotiates gzip). */
async function served(key) {
    const res = await fetch(`${PUBLIC_BASE}/${key}`, { cache: "no-store" });
    if (!res.ok) {
        throw new Error(`${PUBLIC_BASE}/${key} returned ${res.status}`);
    }
    return (await res.arrayBuffer()).byteLength;
}

function uploadFile(file, key, type) {
    const from = path.join(ROOT, file);
    const size = statSync(from).size;
    const resolved = type || contentType(key);
    console.log(`  ${file}  ->  s3://${BUCKET}/${key}  (${size}B)`);
    aws([
        "s3", "cp", from, `s3://${BUCKET}/${key}`,
        "--cache-control", REVALIDATE,
        ...(resolved ? ["--content-type", resolved] : [])
    ]);
    return size;
}

function uploadDir(dir, prefix) {
    const from = path.join(ROOT, dir);
    console.log(`  ${dir}/  ->  s3://${BUCKET}/${prefix}`);
    aws([
        "s3", "sync", from, `s3://${BUCKET}/${prefix}`,
        "--cache-control", REVALIDATE
    ]);
    return readdirSync(from).length;
}

/**
 * `paths` are passed verbatim — no shell is involved, so they must NOT be
 * pre-quoted the way they would be on a command line, or CloudFront receives
 * the quote characters as part of the path and rejects the whole call.
 */
function invalidate(distribution, paths) {
    console.log(`\nInvalidating ${distribution}: ${paths.join(" ")}`);
    const created = JSON.parse(
        aws([
            "cloudfront", "create-invalidation",
            "--distribution-id", distribution,
            "--paths", ...paths,
            "--output", "json"
        ])
    );
    const id = created.Invalidation.Id;
    console.log(`  ${id} — waiting…`);
    aws([
        "cloudfront", "wait", "invalidation-completed",
        "--distribution-id", distribution,
        "--id", id
    ]);
    return id;
}

/* ------------------------------------------------------------------ */

const requested = process.argv.slice(2);
if (requested.length === 0) {
    console.error(
        `Nothing to deploy.\n\n  npm run deploy -- <target…>\n\n` +
            `  targets: ${Object.keys(TARGETS).join(", ")}, all, run-cache\n`
    );
    process.exit(1);
}

if (requested.includes("run-cache")) {
    invalidate(RUN_DISTRIBUTION, ["/*"]);
    console.log("\n✔ run.print.app cache flushed.");
    if (requested.length === 1) {
        process.exit(0);
    }
}

const names = requested.includes("all")
    ? Object.keys(TARGETS)
    : requested.filter((name) => name !== "run-cache");

const unknown = names.filter((name) => !TARGETS[name]);
if (unknown.length) {
    console.error(`Unknown target(s): ${unknown.join(", ")}`);
    console.error(`Known: ${Object.keys(TARGETS).join(", ")}, all, run-cache`);
    process.exit(1);
}

console.log(`Uploading to s3://${BUCKET} as ${PROFILE}\n`);

/** key -> expected byte length, for the proof step below. */
const expected = new Map();
const paths = new Set();

for (const name of names) {
    const target = TARGETS[name];
    if (target.dir) {
        uploadDir(target.dir, target.prefix);
        paths.add("/*");
        continue;
    }
    expected.set(target.key, uploadFile(target.file, target.key, target.type));
    paths.add(`/${target.key}`);
}

invalidate(DISTRIBUTION, [...paths]);

let failed = false;
console.log("");
for (const [key, size] of expected) {
    const live = await served(key);
    const ok = live === size;
    console.log(`  ${ok ? "✔" : "✖"} ${key}: serving ${live}B, local ${size}B`);
    failed ||= !ok;
}

if (failed) {
    console.error(
        "\n✖ The CDN is not serving what was uploaded. The invalidation completed,\n" +
            `  so check that ${PROFILE} has write access to ${BUCKET}.`
    );
    process.exit(1);
}
console.log("\n✔ Deployed and verified.");
