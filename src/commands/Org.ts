import { MessageEmbed } from "discord.js";
import { settings } from "../botsettings";
import Command, { CommandContext } from "../structures/Command";

export default class OrgCommand extends Command {
    constructor() {
        super({
            name: "org",
            description:
                "This org command suite is used for managing your newsletter bot org instance!",
            // mods with ["MANAGE_MESSAGE"] i think
            userPermissions: 8208,
        });
    }

    public async exec(ctx: CommandContext) {
        // command suite switch
        switch (ctx.args[0]) {
            case "info":
                const embed = await orgInfo(ctx);
                ctx.msg.channel.send(embed);
                break;
            case "update":
                orgUpdate(ctx);
                break;
            case "announcement":
                orgAnnoucement(ctx, this.name);
                break;
            default:
                ctx.client.response.emit(
                    ctx.msg.channel,
                    "That was an invalid subcommand!`",
                    "invalid"
                );
        }
    }
}

async function orgInfo({ msg, client }: CommandContext): Promise<MessageEmbed> {
    if (client.database.orgFind(msg.guild!.id))
        await client.database.orgAdd({ _id: msg.guild!.id });
    const org = client.database.orgFind(msg.guild!.id);
    const field = (val: any) => `\`\`\`${val ?? "N/A"}\`\`\``;
    return new MessageEmbed({
        author: {
            name: org?.name ?? "N/A",
            url: org?.website,
            icon_url: org?.logo,
        },
        thumbnail: {
            url: org?.logo,
        },
        description:
            "⚠️ Abbreviated Name is used by the bot to lookup your organization's" +
            " events on the Google Sheets, **so make sure it matches your " +
            "worksheet's name!**" +
            "\n\n In order to update a field, type `" +
            settings.prefix +
            "org update [field name]`." +
            "\nThe field names are specified in **square brackets before each field**.",
        fields: [
            {
                name: "[name] 💬 __Name__",
                value: field(org?.name),
            },
            {
                name: "[abbr] 🆔 __Abbreviated Name__",
                value: field(org?.abbr),
            },
            {
                name: "[description] 🖋 __Description__",
                value: field(org?.description),
            },
            {
                name: "[color] 🎨 __Color__",
                value: field(org?.color),
            },
            {
                name: "[logo] ✨ __Logo__",
                value: field(org?.logo),
            },
            {
                name: "[website] 🔗 __Website__",
                value: field(org?.website),
            },
        ],
        color: org?.color,
    });
}

async function orgUpdate({ msg, client, args }: CommandContext) {
    const options = ["name", "abbr", "description", "color", "logo", "website"];
    if (!options.includes(args[1])) {
        client.response.emit(
            msg.channel,
            `That's not a valid option. Please choose the following: \n${options.map(
                (o) => `\`${settings.prefix}org update ${o}\`\n`
            )}`,
            "invalid"
        );
    }

    if (client.database.orgFind(msg.guild!.id))
        await client.database.orgAdd({ _id: msg.guild!.id });
    const org = client.database.orgFind(msg.guild!.id);

    let newOrg: any = { ...org };
    newOrg[args[1]] = args.splice(1).join(" ");
    const success = await client.database.orgUpdate(newOrg);

    if (success) {
        client.response.emit(
            msg.channel,
            `Successfully updated org info!`,
            "success"
        );
    } else
        client.response.emit(
            msg.channel,
            `There was an issue updating org info.`,
            "error"
        );
}

async function orgAnnoucement(ctx: CommandContext, name: string) {
    switch (ctx.args[1]) {
        case "add":
            // add announcement
            break;
        case "remove":
            // remove announcement
            break;
        default:
            ctx.client.response.emit(
                ctx.msg.channel,
                "Follow up `" + name + "` with `add` or `remove.`",
                "invalid"
            );
    }
}
