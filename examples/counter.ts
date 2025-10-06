import { Message } from 'node-telegram-bot-api';
import { start } from '../src/index'
import { TelegramFlow } from '../src/telegram';

const TELEGRAM_TOKEN = '';

start(
    TELEGRAM_TOKEN,
    [{ command: '/start', description: 'Start a new counter', flow: counter() }],
    { debug: true }
);

function counter(): TelegramFlow<void> {
    return {
        id: 'counter',
        handler: async (flow) => {
            let counter = 0;
            let ui: Message | null = null;

            while (true) {
                ui = await flow.send(`Current value: ${counter}`, {
                    replace: ui?.message_id,
                    buttons: [[
                        { text: 'Increment', callback_data: '/inc' },
                        { text: 'Add 10', callback_data: '/add10' },
                        { text: 'Double', callback_data: '/double' },
                    ]],
                    parseMode: "MarkdownV2"
                });

                const callback = await flow.callback();
                if (callback.data === '/inc') {
                    counter++;
                } else if (callback.data === '/add10') {
                    counter += 10;
                } else if (callback.data === '/double') {
                    counter *= 2;
                }
            }
        }
    }
}