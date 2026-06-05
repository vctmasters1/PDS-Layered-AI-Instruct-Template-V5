// Fix doubled backslash+quote sequences in role-webview-script.js
// Changes \\' (doubled, for template literal context) to \' (single, for readFileSync)
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'role-webview-script.js');
let content = fs.readFileSync(filePath, 'utf8');

const before = (content.match(/\\\\'/g) || []).length;

// Replace \\' with \'
// In JS string: '\\\\' is literal \\, "'" is literal '  =>  replaces \\' with \'
content = content.split("\\\\'").join("\\'");

const after = (content.match(/\\\\'/g) || []).length;

fs.writeFileSync(filePath, content, 'utf8');
console.log('Replaced:', before - after, 'occurrences of \\\\\' → \\\'');
console.log('Remaining \\\\\':', after);
console.log('File length:', content.length);

// Verify parse
const vm = require('vm');
const dummyData = `
    const vscode = { postMessage: ()=>{} };
    const targets = []; const boards = []; const savedRoles = [];
    const allModules = []; const pinCaps = {}; const defaultVars = {};
    const components = {}; const fbBlocks = []; const prefabs = [];
`;
try {
    new vm.Script(dummyData + '\n' + content, { filename: 'webview.js' });
    console.log('PARSE OK after fix');
} catch (e) {
    console.log('PARSE ERROR:', e.message);
    if (e.stack) {
        const m = e.stack.split('\n').find(l => l.includes('webview.js:'));
        console.log('Location:', m);
    }
}
