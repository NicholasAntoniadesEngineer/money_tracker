/**
 * .s10_budget_runner.cjs  (UNTRACKED, money_tracker-owned, throwaway test runner)
 *
 * Why this exists: money_tracker/package.json declares "type":"module", which
 * forces node to treat EVERY .js under this checkout as ESM. The auth_db
 * encryption tests + _harness.js + the primitive services are all CommonJS
 * (module.exports / require). They are designed to run in a standalone auth_db
 * clone whose nearest package.json is NOT type:module. Inside this checkout they
 * cannot be loaded by plain `node file.js` or by `require()` (the .js extension
 * resolves to ESM, and we may NOT add a package.json inside the lib/auth_db
 * submodule nor edit it).
 *
 * This runner is a .cjs file (forced CommonJS regardless of the ancestor
 * package.json) that loads each CommonJS .js module by READING its source and
 * evaluating it inside a CommonJS wrapper via vm.compileFunction -- the exact
 * technique _harness.js itself uses for the vendored UMD TweetNaCl. It installs
 * a custom require() so that relative `.js` requires between these modules route
 * back through this same loader, while bare specifiers (path, fs, crypto, vm)
 * fall through to node's real require. It adds NO npm deps and writes NO file
 * into the submodule.
 *
 * It is functionally a no-op shim: it just executes the real test file
 * (s10_budget_e2e.test.js) with correct CommonJS semantics. All assertions and
 * gates live in that test file, not here.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeRequire = require; // node's real require, for bare modules

// Cache so a module's exports object is shared (services reference each other).
const cache = new Map();

function loadCjs(absPath) {
    const resolved = path.resolve(absPath);
    if (cache.has(resolved)) return cache.get(resolved).exports;

    const src = fs.readFileSync(resolved, 'utf8');
    const moduleObj = { exports: {} };
    cache.set(resolved, moduleObj);

    const dir = path.dirname(resolved);

    // require() seen by the loaded module: relative .js -> our loader; everything
    // else -> node's real require (bare core modules, etc.).
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

// ---------------------------------------------------------------------------
// nacl vendor-dir resolution.
//
// _harness.js locates the vendored TweetNaCl via paths relative to ITS OWN
// __dirname inside the submodule; one candidate is
//   <repo>/lib/money_tracker/shared/vendor/crypto
// In this nested-submodule layout the real vendor dir is <repo>/shared/vendor/
// crypto. Rather than edit the (read-only) submodule harness, we create that
// candidate as a transient symlink and remove it on exit, so nothing is left
// behind. This adds NO npm deps and never modifies the submodule.
// ---------------------------------------------------------------------------
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

const testPath = path.resolve(
    __dirname, 'shared/services/budgetCryptoService.s10.test.js'
);
loadCjs(testPath);
