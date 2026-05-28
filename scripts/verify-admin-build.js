#!/usr/bin/env node
/**
 * verify-admin-build.js
 * 
 * Pre-deploy and post-deploy verification for links-admin.
 * Ensures the canonical admin path contains the correct, up-to-date build
 * and no stale/deprecated assets are being served.
 * 
 * Usage:
 *   node scripts/verify-admin-build.js [--remote]
 * 
 * --remote: Also check the live production URL (requires network)
 */

const fs = require('fs');
const path = require('path');

const ADMIN_ROOT = path.resolve(__dirname, '..', 'links-admin');
const MANIFEST_PATH = path.join(ADMIN_ROOT, 'deploy-manifest.json');

const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) { passed++; console.log(`  ${COLORS.green}✓${COLORS.reset} ${msg}`); }
function fail(msg) { failed++; console.log(`  ${COLORS.red}✗${COLORS.reset} ${msg}`); }
function warn(msg) { warnings++; console.log(`  ${COLORS.yellow}⚠${COLORS.reset} ${msg}`); }
function info(msg) { console.log(`  ${COLORS.cyan}ℹ${COLORS.reset} ${msg}`); }
function header(msg) { console.log(`\n${COLORS.cyan}━━━ ${msg} ━━━${COLORS.reset}`); }

// ─── Check 1: Required files exist ──────────────────────────────────
function checkRequiredFiles() {
    header('Required Files');

    const required = [
        'index.html',
        'assets/app.js',
        'assets/app.css',
        'assets/blog-extension.js',
        'deploy-manifest.json',
    ];

    for (const file of required) {
        const fullPath = path.join(ADMIN_ROOT, file);
        if (fs.existsSync(fullPath)) {
            const stat = fs.statSync(fullPath);
            pass(`${file} ${COLORS.dim}(${(stat.size / 1024).toFixed(1)}KB, ${stat.mtime.toISOString().slice(0, 16)})${COLORS.reset}`);
        } else {
            fail(`${file} — MISSING`);
        }
    }
}

// ─── Check 2: Manifest integrity ────────────────────────────────────
function checkManifest() {
    header('Deploy Manifest');

    if (!fs.existsSync(MANIFEST_PATH)) {
        fail('deploy-manifest.json not found');
        return null;
    }

    try {
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

        if (manifest.version) pass(`Version: ${manifest.version}`);
        else fail('Missing version field');

        if (manifest.commit) pass(`Commit: ${manifest.commit}`);
        else warn('Missing commit field');

        if (manifest.built_at) pass(`Built: ${manifest.built_at}`);
        else warn('Missing built_at field');

        if (manifest.environment) pass(`Environment: ${manifest.environment}`);
        else warn('Missing environment field');

        return manifest;
    } catch (e) {
        fail(`Manifest parse error: ${e.message}`);
        return null;
    }
}

// ─── Check 3: Expected markers present in app.js ────────────────────
function checkExpectedMarkers(manifest) {
    header('Expected UI Markers in app.js');

    const appJs = fs.readFileSync(path.join(ADMIN_ROOT, 'assets/app.js'), 'utf8');

    const expected = manifest?.expected_markers || [
        'Add CTA', 'Button Text', 'Link URL', 'CTA added successfully',
    ];

    for (const marker of expected) {
        if (appJs.includes(marker)) {
            pass(`Found: "${marker}"`);
        } else {
            fail(`MISSING: "${marker}" — new UI not in bundle`);
        }
    }
}

// ─── Check 4: Deprecated markers absent ─────────────────────────────
function checkDeprecatedMarkers(manifest) {
    header('Deprecated Markers (should NOT exist)');

    const appJs = fs.readFileSync(path.join(ADMIN_ROOT, 'assets/app.js'), 'utf8');

    const deprecated = manifest?.deprecated_markers || [
        'Label and URL are required',
    ];

    for (const marker of deprecated) {
        if (appJs.includes(marker)) {
            fail(`STILL PRESENT: "${marker}" — old UI code remains`);
        } else {
            pass(`Removed: "${marker}"`);
        }
    }
}

// ─── Check 5: Cache-busting in index.html ───────────────────────────
function checkCacheBusting() {
    header('Cache-Busting Strategy');

    const indexHtml = fs.readFileSync(path.join(ADMIN_ROOT, 'index.html'), 'utf8');

    // Check for versioned asset references
    const hasVersionedJs = /app\.js\?v=/.test(indexHtml) || /app\.[a-f0-9]+\.js/.test(indexHtml);
    const hasVersionedCss = /app\.css\?v=/.test(indexHtml) || /app\.[a-f0-9]+\.css/.test(indexHtml);

    if (hasVersionedJs) pass('app.js has cache-busting parameter');
    else fail('app.js has NO cache-busting — browsers may serve stale JS');

    if (hasVersionedCss) pass('app.css has cache-busting parameter');
    else fail('app.css has NO cache-busting — browsers may serve stale CSS');

    // Check version in BKDN_CONFIG
    const versionMatch = indexHtml.match(/version:\s*"([^"]+)"/);
    if (versionMatch) {
        pass(`BKDN_CONFIG.version = "${versionMatch[1]}"`);
    } else {
        warn('No version string found in BKDN_CONFIG');
    }
}

// ─── Check 6: No duplicate admin roots ──────────────────────────────
function checkDuplicates() {
    header('Duplicate Admin Detection');

    const projectRoot = path.resolve(__dirname, '..');
    const adminDirs = [];

    function findAdminDirs(dir, depth = 0) {
        if (depth > 3) return;
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                if (entry.name === '.git' || entry.name === 'node_modules') continue;
                const fullPath = path.join(dir, entry.name);
                if (entry.name === 'links-admin') {
                    adminDirs.push(fullPath);
                } else {
                    findAdminDirs(fullPath, depth + 1);
                }
            }
        } catch (e) { /* permission errors, etc */ }
    }

    findAdminDirs(projectRoot);

    if (adminDirs.length === 1) {
        pass(`Single admin root: ${adminDirs[0]}`);
    } else if (adminDirs.length > 1) {
        warn(`${adminDirs.length} admin directories found:`);
        for (const dir of adminDirs) {
            const isCanonical = dir === ADMIN_ROOT;
            console.log(`    ${isCanonical ? COLORS.green + '→' : COLORS.yellow + '?'} ${dir}${isCanonical ? ' (CANONICAL)' : ' (DUPLICATE — review needed)'}${COLORS.reset}`);
        }
    } else {
        fail('No links-admin directory found');
    }
}

// ─── Check 7: Version consistency ───────────────────────────────────
function checkVersionConsistency() {
    header('Version Consistency');

    const indexHtml = fs.readFileSync(path.join(ADMIN_ROOT, 'index.html'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

    const configVersion = (indexHtml.match(/version:\s*"([^"]+)"/) || [])[1];
    const manifestVersion = manifest.version;

    if (configVersion && manifestVersion && configVersion === manifestVersion) {
        pass(`Versions match: index.html="${configVersion}" manifest="${manifestVersion}"`);
    } else {
        fail(`Version mismatch: index.html="${configVersion || '?'}" vs manifest="${manifestVersion || '?'}"`);
    }
}

// ─── Check 8 (optional): Remote verification ────────────────────────
async function checkRemote() {
    header('Remote Production Check');

    try {
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
        const url = 'https://www.bakudanramen.com/links-admin/';

        info(`Fetching ${url}...`);
        const res = await fetch(url);

        if (!res.ok) {
            fail(`HTTP ${res.status} from production`);
            return;
        }

        const html = await res.text();

        // Check version in served HTML
        const servedVersion = (html.match(/version:\s*"([^"]+)"/) || [])[1];
        if (servedVersion === manifest.version) {
            pass(`Production serving correct version: ${servedVersion}`);
        } else {
            fail(`Production version mismatch: serving "${servedVersion || '?'}", expected "${manifest.version}"`);
        }

        // Check cache-busting
        if (/app\.js\?v=/.test(html)) {
            pass('Production HTML has cache-busted JS');
        } else {
            fail('Production HTML missing cache-busting on JS');
        }

    } catch (e) {
        warn(`Could not reach production: ${e.message}`);
    }
}

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
    console.log(`\n${COLORS.cyan}╔══════════════════════════════════════════════╗`);
    console.log(`║  Links Admin — Build Verification            ║`);
    console.log(`╚══════════════════════════════════════════════╝${COLORS.reset}`);
    console.log(`  Admin root: ${ADMIN_ROOT}`);
    console.log(`  Time: ${new Date().toISOString()}`);

    checkRequiredFiles();
    const manifest = checkManifest();
    checkExpectedMarkers(manifest);
    checkDeprecatedMarkers(manifest);
    checkCacheBusting();
    checkDuplicates();
    checkVersionConsistency();

    if (process.argv.includes('--remote')) {
        await checkRemote();
    }

    // Summary
    console.log(`\n${COLORS.cyan}━━━ Summary ━━━${COLORS.reset}`);
    console.log(`  ${COLORS.green}${passed} passed${COLORS.reset}  ${COLORS.red}${failed} failed${COLORS.reset}  ${COLORS.yellow}${warnings} warnings${COLORS.reset}`);

    if (failed > 0) {
        console.log(`\n  ${COLORS.red}⛔ BUILD VERIFICATION FAILED${COLORS.reset}`);
        console.log(`  ${COLORS.dim}Do NOT deploy until all failures are resolved.${COLORS.reset}\n`);
        process.exit(1);
    } else if (warnings > 0) {
        console.log(`\n  ${COLORS.yellow}⚠ Passed with warnings — review before deploy.${COLORS.reset}\n`);
        process.exit(0);
    } else {
        console.log(`\n  ${COLORS.green}✓ All checks passed — safe to deploy.${COLORS.reset}\n`);
        process.exit(0);
    }
}

main();
