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

    constructor(client: NewsletterClient) {
        this.client = client;
        this.spreadsheetId = "1-i-70gyCkRh3m8mRbMzXBCBXKqq5_tVsFssR53lF6jM";

        // make sure the newspaper task is created/in the db with the appropriate time
        // ? the default time is sunday at 7pm (optimal time for a newsletter imo but idk)
        // TODO: make this changeable via a command
        this.defaultCron = "00 01 09 * * 0";

        // this.schedule();
    }

    // schedule the newsletter task
    public async schedule() {
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
        const doc = await this.getDoc();
        const sheet = doc.sheetsByIndex.find(s => s.title == orgAbbrev);

        const orgKey = await this.getOrgKey();
        
        // handle org is not the name of a sheet
        if (sheet == undefined) {
            return new MessageEmbed({
                description: `A sheet for ${orgAbbrev} doesn't exist.`,
                color: "RED"
            });
        }
        // handle org not in org key
        if (!orgKey.has(orgAbbrev)) {
            return new MessageEmbed({
                description: `${orgAbbrev} isn't configured in the organization key`,
                color: "RED"
            });
        }

        const orgConfig = orgKey.get(orgAbbrev)!;

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
        console.log(allEvents);

        // find the events that are for the upcoming week
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

        const ed: any = {};
        events.forEach((e) => (ed[e.division] = [...ed[e.division], e]));

        // create a basic embed
        let orgEmbed = new MessageEmbed({
            title: `📰 __${orgAbbrev}'s Weekly Newsletter__`,
            description:
                "\n- Respond with a number to RSVP for an event!\n\n- Respond with `unsubscribe` to unsubscribe from the ACM weekly newsletter.\n``",
            author: {
                name: orgConfig["Full Name"],
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

    async getOrgKey(): Promise<Map<string, GoogleSpreadsheetRow>> {
        const doc = await this.getDoc();
        const sheet = doc.sheetsByIndex.find(s => s.title == 'Organization Key');

        let res = new Map<string, GoogleSpreadsheetRow>();

        if (sheet == undefined) {
            throw new Error('No sheet called "Organization Key"');
        }

        const rows = await sheet.getRows();

        rows.forEach( row => {
            if (row["Abbr. Name [Same as sheet title]"] != undefined)
                res.set(row["Abbr. Name [Same as sheet title]"], row)
        });

        return res;
    }

    async getDoc(): Promise<GoogleSpreadsheet> {
        const doc = new GoogleSpreadsheet(this.spreadsheetId);
        doc.useApiKey(settings.keys.sheets);

        await doc.loadInfo();

        return doc;
    }

}
