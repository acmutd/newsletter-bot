import Command, { CommandContext } from "../structures/Command";

export default class UnfollowCommand extends Command {
    constructor() {
        super({
            name: "unfollow",
            description: "Unfollow a particular organization",
            usage: ["unfollow [org's abbreviated name (ie. acm)]"],
            dmWorks: true,
        });
    }

    // TODO: Add invalid messages instead of empty returns

    public async exec({ msg, client, args }: CommandContext) {
        if (!args[0]) {
            return this.sendInvalidUsage(msg, client);
        }

        const org = await client.spreadsheet.fetchOrg(args[0]);
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
                {
                    $addToSet: {
                        "preferences.unfollowed": org.localId,
                    },
                },
                { upsert: true }
            )
            .then(() => {
                client.response.emit(
                    msg.channel,
                    `Successfully unfollowed \`${org.abbr}!\``,
                    "success"
                );
            })
            .catch(() => {
                client.response.emit(
                    msg.channel,
                    `Was unable to unfollow ${org.abbr}. Contact developers on the ACM server.\``,
                    "error"
                );
            });
    }
}
