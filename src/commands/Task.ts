import { Guild, GuildMember, User } from 'discord.js';
import Command from '../structures/Command';
import { CommandContext } from '../structures/Command';
import Task from '../structures/managers/ScheduleManager';

export default class TaskCommand extends Command {
    options = {
        timeZone: 'America/Chicago', timeZoneName: 'short',
        year: 'numeric', month: 'numeric', day: 'numeric', 
        hour: 'numeric', minute: 'numeric', second: 'numeric' 
    };

    constructor() {
        super({
            name: 'task',
            description: 'Manipulates tasks',
            longDescription: 'Suite of tools to show and manipulate scheduled tasks.\n' +
               ' List: list tasks, keyed by their ID\n' +
               ' Delay: push a task back by some number of minutes',
            usage: ['task [ list | delay [id] [mins] ]'],
            dmWorks: false,
        });
    }

    public async exec({ msg, client, args }: CommandContext) {
        if (args.length < 1) {
            return this.sendInvalidUsage(msg, client);
        }

        switch (args[0].toLowerCase()) {
            case 'list':
                const tasks = client.scheduler.tasks;
                let embed = {
                    title: `${tasks.size} task${tasks.size != 1 ? 's' : ''}`,
                    fields: [] as any[],
                    footer: {}
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
                            value: `Type: ${value.type}\nNext: ${nextInvokeStr}`
                        });
                    }
                    else {
                        expiredCnt++;
                    }
                }
        
                if (expiredCnt > 0) {
                    embed['footer'] = {
                        text: `${expiredCnt} task${expiredCnt != 1 ? 's' : ''} omitted because already expired`
                    }
                }
        
                return msg.channel.send({embed});
                
            case 'delay':
                // literally all of this is validation and fetching stuff
                if (args.length != 3) return this.sendInvalidUsage(msg, client);

                const id = args[1]
                const mins = +args[2]
                if (isNaN(mins)) return this.sendInvalidUsage(msg, client);

                const task = client.scheduler.getTask(id);

                if (task == undefined) {
                    return client.response.emit(
                        msg.channel,
                        'A task with that ID could not be found!',
                        'invalid'
                    )
                }

                const nextInvokeCronDate = task.job?.nextInvocation();

                if (!nextInvokeCronDate) {
                    return client.response.emit(
                        msg.channel,
                        'This task has already expired.',
                        'invalid'
                    )
                }

                // OKAY validation is done, calculate new date
                const delayedInvoke = new Date(
                    (nextInvokeCronDate as any).toDate().getTime() + mins * 60 * 1000
                );
                task.cron = delayedInvoke;

                console.log(delayedInvoke);
                console.log(nextInvokeCronDate);

                // remove the old one
                await client.scheduler.deleteTask(id);

                // add it with the new time, same ID
                await client.scheduler.createTask(task);

                return client.response.emit(
                    msg.channel,
                    `Task updated! New trigger time is ${delayedInvoke.toLocaleString("en-US", this.options)}`,
                    'success'
                )

            default:
                return this.sendInvalidUsage(msg, client);
        }

        
    }

}