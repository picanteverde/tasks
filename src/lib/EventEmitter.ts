export type Handler = (data: any) => void;

export type EventEmitter = {
  on: (event: string, handler: Handler) => void;
  emit: (event: string, data?: any) => void;
};

type EventListeners = {
  [key: string]: Handler[];
}

export default function eventEmitter (): EventEmitter {
  const listeners: EventListeners = {};

  function on (event: string, handler: Handler) {
    listeners[event] = listeners[event] || [];
    listeners[event].push(handler);
  }
  function emit (event: string, data: any) {
    listeners[event]?.forEach(
      (handler) => {
        try {
          handler(data);
        } catch (error) {
          if (event === 'error') {
            console.error(`Error in handler for event ${event}:`, error);
          } else {
            emit('error', error);
          }
        }
      }
    );
  };

  return {
    on,
    emit,
  };
}