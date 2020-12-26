import { Message, MessageEmbed } from "discord.js";
import { settings } from "../botsettings";
import Command, { CommandContext } from "../structures/Command";
const isUrl = require("is-url");

export default class InfoCommand extends Command {
    constructor() {
        super({
            name: "info",
            description: "Display information about a particular event!",
            usage: ["info [event number]"],
            dmWorks: true,
        });
    }

    // TODO: Add invalid messages instead of empty returns

    public async exec({ msg, client, args }: CommandContext) {
        if (!args[0]) {
            client.response.emit(
                msg.channel,
                `You need to add the appropriate arguments: \`${this.usage[0]}\``,
                "invalid"
            );
            return;
        }
        if (!parseInt(args[0])) {
            client.response.emit(
                msg.channel,
                `The first argument needs to be a number: \`${this.usage[0]}\``,
                "invalid"
            );
            return;
        }

        const e = client.database.cache.events.get(args[0]);
        if (!e) {
            client.response.emit(
                msg.channel,
                `There is no event associated with that number this week.`,
                "invalid"
            );
            return;
        }
        const org = await client.spreadsheet.fetchOrg(e.abbr);
        if (!org) {
            client.response.emit(
                msg.channel,
                `Could not find a corresponding org with this event.`,
                "error"
            );
            return;
        }

        const embed = new MessageEmbed({
            description: `🎟 To RSVP for this event, send the command \`${settings.prefix}rsvp ${e.event.id}\``,
            image: { url: e.event.posterUrl },
            color: org.color,
            author: {
                name: `${e.event.name} | ${org.abbr} Event Info`,
                icon_url: org.logo,
                url: org.website,
            },
            footer: {
                text: `Powered by Newsletter Bot`,
                iconURL: client.user!.avatarURL() as string,
            },
        });

        // add the fields
        embed.addField("__**Name**__", e.event.name);

        if (e.event.description)
            embed.addField("__**Details**__", e.event.description);

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

        if (e.event.team)
            embed.addField("__**Team/Division**__", e.event.team, true);
        if (e.event.location)
            embed.addField("__**Location**__", e.event.location, true);
        if (e.event.speaker)
            embed.addField("__**Host(s)**__", e.event.speaker, true);
        if (e.event.speakerContact)
            embed.addField(
                "__**Host(s) Contact**__",
                e.event.speakerContact,
                true
            );

        // check if poster url legit
        if (isUrl(e.event.posterUrl)) embed.setImage(e.event.posterUrl);

        msg.channel.send(embed);
    }
}
