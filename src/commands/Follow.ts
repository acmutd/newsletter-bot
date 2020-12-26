import Command, { CommandContext } from "../structures/Command";

export default class FollowCommand extends Command {
    constructor() {
        super({
            name: "follow",
            description: "Follow a particular organization",
            usage: ["follow [org's abbreviated name (ie. acm)]"],
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

        const org = await client.spreadsheet.fetchOrg(args[0].toLowerCase());
        if (!org) {
            client.response.emit(
                msg.channel,
                `Could not find an org with that name!`,
                "invalid"
            );
            return;
        }

        client.database.schemas.member
            .update(
                { _id: msg.author.id },
                { $pull: { "preferences.unfollowed": args[0].toLowerCase() } },
                { upsert: true }
            )
            .then(() => {
                client.response.emit(
                    msg.channel,
                    `Successfully followed the ${args[0].toUpperCase()} org!\``,
                    "success"
                );
            })
            .catch(() => {
                client.response.emit(
                    msg.channel,
                    `Was unable to follow the ${args[0].toUpperCase()} org. Contact developers on the ACM server.\``,
                    "error"
                );
            });
    }
}
