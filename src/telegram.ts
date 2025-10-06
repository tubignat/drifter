import TelegramBot, { CallbackQuery, InlineKeyboardButton, Message, MessageEntity, ParseMode } from "node-telegram-bot-api";
import { execute, FlowRunCore, FlowRunCoreImpl, FlowState } from "./core";

export type MessageContent = {
    text: string,
    textEntities: MessageEntity[],
    photo?: string, // fileId
}

export type TelegramFlow<T> = {
    id: string,
    handler: (flow: TelegramFlowRun) => Promise<T>
}

export type TelegramFlowEvent =
    | { type: 'message' } & TelegramBot.Message
    | { type: 'callback' } & TelegramBot.CallbackQuery
    | { type: 'edit' } & TelegramBot.Message

export interface TelegramFlowRun extends FlowRunCore<TelegramFlowEvent> {
    bot(): TelegramBot
    chat(): number
    send(content: string | MessageContent, options?: { replace?: number, reply?: number, buttons?: InlineKeyboardButton[][], parseMode?: ParseMode, disableWebPagePreview?: boolean }): Promise<Message>;
    delete(messageId: number): Promise<void>
    input(options?: { message?: string, delete?: boolean, watch?: boolean }): Promise<Message | CallbackQuery>
    prompt(options?: { message?: string, delete?: boolean, watch?: boolean }): Promise<Message>
    callback(options?: { message?: string }): Promise<CallbackQuery>
    memo<T>(func: () => Promise<T>): Promise<T>
}

export async function run(
    bot: TelegramBot,
    root: TelegramFlow<void>,
    event: TelegramFlowEvent,
    state: string | null,
    debug?: boolean
): Promise<FlowState> {
    if (event.from?.id == null) {
        throw new Error('Could not find chat id');
    }

    return await execute(new TelegramFlowRunImpl(bot, event.from.id, event, state, debug), root);
}


export class TelegramFlowRunImpl extends FlowRunCoreImpl<TelegramFlowEvent> {
    private telegramBot: TelegramBot;
    private chatId: number;

    constructor(bot: TelegramBot, chatId: number, event: TelegramFlowEvent, state: string | null, debug?: boolean) {
        super(event, state, debug);
        this.telegramBot = bot;
        this.chatId = chatId;
    }

    bot(): TelegramBot {
        return this.telegramBot;
    }

    chat(): number {
        return this.chatId;
    }

    async memo<T>(func: () => Promise<T>): Promise<T> {
        return this.subflow({ id: 'memo', handler: func });
    }

    async send(content: string | MessageContent, options?: {
        replace?: number, reply?: number, buttons?: InlineKeyboardButton[][],
        parseMode?: ParseMode, disableWebPagePreview?: boolean
    }): Promise<Message> {
        return this.subflow(send(content, options));
    }

    async delete(messageId: number) {
        await this.subflow({ id: 'delete', handler: () => this.telegramBot.deleteMessage(this.chatId, messageId) });
    }

    async input(options?: { message?: string, delete?: boolean, watch?: boolean, awaitEvents?: string[] }): Promise<Message | CallbackQuery> {
        const result = await this.subflow({
            id: 'input',
            handler: async (flow) => {
                if (options?.message != null) {
                    await this.send(options.message);
                }

                const awaitedEvents = options?.awaitEvents ?? ['callback', 'message'];

                const event = flow.consume();
                if (!awaitedEvents.includes(event.type)) {
                    flow.interrupt();
                }

                if (event.type === 'message' && options?.delete === true) {
                    await this.telegramBot.deleteMessage(event.chat.id, event.message_id);
                }

                return event;
            }
        });

        if (result.type === 'callback' || options?.watch !== true) {
            return result;
        }

        const ev = this.intercept();
        if (ev.type === 'edit' && ev.message_id === result.message_id) {
            this.set(`edited-message-${result.message_id}`, JSON.stringify(ev));
            this.interrupt();
        }

        const saved = this.get(`edited-message-${result.message_id}`);
        return saved == null ? result : JSON.parse(saved) as Message;
    }

    async prompt(options?: { message?: string, delete?: boolean, watch?: boolean }): Promise<Message> {
        return await this.input({ ...options, awaitEvents: ['message'] }) as Message;
    }

    async callback(options?: { message?: string }): Promise<CallbackQuery> {
        return await this.input({ ...options, awaitEvents: ['callback'] }) as CallbackQuery;
    }
}

function send(content: string | MessageContent, options?: {
    replace?: number, reply?: number, buttons?: InlineKeyboardButton[][],
    parseMode?: TelegramBot.ParseMode, disableWebPagePreview?: boolean,
}): TelegramFlow<Message> {
    return {
        id: 'send',
        handler: async (flow) => {
            if (options?.replace != null) {
                return editMessage(flow.bot(), flow.chat(), content, options.replace, options.buttons, options.parseMode, options.disableWebPagePreview);
            }

            if (typeof content === 'string' || content.photo == null) {
                const text = typeof content === 'string' ? content : content.text;
                const entities = typeof content === 'string' ? undefined : content.textEntities;

                return await flow.bot().sendMessage(flow.chat(), text, {
                    reply_to_message_id: options?.reply, parse_mode: options?.parseMode, entities,
                    reply_markup: { inline_keyboard: options?.buttons ?? [] },
                    disable_web_page_preview: options?.disableWebPagePreview
                });
            }

            return await flow.bot().sendPhoto(flow.chat(), content.photo, {
                caption: content.text, caption_entities: content.textEntities, reply_to_message_id: options?.reply,
                parse_mode: options?.parseMode, reply_markup: { inline_keyboard: options?.buttons ?? [] },
            })
        }
    }
}

async function editMessage(
    bot: TelegramBot,
    chatId: TelegramBot.ChatId,
    content: string | MessageContent,
    replace: number,
    buttons?: InlineKeyboardButton[][],
    parseMode?: TelegramBot.ParseMode,
    disableWebPagePreview?: boolean,
) {
    if (typeof content === 'string' || content.photo == null) {
        const text = typeof content === 'string' ? content : content.text;
        const entities = typeof content === 'string' ? undefined : content.textEntities;

        try {
            const result = await bot.editMessageText(text, {
                chat_id: chatId, message_id: replace, parse_mode: parseMode,
                // @ts-ignore
                entities: entities, reply_markup: { inline_keyboard: buttons ?? [] },
                disable_web_page_preview: disableWebPagePreview
            });

            if (typeof result === 'boolean') {
                throw new Error('editMessageText returned boolean: likely editing an inline message, which is not supported here.');
            }

            return result;
        } catch (error: any) {
            if (typeof error?.message === 'string' && error.message.includes('400 Bad Request: there is no text in the message to edit')) {
                await bot.deleteMessage(chatId, replace);
                return await bot.sendMessage(chatId, text, {
                    entities, parse_mode: parseMode, reply_markup: { inline_keyboard: buttons ?? [] },
                    disable_web_page_preview: disableWebPagePreview
                });
            }

            if (typeof error?.message === 'string' && error.message.includes('400 Bad Request: message is not modified')) {
                return { message_id: replace, date: 1, chat: { id: chatId, type: 'private' } } as TelegramBot.Message;
            }

            throw error;
        }
    }

    try {
        const result = await bot.editMessageMedia(
            { type: 'photo', media: content.photo, caption: content.text, caption_entities: content.textEntities },
            { chat_id: chatId, message_id: replace, reply_markup: { inline_keyboard: buttons ?? [] } }
        );

        if (typeof result === 'boolean') {
            throw new Error('editMessageText returned boolean: likely editing an inline message, which is not supported here.');
        }

        return result;
    } catch (error: any) {
        if (typeof error?.message === 'string' && error.message.includes('400 Bad Request: message is not modified')) {
            return { message_id: replace, date: 1, chat: { id: chatId, type: 'private' } } as TelegramBot.Message;
        }

        throw error;
    }
}