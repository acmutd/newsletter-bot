import { Collection } from "discord.js";
import Command from "../Command";
import NewsletterClient from "../Bot";
import * as fs from "fs";

declare function require(name: string): any;

export default class EventManager {
    public bot: NewsletterClient;
    public path: string;
    // public events: Collection<string, Command>;

    /**
     * Event Manager for the NewsletterClient
     * @param bot NewsletterClient
     * @param eventsDirPath Event folder path
     */
    constructor(bot: NewsletterClient, eventsDirPath: string) {
        this.bot = bot;
        this.path = eventsDirPath;
        // this.events = new Collection();
    }

    scanEvents() {
        fs.readdir(this.path, (err, files) => {
            this.bot.logger.info(`Found ${files.length} event(s)!`);
            files.forEach((file) => {
                var eventClass = require(`${
                    this.path.endsWith("/") ? this.path : this.path + "/"
                }${file}`);
                var event = new eventClass.default(this.bot);
                this.bot.on(event.name, event.emit.bind(null, this.bot));
                this.bot.logger.info(
                    `Setup response for the \'${event.name}\' event!`
                );
            });
        });
    }
}
