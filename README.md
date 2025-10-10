# Drifter

A UI framework for Telegram chat bots.

## Getting Started

```bash
npm install drifter-js
```

## Examples

Drifter manages state allowing you to write chat bot flows the same way you would write a console application

```typescript
function hello(): TelegramFlow<void> {
    return {
        id: 'hello',
        handler: async (flow) => {
            await flow.send('What is your name?');

            // execution interrupts here and resumes when the user sends a message
            const response = await flow.prompt(); 
            await flow.send(`Hello, ${response.text}!`);
        },
    }
}

start(tg_token, hello());
```

![Hello example](https://github.com/tubignat/drifter/blob/main/images/hello-example.png?raw=true)

Flow's state can be persisted to ensure user UI inputs are handled correctly after restarts

```typescript
function counter(): TelegramFlow<void> {
    return {
        id: 'counter',
        handler: async (flow) => {
            let counter = 0;
            let ui: Message | null = null;

            while (true) {
                ui = await flow.send(`Current value: ${counter}`, {
                    replace: ui?.message_id,
                    buttons: [[{ text: 'Increment', callback_data: '/inc' }]],
                });

                const callback = await flow.callback();
                if (callback.data === '/inc') {
                    counter++;
                }
            }
        }
    }
}

start(tgToken, counter(), {
    storage: {
        saveFlowState: async (chatId, state) => {
            await sql(`INSERT INTO ui_state(chat, state) VALUES ${chatId}, ${state}`)
        },
        getFlowState: async (chatId) => {
            return await sql(`SELECT state from ui_state WHERE chat = ${chatId}`)
        },
    }
});
```

<p float="left">
  <img src="https://github.com/tubignat/drifter/blob/main/images/counter-example-1.jpeg?raw=true" style="width: 45%; vertical-align: top;"/>
  <img src="https://github.com/tubignat/drifter/blob/main/images/counter-example-2.jpeg?raw=true" style="width: 45%; vertical-align: top;" />
</p>

For more complex flows, you can reuse logic via subflows

```typescript
function buy(): TelegramFlow<void> {
    return {
        id: 'buy',
        handler: async (flow) => {
            const message = await flow.send('What do you want to buy?\n\nChoose one of the items', {
                buttons: [
                    [{ text: 'Book', callback_data: 'book' }],
                    [{ text: 'Coffee', callback_data: 'coffee' }],
                    [{ text: 'Tickets', callback_data: 'tickets' }],
                ],
            })

            const callback = await flow.callback();

            // drifter will cache the subflow results so a subflow doesn't execute twice
            const confirmed = await flow.subflow(confirmation(`You are about to buy: ${callback.data}?\n\nConfirm?`));
            if (confirmed) {
                await flow.send(`You bought ${callback.data}`, { replace: message.message_id });
            }
        }
    }
}

function confirmation(question: string): TelegramFlow<boolean> {
    return {
        id: 'confirmation',
        handler: async (flow) => {
            const message = await flow.send(question, {
                buttons: [[
                    { text: 'Yes', callback_data: '/yes' },
                    { text: 'No', callback_data: '/no' },
                ]],
            });

            const callback = await flow.callback();
            const result = callback.data === '/yes';

            await flow.delete(message.message_id);

            return result;
        }
    }
}

start(tgToken, buy());
```

<p float="left">
  <img src="https://github.com/tubignat/drifter/blob/main/images/subflow-example-1.jpeg?raw=true" align="top" style="width: 30%; vertical-align: top;" />
  <img src="https://github.com/tubignat/drifter/blob/main/images/subflow-example-2.jpeg?raw=true" align="top" style="width: 30%; vertical-align: top;" /> 
  <img src="https://github.com/tubignat/drifter/blob/main/images/subflow-example-3.jpeg?raw=true" align="top" style="width: 30%; vertical-align: top;" /> 
</p>