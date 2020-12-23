import DatabaseManager from "./managers/DatabaseManager";
import CommandManager from "./managers/CommandManager";
import EventManager from "./managers/EventManager";
import ErrorManager from "./managers/ErrorManager";
import IndicatorManager from "./managers/IndicatorManager";
import ScheduleManager from "./managers/ScheduleManager";
import CommandService from "./services/CommandService";
import NewsletterService from "./services/NewsletterService";

import { Client, Intents } from "discord.js";
import LoggerUtil from "../utils/Logger";
import ResponseUtil, { ResponseFormat } from "../utils/Responses";
import { settings } from "../botsettings";
import SpreadsheetManager from "./managers/SpreadsheetManager";

export interface BotConfig {
    token: string;
    dbUrl: string;
    commandPath: string;
    eventPath: string;
    // sentryDSN: string;
    responseFormat: ResponseFormat;
    disabledCommands: string[] | undefined;
    disabledCategories: string[] | undefined;
}

export default class NewsletterClient extends Client {
    // public commands: Collection<string, Command>;
    public settings: any;
    public logger: LoggerUtil;
    public response: ResponseUtil;
    // managers
    public manager: CommandManager;
    public events: EventManager;
    public error: ErrorManager;
    public database: DatabaseManager;
    public indicators: IndicatorManager;
    public scheduler: ScheduleManager;
    public spreadsheet: SpreadsheetManager;
    // public express: ExpressManager;
    // public calendar: CalendarManager;
    // services
    public services: {
        newsletter: NewsletterService;
        command: CommandService;
    };
    public config: BotConfig;

    constructor(config: BotConfig) {
        const intents = new Intents([Intents.NON_PRIVILEGED, "GUILD_MEMBERS"]);
        super({
            ws: { intents },
            partials: ["REACTION", "MESSAGE"],
            fetchAllMembers: true,
        });
        this.settings = settings;
        this.logger = new LoggerUtil();
        this.response = new ResponseUtil(config.responseFormat);
        this.manager = new CommandManager(this, config.commandPath);
        this.events = new EventManager(this, config.eventPath);
        this.database = new DatabaseManager(this, config);
        this.scheduler = new ScheduleManager(this);
        this.spreadsheet = new SpreadsheetManager(this);
        this.error = new ErrorManager(this);
        this.indicators = new IndicatorManager();
        this.services = {
            newsletter: new NewsletterService(this),
            command: new CommandService(this),
        };
        this.config = config;
    }

    /**
     * Initializes and sets up the ACMClient instance
     */
    async start() {
        // TODO: Add Sentry
        // Sentry.init({ dsn: this.config.sentryDSN });
        await this.database.connect();
        await this.database.setup();
        this.manager.scanCommands();
        this.events.scanEvents();
        this.error.setup();
        this.scheduler.setup();

        await this.services.newsletter.schedule();
        // this.on("debug", (e) => {
        //     console.error(e);
        // })

        this.services.newsletter.send();

        await this.login(this.config.token);
    }
}
