import NewsletterClient from "../Bot";
import { settings } from "../../botsettings";
import { MessageEmbed } from "discord.js";
import { GoogleSpreadsheet, GoogleSpreadsheetRow } from "google-spreadsheet";

interface Event {
    title: string;
    description: string;
    division: string;
    room: string;
    date: Date;
}

export default class NewsletterService {
    public client: NewsletterClient;
    private spreadsheetId: string;
    private defaultCron: string;

    // Yse a cached doc whenever time since docCacheTime < docCacheThreshold
    //   NOTE THAT THIS ONLY AFFECTS METADATA.
    //   Updated cells will *always* be reflected, new/deleted sheets will take up to 1 minute to re-cache.
    private doc: GoogleSpreadsheet | undefined;
    private docCacheTime = 0;
    private docCacheThreshold = 60 * 1000;

    constructor(client: NewsletterClient) {
        this.client = client;
        this.spreadsheetId = "1-i-70gyCkRh3m8mRbMzXBCBXKqq5_tVsFssR53lF6jM";

        // make sure the newspaper task is created/in the db with the appropriate time
        // ? the default time is sunday at 7pm (optimal time for a newsletter imo but idk)
        // TODO: make this changeable via a command
        this.defaultCron = "00 00 19 * * 0";
    }

    // schedule the newsletter task
    public async schedule() {
        // note that because of the specified ID, this will not get duplicated.
        await this.client.scheduler.createTask({
            id: "newsletter",
            type: "newsletter",
            cron: this.defaultCron,
        });
    }

    //
    // Event monitoring and handling //
    //
    public async send() {
        // return; // disable newsletter for now
        console.log("Running newsletter.send() process!");

        // create a basic embed
        let newsletter = await this.buildOrgEmbed("ACM");

        // loop through all members in member schema, and find the members with preferences.subscribed = false;
        const unsubscribed = await this.client.database.schemas.member
            .find({
                "preferences.subscribed": false,
            })
            .map((el: any) => el["_id"]);
        console.log(unsubscribed);
        // send to every member in client.members - unsubscribed
        const members = await this.client.guilds
            .resolve(settings.guild)
            ?.members.fetch();

        // remove everyone who is unsubscribed or is a bot
        const subscribed = members?.filter(
            (member) => !unsubscribed.includes(member.id) && !member.user.bot
        );

        for (let subscriber of subscribed!.values()) {
            try {
                await subscriber.send(newsletter);
            } catch (e) {
                console.log(
                    `Subscriber ${subscriber.user.username} has DMs blocked. Newsletter not sent`
                );
            }
        }
        /*
                subscribed?.forEach(async (member) => {
                        const dmChannel = await member.createDM();
                        dmChannel.send(newsletter);
                });
                */

        // reschedule a new newsletter task for next week
        this.schedule();
    }

    //* Embed Builders

    /**
     * Builds and returns an event embed for a single org.
     * @param orgAbbrev the org's abbreviation (i.e. name of sheet)
     */
    public async buildOrgEmbed(orgAbbrev: any): Promise<MessageEmbed> {
        // First things first: figure out if this org exists in our organization key
        const orgMapping = await this.getOrgMapping();
        // handle org not in org key
        if (!orgMapping.has(orgAbbrev)) {
            return new MessageEmbed({
                description: `${orgAbbrev} isn't configured in the organization key`,
                color: "RED",
            });
        }
        const orgConfig = orgMapping.get(orgAbbrev)!;

        // now that it supposedly exists, lets pull the events from the corresponding google sheet
        // note that this pulls only the next week of events.
        const events = await this.fetchOrgEvents(orgAbbrev);
        // handle the case where we can't find this org's sheet
        if (events == undefined) {
            return new MessageEmbed({
                description: `A sheet for ${orgAbbrev} doesn't exist, even though it exists in the organization key!`,
                color: "RED",
            });
        }

        // At this point, we have our organization configuration and the events themselves.

        // split events into their divisions
        const ed: any = {};
        events.forEach(
            (e) =>
                (ed[e.division] = ed.hasOwnProperty(e.division)
                    ? [...ed[e.division], e]
                    : [e])
        );

        // make the actual embed
        let orgEmbed = new MessageEmbed({
            title: `📰 __${orgAbbrev}'s Weekly Newsletter__`,
            description:
                "\n- Respond with a number to RSVP for an event!\n\n- Respond with `unsubscribe` to unsubscribe from the ACM weekly newsletter.\n``",
            author: {
                name: orgConfig["Full Name"],
                iconURL: orgConfig["Logo [URL]"],
            },
            color: 16738560,
            footer: {
                text: "Newsletter",
            },
            fields: Object.keys(ed).map((division: any) => {
                let str = "";
                ed[division].forEach(
                    (e: Event) =>
                        (str += `**${e.title}** on \`${
                            e.date.toDateString().split(" ")[0]
                        } @ ${this.formatAMPM(e.date)}\`\n`)
                );
                return { name: division, value: str, inline: false };
            }),
        });

        return orgEmbed;
    }

    /**
     * Builds and returns an announcement embed for a particular org.
     */
    public buildAnnouncement() {}

    /**
     * Formats Date object into `HH:MM AM/PM`, in CST
     */
    formatAMPM(date: Date): string {
        const options = {
            timeZone: "America/Chicago",
            hour: "numeric",
            minute: "numeric",
        };
        return date.toLocaleString("en-US", options);
    }

    /**
     * Returns events in the next week for the specified organization, or `undefined` if that sheet cannot be found.
     * @param orgAbbrev name of the sheet to look in
     */
    async fetchOrgEvents(orgAbbrev: string): Promise<Event[] | undefined> {
        const doc = await this.getDoc();
        const sheet = doc.sheetsByIndex.find((s) => s.title == orgAbbrev);

        // return undefined if there is no sheet with the name in orgAbbrev
        if (sheet == undefined) {
            return undefined;
        }

        const rows = await sheet.getRows();
        const validRows = rows.filter(
            (row: any) =>
                row["Start Time"] != undefined && row["Start Time"] != "TBA"
        );
        const allEvents: Event[] = validRows.map((row: any) => {
            return {
                title: row["Event Name"],
                description: row["Event Description"],
                division: row["Team/Division"],
                room: row["Room"],
                date: new Date(row.Date + " " + row["Start Time"]),
            };
        });

        // filter for only events in the upcoming week
        let today = new Date();
        const events = allEvents.filter((e) => {
            return (
                e.date > today &&
                e.date <
                    new Date(
                        today.getFullYear(),
                        today.getMonth(),
                        today.getDate() + 7
                    )
            );
        });

        return events;
    }

    /**
     * Reads the organization key from Google Sheets and returns a Map of abbreviation -> config data
     */
    async getOrgMapping(): Promise<Map<string, GoogleSpreadsheetRow>> {
        const doc = await this.getDoc();
        const sheet = doc.sheetsByIndex.find(
            (s) => s.title == "Organization Key"
        );

        let res = new Map<string, GoogleSpreadsheetRow>();

        if (sheet == undefined) {
            throw new Error('No sheet called "Organization Key"');
        }

        const rows = await sheet.getRows();

        rows.forEach((row) => {
            if (row["Abbr. Name [Same as sheet title]"] != undefined)
                res.set(row["Abbr. Name [Same as sheet title]"], row);
        });

        return res;
    }

    /**
     * Returns the Google Sheets document object for the events spreadsheet, with info loaded.
     */
    async getDoc(): Promise<GoogleSpreadsheet> {
        // don't bother re-retrieving the metadata if we recently retrieved it
        if (
            this.doc != undefined &&
            new Date().getTime() - this.docCacheTime < this.docCacheThreshold
        ) {
            console.log(
                "A cached version of the newsletter google sheets metadata was used"
            );
            return this.doc;
        }

        const doc = new GoogleSpreadsheet(this.spreadsheetId);
        doc.useApiKey(settings.keys.sheets);

        await doc.loadInfo();
        this.doc = doc;
        this.docCacheTime = new Date().getTime();

        return doc;
    }
}
