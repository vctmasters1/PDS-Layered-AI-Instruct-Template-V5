#!/usr/bin/env node

/**
 * Simple HTTP Server for PDS Marketplace Frontend
 * Usage: node server.js
 * Then visit: http://localhost:8080
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const HOST = 'localhost';

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);

    // Default to index.html
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, filePath);

    // Get file extension
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - File Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, HOST, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║  🚀 PIPEDREAM MARKETPLACE - LOCAL SERVER RUNNING          ║
║                                                            ║
║  📍 URL: http://localhost:${PORT}                         ║
║                                                            ║
║  This frontend demonstrates:                             ║
║  ✅ Marketplace with designers & producers               ║
║  ✅ Map view showing business locations                  ║
║  ✅ Geolocation-based discovery                          ║
║  ✅ Business profiles & ratings                          ║
║  ✅ Order placement workflow                             ║
║  ✅ Bid system explanation                               ║
║                                                            ║
║  Backend Status: Ready (Express server available)        ║
║  Database: Awaiting PostgreSQL setup                     ║
║                                                            ║
║  Press CTRL+C to stop the server                         ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Server stopped.');
    process.exit(0);
});
