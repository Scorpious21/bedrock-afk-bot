const express = require('express');
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const bedrock = require('bedrock-protocol');
const fs = require('fs');

// ========== CONFIGURATION ==========
const DISCORD_TOKEN = 'MTMyMTM4MzMzNDE5NDE4ODM1MA.GkCsVw.B7Yqk7iYxR0A4PXvL0Lx7to9KuAKuhKqEwxyYM';     // Get from Discord Developer Portal
const 1321383334194188350 = '1321383334194188350';        // Get from Discord Developer Portal
const DEFAULT_SERVER = {
    host: 'Kousin.aternos.me',  // CHANGE THIS
    port: 23984                          // CHANGE THIS
};

let currentServer = { ...DEFAULT_SERVER };
let minecraftClient = null;
let chatInterval = null;
let customMessage = 'Kousin the coolest of all time';
let customInterval = 10 * 60 * 1000; // 10 minutes in ms

// Log storage (last 200 entries)
let logs = [];
function addLog(type, source, message, details = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        type, source, message, details
    };
    logs.unshift(entry); // newest first
    if (logs.length > 200) logs.pop();
    console.log(`[${source}] ${message}`);
}

// ========== MINECRAFT BOT ==========
function startMinecraftBot() {
    if (minecraftClient) {
        try { minecraftClient.close(); } catch(e) {}
    }
    if (chatInterval) clearInterval(chatInterval);

    const username = 'ShadowAFK_' + Math.floor(Math.random() * 9999);
    addLog('info', 'minecraft', `Connecting to ${currentServer.host}:${currentServer.port} as ${username}`);

    minecraftClient = bedrock.createClient({
        host: currentServer.host,
        port: currentServer.port,
        username: username,
        offline: true
    });

    minecraftClient.on('player_start_item_cooldown', () => {
        addLog('success', 'minecraft', `Joined ${currentServer.host}:${currentServer.port}`);
        startAntiAFK();
        startChatLoop();
    });

    minecraftClient.on('close', () => {
        addLog('warn', 'minecraft', 'Disconnected, reconnecting in 10 seconds...');
        setTimeout(() => startMinecraftBot(), 10000);
    });

    minecraftClient.on('error', (err) => {
        addLog('error', 'minecraft', err.message);
    });
}

function startAntiAFK() {
    const actions = ['jump', 'look', 'move'];
    setInterval(() => {
        if (minecraftClient && minecraftClient.connected) {
            const action = actions[Math.floor(Math.random() * actions.length)];
            if (action === 'jump') {
                minecraftClient.queue('player_action', { action: 8 });
                addLog('action', 'anti-afk', 'Jumped');
            } else {
                addLog('action', 'anti-afk', `Performed ${action}`);
            }
        }
    }, 30000); // every 30 seconds
}

function startChatLoop() {
    chatInterval = setInterval(() => {
        if (minecraftClient && minecraftClient.connected) {
            minecraftClient.queue('text', { text: customMessage });
            addLog('chat', 'minecraft', `"${customMessage}" (every ${customInterval/1000}s)`);
        }
    }, customInterval);
}

function updateChatSettings(message, intervalSeconds) {
    customMessage = message;
    customInterval = intervalSeconds * 1000;
    addLog('command', 'discord', `Chat updated: "${message}" every ${intervalSeconds}s`);
    // Restart chat loop with new settings
    if (chatInterval) clearInterval(chatInterval);
    startChatLoop();
}

// ========== DISCORD BOT ==========
const discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });

discordClient.once('ready', () => {
    addLog('success', 'discord', `Logged in as ${discordClient.user.tag}`);
    registerCommands();
});

async function registerCommands() {
    const commands = [
        {
            name: 'setmessage',
            description: 'Change the bot\'s repeating chat message',
            options: [
                { name: 'message', type: 3, description: 'The message to say', required: true },
                { name: 'interval', type: 4, description: 'Interval in seconds (default 600)', required: false }
            ]
        },
        {
            name: 'status',
            description: 'Check bot status',
            options: []
        },
        {
            name: 'joinserver',
            description: 'Make bot join a different server',
            options: [
                { name: 'ip', type: 3, description: 'Server IP', required: true },
                { name: 'port', type: 4, description: 'Port (default 19132)', required: false }
            ]
        }
    ];

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commands });
        addLog('success', 'discord', 'Slash commands registered');
    } catch(err) {
        addLog('error', 'discord', `Failed to register commands: ${err.message}`);
    }
}

discordClient.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'setmessage') {
        const message = interaction.options.getString('message');
        const interval = interaction.options.getInteger('interval') || 600;
        updateChatSettings(message, interval);
        await interaction.reply(`✅ Chat message updated to "${message}" every ${interval} seconds`);
    }
    else if (interaction.commandName === 'status') {
        await interaction.reply(`**Bot Status**\n- Server: ${currentServer.host}:${currentServer.port}\n- Message: "${customMessage}" (every ${customInterval/1000}s)\n- Logs: ${logs.length} entries`);
    }
    else if (interaction.commandName === 'joinserver') {
        const ip = interaction.options.getString('ip');
        const port = interaction.options.getInteger('port') || 19132;
        currentServer = { host: ip, port: port };
        addLog('command', 'discord', `Switching to ${ip}:${port}`);
        startMinecraftBot(); // restart with new server
        await interaction.reply(`✅ Bot switching to ${ip}:${port}`);
    }
});

discordClient.login(DISCORD_TOKEN);

// ========== EXPRESS API FOR DASHBOARD ==========
const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.send('OK'));
app.get('/api/logs', (req, res) => res.json(logs));
app.get('/api/logs/download', (req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename=logs.json');
    res.json(logs);
});
app.get('/api/status', (req, res) => res.json({
    server: currentServer,
    message: customMessage,
    interval: customInterval / 1000,
    logsCount: logs.length
}));

app.listen(3000, () => {
    addLog('success', 'system', 'Web server running on port 3000');
    startMinecraftBot();
});

console.log('✅ Bot started!');