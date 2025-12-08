#!/usr/bin/env node
/**
 * Data Sync Script
 * Syncs data between localStorage (via browser) and JSON files in data/months/
 * 
 * Usage:
 *   node scripts/sync-data.js load    - Load all months from files into localStorage
 *   node scripts/sync-data.js save    - Save all months from localStorage to files
 *   node scripts/sync-data.js watch   - Watch for changes and auto-sync
 */

const fs = require('fs');
const path = require('path');

const MONTHS_DIR = path.join(__dirname, '../data/months');
const STORAGE_FILE = path.join(__dirname, '../data/localStorage.json');

// Ensure directories exist
if (!fs.existsSync(MONTHS_DIR)) {
    fs.mkdirSync(MONTHS_DIR, { recursive: true });
}

/**
 * Load all month files from data/months/ directory
 */
function loadMonthsFromFiles() {
    const months = {};
    
    if (!fs.existsSync(MONTHS_DIR)) {
        console.log('No data/months directory found. Creating it...');
        fs.mkdirSync(MONTHS_DIR, { recursive: true });
        return months;
    }
    
    const files = fs.readdirSync(MONTHS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    console.log(`Found ${jsonFiles.length} month files`);
    
    jsonFiles.forEach(file => {
        const filePath = path.join(MONTHS_DIR, file);
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const monthData = JSON.parse(content);
            const monthKey = path.basename(file, '.json');
            months[monthKey] = monthData;
            console.log(`  ✓ Loaded ${monthKey}: ${monthData.monthName || 'Unknown'} ${monthData.year || 'Unknown'}`);
        } catch (error) {
            console.error(`  ✗ Error loading ${file}:`, error.message);
        }
    });
    
    return months;
}

/**
 * Save all months to individual JSON files
 */
function saveMonthsToFiles(months) {
    if (!fs.existsSync(MONTHS_DIR)) {
        fs.mkdirSync(MONTHS_DIR, { recursive: true });
    }
    
    let savedCount = 0;
    Object.keys(months).forEach(monthKey => {
        const monthData = months[monthKey];
        const filePath = path.join(MONTHS_DIR, `${monthKey}.json`);
        
        try {
            fs.writeFileSync(filePath, JSON.stringify(monthData, null, 2), 'utf8');
            savedCount++;
            console.log(`  ✓ Saved ${monthKey}.json`);
        } catch (error) {
            console.error(`  ✗ Error saving ${monthKey}:`, error.message);
        }
    });
    
    console.log(`\nSaved ${savedCount} month files to ${MONTHS_DIR}`);
}

/**
 * Load localStorage data from file (if exists)
 */
function loadLocalStorage() {
    if (!fs.existsSync(STORAGE_FILE)) {
        return { months: {} };
    }
    
    try {
        const content = fs.readFileSync(STORAGE_FILE, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('Error loading localStorage file:', error.message);
        return { months: {} };
    }
}

/**
 * Save localStorage data to file
 */
function saveLocalStorage(data) {
    try {
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error saving localStorage file:', error.message);
        return false;
    }
}

/**
 * Main sync operations
 */
function loadFromFiles() {
    console.log('Loading months from files...\n');
    const months = loadMonthsFromFiles();
    
    const storageData = {
        months: months,
        pots: {},
        settings: {
            currency: '£',
            defaultFixedCosts: [],
            defaultVariableCategories: ['Food', 'Travel/Transport', 'Activities'],
            defaultPots: []
        }
    };
    
    saveLocalStorage(storageData);
    console.log(`\n✓ Synced ${Object.keys(months).length} months to localStorage file`);
}

function saveToFiles() {
    console.log('Saving months to files...\n');
    const storageData = loadLocalStorage();
    const months = storageData.months || {};
    
    if (Object.keys(months).length === 0) {
        console.log('No months found in localStorage. Loading from files first...');
        loadFromFiles();
        return;
    }
    
    saveMonthsToFiles(months);
}

function watchForChanges() {
    console.log('Watching for changes... (Press Ctrl+C to stop)');
    console.log('Note: This watches the localStorage file, not the browser directly.');
    console.log('Run this script after making changes in the browser.\n');
    
    if (fs.existsSync(STORAGE_FILE)) {
        fs.watchFile(STORAGE_FILE, { interval: 1000 }, (curr, prev) => {
            if (curr.mtime > prev.mtime) {
                console.log('\n[Change detected] Syncing to files...');
                saveToFiles();
            }
        });
    } else {
        console.log('localStorage file not found. Waiting for it to be created...');
        const checkInterval = setInterval(() => {
            if (fs.existsSync(STORAGE_FILE)) {
                clearInterval(checkInterval);
                console.log('localStorage file found. Starting watch...');
                watchForChanges();
            }
        }, 2000);
    }
}

// Command line interface
const command = process.argv[2] || 'load';

switch (command) {
    case 'load':
        loadFromFiles();
        break;
    case 'save':
        saveToFiles();
        break;
    case 'watch':
        watchForChanges();
        break;
    default:
        console.log('Usage: node scripts/sync-data.js [load|save|watch]');
        console.log('  load  - Load months from files to localStorage');
        console.log('  save  - Save months from localStorage to files');
        console.log('  watch - Watch for changes and auto-sync');
        process.exit(1);
}
