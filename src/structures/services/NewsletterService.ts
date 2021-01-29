import NewsletterClient from "../Bot";
import { settings } from "../../botsettings";
import {
    Message,
    MessageEmbed,
    DMChannel,
    NewsChannel,
    TextChannel,
    MessageReaction,
    User,
    GuildEmoji,
} from "discord.js";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { SpreadsheetOrg, SpreadsheetEvent } from "../managers/SpreadsheetManager";
import { EventData } from "../models/Event";
const isUrl = require("is-url");

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

        // clear existing rsvps
        this.client.scheduler.clearTasks("rsvp_reminder");

        // emoji guild
        const emojiGuild = await this.client.guilds.fetch(settings.emojiGuild);

        // recache
        await this.client.spreadsheet.fetchAllOrgs();

        // get org events
        const orgsWithEvents: OrgWithEvents[] = []; // Array of org + events
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
                orgsWithEvents.push({ events, org });
            }
        }

        // update the db
        try {
            await this.client.database.eventAddNewList(eventsToDB);
        } catch (e) {
            this.client.logger.error(e);
        }

        // initialize newsletter as an array of messages after the banner
        const newsletter: (MessageEmbed | { localId: string; abbr: string; embed: MessageEmbed })[] = [];

        // add org embeds
        orgsWithEvents.forEach((data) => {
            newsletter.push({
                localId: data.org.localId,
                abbr: data.org.abbr,
                embed: this.buildOrgEmbed(data),
            });
        });

        // add command list embed
        newsletter.push(this.generateHelp());

        // everything has been built, time to send out

        // loop through org guilds and send newsletter to members
        const orgsWithGuild = orgsWithEvents.filter((o) => !!o.org.guild);

        console.log(orgsWithGuild);

        for (const data of orgsWithGuild) {
            try {
                console.log("starting w " + data.org.abbr);
                // resolve newsletter channel
                let channel: TextChannel | NewsChannel | DMChannel | undefined;

                if (data.org.newsletterChannel) {
                    const res = await this.client.channels.resolve(data.org.newsletterChannel);
                    if (!res) this.client.error.handleMsg(`Channel not found for ${data.org.abbr}`);
                    channel = res as TextChannel | NewsChannel | DMChannel;
                } else {
                    this.client.error.handleMsg(`Newsletter channel is not configured for ${data.org.abbr}`);
                }
                if (!channel) continue;

                // initialize temporary TOC data for this org
                let tocData: OrgMessage[] = [];

                console.log("sending banner for " + data.org.abbr);
                // send the banner
                await channel.send({
                    files: [
                        // "https://media.discordapp.net/attachments/744488968338276436/791967343223767060/newsletter_banner.png",
                        "https://cdn.discordapp.com/attachments/744488968338276434/804190590682005554/newsletter-banner.png",
                    ],
                });

                // send the rest of the newsletter, one message at a time.
                for (const n of newsletter) {
                    // if this is an org-related embed
                    let msg;
                    let embed: MessageEmbed;
                    if (!(n instanceof MessageEmbed) && n.localId) {
                        msg = await channel.send(n.embed);
                        embed = n.embed;
                        // track message in the table of contents
                        tocData.push({
                            orgAbbr: n.abbr,
                            msg,
                        });
                    } else {
                        msg = await channel.send(n);
                        embed = n as MessageEmbed;
                    }
                    const obj = decode(embed.description);
                    if (obj) {
                        const keys = Object.keys(obj.reactions);
                        for (const name of keys) {
                            const emote = emojiGuild.emojis.cache.find((e) => e.name == name);
                            if (emote) await msg.react(emote);
                        }
                    }
                }

                await channel.send(this.buildTOC(tocData));

                if (data.org.pingEveryone) await channel.send(`@everyone 📰 ECS Weekly Newsletter has arrived!`);
            } catch (e) {
                this.client.error.handleMsg(`Error in sending newsletter to ${data.org.name}: ${e}`);
            }
        }
        this.schedule();
    }

    public buildOrgEmbed(data: OrgWithEvents): MessageEmbed {
        const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

        /*
        schema for encodedData:
        {
            newsletter: true,
            reactions: {
                emojiId: number | string,
            },
            abbr: "ACM",
        }

        functions:
        - handleNewsletterReact()
            - encode(orgWithEvents)
            - decode(data)
    */
        const encodedData: {
            newsletter: boolean;
            reactions: any;
        } = {
            newsletter: true,
            reactions: {
                // _info: data.org.localId,
            },
        };

        data.events.forEach((e) => {
            encodedData.reactions[`_${e.id}`] = e.id;
        });

        return new MessageEmbed({
            title: data.org.name,
            description: `${encode(encodedData)}` + `${data.org.description}\n\n` + "",
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
            description: tocData.map((x, i) => `${i + 1}. [${x.orgAbbr}](${x.msg.url})`).join("\n"),
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
        embed.setTitle(`\'${e.event.name}\' is starting in ${minutesBeforeStart} minutes!`);
        embed.setDescription(e.event.rsvpMessage);
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

    public async handleReactionRemove(reaction: MessageReaction, user: User) {
        // fetch everything to ensure all the data is complete
        if (reaction.partial) await reaction.fetch();
        await reaction.users.fetch();

        if (reaction.message.embeds.length == 0) return;
        if (!reaction.message.embeds[0].description) return;

        const obj = decode(reaction.message.embeds[0].description);
        if (!obj) return;
        if (!obj.newsletter) return;
        if (!obj.reactions) return;

        let reactionRes: number | string | undefined;

        Object.keys(obj.reactions).forEach((n) => {
            if (reaction.emoji.name.includes(n)) reactionRes = obj.reactions[n];
        });

        if (!reactionRes) return;
        if (user.bot) return;

        if (reaction.emoji.name == "_rsvp") {
            // rsvp to event
            user.createDM().then((channel) => {
                this.unrsvp(channel, user, reactionRes as number);
            });
        }
    }

    public async handleReactionAdd(reaction: MessageReaction, user: User) {
        // fetch everything to ensure all the data is complete
        if (reaction.partial) await reaction.fetch();
        await reaction.users.fetch();

        if (reaction.message.embeds.length == 0) return;
        if (!reaction.message.embeds[0].description) return;

        const obj = decode(reaction.message.embeds[0].description);
        if (!obj) return;
        if (!obj.newsletter) return;
        if (!obj.reactions) return;

        let reactionRes: number | string | undefined;

        Object.keys(obj.reactions).forEach((n) => {
            if (reaction.emoji.name.includes(n)) reactionRes = obj.reactions[n];
        });

        if (!reactionRes) return;
        if (user.bot) return;

        if (reaction.emoji.name == "_rsvp") {
            // rsvp to event
            user.createDM().then((channel) => {
                this.rsvp(channel, user, reactionRes as number);
            });
        }
        // else if (reaction.emoji.name == "_info") {
        //     // dm org info
        //     user.createDM().then((channel) => {
        //         // this.sendOrgInfo(channel);
        //         // this.buildOrgEmbed()
        //     });
        // }
        else {
            if (typeof reactionRes == "number") {
                // remove their reaction
                reaction.users.remove(user.id);

                // dm event info, with reaction button to rsvp
                user.createDM().then((channel) => {
                    this.sendEventInfo(channel, reactionRes as number);
                });
            }
        }
    }

    public async sendEventInfo(channel: TextChannel | DMChannel | NewsChannel, id: number) {
        const emojiGuild = await this.client.guilds.fetch(settings.emojiGuild);
        let rsvpEmote: GuildEmoji | string | undefined = emojiGuild.emojis.cache.find((e) => e.name == "_rsvp");

        if (!rsvpEmote) rsvpEmote = "🎟";

        // get event
        const e = this.client.database.cache.events.get(`${id}`);
        if (!e) {
            this.client.response.emit(channel, `There is no event associated with that number this week.`, "invalid");
            return;
        }
        const org = await this.client.spreadsheet.fetchOrg(e.abbr.toLowerCase());
        if (!org) {
            this.client.response.emit(channel, `Could not find a corresponding org with this event.`, "error");
            return;
        }

        const encodedData = {
            newsletter: true,
            reactions: {
                _rsvp: id,
            },
        };

        const embed = new MessageEmbed({
            description: `${encode(encodedData)}🎟 To RSVP for this event, either react to ${
                typeof rsvpEmote == "string" ? rsvpEmote : `<:${rsvpEmote.name}:${rsvpEmote.id}>`
            }, or send the command \`${settings.prefix}rsvp ${e.event.id}\``,
            image: { url: e.event.posterUrl },
            color: org.color,
            author: {
                name: `${e.event.name} | ${org.abbr} Event Info`,
                icon_url: org.logo,
                url: org.website,
            },
            footer: {
                text: `Powered by Newsletter Bot`,
                iconURL: this.client.user!.avatarURL() as string,
            },
        });

        // add the fields
        embed.addField("__**Name**__", e.event.name);

        const desc = e.event.description;
        if (desc) embed.addField("__**Details**__", desc.length > 1000 ? desc.substr(0, 1000) + "…" : desc);

        embed.addField(
            "__**Date**__",
            `\`${e.event.start?.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
            })}\` at \`${e.event.start?.toLocaleString("en-US", {
                hour: "numeric",
                minute: "numeric",
                hour12: true,
            })}\``
        );

        if (e.event.team) embed.addField("__**Team/Division**__", e.event.team, true);
        if (e.event.location) embed.addField("__**Location**__", e.event.location, true);
        if (e.event.speaker) embed.addField("__**Host(s)**__", e.event.speaker, true);
        if (e.event.speakerContact) embed.addField("__**Host(s) Contact**__", e.event.speakerContact, true);

        // check if poster url legit
        if (isUrl(e.event.posterUrl)) embed.setImage(e.event.posterUrl);

        const msg = await channel.send(embed);

        if (rsvpEmote) await msg.react(rsvpEmote);
    }

    public async sendOrgInfo(channel: TextChannel | DMChannel | NewsChannel) {}

    public async unrsvp(channel: TextChannel | DMChannel | NewsChannel, user: User, id: number) {
        const e = this.client.database.cache.events.get(`${id}`);

        if (!e) {
            this.client.response.emit(channel, `There is no event associated with that number this week.`, "invalid");
            return;
        }

        const minutesBeforeStart = 30;
        const toBeNotified = new Date(e.event.start!.getTime() - minutesBeforeStart * 60000);
        const now = new Date();
        if (toBeNotified < now) {
            if (e.event.start! < now) {
                this.client.response.emit(channel, `This event has already started!`, "invalid");
            } else {
                this.client.response.emit(
                    channel,
                    `This event is already starting within ${minutesBeforeStart} minutes\n\n
                    ${e.event.rsvpMessage}
                    `,
                    "invalid"
                );
            }
            return;
        }
        const res = this.client.scheduler.tasks.find((t) => {
            if (t.payload && t.payload.eventID && t.payload.userID) {
                return t.payload.eventID == `${id}` && t.payload.userID == `${user.id}`;
            }
            return false;
        });
        if (!res) {
            this.client.response.emit(channel, `You have not RSVP'd for \`${e.event.name}\`.`, "invalid");
            return;
        }

        this.client.scheduler.deleteTask(res.id!);

        this.client.response.emit(channel, `Successfully un-RSVP'd for \`${e.event.name}\`.`, "success");
    }

    public async rsvp(channel: TextChannel | DMChannel | NewsChannel, user: User, id: number) {
        const e = this.client.database.cache.events.get(`${id}`);

        if (!e) {
            this.client.response.emit(channel, `There is no event associated with that number this week.`, "invalid");
            return;
        }

        const minutesBeforeStart = 30;
        const toBeNotified = new Date(e.event.start!.getTime() - minutesBeforeStart * 60000);
        const now = new Date();
        if (toBeNotified < now) {
            if (e.event.start! < now) {
                this.client.response.emit(channel, `This event has already started!`, "invalid");
            } else {
                this.client.response.emit(
                    channel,
                    `This event is already starting within ${minutesBeforeStart} minutes\n\n
                    ${e.event.rsvpMessage}
                    `,
                    "invalid"
                );
            }
            return;
        }
        const res = this.client.scheduler.tasks.find((t) => {
            if (t.payload && t.payload.eventID && t.payload.userID) {
                return t.payload.eventID == `${id}` && t.payload.userID == `${user.id}`;
            }
            return false;
        });
        if (res) {
            this.client.response.emit(channel, `You have already RSVP'd for \`${e.event.name}\`.`, "invalid");
            return;
        }

        this.client.scheduler.createTask({
            type: "rsvp_reminder",
            payload: {
                eventID: id.toString(),
                userID: user.id,
                minutesBeforeStart,
            },
            cron: new Date(e.event.start!.getTime() - minutesBeforeStart * 60000),
        });

        this.client.response.emit(channel, `Successfully RSVP'd for \`${e.event.name}\`.`, "success");
    }

    public generateHelp() {
        const embed = new MessageEmbed({
            title: "Newsletter Help",
        });
        embed.addField(
            `<:_1:803215905190445066> \`or any other number\``,
            "The number corresponds to an event on the newsletter. If you click it, I will private messages you more information about the event.",
            true
        );

        return embed;
    }
}

function encode(obj: any): string {
    return `[\u200B](http://fake.fake?data=${encodeURIComponent(JSON.stringify(obj))})`;
}

function decode(description: string | null): any {
    if (!description) return;
    const re = /\[\u200B\]\(http:\/\/fake\.fake\?data=(.*?)\)/;
    const matches = description.match(re);
    if (!matches || matches.length < 2) return;
    return JSON.parse(decodeURIComponent(description.match(re)![1]));
}
