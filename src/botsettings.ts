import { ResponseFormat } from "./utils/Responses";

export interface Settings {
    token: string;
    prefix: string;
    activity: {
        type: "WATCHING" | "STREAMING" | "LISTENING";
        description: string;
    };
    // sentryDNS: string;
    databaseURL: string;
    keys: {
        sheets: string;
    };
    responseFormat: ResponseFormat;
    disabledCommands: string[];
    disabledCategories: string[];
    guild: string;
    emojiGuild: string;
    sheets: {
        calendarURL: string;
    };
    channels: {
        error: string;
        log: string;
    };
}

export const settings: Settings = require("../botconfig.js") as Settings;
