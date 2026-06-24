/**
 * .authdb_enc_gate_runner.cjs  (UNTRACKED, throwaway runner)
 *
 * Runs ONE auth_db encryption gate file (passed as argv[2], a path relative to the
 * repo root) under correct CommonJS semantics inside this type:module checkout,
 * reusing the same vm-based CommonJS loader + transient nacl vendor symlink as the
 * budget runners. Reads files only; modifies nothing in the submodule; no npm deps.
 *
 * Usage: node .authdb_enc_gate_runner.cjs lib/auth_db/encryption/tests/s0_primitives.test.js
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
    const resolveSpec = (spec) => {
        if (spec.startsWith('.') || spec.startsWith('/')) {
            let target = path.resolve(dir, spec);
            if (!fs.existsSync(target) && fs.existsSync(target + '.js')) target += '.js';
            return target;
        }
        return nodeRequire.resolve(spec);
    };
    const localRequire = (spec) => {
        if (spec.startsWith('.') || spec.startsWith('/')) {
            const target = resolveSpec(spec);
            if (target.endsWith('.js') || target.endsWith('.cjs')) return loadCjs(target);
            return nodeRequire(target);
        }
        return nodeRequire(spec);
    };
    // Some tests use require.resolve(...) + delete require.cache[p] to force a
    // FRESH module load (e.g. s13 re-loading authService.js between gates). Back
    // require.cache by the runner's own `cache` Map so the delete-then-require
    // round-trip actually re-evaluates the module.
    localRequire.resolve = resolveSpec;
    localRequire.cache = new Proxy({}, {
        get(_t, key) { return cache.has(key) ? cache.get(key) : undefined; },
        has(_t, key) { return cache.has(key); },
        deleteProperty(_t, key) { cache.delete(key); return true; },
        ownKeys() { return Array.from(cache.keys()); },
        getOwnPropertyDescriptor(_t, key) {
            if (cache.has(key)) return { configurable: true, enumerable: true, value: cache.get(key) };
            return undefined;
        },
    });
    const wrapper = vm.compileFunction(
        src,
        ['module', 'exports', 'require', '__filename', '__dirname', 'Buffer', 'global', 'process'],
        { filename: resolved }
    );
    wrapper(moduleObj, moduleObj.exports, localRequire, resolved, dir, Buffer, global, process);
    return moduleObj.exports;
}

// transient nacl vendor symlink (same rationale as the budget runners).
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
process.on('exit', () => { if (createdShim) { try { fs.rmSync(shimRootToRemove, { recursive: true, force: true }); } catch (_) {} } });

const rel = process.argv[2];
if (!rel) { process.stdout.write('usage: node .authdb_enc_gate_runner.cjs <test-path>\n'); process.exit(2); }
loadCjs(path.resolve(__dirname, rel));
