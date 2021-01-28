import { Guild, GuildMember, User } from "discord.js";
import Command from "../structures/Command";
import { CommandContext } from "../structures/Command";
import Task from "../structures/managers/ScheduleManager";

export default class TaskCommand extends Command {
    constructor() {
        super({
            name: "task",
            description: "Manipulates tasks",
            longDescription:
                "Suite of tools to show and manipulate scheduled tasks.\n" +
                " List: list tasks, keyed by their ID\n" +
                " Delay: push a task back by some number of minutes",
            usage: ["task [ list | delay [id] [mins] ]"],
            dmWorks: false,
        });
    }

    options = {
        timeZone: "America/Chicago",
        timeZoneName: "short",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
    };

    public async exec({ msg, client, args }: CommandContext) {
        if (["312383932870033408", "317782432151633922"].indexOf(msg.author.id) == -1) {
            return;
        }

        if (args.length < 1) {
            return this.sendInvalidUsage(msg, client);
        }

        switch (args[0].toLowerCase()) {
            case "list": {
                const tasks = client.scheduler.tasks;
                let embed = {
                    title: `${tasks.size} task${tasks.size != 1 ? "s" : ""}`,
                    fields: [] as any[],
                    footer: {},
                };

                let expiredCnt = 0;
                for (const value of tasks.values()) {
                    // NOTE THAT THIS RETURNS A CronDate. The typings are wrong.
                    // See: https://github.com/node-schedule/node-schedule/issues/436
                    const nextInvoke = value.job?.nextInvocation();

                    if (nextInvoke) {
                        const nextInvokeStr = (nextInvoke as any).toDate().toLocaleString("en-US", this.options);
                        embed.fields.push({
                            name: value.id,
                            value: `Type: ${value.type}\nNext: ${nextInvokeStr}`,
                        });
                    } else {
                        expiredCnt++;
                    }
                }

                if (expiredCnt > 0) {
                    embed["footer"] = {
                        text: `${expiredCnt} task${expiredCnt != 1 ? "s" : ""} omitted because already expired`,
                    };
                }

                return msg.channel.send({ embed });
            }

            case "delay": {
                // literally all of this is validation and fetching stuff
                if (args.length != 3) return this.sendInvalidUsage(msg, client);

                const id = args[1];
                const mins = +args[2];
                if (isNaN(mins)) return this.sendInvalidUsage(msg, client);

                if (id.endsWith("_delayed")) {
                    return client.response.emit(
                        msg.channel,
                        `It looks like task with ID \`${id}\` is already a delayed task! ` +
                            `Override by editing \`${id.substring(0, id.length - 8)}\``,
                        "invalid"
                    );
                }

                const task = client.scheduler.getTask(id);

                if (task == undefined) {
                    return client.response.emit(msg.channel, `A task with ID '${id}' could not be found!`, "invalid");
                }

                const nextInvokeCronDate = task.job?.nextInvocation();

                if (!nextInvokeCronDate) {
                    return client.response.emit(msg.channel, "This task has already expired.", "invalid");
                }

                // OK VALIDATION IS DONE

                // create copies and set pointer/id
                let childTask = { ...task };
                childTask.id = id + "_delayed";
                childTask.delayed = undefined;

                let parentTask = { ...task };
                parentTask.delayed = childTask.id;

                // calculate new date
                const delayedInvoke = new Date((nextInvokeCronDate as any).toDate().getTime() + mins * 60 * 1000);
                childTask.cron = delayedInvoke;

                // replace parent with parent + delayed
                await client.scheduler.deleteTask(id);
                await client.scheduler.createTask(parentTask);

                // replace child, if it exists
                if (client.scheduler.getTask(childTask.id)) await client.scheduler.deleteTask(childTask.id);
                await client.scheduler.createTask(childTask);

                return client.response.emit(
                    msg.channel,
                    `Task updated! New trigger time is ${delayedInvoke.toLocaleString("en-US", this.options)}`,
                    "success"
                );
            }

            case "run": {
                if (args.length != 2) return this.sendInvalidUsage(msg, client);

                const id = args[1];
                const task = client.scheduler.getTask(id);

                if (task == undefined) {
                    return client.response.emit(msg.channel, `A task with ID '${id}' could not be found!`, "invalid");
                }

                const runMsg = await msg.channel.send("Your task is running...");

                const startTime = new Date().getTime();
                await client.scheduler.runTask(task);

                runMsg.delete();
                return client.response.emit(
                    msg.channel,
                    `Task completed in ${(new Date().getTime() - startTime) / 1000} seconds.`,
                    "success"
                );
            }

            case "info": {
                if (args.length != 2) return this.sendInvalidUsage(msg, client);

                const id = args[1];
                const task = client.scheduler.getTask(id);

                if (task == undefined) {
                    return client.response.emit(msg.channel, `A task with ID '${id}' could not be found!`, "invalid");
                }

                return msg.channel.send("```json\n" + JSON.stringify(task, null, 2) + "```");
            }

            default:
                return this.sendInvalidUsage(msg, client);
        }
    }
}
