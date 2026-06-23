/**
 * .s4s5_budget_transform_runner.cjs  (UNTRACKED, money_tracker-owned, throwaway runner)
 *
 * Triplet of .s10_budget_runner.cjs (S1) and .s2_budget_key_runner.cjs (S2),
 * pointed at the S4/S5 encrypt-on-write + dual-read gates over the REAL
 * DatabaseService transforms (the canonical auth_db submodule copy).
 *
 * Why this exists: money_tracker/package.json declares "type":"module", which
 * forces node to treat EVERY .js under this checkout as ESM. The auth_db harness +
 * primitive services are CommonJS and ship in a clone whose nearest package.json is
 * NOT type:module; inside this checkout they cannot be loaded by plain `node file.js`
 * or `require()` (the .js extension resolves to ESM, and we may NOT add a
 * package.json inside lib/auth_db nor edit the submodule).
 *
 * This .cjs (forced CommonJS) loads each CommonJS .js by READING its source and
 * evaluating it inside a CommonJS wrapper via vm.compileFunction, installing a
 * custom require() so relative `.js` requires route back through this loader while
 * bare specifiers fall through to node's real require. The test file itself reads
 * the (read-only) databaseService.js + calculationService.js source and captures
 * their `window.<Global>` export in a sandbox — neither file is modified. Adds NO
 * npm deps, writes NO file into the submodule.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeRequire = require;

const cache = new Map();

function loadCjs(absPath) {
    const resolved = path.resolve(absPath);
    if (cache.has(resolved)) return cache.get(resolved).exports;

    const src = fs.readFileSync(resolved, 'utf8');
    const moduleObj = { exports: {} };
    cache.set(resolved, moduleObj);

    const dir = path.dirname(resolved);

    const localRequire = (spec) => {
        if (spec.startsWith('.') || spec.startsWith('/')) {
            let target = path.resolve(dir, spec);
            if (!fs.existsSync(target) && fs.existsSync(target + '.js')) target += '.js';
            if (target.endsWith('.js') || target.endsWith('.cjs')) {
                return loadCjs(target);
            }
            return nodeRequire(target);
        }
        return nodeRequire(spec);
    };

    const wrapper = vm.compileFunction(
        src,
        ['module', 'exports', 'require', '__filename', '__dirname', 'Buffer', 'global', 'process'],
        { filename: resolved }
    );
    wrapper(moduleObj, moduleObj.exports, localRequire, resolved, dir, Buffer, global, process);
    return moduleObj.exports;
}

// nacl vendor-dir resolution (same rationale as the S1/S2 runners): _harness.js
// locates vendored TweetNaCl relative to ITS OWN __dirname; one candidate is
// <repo>/lib/money_tracker/shared/vendor/crypto. The real vendor dir is
// <repo>/shared/vendor/crypto. Create a transient symlink, remove on exit.
const realVendor = path.resolve(__dirname, 'shared/vendor/crypto');
const shimVendorParent = path.resolve(__dirname, 'lib/money_tracker/shared/vendor');
const shimVendorLink = path.join(shimVendorParent, 'crypto');
const shimRootToRemove = path.resolve(__dirname, 'lib/money_tracker');

let createdShim = false;
if (!fs.existsSync(shimVendorLink)) {
    fs.mkdirSync(shimVendorParent, { recursive: true });
    fs.symlinkSync(realVendor, shimVendorLink);
    createdShim = true;
}
function cleanupShim() {
    if (createdShim) {
        try { fs.rmSync(shimRootToRemove, { recursive: true, force: true }); } catch (_) { /* best effort */ }
        createdShim = false;
    }
}
process.on('exit', cleanupShim);

const testPath = path.resolve(__dirname, 'shared/services/budgetTransform.s4s5.test.js');
loadCjs(testPath);
