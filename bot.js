require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const QRCode = require('qrcode');
const fs = require('fs').promises;
const axios = require('axios');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers
    ]
});

const jokes = [
    "Why don't scientists trust atoms? Because they make up everything!",
    "Why did the scarecrow win an award? He was outstanding in his field!",
    "Why don't eggs tell jokes? They'd crack each other up!",
    "What do you call a fake noodle? An impasta!",
    "Why did the math book look so sad? Because it was full of problems!",
    "What do you call a bear with no teeth? A gummy bear!",
    "Why don't skeletons fight each other? They don't have the guts!",
    "What do you call a sleeping bull? A bulldozer!",
    "Why did the cookie go to the doctor? Because it felt crumbly!",
    "What do you call a fish wearing a bowtie? Sofishticated!"
];

const memes = [
    "https://i.imgflip.com/1bij.jpg",
    "https://i.imgflip.com/2/30b1gx.jpg",
    "https://i.imgflip.com/26am.jpg",
    "https://i.imgflip.com/23ls.jpg",
    "https://i.imgflip.com/2fm6x.jpg",
    "https://i.imgflip.com/5c7lwc.jpg",
    "https://i.imgflip.com/4t0m5.jpg",
    "https://i.imgflip.com/2za3u.jpg",
    "https://i.imgflip.com/1o00in.jpg",
    "https://i.imgflip.com/4acd7.jpg"
];

const activeGiveaways = new Map();

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    
    let result = [];
    if (days > 0) result.push(`${days}d`);
    if (hours > 0) result.push(`${hours}h`);
    if (minutes > 0) result.push(`${minutes}m`);
    if (seconds > 0) result.push(`${seconds}s`);
    
    return result.join(' ') || '0s';
}

function parseDuration(durationStr) {
    const regex = /(\d+)([dhms])/g;
    let totalMs = 0;
    let match;
    
    while ((match = regex.exec(durationStr)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2];
        
        switch (unit) {
            case 'd': totalMs += value * 24 * 60 * 60 * 1000; break;
            case 'h': totalMs += value * 60 * 60 * 1000; break;
            case 'm': totalMs += value * 60 * 1000; break;
            case 's': totalMs += value * 1000; break;
        }
    }
    
    return totalMs;
}

// Kick.com API helper functions
async function getKickStreamerData(username) {
    try {
        const response = await axios.get(`https://kick.com/api/v1/channels/${username}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            },
            timeout: 10000
        });
        return response.data;
    } catch (error) {
        if (error.response?.status === 404) {
            return null; // Streamer not found
        }
        throw error;
    }
}

function formatUptime(startTime) {
    const now = Date.now();
    const start = new Date(startTime).getTime();
    const uptimeMs = now - start;
    
    if (uptimeMs <= 0) return '0s';
    
    const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
    const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uptimeMs % (1000 * 60)) / 1000);
    
    let result = [];
    if (hours > 0) result.push(`${hours}h`);
    if (minutes > 0) result.push(`${minutes}m`);
    if (seconds > 0 && hours === 0) result.push(`${seconds}s`);
    
    return result.join(' ') || '0s';
}

// Utility functions
function generatePassword(length = 12) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
}

function calculateExpression(expression) {
    try {
        // Basic security - only allow numbers, operators, parentheses, and spaces
        if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
            throw new Error('Invalid characters in expression');
        }
        // Use Function constructor for safer evaluation
        const result = Function('"use strict"; return (' + expression + ')')();
        return result;
    } catch (error) {
        throw new Error('Invalid expression');
    }
}

async function translateText(text, targetLang) {
    try {
        // Using Google Translate API (free tier)
        const response = await axios.get(`https://translate.googleapis.com/translate_a/single`, {
            params: {
                client: 'gtx',
                sl: 'auto',
                tl: targetLang,
                dt: 't',
                q: text
            }
        });
        return response.data[0][0][0];
    } catch (error) {
        throw new Error('Translation failed');
    }
}

// Game data
const eightBallResponses = [
    "🎱 It is certain", "🎱 Reply hazy, try again", "🎱 Don't count on it",
    "🎱 It is decidedly so", "🎱 Ask again later", "🎱 My reply is no",
    "🎱 Without a doubt", "🎱 Better not tell you now", "🎱 My sources say no",
    "🎱 Yes definitely", "🎱 Cannot predict now", "🎱 Outlook not so good",
    "🎱 You may rely on it", "🎱 Concentrate and ask again", "🎱 Very doubtful",
    "🎱 As I see it, yes", "🎱 Most likely", "🎱 Outlook good",
    "🎱 Yes", "🎱 Signs point to yes"
];

const triviaQuestions = [
    { question: "What is the capital of France?", answers: ["Paris", "London", "Berlin", "Madrid"], correct: 0 },
    { question: "Which planet is closest to the Sun?", answers: ["Venus", "Mercury", "Earth", "Mars"], correct: 1 },
    { question: "What is 2 + 2?", answers: ["3", "4", "5", "6"], correct: 1 },
    { question: "Who painted the Mona Lisa?", answers: ["Van Gogh", "Picasso", "Da Vinci", "Monet"], correct: 2 },
    { question: "What is the largest ocean?", answers: ["Atlantic", "Indian", "Arctic", "Pacific"], correct: 3 },
    { question: "How many sides does a triangle have?", answers: ["2", "3", "4", "5"], correct: 1 },
    { question: "What year did World War II end?", answers: ["1944", "1945", "1946", "1947"], correct: 1 },
    { question: "What is the chemical symbol for gold?", answers: ["Go", "Gd", "Au", "Ag"], correct: 2 }
];

function rollDice(count, sides) {
    const results = [];
    for (let i = 0; i < count; i++) {
        results.push(Math.floor(Math.random() * sides) + 1);
    }
    return results;
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
    };
}

async function shortenUrl(url) {
    try {
        // Using is.gd URL shortener (free, no API key needed)
        const response = await axios.get(`https://is.gd/create.php`, {
            params: {
                format: 'simple',
                url: url
            }
        });
        return response.data;
    } catch (error) {
        throw new Error('URL shortening failed');
    }
}

async function getIpInfo(ip) {
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}`);
        return response.data;
    } catch (error) {
        throw new Error('IP lookup failed');
    }
}

const commands = [
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Test if bot is responding'),
        
    new SlashCommandBuilder()
        .setName('joke')
        .setDescription('Get a random joke'),
        
    new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Get a random meme'),
        
    new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Manage giveaways')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start a new giveaway')
                .addStringOption(option =>
                    option.setName('duration')
                        .setDescription('Giveaway duration (e.g., 1h, 2d30m, 45s)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('prize')
                        .setDescription('What is the prize?')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('end')
                .setDescription('End a giveaway early')
                .addStringOption(option =>
                    option.setName('message_id')
                        .setDescription('ID of the giveaway message')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Show all active giveaways')),
                
    new SlashCommandBuilder()
        .setName('qr')
        .setDescription('Generate QR code')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Text to encode in QR code')
                .setRequired(true)),
                
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user from the server')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to kick')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for kick')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
        
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to ban')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for ban')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('delete_days')
                .setDescription('Days of messages to delete (0-7)')
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
        
    new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to timeout')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Timeout duration (e.g., 5m, 1h, 1d)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for timeout')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
        
    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Delete messages from channel')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (1-100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
        
        
    new SlashCommandBuilder()
        .setName('viewers')
        .setDescription('Check viewer count of a Kick streamer')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Kick.com username')
                .setRequired(true)),
                
    new SlashCommandBuilder()
        .setName('uptime')
        .setDescription('Check uptime of a Kick streamer')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Kick.com username')
                .setRequired(true)),
                
    new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set a personal reminder')
        .addStringOption(option =>
            option.setName('time')
                .setDescription('When to remind (e.g., 30m, 2h, 1d)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('What to remind you about')
                .setRequired(true)),
                
    new SlashCommandBuilder()
        .setName('timer')
        .setDescription('Start a countdown timer')
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Timer duration (e.g., 5m, 1h)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Timer message')
                .setRequired(false)),
                
    new SlashCommandBuilder()
        .setName('reminders')
        .setDescription('Show your active reminders'),
        
    new SlashCommandBuilder()
        .setName('translate')
        .setDescription('Translate text to another language')
        .addStringOption(option =>
            option.setName('language')
                .setDescription('Target language (en, cs, de, es, fr, etc.)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Text to translate')
                .setRequired(true)),
                
    new SlashCommandBuilder()
        .setName('password')
        .setDescription('Generate a secure password')
        .addIntegerOption(option =>
            option.setName('length')
                .setDescription('Password length (8-50)')
                .setMinValue(8)
                .setMaxValue(50)
                .setRequired(false)),
                
    new SlashCommandBuilder()
        .setName('calculate')
        .setDescription('Calculate mathematical expressions')
        .addStringOption(option =>
            option.setName('expression')
                .setDescription('Math expression (e.g., 2+2*5)')
                .setRequired(true)),
                
    new SlashCommandBuilder()
        .setName('base64')
        .setDescription('Encode or decode base64')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Encode or decode')
                .setRequired(true)
                .addChoices(
                    { name: 'Encode', value: 'encode' },
                    { name: 'Decode', value: 'decode' }
                ))
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Text to encode/decode')
                .setRequired(true)),
                
    new SlashCommandBuilder()
        .setName('hash')
        .setDescription('Generate hash of text')
        .addStringOption(option =>
            option.setName('algorithm')
                .setDescription('Hash algorithm')
                .setRequired(true)
                .addChoices(
                    { name: 'MD5', value: 'md5' },
                    { name: 'SHA1', value: 'sha1' },
                    { name: 'SHA256', value: 'sha256' }
                ))
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Text to hash')
                .setRequired(true)),
                
    new SlashCommandBuilder()
        .setName('timestamp')
        .setDescription('Get current timestamp'),
        
    new SlashCommandBuilder()
        .setName('server-info')
        .setDescription('Show server information'),
        
    new SlashCommandBuilder()
        .setName('user-info')
        .setDescription('Show user information')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to get info about')
                .setRequired(false)),
                
    // Mini Games
    new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play rock, paper, scissors')
        .addStringOption(option =>
            option.setName('choice')
                .setDescription('Your choice')
                .setRequired(true)
                .addChoices(
                    { name: '🪨 Rock', value: 'rock' },
                    { name: '📄 Paper', value: 'paper' },
                    { name: '✂️ Scissors', value: 'scissors' }
                )),
                
    new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Ask the magic 8-ball a question')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Your question')
                .setRequired(true)),
                
    new SlashCommandBuilder()
        .setName('trivia')
        .setDescription('Answer a random trivia question'),
        
    new SlashCommandBuilder()
        .setName('dice')
        .setDescription('Roll dice')
        .addStringOption(option =>
            option.setName('notation')
                .setDescription('Dice notation (e.g., 2d6, 1d20)')
                .setRequired(true)),
                
    // Advanced Features
    new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a poll with reactions')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Poll question')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('options')
                .setDescription('Poll options separated by commas (max 10)')
                .setRequired(true)),
                
    new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set channel slowmode')
        .addIntegerOption(option =>
            option.setName('seconds')
                .setDescription('Slowmode delay in seconds (0-21600)')
                .setMinValue(0)
                .setMaxValue(21600)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
        
    new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Send a formatted announcement')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Announcement message')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Announcement title')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
        
    new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Show user avatar')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to show avatar of')
                .setRequired(false)),
                
    // Advanced Utilities
    new SlashCommandBuilder()
        .setName('color')
        .setDescription('Get information about a color')
        .addStringOption(option =>
            option.setName('hex')
                .setDescription('Hex color code (e.g., #ff0000)')
                .setRequired(true)),
                
    new SlashCommandBuilder()
        .setName('shorten')
        .setDescription('Shorten a URL')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('URL to shorten')
                .setRequired(true)),
                
    new SlashCommandBuilder()
        .setName('ip-info')
        .setDescription('Get information about an IP address')
        .addStringOption(option =>
            option.setName('ip')
                .setDescription('IP address to lookup')
                .setRequired(true))
];

async function registerCommands() {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    
    try {
        console.log('Clearing existing slash commands...');
        
        const guildId = '1374372067536801812'; // Tvůj Guild ID
        
        console.log('Registering slash commands to guild...');
        
        // Zaregistruj příkazy do guild (bez mazání)
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, guildId),
            { body: commands },
        );
        
        console.log(`Successfully registered ${commands.length} slash commands!`);
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await registerCommands();
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
        const { commandName } = interaction;

        if (commandName === 'ping') {
            await interaction.reply('Pong! 🏓');
        }
        
        else if (commandName === 'joke') {
            const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
            await interaction.reply(`😄 ${randomJoke}`);
        }
        
        else if (commandName === 'meme') {
            const randomMeme = memes[Math.floor(Math.random() * memes.length)];
            await interaction.reply(randomMeme);
        }
        
        else if (commandName === 'qr') {
            const text = interaction.options.getString('text');
            
            try {
                await interaction.deferReply();
                const qrBuffer = await QRCode.toBuffer(text, {
                    width: 500,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                
                const attachment = new AttachmentBuilder(qrBuffer, { name: 'qrcode.png' });
                
                const embed = {
                    color: 0x0099ff,
                    title: '📱 QR Code Generated',
                    description: `**Text:** ${text.length > 100 ? text.substring(0, 100) + '...' : text}`,
                    image: { url: 'attachment://qrcode.png' },
                    footer: { text: 'Scan with your phone camera' }
                };
                
                await interaction.editReply({ embeds: [embed], files: [attachment] });
            } catch (error) {
                console.error('QR Code generation error:', error);
                await interaction.editReply({ content: '❌ Failed to generate QR code. Text might be too long.' });
            }
        }
        
        else if (commandName === 'kick') {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
                await interaction.reply({
                    content: '❌ You don\'t have permission to kick members!',
                    ephemeral: true
                });
                return;
            }
            
            const member = interaction.guild.members.cache.get(user.id);
            if (!member) {
                await interaction.reply({
                    content: '❌ User not found in this server!',
                    ephemeral: true
                });
                return;
            }
            
            if (!member.kickable) {
                await interaction.reply({
                    content: '❌ I cannot kick this user! They might have higher permissions.',
                    ephemeral: true
                });
                return;
            }
            
            try {
                await member.kick(reason);
                
                const embed = {
                    color: 0xff9900,
                    title: '👢 User Kicked',
                    fields: [
                        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
                        { name: 'Reason', value: reason, inline: false }
                    ],
                    timestamp: new Date().toISOString()
                };
                
                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                console.error('Kick error:', error);
                await interaction.reply({
                    content: '❌ Failed to kick user!',
                    ephemeral: true
                });
            }
        }
        
        else if (commandName === 'ban') {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const deleteDays = interaction.options.getInteger('delete_days') || 0;
            
            if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
                await interaction.reply({
                    content: '❌ You don\'t have permission to ban members!',
                    ephemeral: true
                });
                return;
            }
            
            const member = interaction.guild.members.cache.get(user.id);
            if (member && !member.bannable) {
                await interaction.reply({
                    content: '❌ I cannot ban this user! They might have higher permissions.',
                    ephemeral: true
                });
                return;
            }
            
            try {
                await interaction.guild.members.ban(user, {
                    deleteMessageDays: deleteDays,
                    reason: reason
                });
                
                const embed = {
                    color: 0xff0000,
                    title: '🔨 User Banned',
                    fields: [
                        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
                        { name: 'Reason', value: reason, inline: false },
                        { name: 'Messages Deleted', value: `${deleteDays} days`, inline: true }
                    ],
                    timestamp: new Date().toISOString()
                };
                
                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                console.error('Ban error:', error);
                await interaction.reply({
                    content: '❌ Failed to ban user!',
                    ephemeral: true
                });
            }
        }
        
        else if (commandName === 'timeout') {
            const user = interaction.options.getUser('user');
            const durationStr = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                await interaction.reply({
                    content: '❌ You don\'t have permission to timeout members!',
                    ephemeral: true
                });
                return;
            }
            
            const member = interaction.guild.members.cache.get(user.id);
            if (!member) {
                await interaction.reply({
                    content: '❌ User not found in this server!',
                    ephemeral: true
                });
                return;
            }
            
            if (!member.moderatable) {
                await interaction.reply({
                    content: '❌ I cannot timeout this user! They might have higher permissions.',
                    ephemeral: true
                });
                return;
            }
            
            const duration = parseDuration(durationStr);
            if (duration === 0 || duration > 28 * 24 * 60 * 60 * 1000) {
                await interaction.reply({
                    content: '❌ Invalid duration! Use format like `5m`, `1h`, `1d` (max 28 days)',
                    ephemeral: true
                });
                return;
            }
            
            try {
                await member.timeout(duration, reason);
                
                const embed = {
                    color: 0xffa500,
                    title: '⏰ User Timed Out',
                    fields: [
                        { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                        { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
                        { name: 'Duration', value: formatDuration(duration), inline: true },
                        { name: 'Reason', value: reason, inline: false },
                        { name: 'Ends', value: `<t:${Math.floor((Date.now() + duration) / 1000)}:R>`, inline: true }
                    ],
                    timestamp: new Date().toISOString()
                };
                
                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                console.error('Timeout error:', error);
                await interaction.reply({
                    content: '❌ Failed to timeout user!',
                    ephemeral: true
                });
            }
        }
        
        else if (commandName === 'clear') {
            const amount = interaction.options.getInteger('amount');
            
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                await interaction.reply({
                    content: '❌ You don\'t have permission to manage messages!',
                    ephemeral: true
                });
                return;
            }
            
            try {
                const messages = await interaction.channel.messages.fetch({ limit: amount });
                await interaction.channel.bulkDelete(messages, true);
                
                await interaction.reply({
                    content: `✅ Deleted ${messages.size} messages!`,
                    ephemeral: true
                });
            } catch (error) {
                console.error('Clear error:', error);
                await interaction.reply({
                    content: '❌ Failed to delete messages! (Messages older than 14 days cannot be bulk deleted)',
                    ephemeral: true
                });
            }
        }
        
        else if (commandName === 'viewers') {
            const username = interaction.options.getString('username');
            
            await interaction.deferReply();
            
            try {
                const streamerData = await getKickStreamerData(username);
                
                if (!streamerData) {
                    await interaction.editReply({
                        content: `❌ Streamer **${username}** not found on Kick.com`
                    });
                    return;
                }
                
                const isLive = streamerData.livestream !== null;
                const viewerCount = isLive ? streamerData.livestream.viewer_count : 0;
                const profilePic = streamerData.user?.profile_pic || 'https://kick.com/favicon.ico';
                
                const embed = {
                    color: isLive ? 0x00ff00 : 0x808080,
                    title: `👥 ${streamerData.user.username} - Viewers`,
                    thumbnail: { url: profilePic },
                    fields: [
                        {
                            name: 'Current Viewers',
                            value: `**${viewerCount.toLocaleString()}** ${viewerCount === 1 ? 'viewer' : 'viewers'}`,
                            inline: true
                        },
                        {
                            name: 'Status',
                            value: isLive ? '🟢 **Live**' : '🔴 **Offline**',
                            inline: true
                        }
                    ],
                    footer: { text: `kick.com/${username}` },
                    timestamp: new Date().toISOString()
                };
                
                if (isLive && streamerData.livestream.session_title) {
                    embed.fields.push({
                        name: 'Stream Title',
                        value: streamerData.livestream.session_title,
                        inline: false
                    });
                }
                
                if (isLive && streamerData.livestream.category) {
                    embed.fields.push({
                        name: 'Category',
                        value: streamerData.livestream.category.name,
                        inline: true
                    });
                }
                
                await interaction.editReply({ embeds: [embed] });
                
            } catch (error) {
                console.error('Viewers command error:', error);
                await interaction.editReply({
                    content: '❌ Failed to fetch viewer data. Kick.com might be temporarily unavailable.'
                });
            }
        }
        
        else if (commandName === 'uptime') {
            const username = interaction.options.getString('username');
            
            await interaction.deferReply();
            
            try {
                const streamerData = await getKickStreamerData(username);
                
                if (!streamerData) {
                    await interaction.editReply({
                        content: `❌ Streamer **${username}** not found on Kick.com`
                    });
                    return;
                }
                
                const isLive = streamerData.livestream !== null;
                const profilePic = streamerData.user?.profile_pic || 'https://kick.com/favicon.ico';
                
                if (!isLive) {
                    const embed = {
                        color: 0x808080,
                        title: `⏱️ ${streamerData.user.username} - Uptime`,
                        thumbnail: { url: profilePic },
                        description: '🔴 **Stream is offline**',
                        footer: { text: `kick.com/${username}` },
                        timestamp: new Date().toISOString()
                    };
                    
                    await interaction.editReply({ embeds: [embed] });
                    return;
                }
                
                const streamStartTime = streamerData.livestream.created_at;
                const uptime = formatUptime(streamStartTime);
                const viewerCount = streamerData.livestream.viewer_count;
                
                const embed = {
                    color: 0x00ff00,
                    title: `⏱️ ${streamerData.user.username} - Uptime`,
                    thumbnail: { url: profilePic },
                    fields: [
                        {
                            name: 'Stream Uptime',
                            value: `**${uptime}**`,
                            inline: true
                        },
                        {
                            name: 'Current Viewers',
                            value: `**${viewerCount.toLocaleString()}**`,
                            inline: true
                        },
                        {
                            name: 'Started',
                            value: `<t:${Math.floor(new Date(streamStartTime).getTime() / 1000)}:R>`,
                            inline: true
                        }
                    ],
                    footer: { text: `kick.com/${username}` },
                    timestamp: new Date().toISOString()
                };
                
                if (streamerData.livestream.session_title) {
                    embed.fields.push({
                        name: 'Stream Title',
                        value: streamerData.livestream.session_title,
                        inline: false
                    });
                }
                
                if (streamerData.livestream.category) {
                    embed.fields.push({
                        name: 'Category',
                        value: streamerData.livestream.category.name,
                        inline: true
                    });
                }
                
                await interaction.editReply({ embeds: [embed] });
                
            } catch (error) {
                console.error('Uptime command error:', error);
                await interaction.editReply({
                    content: '❌ Failed to fetch uptime data. Kick.com might be temporarily unavailable.'
                });
            }
        }
        
        else if (commandName === 'remind') {
            const timeStr = interaction.options.getString('time');
            const message = interaction.options.getString('message');
            const duration = parseDuration(timeStr);
            
            if (duration === 0) {
                await interaction.reply({
                    content: '❌ Invalid time format. Use combinations like: `30m`, `2h`, `1d`',
                    ephemeral: true
                });
                return;
            }
            
            const reminderId = Date.now().toString();
            const remindTime = Date.now() + duration;
            
            activeReminders.set(reminderId, {
                userId: interaction.user.id,
                channelId: interaction.channel.id,
                message,
                time: remindTime
            });
            
            setTimeout(async () => {
                const reminder = activeReminders.get(reminderId);
                if (reminder) {
                    try {
                        const channel = await client.channels.fetch(reminder.channelId);
                        const embed = {
                            color: 0xffaa00,
                            title: '⏰ Reminder',
                            description: `<@${reminder.userId}> ${reminder.message}`,
                            timestamp: new Date().toISOString()
                        };
                        await channel.send({ embeds: [embed] });
                    } catch (error) {
                        console.error('Reminder error:', error);
                    }
                    activeReminders.delete(reminderId);
                }
            }, duration);
            
            await interaction.reply({
                content: `⏰ Reminder set! I'll remind you about "${message}" in ${formatDuration(duration)}`,
                ephemeral: true
            });
        }
        
        else if (commandName === 'timer') {
            const durationStr = interaction.options.getString('duration');
            const message = interaction.options.getString('message') || 'Timer finished!';
            const duration = parseDuration(durationStr);
            
            if (duration === 0) {
                await interaction.reply({
                    content: '❌ Invalid duration format. Use combinations like: `5m`, `1h`',
                    ephemeral: true
                });
                return;
            }
            
            const embed = {
                color: 0x00aaff,
                title: '⏱️ Timer Started',
                description: `Timer set for **${formatDuration(duration)}**\nMessage: ${message}`,
                footer: { text: `Ends at` },
                timestamp: new Date(Date.now() + duration).toISOString()
            };
            
            await interaction.reply({ embeds: [embed] });
            
            setTimeout(async () => {
                try {
                    const finishedEmbed = {
                        color: 0xff6600,
                        title: '⏰ Timer Finished!',
                        description: `<@${interaction.user.id}> ${message}`,
                        timestamp: new Date().toISOString()
                    };
                    await interaction.followUp({ embeds: [finishedEmbed] });
                } catch (error) {
                    console.error('Timer error:', error);
                }
            }, duration);
        }
        
        else if (commandName === 'reminders') {
            const userReminders = Array.from(activeReminders.values())
                .filter(r => r.userId === interaction.user.id);
                
            if (userReminders.length === 0) {
                await interaction.reply({
                    content: '📝 You have no active reminders.',
                    ephemeral: true
                });
                return;
            }
            
            const embed = {
                color: 0x0099ff,
                title: '📋 Your Active Reminders',
                fields: userReminders.map((r, index) => ({
                    name: `Reminder ${index + 1}`,
                    value: `**Message:** ${r.message}\n**Time:** <t:${Math.floor(r.time / 1000)}:R>`,
                    inline: true
                }))
            };
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (commandName === 'translate') {
            const targetLang = interaction.options.getString('language');
            const text = interaction.options.getString('text');
            
            await interaction.deferReply();
            
            try {
                const translatedText = await translateText(text, targetLang);
                
                const embed = {
                    color: 0x4285f4,
                    title: '🌍 Translation',
                    fields: [
                        { name: 'Original', value: text, inline: false },
                        { name: `Translated (${targetLang.toUpperCase()})`, value: translatedText, inline: false }
                    ],
                    footer: { text: 'Powered by Google Translate' }
                };
                
                await interaction.editReply({ embeds: [embed] });
            } catch (error) {
                await interaction.editReply({
                    content: '❌ Translation failed. Please check the language code and try again.'
                });
            }
        }
        
        else if (commandName === 'password') {
            const length = interaction.options.getInteger('length') || 12;
            const password = generatePassword(length);
            
            const embed = {
                color: 0x00ff00,
                title: '🔒 Generated Password',
                description: `\`\`\`${password}\`\`\``,
                fields: [
                    { name: 'Length', value: length.toString(), inline: true },
                    { name: 'Strength', value: length >= 16 ? 'Very Strong' : length >= 12 ? 'Strong' : 'Medium', inline: true }
                ],
                footer: { text: 'Keep this password secure!' }
            };
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (commandName === 'calculate') {
            const expression = interaction.options.getString('expression');
            
            try {
                const result = calculateExpression(expression);
                
                const embed = {
                    color: 0xff9900,
                    title: '🧮 Calculator',
                    fields: [
                        { name: 'Expression', value: `\`${expression}\``, inline: false },
                        { name: 'Result', value: `\`${result}\``, inline: false }
                    ]
                };
                
                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                await interaction.reply({
                    content: '❌ Invalid mathematical expression.',
                    ephemeral: true
                });
            }
        }
        
        else if (commandName === 'base64') {
            const action = interaction.options.getString('action');
            const text = interaction.options.getString('text');
            
            try {
                let result;
                if (action === 'encode') {
                    result = Buffer.from(text, 'utf8').toString('base64');
                } else {
                    result = Buffer.from(text, 'base64').toString('utf8');
                }
                
                const embed = {
                    color: 0x9c27b0,
                    title: `🔤 Base64 ${action === 'encode' ? 'Encode' : 'Decode'}`,
                    fields: [
                        { name: 'Input', value: `\`\`\`${text}\`\`\``, inline: false },
                        { name: 'Output', value: `\`\`\`${result}\`\`\``, inline: false }
                    ]
                };
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } catch (error) {
                await interaction.reply({
                    content: '❌ Invalid base64 string.',
                    ephemeral: true
                });
            }
        }
        
        else if (commandName === 'hash') {
            const algorithm = interaction.options.getString('algorithm');
            const text = interaction.options.getString('text');
            
            const hash = crypto.createHash(algorithm).update(text).digest('hex');
            
            const embed = {
                color: 0x795548,
                title: `🔐 ${algorithm.toUpperCase()} Hash`,
                fields: [
                    { name: 'Input', value: `\`\`\`${text}\`\`\``, inline: false },
                    { name: 'Hash', value: `\`\`\`${hash}\`\`\``, inline: false }
                ]
            };
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (commandName === 'timestamp') {
            const now = Date.now();
            const timestamp = Math.floor(now / 1000);
            
            const embed = {
                color: 0x607d8b,
                title: '⏰ Current Timestamp',
                fields: [
                    { name: 'Unix Timestamp', value: `\`${timestamp}\``, inline: true },
                    { name: 'Milliseconds', value: `\`${now}\``, inline: true },
                    { name: 'Discord Format', value: `\`<t:${timestamp}>\``, inline: false },
                    { name: 'ISO String', value: `\`${new Date().toISOString()}\``, inline: false }
                ]
            };
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (commandName === 'server-info') {
            const guild = interaction.guild;
            const owner = await guild.fetchOwner();
            
            const embed = {
                color: 0x5865f2,
                title: `🏰 ${guild.name}`,
                thumbnail: { url: guild.iconURL() || 'https://discord.com/assets/322c936a8c8be1b803cd94861bdfa868.png' },
                fields: [
                    { name: 'Owner', value: `${owner.user.tag}`, inline: true },
                    { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: 'Members', value: `${guild.memberCount}`, inline: true },
                    { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true },
                    { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
                    { name: 'Boost Level', value: `${guild.premiumTier}`, inline: true },
                    { name: 'Server ID', value: `\`${guild.id}\``, inline: false }
                ]
            };
            
            await interaction.reply({ embeds: [embed] });
        }
        
        else if (commandName === 'user-info') {
            const user = interaction.options.getUser('user') || interaction.user;
            const member = interaction.guild.members.cache.get(user.id);
            
            const embed = {
                color: user.accentColor || 0x5865f2,
                title: `👤 ${user.tag}`,
                thumbnail: { url: user.displayAvatarURL() },
                fields: [
                    { name: 'User ID', value: `\`${user.id}\``, inline: true },
                    { name: 'Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true }
                ]
            };
            
            if (member) {
                embed.fields.push(
                    { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
                    { name: 'Nickname', value: member.nickname || 'None', inline: true },
                    { name: 'Roles', value: `${member.roles.cache.size - 1}`, inline: true }
                );
            }
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        else if (commandName === 'rps') {
            const userChoice = interaction.options.getString('choice');
            const choices = ['rock', 'paper', 'scissors'];
            const botChoice = choices[Math.floor(Math.random() * choices.length)];
            
            const choiceEmoji = {
                rock: '🪨',
                paper: '📄', 
                scissors: '✂️'
            };
            
            let result;
            if (userChoice === botChoice) {
                result = "It's a tie!";
            } else if (
                (userChoice === 'rock' && botChoice === 'scissors') ||
                (userChoice === 'paper' && botChoice === 'rock') ||
                (userChoice === 'scissors' && botChoice === 'paper')
            ) {
                result = "You win!";
            } else {
                result = "I win!";
            }
            
            const embed = {
                color: result === "You win!" ? 0x00ff00 : result === "I win!" ? 0xff0000 : 0xffaa00,
                title: '🎮 Rock Paper Scissors',
                fields: [
                    { name: 'Your Choice', value: `${choiceEmoji[userChoice]} ${userChoice}`, inline: true },
                    { name: 'My Choice', value: `${choiceEmoji[botChoice]} ${botChoice}`, inline: true },
                    { name: 'Result', value: result, inline: false }
                ]
            };
            
            await interaction.reply({ embeds: [embed] });
        }
        
        else if (commandName === '8ball') {
            const question = interaction.options.getString('question');
            const response = eightBallResponses[Math.floor(Math.random() * eightBallResponses.length)];
            
            const embed = {
                color: 0x8b00ff,
                title: '🎱 Magic 8-Ball',
                fields: [
                    { name: 'Question', value: question, inline: false },
                    { name: 'Answer', value: response, inline: false }
                ]
            };
            
            await interaction.reply({ embeds: [embed] });
        }
        
        else if (commandName === 'trivia') {
            const question = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
            
            const embed = {
                color: 0x00aaff,
                title: '🧠 Trivia Question',
                description: question.question,
                fields: question.answers.map((answer, index) => ({
                    name: `${String.fromCharCode(65 + index)}) ${answer}`,
                    value: '‎',
                    inline: true
                })),
                footer: { text: 'React with the letter of your answer!' }
            };
            
            const message = await interaction.reply({ embeds: [embed], fetchReply: true });
            
            const reactions = ['🇦', '🇧', '🇨', '🇩'];
            for (let i = 0; i < question.answers.length; i++) {
                await message.react(reactions[i]);
            }
            
            setTimeout(async () => {
                const correctAnswer = question.answers[question.correct];
                const resultEmbed = {
                    color: 0x00ff00,
                    title: '🧠 Trivia Answer',
                    description: `**Question:** ${question.question}\n\n**Correct Answer:** ${String.fromCharCode(65 + question.correct)}) ${correctAnswer}`
                };
                await interaction.followUp({ embeds: [resultEmbed] });
            }, 30000);
        }
        
        else if (commandName === 'dice') {
            const notation = interaction.options.getString('notation');
            const match = notation.match(/^(\d+)d(\d+)$/i);
            
            if (!match) {
                await interaction.reply({
                    content: '❌ Invalid dice notation. Use format like: `2d6`, `1d20`, `3d8`',
                    ephemeral: true
                });
                return;
            }
            
            const count = parseInt(match[1]);
            const sides = parseInt(match[2]);
            
            if (count > 20 || sides > 100) {
                await interaction.reply({
                    content: '❌ Maximum 20 dice with 100 sides each.',
                    ephemeral: true
                });
                return;
            }
            
            const results = rollDice(count, sides);
            const total = results.reduce((a, b) => a + b, 0);
            
            const embed = {
                color: 0xff6600,
                title: `🎲 Rolling ${notation}`,
                fields: [
                    { name: 'Results', value: results.join(', '), inline: false },
                    { name: 'Total', value: total.toString(), inline: true },
                    { name: 'Average', value: (total / count).toFixed(1), inline: true }
                ]
            };
            
            await interaction.reply({ embeds: [embed] });
        }
        
        else if (commandName === 'poll') {
            const question = interaction.options.getString('question');
            const optionsStr = interaction.options.getString('options');
            const options = optionsStr.split(',').map(opt => opt.trim()).slice(0, 10);
            
            if (options.length < 2) {
                await interaction.reply({
                    content: '❌ Poll needs at least 2 options.',
                    ephemeral: true
                });
                return;
            }
            
            const reactions = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
            
            const embed = {
                color: 0x0099ff,
                title: '📊 Poll',
                description: `**${question}**\n\n${options.map((opt, i) => `${reactions[i]} ${opt}`).join('\n')}`,
                footer: { text: `Created by ${interaction.user.username}` }
            };
            
            const message = await interaction.reply({ embeds: [embed], fetchReply: true });
            
            for (let i = 0; i < options.length; i++) {
                await message.react(reactions[i]);
            }
        }
        
        else if (commandName === 'slowmode') {
            const seconds = interaction.options.getInteger('seconds');
            
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                await interaction.reply({
                    content: '❌ You need Manage Channels permission.',
                    ephemeral: true
                });
                return;
            }
            
            try {
                await interaction.channel.setRateLimitPerUser(seconds);
                
                const embed = {
                    color: seconds > 0 ? 0xffaa00 : 0x00ff00,
                    title: '⏱️ Slowmode Updated',
                    description: seconds > 0 ? 
                        `Slowmode set to **${seconds} seconds**` : 
                        'Slowmode **disabled**',
                    footer: { text: `Set by ${interaction.user.username}` }
                };
                
                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                await interaction.reply({
                    content: '❌ Failed to set slowmode.',
                    ephemeral: true
                });
            }
        }
        
        else if (commandName === 'announce') {
            const message = interaction.options.getString('message');
            const title = interaction.options.getString('title') || '📢 Announcement';
            
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                await interaction.reply({
                    content: '❌ You need Manage Messages permission.',
                    ephemeral: true
                });
                return;
            }
            
            const embed = {
                color: 0xff6600,
                title: title,
                description: message,
                footer: { text: `By ${interaction.user.username}` },
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [embed] });
        }
        
        else if (commandName === 'avatar') {
            const user = interaction.options.getUser('user') || interaction.user;
            
            const embed = {
                color: 0x5865f2,
                title: `🖼️ ${user.username}'s Avatar`,
                image: { url: user.displayAvatarURL({ size: 512 }) },
                fields: [
                    { name: 'User', value: user.tag, inline: true },
                    { name: 'Avatar URL', value: `[Click here](${user.displayAvatarURL()})`, inline: true }
                ]
            };
            
            await interaction.reply({ embeds: [embed] });
        }
        
        else if (commandName === 'color') {
            const hex = interaction.options.getString('hex');
            const rgb = hexToRgb(hex);
            
            if (!rgb) {
                await interaction.reply({
                    content: '❌ Invalid hex color. Use format: #ff0000',
                    ephemeral: true
                });
                return;
            }
            
            const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
            const colorInt = parseInt(hex.replace('#', ''), 16);
            
            const embed = {
                color: colorInt,
                title: '🎨 Color Information',
                fields: [
                    { name: 'Hex', value: `\`${hex.toUpperCase()}\``, inline: true },
                    { name: 'RGB', value: `\`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})\``, inline: true },
                    { name: 'HSL', value: `\`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)\``, inline: true },
                    { name: 'Decimal', value: `\`${colorInt}\``, inline: true }
                ],
                thumbnail: { url: `https://via.placeholder.com/100/${hex.replace('#', '')}/000000?text=+` }
            };
            
            await interaction.reply({ embeds: [embed] });
        }
        
        else if (commandName === 'shorten') {
            const url = interaction.options.getString('url');
            
            if (!url.startsWith('http')) {
                await interaction.reply({
                    content: '❌ Please provide a valid URL starting with http:// or https://',
                    ephemeral: true
                });
                return;
            }
            
            await interaction.deferReply();
            
            try {
                const shortUrl = await shortenUrl(url);
                
                const embed = {
                    color: 0x00aa55,
                    title: '🔗 URL Shortened',
                    fields: [
                        { name: 'Original URL', value: url.length > 100 ? url.substring(0, 100) + '...' : url, inline: false },
                        { name: 'Short URL', value: shortUrl, inline: false }
                    ]
                };
                
                await interaction.editReply({ embeds: [embed] });
            } catch (error) {
                await interaction.editReply({
                    content: '❌ Failed to shorten URL.'
                });
            }
        }
        
        else if (commandName === 'ip-info') {
            const ip = interaction.options.getString('ip');
            
            await interaction.deferReply();
            
            try {
                const info = await getIpInfo(ip);
                
                if (info.status === 'fail') {
                    await interaction.editReply({
                        content: '❌ Invalid IP address or lookup failed.'
                    });
                    return;
                }
                
                const embed = {
                    color: 0x0088cc,
                    title: `🌍 IP Information: ${ip}`,
                    fields: [
                        { name: 'Country', value: `${info.country} (${info.countryCode})`, inline: true },
                        { name: 'Region', value: info.regionName, inline: true },
                        { name: 'City', value: info.city, inline: true },
                        { name: 'ISP', value: info.isp, inline: true },
                        { name: 'Organization', value: info.org || 'N/A', inline: true },
                        { name: 'Timezone', value: info.timezone, inline: true }
                    ]
                };
                
                await interaction.editReply({ embeds: [embed] });
            } catch (error) {
                await interaction.editReply({
                    content: '❌ Failed to lookup IP information.'
                });
            }
        }
        
        else if (commandName === 'giveaway') {
            const subcommand = interaction.options.getSubcommand();
            
            if (subcommand === 'start') {
                const durationStr = interaction.options.getString('duration');
                const prize = interaction.options.getString('prize');
                const duration = parseDuration(durationStr);
                
                if (duration === 0) {
                    await interaction.reply({
                        content: '❌ Invalid duration format. Use combinations like: `1d`, `2h`, `30m`, `45s`',
                        ephemeral: true
                    });
                    return;
                }
                
                const endTime = Date.now() + duration;
                const giveawayEmbed = {
                    color: 0x00ff00,
                    title: '🎉 GIVEAWAY 🎉',
                    description: `**Prize:** ${prize}\n**Duration:** ${formatDuration(duration)}\n**Ends:** <t:${Math.floor(endTime / 1000)}:R>\n\nReact with 🎉 to enter!`,
                    footer: { text: `Hosted by ${interaction.user.username}` },
                    timestamp: new Date(endTime).toISOString()
                };
                
                await interaction.reply({ embeds: [giveawayEmbed] });
                const giveawayMessage = await interaction.fetchReply();
                await giveawayMessage.react('🎉');
                
                activeGiveaways.set(giveawayMessage.id, {
                    messageId: giveawayMessage.id,
                    channelId: interaction.channel.id,
                    prize,
                    endTime,
                    hostId: interaction.user.id
                });
                
                setTimeout(async () => {
                    const giveaway = activeGiveaways.get(giveawayMessage.id);
                    if (giveaway) {
                        await endGiveaway(giveawayMessage.id);
                    }
                }, duration);
            }
            
            else if (subcommand === 'end') {
                const messageId = interaction.options.getString('message_id');
                if (!activeGiveaways.has(messageId)) {
                    await interaction.reply({
                        content: '❌ No active giveaway found with that ID.',
                        ephemeral: true
                    });
                    return;
                }
                
                await endGiveaway(messageId);
                await interaction.reply('✅ Giveaway ended manually!');
            }
            
            else if (subcommand === 'list') {
                const giveaways = Array.from(activeGiveaways.values());
                if (giveaways.length === 0) {
                    await interaction.reply({
                        content: '📝 No active giveaways.',
                        ephemeral: true
                    });
                    return;
                }
                
                const listEmbed = {
                    color: 0x0099ff,
                    title: '📋 Active Giveaways',
                    fields: giveaways.map(g => ({
                        name: g.prize,
                        value: `ID: ${g.messageId}\nEnds: <t:${Math.floor(g.endTime / 1000)}:R>`,
                        inline: true
                    }))
                };
                
                await interaction.reply({ embeds: [listEmbed], ephemeral: true });
            }
        }
    } catch (error) {
        console.error('Error handling slash command:', error);
        try {
            const errorMessage = { content: '❌ Sorry, something went wrong while processing your command!', ephemeral: true };
            if (interaction.replied) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (replyError) {
            console.error('Error sending error message:', replyError);
        }
    }
});

async function endGiveaway(messageId) {
    const giveaway = activeGiveaways.get(messageId);
    if (!giveaway) return;
    
    try {
        const channel = await client.channels.fetch(giveaway.channelId);
        const giveawayMessage = await channel.messages.fetch(messageId);
        
        const reaction = giveawayMessage.reactions.cache.get('🎉');
        if (!reaction) {
            const embed = {
                color: 0xff0000,
                title: '🎉 GIVEAWAY ENDED 🎉',
                description: `**Prize:** ${giveaway.prize}\n\n❌ No valid entries!`,
                footer: { text: 'Better luck next time!' }
            };
            await giveawayMessage.edit({ embeds: [embed] });
            activeGiveaways.delete(messageId);
            return;
        }
        
        const users = await reaction.users.fetch();
        const validUsers = users.filter(user => !user.bot);
        
        if (validUsers.size === 0) {
            const embed = {
                color: 0xff0000,
                title: '🎉 GIVEAWAY ENDED 🎉',
                description: `**Prize:** ${giveaway.prize}\n\n❌ No valid entries!`,
                footer: { text: 'Better luck next time!' }
            };
            await giveawayMessage.edit({ embeds: [embed] });
            activeGiveaways.delete(messageId);
            return;
        }
        
        const winnersArray = Array.from(validUsers.values());
        const winner = winnersArray[Math.floor(Math.random() * winnersArray.length)];
        
        const winnerEmbed = {
            color: 0xffd700,
            title: '🎉 GIVEAWAY ENDED 🎉',
            description: `**Prize:** ${giveaway.prize}\n\n🏆 **Winner:** ${winner}\n\nCongratulations!`,
            footer: { text: 'Thanks to everyone who participated!' }
        };
        
        await giveawayMessage.edit({ embeds: [winnerEmbed] });
        await giveawayMessage.reply(`🎉 Congratulations ${winner}! You won **${giveaway.prize}**!`);
        
        activeGiveaways.delete(messageId);
    } catch (error) {
        console.error('Error ending giveaway:', error);
        activeGiveaways.delete(messageId);
    }
}

client.on('error', (error) => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

if (!process.env.DISCORD_TOKEN) {
    console.error('Error: DISCORD_TOKEN environment variable is not set!');
    process.exit(1);
}

// Bot file - no HTTP server needed

client.login(process.env.DISCORD_TOKEN).catch((error) => {
    console.error('Failed to login:', error);
    process.exit(1);
});