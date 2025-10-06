import { InlineKeyboardButton } from 'node-telegram-bot-api';
import { start } from '../src/index'
import { TelegramFlow } from '../src/telegram';

const TELEGRAM_TOKEN = '';

start(
    TELEGRAM_TOKEN,
    [
        { command: '/new', description: 'Start a new game', flow: blackjack() },
        { command: '/stats', description: 'Show play statistics', flow: stats() },
    ],
    { debug: true }
);

type Card = {
    suit: '♠️' | '♥️' | '♦️' | '♣️';
    value: 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
};

function blackjack(): TelegramFlow<void> {
    return {
        id: 'blackjack',
        handler: async (flow) => {
            const ui = await flow.send("Starting a new game...");
            const deck = await flow.memo(async () => createRandomlyShuffledDeck());

            const update = async (content: string, buttons?: InlineKeyboardButton[][]) => {
                await flow.send(content, { replace: ui?.message_id, parseMode: "HTML", buttons });
            }

            const player = await flow.subflow(playersTurn(deck, update));
            let gameOverMessage = await flow.subflow(gameOver(player, []));

            if (gameOverMessage != null) {
                await flow.send(gameOverMessage, { replace: ui?.message_id, parseMode: "HTML" });
                return;
            }

            const dealer = await flow.subflow(dealersTurn(deck, player, update));
            gameOverMessage = await flow.subflow(gameOver(player, dealer));

            await flow.send(gameOverMessage ?? "", { replace: ui?.message_id, parseMode: "HTML" });
        }
    }
}

function gameOver(player: Card[], dealer: Card[]): TelegramFlow<string | null> {
    return {
        id: 'game-over',
        handler: async () => {
            const playersValue = calculateHandValue(player);
            if (playersValue === 21) {
                statsStorage.player += 1;
                return `🎉 <b>You hit 21!</b>\n\n👤 <b>Hand</b>: ${formatHand(player)}\n\nStart a /new game?`;
            }

            if (playersValue > 21) {
                statsStorage.dealer += 1;
                return `😞 <b>You went over 21! Dealer wins</b>\n\n👤 <b>Hand</b>: ${formatHand(player)}\n\nStart a /new game?`;
            }

            if (dealer.length === 0) {
                return null;
            }

            const dealersValue = calculateHandValue(dealer);

            if (dealersValue > 21) {
                statsStorage.player += 1;
                return `🎉 <b>Dealer went over 21! You win</b>\n\n👤 <b>Hand</b>: ${formatHand(player)}\n🏪 Dealer's hand: ${formatHand(dealer)}\n\nStart a /new game?`;
            }

            if (dealersValue > playersValue) {
                statsStorage.dealer += 1;
                return `😞 <b>Dealer wins</b>\n\n👤 <b>Hand</b>: ${formatHand(player)}\n🏪 Dealer's hand: ${formatHand(dealer)}\n\nStart a /new game?`;
            }

            if (dealersValue < playersValue) {
                statsStorage.player += 1;
                return `🎉 <b>You win!</b>\n\n👤 <b>Hand</b>: ${formatHand(player)}\n🏪 Dealer's hand: ${formatHand(dealer)}\n\nStart a /new game?`;
            }

            statsStorage.dealer += 1;
            statsStorage.player += 1;
            return `🤝 <b>It's a tie!</b>\n\n👤 <b>Hand</b>: ${formatHand(player)}\n🏪 Dealer's hand: ${formatHand(dealer)}\n\nStart a /new game?`;
        }
    }
}

function playersTurn(deck: Card[], update: (content: string, buttons?: InlineKeyboardButton[][]) => Promise<void>): TelegramFlow<Card[]> {
    return {
        id: 'players-turn',
        handler: async (flow) => {
            const player = [deal(deck)];

            while (true) {
                await update(`🎯 <b>Your turn</b>\n\n👤 <b>Hand</b>: ${formatHand(player)}`, [[
                    { text: '🃏 Hit', callback_data: '/hit' },
                    { text: '✋ Stand', callback_data: '/stand' }
                ]]);

                const callback = await flow.callback();

                if (callback.data === '/hit') {
                    player.push(deal(deck));
                    if (calculateHandValue(player) >= 21) {
                        return player;
                    }
                }

                if (callback.data === '/stand') {
                    return player;
                }
            }
        }
    }
}

function dealersTurn(deck: Card[], player: Card[], update: (content: string) => Promise<void>): TelegramFlow<Card[]> {
    return {
        id: 'dealers-turn',
        handler: async () => {
            const dealer = [];

            while (calculateHandValue(dealer) < 17) {
                dealer.push(deal(deck));
                await update(`🏪 <b>Dealer's turn...</b>\n\n👤 <b>Hand</b>: ${formatHand(player)}\n🏪 Dealer's hand: ${formatHand(dealer)}`);
                await new Promise(resolve => setTimeout(resolve, 1500));
            }

            return dealer;
        }
    }
}

const statsStorage = { player: 0, dealer: 0 };

function stats(): TelegramFlow<void> {
    return {
        id: 'stats',
        handler: async (flow) => {
            await flow.send(`Player: ${statsStorage.player} vs Dealer: ${statsStorage.dealer}`);
        }
    }
}

function createRandomlyShuffledDeck(): Card[] {
    const suits = ['♠️', '♥️', '♦️', '♣️'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck: Card[] = [];

    for (const suit of suits) {
        for (const value of values) {
            // @ts-ignore
            deck.push({ suit, value });
        }
    }

    return shuffle(deck);
}

function shuffle(deck: Card[]): Card[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = shuffled[i]!;
        shuffled[i] = shuffled[j]!;
        shuffled[j] = temp;
    }
    return shuffled;
}

function calculateHandValue(hand: Card[]): number {
    const values: { [key: string]: number } = { 'A': 11, 'J': 2, 'Q': 3, 'K': 4 };
    let value = 0;

    for (const card of hand) {
        value += values[card.value] ?? parseInt(card.value);
    }

    return value;
}

function deal(deck: Card[]): Card {
    const card = deck.pop();
    if (!card) throw new Error('Deck is empty');
    return card;
}

function formatCard(card: Card): string {
    return `${card.value}${card.suit}`;
}

function formatHand(hand: Card[]): string {
    return `${hand.map(formatCard).join(' ')} (${calculateHandValue(hand)})`;
}
