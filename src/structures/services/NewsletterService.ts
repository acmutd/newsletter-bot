import NewsletterClient from "../Bot";
import { settings } from "../../botsettings";
import {
    Collection,
    GuildMember,
    Message,
    MessageAdditions,
    MessageEmbed,
    Channel,
    DMChannel,
    NewsChannel,
    TextChannel
} from "discord.js";
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
    private enabled = true;

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
        if (!this.enabled) return;
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
        if (!this.enabled) return;
        // recache
        await this.client.spreadsheet.fetchAllOrgs();

        // get org events
        const orgWithEvents: OrgWithEvents[] = []; // Array of org + events
        let eventsToDB: EventData[] = []; // Array of events indexed by rsvp number
        let count = 1; // Tracks the current rsvp number

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
            | { localId: string; abbr: string; embed: MessageEmbed }
        )[] = [];

        // add org embeds
        orgWithEvents.forEach((data) => {
            newsletter.push({
                localId: data.org.localId,
                abbr: data.org.abbr,
                embed: this.buildOrgEmbed(data),
            });
        });

        // add command list embed
        newsletter.push(this.client.services.command.buildDMHelp());

        // everything has been built, time to send out
        const received: Set<string> = new Set<string>(); // set of userIDs, tracked to prevent double-sending to the same user
        const users: Map<string, any> = new Map<string, any>(); // map of userID -> subscription & follow preferences from the DB

        // build `users`
        /*
        try {
            const u = await this.client.database.schemas.member.find({});
            u.forEach((m) =>
                users.set(m["_id"], {
                    subscribed: m.preferences.subscribed,
                    unfollowed: m.preferences.unfollowed
                        ? [...m.preferences.unfollowed]
                        : [],
                })
            );
        } catch (e) {
            this.client.logger.error(e);
        }
        */

        // loop through org guilds and send newsletter to members
        const orgsWithGuild = orgWithEvents.filter((o) => !!o.org.guild);
        for (const data of orgsWithGuild) {
            // resolve newsletter channel
            let channel: TextChannel | NewsChannel | DMChannel | undefined;
            if(data.org.newsletterChannel) {
                const res = await this.client.channels.resolve(data.org.newsletterChannel);
                if (!res) {
                    this.client.error.handleMsg(`Channel not found for ${data.org.abbr}`);
                }
                else if(!res.isText()) {
                    this.client.error.handleMsg(`Channel is not text-based for ${data.org.abbr}`);
                }
                else {
                    channel = res;
                }
            }
            else {
                this.client.error.handleMsg(`Newsletter channel is not configured for ${data.org.abbr}`);
            }
            if (!channel) continue;

            // initialize temporary TOC data for this org
            let tocData: OrgMessage[] = [];

            // send the banner
            await channel.send({
                files: [
                    "https://media.discordapp.net/attachments/744488968338276436/791967343223767060/newsletter_banner.png",
                ],
            });

            // send the rest of the newsletter, one message at a time.
            for (const n of newsletter) {
                // if this is an org-related embed
                if (!(n instanceof MessageEmbed) && n.localId) {
                    const msg = await channel.send(n);
                    // track message in the table of contents
                    tocData.push({
                        orgAbbr: n.abbr,
                        msg
                    });
                } 

                else await channel.send(n);
            }

            await channel.send(this.buildTOC(tocData));

            /*
            // send to the members
            members.forEach(async (m) => {
                // comment out one of the lines below, depending on whether to send the newsletter to people with unknown preference
                if (
                    !received.has(m.id) &&
                    //users.has(m.id) ? users.get(m.id).subscribed : true &&  // defaults to send if user preference not set.
                    users.has(m.id)
                        ? users.get(m.id).subscribed
                        : false && // defaults to do not send if user preference not set
                          !m.user.bot
                ) {
                    received.add(m.id);
                    const dmChannel = await m.createDM();
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
                            if (!users.get(m.id).unfollowed.includes(n.localId)) {  // if user is not unfollowed from this org
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
            */
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
            description:
                `${data.org.description}\n\n` + '',
                // `🎟 Respond with \`${settings.prefix}rsvp [number]\` to RSVP for an event!\n` +
                // `🚪 Respond with \`${settings.prefix}unsubscribe\` to unsubscribe from the ${data.org.abbr} weekly newsletter.\n\n`,
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
            description: tocData
                .map((x, i) => `${i + 1}. [${x.orgAbbr}](${x.msg.url})`)
                .join("\n"),
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
            if (user) {
                user.send(embed);
            }
        } catch (e) {
            this.client.logger.error(e);
        }
    }

    /*
    async handleReactionAdd(reaction: MessageReaction, user: User) {
        // fetch everything to ensure all the data is complete
        if (reaction.partial) await reaction.fetch();
        await reaction.users.fetch();
        const msg = await reaction.message.fetch();

        // resolve user into guild member (so that we can check their roles later)
        const ACMGuild = await this.client.guilds.fetch(settings.guild);
        const member = await ACMGuild.members.fetch(user.id);

        // regex to parse encoded data
        const re = /\[\u200B\]\(http:\/\/fake\.fake\?data=(.*?)\)/;

        // Ignore if the message isn't something we care about
        if (user.id === this.client.user?.id ||                 // bot is the one who reacted
            msg.channel.id !== this.privateChannelId ||         // wrong channel
            msg.author.id !== this.client.user?.id ||           // author is not bot
            !reaction.users.cache.has(this.client.user?.id) ||  // bot check mark react is not there
            reaction.emoji.name !== "✅" ||                     // wrong emote
            msg.embeds.length !== 1 ||                          // # of embeds not 1
            !msg.embeds[0].title ||                             // no title
            !msg.embeds[0].title!.startsWith("Response for") || // wrong title
            !msg.embeds[0].description ||                       // no description
            !re.test(msg.embeds[0].description)                 // desc doesn't contain our embedded data

        )
            return;

        // If reactor is not a mod, remove their reaction and rat them out.
        if (!member.roles.cache.has(this.staffRoleId)) {
            reaction.users.remove(user.id);
            return this.client.response.emit(
                msg.channel,
                `${user}, you are not authorized to approve points!`,
                "invalid"
            )
        }

        // Award the points, clear reactions, react with 🎉, print success
        const encodedData = JSON.parse(decodeURIComponent(msg.embeds[0].description.match(re)![1]))
        this.awardPoints(encodedData.points, encodedData.activity, new Set<string>([encodedData.snowflake]));
        reaction.message.reactions.removeAll()
            .then(() => reaction.message.react("🎉"));

        let embed = new MessageEmbed({
            color: 'GREEN',
            description: `**${user} has approved \`${encodedData.activity}\` for <@${encodedData.snowflake}>!**\n` +
                `[link to original message](${msg.url})`,
        });

        return msg.channel.send(embed);
    }
    */

    /*
        const encodedData = {
            snowflake: userData.snowflake,
            activity: answers[1].choice.label,
            points: pointsToAdd,
        };

        let embed = new MessageEmbed({
            title: `Response for ${userData.full_name}`,
            description: 
                // we'll sneakily hide some data here :)
                `[\u200B](http://fake.fake?data=${encodeURIComponent(JSON.stringify(encodedData))})` +
                `**Discord**: <@${userData.snowflake}>\n` + 
                `**Email**: \`${userData.email}\`\n` +     
                `**Activity**: \`${answers[1].choice.label}\`\n\n` +
                `**Proof**:`,
            footer: {
                text: `${pointsToAdd} points will be awarded upon approval.`
            }
        });
    */
}
