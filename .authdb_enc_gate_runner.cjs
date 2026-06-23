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
    const localRequire = (spec) => {
        if (spec.startsWith('.') || spec.startsWith('/')) {
            let target = path.resolve(dir, spec);
            if (!fs.existsSync(target) && fs.existsSync(target + '.js')) target += '.js';
            if (target.endsWith('.js') || target.endsWith('.cjs')) return loadCjs(target);
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
