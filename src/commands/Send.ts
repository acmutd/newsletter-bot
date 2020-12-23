import Command, { CommandContext } from "../structures/Command";

export default class SendCommand extends Command {
    constructor() {
        super({
            name: "send",
            description: "test",
            userPermissions: 8,
            dmWorks: true,
        });
    }

    public async exec({ msg, client, args }: CommandContext) {
        client.services.newsletter.send();
    }
}
