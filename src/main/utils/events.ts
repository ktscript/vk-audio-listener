export const MAX_EVENTS_TO_SHOW = 5;

export type ILAEventType =
    | "initializing"
    | "authorization" | "sessions_updating"
    | "listening" | "password_changing";

export type ILAEvent = {
    type: ILAEventType;
    payload: {
        date: number;
        data?: any;
    };
}

export class ILAEventControl {
    private events: ILAEvent[] = [];

    public pushEvent(type: ILAEventType, data?: any) {
        if (this.events.length >= MAX_EVENTS_TO_SHOW) {
            this.events.shift();
        }

        this.events.push({
            type,
            payload: {
                date: Date.now(),
                data
            }
        });

        return this;
    }

    public sort() {
        return this.events.sort((a, b) => a.payload.date < b.payload.date ? 1 : -1);
    }

    public getEvents() {
        return this.events;
    }
}