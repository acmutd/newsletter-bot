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

        const startTime = (new Date()).getTime();

        msg.channel.send(
            await client.services.newsletter.buildOrgEmbed(args[0])
        );

        msg.channel.send(
            `Preview generated in ${((new Date()).getTime() - startTime)/1000} seconds.`
        )
    }
}
