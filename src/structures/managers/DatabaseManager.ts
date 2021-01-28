import NewsletterClient, { BotConfig } from "../Bot";
import mongoose, { Model } from "mongoose";
import { Collection } from "discord.js";
import { settings } from "../../botsettings";
import MemberSchema, { iMember } from "../models/Member";
import TaskSchema, { iTask } from "../models/Task";
import OrgSchema, { iOrg, OrgData } from "../models/Org";
import EventSchema, { EventData, iEvent } from "../models/Event";

export interface SchemaTypes {
    // member: Model<iMessage>
    member: Model<iMember>;
    event: Model<iEvent>;
    // response: Model<Response>;
    // rrmessage: Model<RRMessage>;
    task: Model<iTask>;
    org: Model<iOrg>;
}

export interface CacheTypes {
    // responses: Collection<string, Response>;
    // rrmessages: Collection<string, RRMessage>;
    events: Collection<string, EventData>;
    orgs: Collection<string, OrgData>;
}
export default class DatabaseManager {
    public client: NewsletterClient;
    public url: string;
    public m!: typeof mongoose;
    public schemas: SchemaTypes;
    public cache: CacheTypes;
    /**
     * Constructor of the database manager
     * @param config The BotConfig of the NewsletterClient (from main.ts).
     */
    constructor(client: NewsletterClient, config: BotConfig) {
        this.client = client;
        this.cache = {
            // responses: new Collection(),
            // rrmessages: new Collection(),
            events: new Collection(),
            orgs: new Collection(),
        };
        this.url = config.dbUrl;
        this.schemas = {
            member: MemberSchema,
            event: EventSchema,
            // response: ResponseSchema,
            // rrmessage: RRMessageSchema,
            task: TaskSchema,
            org: OrgSchema,
        };
    }

    public async connect() {
        this.m = await mongoose.connect(this.url, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            useFindAndModify: false,
        });

        // replace console.log with a logger
        this.m.connection.on("error", (err) => console.log("There was a connection error in DatabaseManager: " + err));
    }
    public dispose() {
        this.m.connection.close();
        this.client.logger.database("Closed MongoDB connection!");
    }
    public async setup() {
        try {
            // await this.recache('response');
            // await this.recache('rrmessage');
            await this.recache("org");
        } catch (err) {
            this.client.logger.error(err);
        }
    }
    public async recache(schema: keyof SchemaTypes, cache?: keyof CacheTypes) {
        try {
            let docs = await (this.schemas[schema] as Model<any>).find({});
            this.cache[cache ?? (`${schema}s` as keyof CacheTypes)] = new Collection<string, any>();
            docs.forEach((doc) => {
                this.cache[cache ?? (`${schema}s` as keyof CacheTypes)].set(doc["_id"] as string, doc);
            });
        } catch (err) {
            this.client.logger.error(err);
        }
    }

    // * Abstraction
    // org CRUD
    public orgFind(id: string) {
        const org = this.cache.orgs.find((o) => o._id == id);
        return org;
    }

    public async orgAdd(org: OrgData): Promise<boolean> {
        try {
            await this.schemas.org.create(org);
            await this.recache("org");
            return true;
        } catch (err) {
            return false;
        }
    }

    public async orgUpdate(org: OrgData): Promise<boolean> {
        try {
            await this.schemas.org.updateOne({ _id: org["_id"] }, org);
            await this.recache("org");
            return true;
        } catch (err) {
            return false;
        }
    }

    public async orgDelete(id: string): Promise<boolean> {
        try {
            await this.schemas.org.findOneAndDelete({ _id: id });
            await this.recache("org");
            return true;
        } catch (err) {
            return false;
        }
    }

    // add crud for event
    public async eventAddNewList(eventsWithIds: EventData[]): Promise<boolean> {
        try {
            await this.schemas.event.deleteMany({});
            await this.schemas.event.insertMany(eventsWithIds);
            await this.recache("event");
            return true;
        } catch (err) {
            return false;
        }
    }

    public async annoucementAdd(id: string, annoucement: any): Promise<boolean> {
        try {
            await this.schemas.org.updateOne({ _id: id }, { $push: { annoucements: annoucement } });
            await this.recache("org");
            return true;
        } catch (err) {
            return false;
        }
    }

    public async announcementClear(id: string): Promise<boolean> {
        try {
            await this.schemas.org.update({ _id: id }, { annoucements: [] });
            await this.recache("org");
            return true;
        } catch (err) {
            return false;
        }
    }
}
