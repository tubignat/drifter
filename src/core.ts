import { randomUUID } from 'crypto';

export type Flow<T, TRun extends FlowRunCore<TEvent>, TEvent> = {
    id: string,
    handler: (flow: TRun) => Promise<T>
}

export interface FlowRunCore<TEvent> {
    interrupt(): never
    intercept(): TEvent
    consume(): TEvent
    reset(): void
    set(key: string, value: string): void
    get(key: string): string | undefined
    subflow<T>(flow: Flow<T, this, TEvent>): Promise<T>
    __state(): FlowState;
}

export async function execute<TRun extends FlowRunCore<TEvent>, TEvent>(run: TRun, root: Flow<void, TRun, TEvent>): Promise<FlowState> {
    try {
        await run.subflow(root);
        run.__state().executed = true;
    } catch (error: any) {
        if (!(error instanceof Interruption)) {
            let failedFlow = run.__state();
            while (true) {
                const next = failedFlow.subflows[failedFlow.subflows.length - 1];
                if (next == null || next.subflows.length === 0) {
                    break;
                }

                failedFlow = next;
            }

            failedFlow.error = { ...error, name: error.name, message: error.message, stack: error.stack };
            run.__state().error = { ...error, name: error.name, message: error.message, stack: error.stack };
            run.__state().executed = true;
        }
    }

    run.__state().kvs["updated"] = new Date().toISOString();
    return run.__state();
}

export type FlowState = {
    id: string;
    executed: boolean;
    subflows: FlowState[];
    result?: any;
    error?: any;
    kvs: { [key: string]: string };
}

class Interruption {
    constructor() { }
}

export class FlowRunCoreImpl<TEvent> {
    private event: TEvent;
    private consumed: boolean = false;
    private stack: { flow: FlowState, step: number }[] = [];
    private debug: boolean = false;

    constructor(event: TEvent, state: string | null, debug?: boolean) {
        this.event = event;
        this.debug = debug === true;

        const flow = state != null ? JSON.parse(state) as FlowState : {
            id: randomUUID(), executed: false, subflows: [], kvs: {
                "created": new Date().toISOString()
            }
        };

        this.stack.push({ flow, step: 0 });
    }

    __state(): FlowState {
        const state = this.stack[0];
        if (state == null) {
            throw new Error("Invalid state, stack is empty");
        }

        return state.flow;
    }

    interrupt(): never {
        throw new Interruption();
    }

    intercept(): TEvent {
        return this.event;
    }

    consume(): TEvent {
        if (this.consumed) {
            throw new Interruption();
        }

        this.consumed = true;
        return this.event;
    }

    reset(): void {
        const lastEntry = this.lastEntry();
        lastEntry.flow.subflows.splice(lastEntry.step);
    }

    set(key: string, value: string): void {
        this.lastEntry().flow.kvs[key] = value;
    }

    get(key: string): string | undefined {
        return this.lastEntry().flow.kvs[key];
    }

    async subflow<T>(flow: Flow<T, this, TEvent>): Promise<T> {
        const current = this.lastEntry();
        let subflow = current.flow.subflows[current.step];
        if (!subflow) {
            subflow = { id: flow.id, subflows: [], executed: false, kvs: {} };
            current.flow.subflows.push(subflow);
        } else if (subflow.id !== flow.id) {
            throw new Error(`Non-deterministic flow: expected ${flow.id}, got ${subflow.id}`);
        }

        if (!subflow.executed) {
            this.stack.push({ flow: subflow, step: 0 });

            // cloning is necessary here to avoid non-determinism
            subflow.result = clone(await flow.handler(this));

            subflow.executed = true;
            if (!this.debug) {
                // once the flow is executed, its stack is useless,
                // but we keep it for debugging
                subflow.subflows = [];
            }

            this.stack.pop();
        }

        current.step += 1;

        // cloning is necessary here to avoid non-determinism
        return clone(subflow.result);
    }

    private lastEntry() {
        const lastEntry = this.stack[this.stack.length - 1];
        if (lastEntry == null) {
            throw new Error("Invalid state, stack is empty");
        }

        return lastEntry;
    }
}

function clone(object: any) {
    if (object == null) {
        return object;
    }

    // todo: verify result is serializable
    return JSON.parse(JSON.stringify(object));
}