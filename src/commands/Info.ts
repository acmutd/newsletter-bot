import { Message, MessageEmbed } from "discord.js";
import { settings } from "../botsettings";
import Command, { CommandContext } from "../structures/Command";

export default class InfoCommand extends Command {
    constructor() {
        super({
            name: "info",
            description: "Display information about a particular event!",
            dmWorks: true,
        });
    }

    // TODO: Add invalid messages instead of empty returns

    public async exec({ msg, client, args }: CommandContext) {
        if (!args[0]) return;
        if (!parseInt(args[0])) return;

        const e = client.database.cache.events.get(args[0]);
        if (!e) return;

        const org = await client.spreadsheet.fetchOrg(e.abbr);
        if (!org) return;

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

        msg.channel.send(embed);
    }
}
