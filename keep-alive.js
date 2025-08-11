const { spawn } = require('child_process');
const http = require('http');

// Keep-alive HTTP server
const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
        status: 'Bot is running!',
        uptime: process.uptime(),
        commands: 45
    }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Keep-alive server running on port ${PORT}`);
});

// Auto-restart bot process
function startBot() {
    console.log('Starting Discord bot...');
    const botProcess = spawn('node', ['bot.js'], {
        stdio: 'inherit'
    });

    botProcess.on('exit', (code) => {
        console.log(`Bot exited with code ${code}. Restarting in 3 seconds...`);
        setTimeout(startBot, 3000);
    });

    botProcess.on('error', (error) => {
        console.error('Bot process error:', error);
        setTimeout(startBot, 5000);
    });
}

startBot();