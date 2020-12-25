import { MessageEmbed } from "discord.js";
import Command, { CommandContext } from "../structures/Command";
import { SpreadsheetEvent } from "../structures/managers/SpreadsheetManager";
import { OrgWithEvents } from "../structures/services/NewsletterService"



export default class PreviewCommand extends Command {
    constructor() {
        super({
            name: "preview",
            description: "Display the newsletter for an organization",
            usage: ["preview [org abbrev.]"],
            dmWorks: true,
        });
    }

    public async exec({ msg, client, args }: CommandContext) {
        if (args.length != 1) {
            return client.response.emit(
                msg.channel,
                this.getUsageText(client.settings.prefix),
                "invalid"
            );
        }

        const startTime = new Date().getTime();

        // re-cache
        await client.spreadsheet.fetchAllOrgs();

        const org = client.spreadsheet.orgs.array().find((org) => org.abbr.toLowerCase() == args[0].toLowerCase())

        //console.log(JSON.stringify(client.spreadsheet.orgs.array(), null, 2))

        // error and return if org doesn't exist in the org key (sheet 0)
        if (org == undefined) {
            await client.response.emit(
                msg.channel,
                `The org \`${args[0]}\` could not be found.`
            );
            return;
        }

        let events = await client.spreadsheet.fetchEvents(org.abbr, 7);

        if (events.length < 1) {
            await client.response.emit(
                msg.channel,
                `No events were found for \`${args[0]}\` in the upcoming week.`
            )
        }


        var addedID: SpreadsheetEvent[] = [];
        events.forEach((e, count) => {
            addedID.push({ ...e, id: count+1 });
        });

        events = [...addedID];
        const orgWithEvents: OrgWithEvents = { events, org };
        
        const embed = client.services.newsletter.buildOrgEmbed(orgWithEvents)


        msg.channel.send(embed);

        msg.channel.send(
            new MessageEmbed({
                color: '#EEEEEE',
                description: 'Please **DO NOT RSVP** based on these event numbers. This is purely a preview.',
                footer: {
                    text: `Preview generated in ${
                        (new Date().getTime() - startTime) / 1000
                    } seconds.`
                }
            })
            
        );
    }
}
