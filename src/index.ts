import TelegramBot from "node-telegram-bot-api";
import { run, TelegramFlow, TelegramFlowEvent } from "./telegram";
import { saveStateForDebug, startDebugServer } from "./debug";

export function start(
    tgToken: string,
    flow: { command: string, description: string, flow: TelegramFlow<void> }[] | TelegramFlow<void>,
    options?: {
        debug?: boolean,
        storage?: {
            getFlowState: (chatId: string) => Promise<string | null>,
            saveFlowState: (chatId: string, state: string | null) => Promise<void>
        }
    }
) {
    const telegram = new TelegramBot(tgToken, { polling: true });
    const storage = options?.storage ?? inMemoryStorage();
    const root = Array.isArray(flow) ? rootFlow(flow) : flow;

    if (options?.debug === true) {
        startDebugServer();
    }

    async function handle(userId: string, event: TelegramFlowEvent) {
        try {
            const state = await storage.getFlowState(userId);
            const updated = await run(telegram, root, event, state, options?.debug);
            if (updated.error != null) {
                console.error(updated.error.stack);
            }

            await storage.saveFlowState(userId, updated.executed ? null : JSON.stringify(updated));

            if (options?.debug === true) {
                saveStateForDebug(updated);
            }

            if (event.type === 'callback') {
                const response = updated.error != null ? { text: "Something went wrong", show_alert: true } : undefined;
                await telegram.answerCallbackQuery(event.id, response);
            }
        } catch (error: any) {
            console.error('Error while processing event:', error.stack);
        }
    }

    if (Array.isArray(flow)) {
        telegram.setMyCommands(flow);
    }

    telegram.on('edited_message', async (msg) => {
        const userId = msg.from?.id?.toString();
        if (userId == null) {
            return;
        }

        console.log(`Edit message from ${userId}`)
        await handle(userId, { type: 'edit', ...msg });
    });

    telegram.on('message', async (msg) => {
        const userId = msg.from?.id?.toString();
        if (userId == null) {
            return;
        }
        const text = msg.text ?? msg.caption ?? '';
        console.log(`Message from ${userId}: ${text.slice(0, 50)}`)

        await handle(userId, { type: 'message', ...msg });
    });

    telegram.on("callback_query", async (query) => {
        const userId = query.from?.id?.toString();
        if (userId == null) {
            return;
        }

        console.log(`Callback query from ${userId}: ${query.message?.text}`)
        await handle(userId, { type: 'callback', ...query });
    });
}

function inMemoryStorage() {
    const map: { [key: string]: string } = {};
    return {
        getFlowState: async (chatId: string) => {
            return map[chatId] ?? null;
        },
        saveFlowState: async (chatId: string, state: string | null) => {
            if (state == null) {
                delete map[chatId];
            } else {
                map[chatId] = state;
            }
        }
    }
}

function rootFlow(commands: { command: string, description: string, flow: TelegramFlow<void> }[]): TelegramFlow<void> {
    return {
        id: 'root',
        handler: async (flow) => {
            const event = flow.intercept();
            if (event.type === 'message' && event.text != null && commands.find(c => c.command === event.text) != null) {
                flow.reset();
            }

            const message = await flow.prompt();
            const command = commands.find(c => c.command === message.text);
            if (command != null) {
                return await flow.subflow(command.flow);
            }
        }
    }
}