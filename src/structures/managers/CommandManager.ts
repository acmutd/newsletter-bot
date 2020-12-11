import { Collection } from "discord.js";
import Command from "../Command";
import NewsletterClient from "../Bot";
import * as fs from "fs";

export default class CommandManager {
    public bot: NewsletterClient;
    public path: string;
    public commands: Collection<string, Command>;

    /**
     *
     * @param bot NewsletterClient
     * @param commandPath Path to the command folder
     */
    constructor(bot: NewsletterClient, commandPath: string) {
        this.bot = bot;
        this.path = commandPath;
        this.commands = new Collection();
    }

    scanCommands() {
        fs.readdir(this.path, (err, files) => {
            this.bot.logger.info(`Found ${files.length} commands(s)!`);
            files.forEach((file) => {
                var cmd = require(`${
                    this.path.endsWith("/") ? this.path : this.path + "/"
                }${file}`);

                var command = new cmd.default();
                this.commands.set(command.name, command);
                this.bot.logger.info(`Loaded the \'${command.name}\' command!`);
            });
        });
    }
}
