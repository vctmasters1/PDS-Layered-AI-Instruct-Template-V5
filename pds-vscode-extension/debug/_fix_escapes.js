// Diagnostic: find and fix doubled escape sequences in role-webview-script.js
// This script is safe to run — it prints what would be changed before making changes.
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'role-webview-script.js');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find lines with \\ followed by a quote (these are doubled escapes from the template literal)
const issues = [];
lines.forEach((line, i) => {
    if (line.includes("\\\\'") || line.includes('\\\\"')) {
        issues.push({ ln: i + 1, text: line.trim().substring(0, 150) });
    }
});

console.log('Lines with doubled-escape+quote (\\\\\' or \\\\"): ' + issues.length);
issues.forEach(h => console.log('  [' + h.ln + ']: ' + h.text));

// Also run the vm.Script check to confirm what errors remain
const vm = require('vm');

// Build minimal script (just webview script without data injections)
const scriptBody = content;
const dummyData = `
    const vscode = { postMessage: ()=>{} };
    const targets = [];
    const boards = [];
    const savedRoles = [];
    const allModules = [];
    const pinCaps = {};
    const defaultVars = {};
    const components = {};
    const fbBlocks = [];
    const prefabs = [];
`;
const fullScript = dummyData + '\n' + scriptBody;

try {
    new vm.Script(fullScript, { filename: 'webview.js' });
    console.log('\nPARSE OK');
} catch (e) {
    console.log('\nPARSE ERROR:', e.message);
    if (e.stack) {
        const stackLines = e.stack.split('\n');
        // Find the line reference
        const ref = stackLines.find(l => l.includes('webview.js:'));
        console.log('Location:', ref);
    }
}
