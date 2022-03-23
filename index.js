require("dotenv").config();
const util = require("util");
const fs = require("fs");
const TelegramBot = require('node-telegram-bot-api');
const child_process = require("child_process");
const exec = (...args) => {
    console.log(`exec:`, ...args);
    return util.promisify(child_process.exec)(...args);
}

const token = process.env.TOKEN;
const chatId = process.env.CHAT_ID;
const gitURL = process.env.GIT_URL;
const gitBranch = process.env.GIT_BRANCH;
const fetchIntervalSeconds = +process.env.FETCH_INTERVAL_SECONDS;
const authorReplacements = JSON.parse(process.env.AUTHOR_REPLACEMENTS);

const bot = new TelegramBot(token, {polling: true});
bot.onText(/.*/, (msg, match) => {
    if (chatId !== msg.chat.id) {
        bot.sendMessage(msg.chat.id, `This bot is for a specific chat (your chat ID: ${msg.chat.id})`);
    }
})


async function main() {
    if (fs.existsSync("./tmpdata")) fs.rmdirSync("./tmpdata", { recursive: true, force: true });
    fs.mkdirSync("./tmpdata");
    try {
        console.log(`Cloned repo`, await exec(`cd ./tmpdata && git clone --bare '${gitURL}' .`));
        let lastCommit = (await exec(`cd ./tmpdata && git log -1 --pretty=format:%H`)).stdout;
        console.log(`First commit:`, lastCommit);
        while (true) {
            await wait(fetchIntervalSeconds * 1000);
            console.log();
            console.log("Syncing Git repo");
            console.log(`Fetched repo`, await exec(`cd ./tmpdata && git fetch --all`));
            const result = await exec(`cd ./tmpdata && git log ${lastCommit}..HEAD`);
            console.log(`New commits:`, result);

            let resstr = result.stdout;
            if (resstr) {
                for (const [from, to] of Object.entries(authorReplacements)) {
                    resstr = resstr.replace("Author: " + from, "Author: " + to);
                }
                resstr = resstr.replace(/commit ([0-9a-f]+)\n/g, "");
                resstr = resstr.replace(/Date: [^\n]*\n/g, "");
                resstr = resstr.replace("\n    ", "");
                resstr = resstr.replace(/Author: ([^\n]*)\n/g, "*New commit by $1*\n\n");
                bot.sendMessage(chatId, resstr, { parse_mode: "Markdown" });
            }

            let recentCommit = result.stdout.match(/commit ([0-9a-f]+)\n/)?.[1];
            if (recentCommit) lastCommit = recentCommit;
            console.log("Most recent commit:", lastCommit);
        }
    } finally {
        fs.rmdirSync("./tmpdata", { recursive: true, force: true });
    }
}
main();


async function wait(ms) {
    return await new Promise(resolve => setTimeout(resolve, ms));
}