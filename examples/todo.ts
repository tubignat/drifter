import { start } from '../src/index'
import { TelegramFlow } from '../src/telegram';

const TELEGRAM_TOKEN = '';

start(TELEGRAM_TOKEN, todo(), { debug: true });

type ListItem = {
    text: string;
    check: boolean;
}

function todo(): TelegramFlow<void> {
    const list: ListItem[] = [];

    function renderList() {
        if (list.length === 0) {
            return "Nothing is planned yet. Send any text to add it to the to-do list.";
        }

        const checked = list.filter(item => item.check).map((item) => item.text).join('\n');
        const unchecked = list.filter(item => !item.check).map((item, i) => `/check${i} — ${item.text}`).join('\n');

        return `${checked}\n\n${unchecked}`
    }

    return {
        id: 'todo',
        handler: async (flow) => {
            const message = await flow.prompt();
            if (message.text == null) {
                return;
            }

            if (message.text.startsWith('/check')) {
                const index = Number.parseInt(message.text.replace('/check', ''));
                const item = list.filter(item => !item.check)[index];
                if (item != null) {
                    item.check = true;
                }
            } else if (!message.text.startsWith('/')) {
                list.push({ text: message.text, check: false });
            }

            await flow.send(renderList());
        }
    }
}