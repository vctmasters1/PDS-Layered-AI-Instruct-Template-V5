const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '_debug_webview_generated.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const scriptMatch = html.match(/<script nonce=\"testnonce\">([\s\S]*?)<\/script>/);
if (!scriptMatch) {
    console.error('No script block found');
    process.exit(1);
}

const scriptContent = scriptMatch[1];

try {
    new Function(scriptContent);
    console.log('SUCCESS: Script compiled');
} catch (e) {
    console.log('ERROR: ' + e.message);
    const lines = scriptContent.split('\n');
    
    // Look for lines that look broken (e.g. truncated JSON)
    lines.forEach((line, i) => {
        if (line.includes('const blocks = [') && line.length > 500) {
            console.log(`Line ${i+1} (blocks) length: ${line.length}`);
            const lastPart = line.substring(line.length - 50);
            console.log(`Line ${i+1} end: ...${lastPart}`);
        }
        if (line.includes('const prefabs = [') && line.length > 500) {
            console.log(`Line ${i+1} (prefabs) length: ${line.length}`);
            const lastPart = line.substring(line.length - 50);
            console.log(`Line ${i+1} end: ...${lastPart}`);
        }
    });

    // Provide context around the first 20 lines (where it seems to fail)
    console.log('\n--- Script Header (Lines 1-20) ---');
    lines.slice(0, 20).forEach((l, i) => console.log(`${(i+1).toString().padStart(3)}: ${l}`));
}
