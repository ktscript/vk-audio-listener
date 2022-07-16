import EventEmitter from "events";

type EventType =
    | "notify"
    | "error";

class ILAGlobalEventBus extends EventEmitter {
    public on(event: EventType, listener: (...args: any[]) => void) {
        return super.on(event, listener);
    }

    public emit(event: EventType, ...args: any[]) {
        return super.emit(event, ...args);
    }
}

const ilaEventBus = new ILAGlobalEventBus();

export default ilaEventBus;