import NewsletterClient from "../Bot";
import { settings } from "../../botsettings";
import { Collection, GuildMember, Message, MessageAdditions, MessageEmbed } from "discord.js";
import { GoogleSpreadsheet, GoogleSpreadsheetRow } from "google-spreadsheet";
import {
    SpreadsheetOrg,
    SpreadsheetEvent,
} from "../managers/SpreadsheetManager";
import Member, { iMember } from "../models/Member";
import { EventData } from "../models/Event";

interface Event {
    title: string;
    description: string;
    division: string;
    room: string;
    date: Date;
}

interface OrgMessage {
    orgAbbr: string;
    msg: Message;
}

export interface OrgWithEvents {
    events: SpreadsheetEvent[];
    org: SpreadsheetOrg;
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
        // recache
        await this.client.spreadsheet.fetchAllOrgs();

        // get org events
        const orgWithEvents: OrgWithEvents[] = [];  // Array of org + events
        let eventsToDB: EventData[] = [];           // Array of events indexed by rsvp number
        let count = 1;                              // Tracks the current rsvp number

        for (const org of this.client.spreadsheet.orgs.array()) {
            let events = await this.client.spreadsheet.fetchEvents(org.abbr, 7);

            if (events.length > 0) {
                var addedID: SpreadsheetEvent[] = [];
                var toDB: any = [];

                events.forEach((e) => {
                    addedID.push({ ...e, id: count });
                    toDB.push({
                        _id: count,
                        abbr: org.abbr,
                        event: { ...e, id: count },
                    });
                    count++;
                });

                events = [...addedID];
                eventsToDB = [...toDB, ...eventsToDB];
                orgWithEvents.push({ events, org });
            }
        }

        // update the db
        try {
            await this.client.database.eventAddNewList(eventsToDB);
        } catch (e) {
            this.client.logger.error(e);
        }

        // initialize newsletter as an array of messages after the banner
        const newsletter: (
            | MessageEmbed
            | { localId: string; abbr: string, embed: MessageEmbed }
        )[] = []
        
        // add org embeds
        orgWithEvents.forEach((data) => {
            newsletter.push( { localId: data.org.localId, abbr: data.org.abbr, embed: this.buildOrgEmbed(data) } );
        });

        // add command list embed
        newsletter.push(this.client.services.command.buildDMHelp());

        // everything has been built, time to send out
        const received: Set<string> = new Set<string>();            // set of userIDs, tracked to prevent double-sending to the same user
        const users: Map<string, any> = new Map<string, any>();     // map of userID -> subscription & follow preferences from the DB

        // build `users`
        try {
            const u = await this.client.database.schemas.member.find({});
            u.forEach(
                (m) => (
                    users.set(m["_id"], {
                        subscribed: m.preferences.subscribed,
                        unfollowed: m.preferences.unfollowed
                            ? [...m.preferences.unfollowed]
                            : [],
                    })
                )
            );
        } catch (e) {
            this.client.logger.error(e);
        }

        // loop through org guilds and send newsletter to members
        const orgsWithGuild = orgWithEvents.filter((o) => !!o.org.guild);
        for (const data of orgsWithGuild) {
            // resolve guild
            try {
                const guild = await this.client.guilds.fetch(data.org.guild!);
                var members = await guild.members.fetch();
            } catch (e) {
                this.client.logger.error(e);
                continue;
            }

            // send to the members
            members.forEach(async (m) => {
                // comment out one of the lines below, depending on whether to send the newsletter to people with unknown preference
                if (
                    !received.has(m.id) &&
                    //users.has(m.id) ? users.get(m.id).subscribed : true &&  // defaults to send if user preference not set.
                    users.has(m.id) ? users.get(m.id).subscribed : false && // defaults to do not send if user preference not set
                    !m.user.bot
                ) {
                    received.add(m.id);
                    let tocData: OrgMessage[] = [];

                    // send the banner
                    await m.send({
                        files: [
                            "https://media.discordapp.net/attachments/744488968338276436/791967343223767060/newsletter_banner.png",
                        ],
                    });

                    // send the rest of the newsletter, one message at a time.
                    for (const n of newsletter) {
                        if (!(n instanceof MessageEmbed) && n.localId) {            // if this is an org-related embed
                            if (!users.get(m.id).unfollowed.includes(n.localId)) {  //  if user is not unfollowed from this org
                                const msg = await m.send(n);
                                // track message in the table of contents
                                tocData.push({
                                    orgAbbr: n.abbr,
                                    msg
                                });
                            }
                        } 
                        else await m.send(n);
                    }

                    await m.send(this.buildTOC(tocData));

                    // console.log(
                    //     "Would send newsletter to " +
                    //         m.user.username +
                    //         "#" +
                    //         m.user.discriminator
                    // );
                }
            });
        }
        this.schedule();
    }

    public buildOrgEmbed(data: OrgWithEvents): MessageEmbed {
        const weekdays = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
        ];

        const tte: any = {};
        data.events.forEach((e) => {
            if (e.team) {
                if (tte[e.team]) {
                    tte[e.team].push(e);
                } else tte[e.team] = [e];
            }
        });

        const now = new Date().toLocaleDateString("en-US", {
            weekday: "short",
            month: "long",
            day: "numeric",
        });

        return new MessageEmbed({
            title: data.org.name,
            description: `${data.org.description}\n\n` +
                `🎟 Respond with \`${settings.prefix}rsvp [number]\` to RSVP for an event!\n` +
                `🚪 Respond with \`${settings.prefix}unsubscribe\` to unsubscribe from the ${data.org.abbr} weekly newsletter.\n\n`,
            color: data.org.color,
            author: {
                name: `${data.org.abbr}'s Weekly Newsletter`,
                icon_url: data.org.logo,
                url: data.org.website,
            },
            footer: {
                text: `${now} Newsletter | Powered by Newsletter Bot`,
                iconURL: this.client.user!.avatarURL() as string,
            },
            fields: Object.keys(tte).map((k) => {
                var val = "";
                tte[k].forEach((e: SpreadsheetEvent) => {
                    val += `\`${e.id ?? ""}\`. **${e.name}** on \`${
                        weekdays[e.date.getDay()]
                    }\` at \`${e.date.toLocaleString("en-US", {
                        hour: "numeric",
                        minute: "numeric",
                        hour12: true,
                    })} CST\`\n`;
                });
                return {
                    name: `__**${k}**__`,
                    value: val ?? "No Events",
                };
            }),
            thumbnail: { url: data.org.logo },
            url: data.org.website,
        });
    }

    private buildTOC(tocData: OrgMessage[]): MessageEmbed {
        return new MessageEmbed({
            title: "Newsletter Table of Contents",
            description: tocData.map( (x, i) => `${i+1}. [${x.orgAbbr}](${x.msg.url})`).join("\n")
        });
    }

    public async remind({
        eventID,
        userID,
        minutesBeforeStart,
    }: {
        eventID: string;
        userID: string;
        minutesBeforeStart: number;
    }) {
        const e = this.client.database.cache.events.get(eventID);
        if (!e) return;

        // we'll add more to this
        const embed = new MessageEmbed();
        embed.setTitle(
            `\'${e.event.name}\' is starting in ${minutesBeforeStart} minutes!`
        );
        if (e.event.location) embed.addField("Location", e.event.location);

        try {
            var org = await this.client.spreadsheet.fetchOrg(e.abbr);
            if (!org) return;

            var user = await this.client.users.fetch(userID);
            if (user) user.send(embed);
        } catch (e) {
            this.client.logger.error(e);
        }
    }

    // public async send() {
    //     // return; // disable newsletter for now
    //     console.log("Running newsletter.send() process!");

    //     // create a basic embed
    //     let newsletter = await this.buildOrgEmbed("ACM");

    //     // loop through all members in member schema, and find the members with preferences.subscribed = false;
    //     const unsubscribed = await this.client.database.schemas.member
    //         .find({
    //             "preferences.subscribed": false,
    //         })
    //         .map((el: any) => el["_id"]);
    //     console.log(unsubscribed);
    //     // send to every member in client.members - unsubscribed
    //     const members = await this.client.guilds
    //         .resolve(settings.guild)
    //         ?.members.fetch();

    //     // remove everyone who is unsubscribed or is a bot
    //     const subscribed = members?.filter(
    //         (member) => !unsubscribed.includes(member.id) && !member.user.bot
    //     );

    //     for (let subscriber of subscribed!.values()) {
    //         try {
    //             await subscriber.send(newsletter);
    //         } catch (e) {
    //             console.log(
    //                 `Subscriber ${subscriber.user.username} has DMs blocked. Newsletter not sent`
    //             );
    //         }
    //     }
    //     /*
    //             subscribed?.forEach(async (member) => {
    //                     const dmChannel = await member.createDM();
    //                     dmChannel.send(newsletter);
    //             });
    //             */

    //     // reschedule a new newsletter task for next week
    //     this.schedule();
    // }

    //* Embed Builders

    /**
     * Builds and returns an event embed for a single org.
     * @param orgAbbrev the org's abbreviation (i.e. name of sheet)
     */
    // public async buildOrggEmbed(orgAbbrev: any): Promise<MessageEmbed> {
    //     // First things first: figure out if this org exists in our organization key
    //     const orgMapping = await this.getOrgMapping();
    //     // handle org not in org key
    //     if (!orgMapping.has(orgAbbrev)) {
    //         return new MessageEmbed({
    //             description: `${orgAbbrev} isn't configured in the organization key`,
    //             color: "RED",
    //         });
    //     }
    //     const orgConfig = orgMapping.get(orgAbbrev)!;

    //     // now that it supposedly exists, lets pull the events from the corresponding google sheet
    //     // note that this pulls only the next week of events.
    //     const events = await this.fetchOrgEvents(orgAbbrev);
    //     // handle the case where we can't find this org's sheet
    //     if (events == undefined) {
    //         return new MessageEmbed({
    //             description: `A sheet for ${orgAbbrev} doesn't exist, even though it exists in the organization key!`,
    //             color: "RED",
    //         });
    //     }

    //     // At this point, we have our organization configuration and the events themselves.

    //     // split events into their divisions
    //     const ed: any = {};
    //     events.forEach(
    //         (e) =>
    //             (ed[e.division] = ed.hasOwnProperty(e.division)
    //                 ? [...ed[e.division], e]
    //                 : [e])
    //     );

    //     // make the actual embed
    //     let orgEmbed = new MessageEmbed({
    //         title: `📰 __${orgAbbrev}'s Weekly Newsletter__`,
    //         description:
    //             "\n- Respond with a number to RSVP for an event!\n\n- Respond with `unsubscribe` to unsubscribe from the ACM weekly newsletter.\n``",
    //         author: {
    //             name: orgConfig["Full Name"],
    //             iconURL: orgConfig["Logo [URL]"],
    //         },
    //         color: 16738560,
    //         footer: {
    //             text: "Newsletter",
    //         },
    //         fields: Object.keys(ed).map((division: any) => {
    //             let str = "";
    //             ed[division].forEach(
    //                 (e: Event) =>
    //                     (str += `**${e.title}** on \`${
    //                         e.date.toDateString().split(" ")[0]
    //                     } @ ${this.formatAMPM(e.date)}\`\n`)
    //             );
    //             return { name: division, value: str, inline: false };
    //         }),
    //     });

    //     return orgEmbed;
    // }

    /**
     * Builds and returns an announcement embed for a particular org.
     */
    public buildAnnouncement() {}

    /**
     * Formats Date object into `HH:MM AM/PM`, in CST
     */
    // formatAMPM(date: Date): string {
    //     const options = {
    //         timeZone: "America/Chicago",
    //         hour: "numeric",
    //         minute: "numeric",
    //     };
    //     return date.toLocaleString("en-US", options);
    // }

    /**
     * Returns events in the next week for the specified organization, or `undefined` if that sheet cannot be found.
     * @param orgAbbrev name of the sheet to look in
     */
    // async fetchOrgEvents(orgAbbrev: string): Promise<Event[] | undefined> {
    //     const doc = await this.getDoc();
    //     const sheet = doc.sheetsByIndex.find((s) => s.title == orgAbbrev);

    //     // return undefined if there is no sheet with the name in orgAbbrev
    //     if (sheet == undefined) {
    //         return undefined;
    //     }

    //     const rows = await sheet.getRows();
    //     const validRows = rows.filter(
    //         (row: any) =>
    //             row["Start Time"] != undefined && row["Start Time"] != "TBA"
    //     );
    //     const allEvents: Event[] = validRows.map((row: any) => {
    //         return {
    //             title: row["Event Name"],
    //             description: row["Event Description"],
    //             division: row["Team/Division"],
    //             room: row["Room"],
    //             date: new Date(row.Date + " " + row["Start Time"]),
    //         };
    //     });

    //     // filter for only events in the upcoming week
    //     let today = new Date();
    //     const events = allEvents.filter((e) => {
    //         return (
    //             e.date > today &&
    //             e.date <
    //                 new Date(
    //                     today.getFullYear(),
    //                     today.getMonth(),
    //                     today.getDate() + 7
    //                 )
    //         );
    //     });

    //     return events;
    // }

    /**
     * Reads the organization key from Google Sheets and returns a Map of abbreviation -> config data
     */
    // async getOrgMapping(): Promise<Map<string, GoogleSpreadsheetRow>> {
    //     const doc = await this.getDoc();
    //     const sheet = doc.sheetsByIndex.find(
    //         (s) => s.title == "Organization Key"
    //     );

    //     let res = new Map<string, GoogleSpreadsheetRow>();

    //     if (sheet == undefined) {
    //         throw new Error('No sheet called "Organization Key"');
    //     }

    //     const rows = await sheet.getRows();

    //     rows.forEach((row) => {
    //         if (row["Abbr. Name [Same as sheet title]"] != undefined)
    //             res.set(row["Abbr. Name [Same as sheet title]"], row);
    //     });

    //     return res;
    // }

    /**
     * Returns the Google Sheets document object for the events spreadsheet, with info loaded.
     */
    // async getDoc(): Promise<GoogleSpreadsheet> {
    //     // don't bother re-retrieving the metadata if we recently retrieved it
    //     if (
    //         this.doc != undefined &&
    //         new Date().getTime() - this.docCacheTime < this.docCacheThreshold
    //     ) {
    //         console.log(
    //             "A cached version of the newsletter google sheets metadata was used"
    //         );
    //         return this.doc;
    //     }

    //     const doc = new GoogleSpreadsheet(this.spreadsheetId);
    //     doc.useApiKey(settings.keys.sheets);

    //     await doc.loadInfo();
    //     this.doc = doc;
    //     this.docCacheTime = new Date().getTime();

    //     return doc;
    // }
}
