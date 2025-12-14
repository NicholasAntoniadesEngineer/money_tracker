#!/usr/bin/env node

/**
 * Build script to bundle all CSS and JavaScript into standalone HTML files
 * Usage: node build.js
 */

const fs = require('fs');
const path = require('path');

// Define the order of JavaScript files to load
const JS_ORDER = {
    'index.html': [
        'components/Header.js',
        'models/DataManager.js',
        'utils/formatters.js',
        'utils/InitialData.js',
        'controllers/LandingController.js'
    ],
    'views/monthly-budget.html': [
        'components/Header.js',
        'models/DataManager.js',
        'utils/formatters.js',
        'utils/CSVHandler.js',
        'utils/ReferenceImporter.js',
        'controllers/MonthlyBudgetController.js'
    ],
    'views/pots.html': [
        'components/Header.js',
        'models/DataManager.js',
        'utils/formatters.js',
        'controllers/PotsController.js'
    ],
    'views/overview.html': [
        'components/Header.js',
        'models/DataManager.js',
        'utils/formatters.js',
        'controllers/OverviewController.js'
    ],
    'views/settings.html': [
        'components/Header.js',
        'models/DataManager.js',
        'utils/formatters.js',
        'utils/CSVHandler.js',
        'utils/ReferenceImporter.js',
        'controllers/SettingsController.js'
    ]
};

// CSS files to inline
const CSS_FILES = [
    'styles/main.css'
];

/**
 * Read and return file contents
 */
function readFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error.message);
        return '';
    }
}

/**
 * Bundle JavaScript files
 */
function bundleJavaScript(htmlFile) {
    const jsFiles = JS_ORDER[htmlFile] || [];
    let bundledJS = '';
    
    jsFiles.forEach(jsFile => {
        const content = readFile(jsFile);
        if (content) {
            bundledJS += `\n// ===== ${jsFile} =====\n`;
            bundledJS += content;
            bundledJS += '\n';
        }
    });
    
    return bundledJS;
}

/**
 * Bundle CSS files
 */
function bundleCSS() {
    let bundledCSS = '';
    
    CSS_FILES.forEach(cssFile => {
        const content = readFile(cssFile);
        if (content) {
            bundledCSS += `\n/* ===== ${cssFile} ===== */\n`;
            bundledCSS += content;
            bundledCSS += '\n';
        }
    });
    
    return bundledCSS;
}

/**
 * Process HTML file and create bundled version
 */
function processHTML(htmlFile) {
    const originalContent = readFile(htmlFile);
    if (!originalContent) {
        console.error(`Could not read ${htmlFile}`);
        return;
    }
    
    // Bundle CSS
    const css = bundleCSS();
    
    // Bundle JavaScript
    const js = bundleJavaScript(htmlFile);
    
    let bundledContent = originalContent;
    
    // Replace CSS link with inline style
    bundledContent = bundledContent.replace(
        /<link rel="stylesheet" href="[^"]+">/g,
        `<style>${css}</style>`
    );
    
    // Extract inline scripts (scripts without src attribute)
    const inlineScripts = [];
    bundledContent = bundledContent.replace(
        /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g,
        (match, content) => {
            inlineScripts.push(content);
            return ''; // Remove from HTML temporarily
        }
    );
    
    // Remove all external script tags (with src attribute)
    bundledContent = bundledContent.replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/g, '');
    
    // Add bundled JavaScript and inline scripts before closing body tag
    let allJS = js;
    if (inlineScripts.length > 0) {
        allJS += '\n\n// ===== Inline Scripts =====\n';
        inlineScripts.forEach((script, index) => {
            allJS += `\n// Inline script ${index + 1}\n${script}\n`;
        });
    }
    
    bundledContent = bundledContent.replace(
        /<\/body>/,
        `<script>${allJS}</script>\n</body>`
    );
    
    // Update relative paths in HTML
    // Fix href paths for views
    bundledContent = bundledContent.replace(/href="views\//g, 'href="views/');
    bundledContent = bundledContent.replace(/href="\.\.\/views\//g, 'href="views/');
    
    // Fix script and link paths that might reference parent directories
    bundledContent = bundledContent.replace(/src="\.\.\//g, 'src="');
    bundledContent = bundledContent.replace(/href="\.\.\//g, 'href="');
    
    // Create output directory
    const outputDir = 'dist';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Create views directory in dist if needed
    if (htmlFile.startsWith('views/')) {
        const viewsDir = path.join(outputDir, 'views');
        if (!fs.existsSync(viewsDir)) {
            fs.mkdirSync(viewsDir, { recursive: true });
        }
    }
    
    // Write bundled file
    const outputPath = path.join(outputDir, htmlFile);
    fs.writeFileSync(outputPath, bundledContent, 'utf8');
    console.log(`✓ Bundled ${htmlFile} → ${outputPath}`);
}

/**
 * Recursively copy directory
 */
function copyDirectory(src, dest) {
    if (!fs.existsSync(src)) {
        return;
    }
    
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            copyDirectory(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * Main build function
 */
function build() {
    console.log('Building standalone HTML files...\n');
    
    const htmlFiles = [
        'index.html',
        'views/monthly-budget.html',
        'views/pots.html',
        'views/overview.html',
        'views/settings.html'
    ];
    
    htmlFiles.forEach(processHTML);
    
    // Copy reference directory if it exists
    const referenceDir = 'reference';
    if (fs.existsSync(referenceDir)) {
        const distReference = path.join('dist', referenceDir);
        copyDirectory(referenceDir, distReference);
        console.log(`✓ Copied ${referenceDir}/ → dist/${referenceDir}/`);
    }
    
    // Copy assets directory if it exists
    const assetsDir = 'assets';
    if (fs.existsSync(assetsDir)) {
        const distAssets = path.join('dist', assetsDir);
        copyDirectory(assetsDir, distAssets);
        console.log(`✓ Copied ${assetsDir}/ → dist/${assetsDir}/`);
    }
    
    console.log('\n✓ Build complete! Standalone files are in the dist/ directory');
    console.log('  You can now open any HTML file directly in a browser.');
}

// Run build
build();


