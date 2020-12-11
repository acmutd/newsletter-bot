import NewsletterClient from "./structures/Bot";
import * as path from "path";
import { settings } from "./botsettings";

// TODO: Add Sentry

let client: NewsletterClient = new NewsletterClient({
    token: settings.token,
    dbUrl: settings.databaseURL,
    sentryDSN: settings.sentryDNS,
    commandPath: path.join(process.cwd(), "dist", "commands"),
    eventPath: path.join(process.cwd(), "dist", "events"),
    responseFormat: settings.responseFormat,
    disabledCommands: settings.disabledCommands,
    disabledCategories: settings.disabledCategories,
});

client.start();
