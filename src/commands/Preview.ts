import Command, { CommandContext } from "../structures/Command";

export default class PreviewCommand extends Command {
    constructor() {
        super({
            name: "preview",
            description: "Display the newsletter for an organization",
            usage: ['preview [org abbrev.]'],
            dmWorks: true,
        });
    }

    public async exec({ msg, client, args }: CommandContext) {
        if (args.length != 1) {
            return client.response.emit(
                msg.channel,
                this.getUsageText(client.settings.prefix),
                'invalid'
            )
        }

        msg.channel.send(
            await client.services.newsletter.buildOrgEmbed(args[0])
        );
    }
}
