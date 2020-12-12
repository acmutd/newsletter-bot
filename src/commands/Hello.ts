import Command, { CommandContext } from "../structures/Command";

export default class HelloCommand extends Command {
    constructor() {
        super({
            name: "hello",
            description: "test",
            dmWorks: true,
        });
    }

    public async exec({ msg, client, args }: CommandContext) {
        msg.channel.send("hello!");
    }
}
