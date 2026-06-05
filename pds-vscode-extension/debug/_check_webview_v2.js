const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '_debug_webview_generated.html');
if (!fs.existsSync(htmlPath)) {
    console.error('HTML file not found at', htmlPath);
    process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');

// Find the script block
const scriptMatch = html.match(/<script nonce="testnonce">([\s\S]*?)<\/script>/);
if (!scriptMatch) {
    console.error('Could not find script block with nonce="testnonce"');
    process.exit(1);
}

const scriptContent = scriptMatch[1];
console.log('Script content length:', scriptContent.length);

try {
    // Try to compile the script as a function body
    new Function(scriptContent);
    console.log('Script compiled successfully!');
} catch (e) {
    console.error('Compilation Error:', e.message);
    
    // Find approximate line number by trying to compile chunks
    const lines = scriptContent.split('\n');
    let current = '';
    for (let i = 0; i < lines.length; i++) {
        current += lines[i] + '\n';
        try {
            // Check if adding this line makes it invalid
            // This is tricky because a single line might not be a valid block
            // but we can look for specific syntax errors
        } catch (err) {}
    }
    
    // Report the area around the error if the error message gives a line
    // Error messages from new Function usually don't give lines in Node, 
    // but some versions might.
    
    // Manual check for common pitfalls
    if (scriptContent.includes('<<')) console.log('Possible bitwise/heredoc error');
    if (scriptContent.includes('`')) console.log('Template literal found');
    
    // Output a few lines around where we suspect the error is (based on previous logs)
    // Previous logs showed index 642, which is approx line 9 of the script
    const startLine = 1;
    const endLine = 30;
    console.log(`Showing lines ${startLine} to ${endLine}:`);
    for (let i = startLine - 1; i < endLine && i < lines.length; i++) {
        console.log(`${(i+1).toString().padStart(4)}: ${lines[i]}`);
    }
}
